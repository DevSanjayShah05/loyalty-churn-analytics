"""
Foot & Frequency -- analytics engine.

Loads the processed Starbucks Capstone tables and, at startup, builds the full
CRM analytics layer in-memory:

  * RFM (Recency / Frequency / Monetary) quintile scoring per customer
  * K-Means clustering into named, human-readable customer segments
  * A churn-propensity classifier (logistic regression) with global and
    per-customer feature importances ("churn drivers")
  * 12-month customer lifetime value (CLV) projection
  * Offer response & uplift analysis feeding a campaign simulator

Everything is deterministic (fixed random_state) so the API is reproducible.
"""
from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))

# Features used to PREDICT churn. Recency is deliberately excluded because the
# churn label is defined from recency -- including it would be target leakage.
CHURN_FEATURES = [
    "frequency", "monetary", "avg_order_value", "tenure_days", "age",
    "income", "offer_view_rate", "offer_completion_rate",
    "offers_received", "is_male", "is_female",
]
FEATURE_LABELS = {
    "frequency": "Purchase frequency",
    "monetary": "Total spend",
    "avg_order_value": "Avg order value",
    "tenure_days": "Membership tenure",
    "age": "Age",
    "income": "Income",
    "offer_view_rate": "Offer view rate",
    "offer_completion_rate": "Offer completion rate",
    "offers_received": "Offers received",
    "is_male": "Gender: male",
    "is_female": "Gender: female",
}

N_SEGMENTS = 5
CLV_HORIZON_MONTHS = 12
MONTHLY_DISCOUNT = 0.01  # ~12% annual discount rate on future cash flows


def _quintile(series: pd.Series, reverse: bool = False) -> pd.Series:
    """Robust 1-5 quintile score that tolerates heavy ties (rank first)."""
    ranks = series.rank(method="first")
    labels = [5, 4, 3, 2, 1] if reverse else [1, 2, 3, 4, 5]
    try:
        return pd.qcut(ranks, 5, labels=labels).astype(int)
    except ValueError:
        return pd.Series(3, index=series.index)


class AnalyticsEngine:
    def __init__(self, data_dir: str = DATA_DIR):
        self.data_dir = data_dir
        self.customers = pd.read_parquet(os.path.join(data_dir, "customers.parquet"))
        self.offers = pd.read_parquet(os.path.join(data_dir, "offers.parquet"))
        self.offer_response = pd.read_parquet(
            os.path.join(data_dir, "offer_response.parquet"))
        self.transactions = pd.read_parquet(
            os.path.join(data_dir, "transactions.parquet"))
        self.model_meta: dict = {}
        self._build()

    # ------------------------------------------------------------------ build
    def _build(self):
        self._score_rfm()
        self._segment()
        self._train_churn_model()
        self._estimate_clv()
        self._recommend_actions()
        self._offer_response_lookup = self.offer_response.merge(
            self.customers[["person_id", "segment_name", "churn_risk_band"]],
            on="person_id", how="left")

    def _score_rfm(self):
        c = self.customers
        c["r_score"] = _quintile(c["recency_days"], reverse=True)
        c["f_score"] = _quintile(c["frequency"])
        c["m_score"] = _quintile(c["monetary"])
        c["rfm_score"] = c["r_score"] + c["f_score"] + c["m_score"]
        c["rfm_cell"] = (c["r_score"].astype(str) + c["f_score"].astype(str)
                         + c["m_score"].astype(str))

    def _segment(self):
        c = self.customers
        feat = c[["recency_days", "frequency", "monetary", "tenure_days",
                  "offer_completion_rate"]].fillna(0.0)
        X = StandardScaler().fit_transform(feat)
        km = KMeans(n_clusters=N_SEGMENTS, random_state=42, n_init=10)
        c["cluster"] = km.fit_predict(X)

        prof = c.groupby("cluster").agg(
            recency=("recency_days", "mean"),
            frequency=("frequency", "mean"),
            monetary=("monetary", "mean"),
            tenure=("tenure_days", "mean"),
            churn=("churned", "mean"),
            n=("person_id", "size"),
        )
        # Deterministic, profile-driven naming. Each name is assigned to the
        # cluster whose centroid best matches it, strongest signal first, so
        # names always describe the group they land on (no forced mislabels).
        names: dict[int, str] = {}
        remaining = set(prof.index)

        def take(metric: str, ascending: bool, name: str):
            sub = prof.loc[list(remaining)].sort_values(metric, ascending=ascending)
            cid = int(sub.index[0])
            names[cid] = name
            remaining.discard(cid)

        take("recency", ascending=False, name="Lapsed")            # most inactive
        take("monetary", ascending=False, name="Loyal High-Value")  # whales
        take("tenure", ascending=True, name="New / Developing")     # newest, building
        take("monetary", ascending=False, name="Loyal Regulars")    # active, good value
        names[remaining.pop()] = "Steady Regulars"                  # frequent, low spend

        c["segment_name"] = c["cluster"].map(names)
        self._segment_order = ["Loyal High-Value", "Loyal Regulars",
                               "Steady Regulars", "New / Developing", "Lapsed"]

    def _feature_matrix(self) -> pd.DataFrame:
        c = self.customers.copy()
        c["is_male"] = (c["gender"] == "M").astype(int)
        c["is_female"] = (c["gender"] == "F").astype(int)
        c["age"] = c["age"].fillna(c["age"].median())
        c["income"] = c["income"].fillna(c["income"].median())
        return c[CHURN_FEATURES].astype(float)

    def _train_churn_model(self):
        c = self.customers
        X = self._feature_matrix()
        y = c["churned"].astype(int).values

        self._scaler = StandardScaler().fit(X)
        Xs = self._scaler.transform(X)

        Xtr, Xte, ytr, yte = train_test_split(
            Xs, y, test_size=0.25, random_state=42, stratify=y)
        self._clf = LogisticRegression(max_iter=1000, class_weight="balanced")
        self._clf.fit(Xtr, ytr)
        auc = roc_auc_score(yte, self._clf.predict_proba(Xte)[:, 1])

        # Predicted probability for every customer.
        c["churn_prob"] = self._clf.predict_proba(Xs)[:, 1]
        c["churn_risk_band"] = pd.cut(
            c["churn_prob"], bins=[-0.01, 0.33, 0.66, 1.01],
            labels=["Low", "Medium", "High"])

        coefs = self._clf.coef_[0]
        self._coefs = coefs
        # Per-customer signed contribution to log-odds: coef_j * standardized_x.
        self._contrib = Xs * coefs  # (n_customers, n_features)

        importances = sorted(
            ({"feature": f, "label": FEATURE_LABELS[f],
              "coefficient": round(float(coefs[i]), 4),
              "importance": round(float(abs(coefs[i])), 4),
              "direction": "increases churn" if coefs[i] > 0 else "reduces churn"}
             for i, f in enumerate(CHURN_FEATURES)),
            key=lambda d: d["importance"], reverse=True)

        # Optional second opinion from gradient boosting, if xgboost is present.
        xgb_auc = None
        try:
            from xgboost import XGBClassifier
            xgb = XGBClassifier(
                n_estimators=200, max_depth=3, learning_rate=0.1,
                subsample=0.9, eval_metric="logloss", random_state=42)
            xgb.fit(Xtr, ytr)
            xgb_auc = float(roc_auc_score(yte, xgb.predict_proba(Xte)[:, 1]))
        except Exception:
            pass

        self.model_meta = {
            "model": "Logistic Regression (class-weight balanced)",
            "target": "Churn = no purchase in the final 7 days of the 30-day window",
            "n_customers": int(len(c)),
            "churn_rate": round(float(y.mean()), 4),
            "test_roc_auc": round(float(auc), 4),
            "xgboost_roc_auc": round(xgb_auc, 4) if xgb_auc else None,
            "n_features": len(CHURN_FEATURES),
            "feature_importances": importances,
            "note": "Recency is excluded from features to avoid target leakage.",
        }

    def _customer_drivers(self, idx: int, top: int = 3) -> list[dict]:
        contrib = self._contrib[idx]
        order = np.argsort(-np.abs(contrib))[:top]
        out = []
        for j in order:
            out.append({
                "feature": FEATURE_LABELS[CHURN_FEATURES[j]],
                "contribution": round(float(contrib[j]), 3),
                "direction": "increases risk" if contrib[j] > 0 else "reduces risk",
            })
        return out

    def _estimate_clv(self):
        c = self.customers
        # monetary = spend across the ~30-day (one month) window => monthly spend.
        monthly_spend = c["monetary"].values
        retain = np.clip(1.0 - c["churn_prob"].values, 0.01, 0.999)
        clv = np.zeros(len(c))
        for t in range(1, CLV_HORIZON_MONTHS + 1):
            clv += monthly_spend * (retain ** t) / ((1 + MONTHLY_DISCOUNT) ** t)
        c["clv_12m"] = np.round(clv, 2)
        c["expected_lifetime_months"] = np.round(
            np.clip(1.0 / (1.0 - retain), 0, 120), 1)

    def _recommend_actions(self):
        c = self.customers

        def action(row):
            if row["frequency"] == 0:
                return "Onboard: send welcome offer to drive first purchase"
            if row["churn_risk_band"] == "High":
                if row["m_score"] >= 4:
                    return "Win-back: high-value at risk -- personal BOGO + VIP perk"
                return "Re-engage: targeted discount before customer lapses"
            if row["segment_name"] == "Loyal High-Value":
                return "Reward & upsell: exclusive early access, protect loyalty"
            if row["segment_name"] == "New / Developing":
                return "Nurture: educational + low-difficulty offer to build habit"
            if row["offer_view_rate"] < 0.5 and row["offers_received"] > 0:
                return "Fix reach: switch channels -- offers not being seen"
            return "Maintain: standard loyalty cadence"

        c["recommended_action"] = c.apply(action, axis=1)

    # ------------------------------------------------------------------- reads
    def overview(self) -> dict:
        c = self.customers
        return {
            "n_customers": int(len(c)),
            "n_active": int((c["frequency"] > 0).sum()),
            "total_revenue": round(float(c["monetary"].sum()), 2),
            "avg_clv_12m": round(float(c["clv_12m"].mean()), 2),
            "total_clv_12m": round(float(c["clv_12m"].sum()), 2),
            "churn_rate": round(float(c["churned"].mean()), 4),
            "high_risk_customers": int((c["churn_risk_band"] == "High").sum()),
            "avg_order_value": round(float(
                c.loc[c["frequency"] > 0, "avg_order_value"].mean()), 2),
            "model_roc_auc": self.model_meta["test_roc_auc"],
            "n_offers": int(len(self.offers)),
        }

    def segments(self) -> list[dict]:
        c = self.customers
        rows = []
        for name in self._segment_order:
            s = c[c["segment_name"] == name]
            if s.empty:
                continue
            rows.append({
                "segment": name,
                "count": int(len(s)),
                "pct_of_base": round(float(len(s) / len(c)), 4),
                "avg_recency_days": round(float(s["recency_days"].mean()), 1),
                "avg_frequency": round(float(s["frequency"].mean()), 1),
                "avg_monetary": round(float(s["monetary"].mean()), 2),
                "avg_rfm_score": round(float(s["rfm_score"].mean()), 1),
                "avg_clv_12m": round(float(s["clv_12m"].mean()), 2),
                "churn_rate": round(float(s["churned"].mean()), 4),
                "avg_churn_prob": round(float(s["churn_prob"].mean()), 4),
                "revenue_share": round(float(
                    s["monetary"].sum() / c["monetary"].sum()), 4),
            })
        return rows

    def customers_table(self, segment=None, risk=None, search=None,
                        sort_by="churn_prob", descending=True,
                        limit=50, offset=0) -> dict:
        c = self.customers
        mask = pd.Series(True, index=c.index)
        if segment:
            mask &= c["segment_name"] == segment
        if risk:
            mask &= c["churn_risk_band"] == risk
        if search:
            mask &= c["person_id"].str.contains(search, case=False, na=False)
        sub = c[mask]
        valid_sorts = {"churn_prob", "clv_12m", "monetary", "frequency",
                       "recency_days", "rfm_score", "tenure_days"}
        if sort_by not in valid_sorts:
            sort_by = "churn_prob"
        sub = sub.sort_values(sort_by, ascending=not descending)
        total = int(len(sub))
        page = sub.iloc[offset: offset + limit]
        rows = []
        for i, row in page.iterrows():
            rows.append({
                "person_id": row["person_id"],
                "segment": row["segment_name"],
                "rfm_cell": row["rfm_cell"],
                "rfm_score": int(row["rfm_score"]),
                "recency_days": round(float(row["recency_days"]), 1),
                "frequency": int(row["frequency"]),
                "monetary": round(float(row["monetary"]), 2),
                "clv_12m": round(float(row["clv_12m"]), 2),
                "churn_prob": round(float(row["churn_prob"]), 4),
                "churn_risk_band": str(row["churn_risk_band"]),
                "top_drivers": self._customer_drivers(
                    self.customers.index.get_loc(i)),
            })
        return {"total": total, "limit": limit, "offset": offset, "rows": rows}

    def customer_360(self, person_id: str) -> dict | None:
        c = self.customers
        match = c[c["person_id"] == person_id]
        if match.empty:
            return None
        i = match.index[0]
        row = match.iloc[0]
        pos = c.index.get_loc(i)

        txns = self.transactions[self.transactions["person_id"] == person_id]
        timeline = [
            {"day": round(float(r["day"]), 2), "amount": round(float(r["amount"]), 2)}
            for _, r in txns.sort_values("day").iterrows()
        ]
        offer_hist = self.offer_response[
            self.offer_response["person_id"] == person_id]
        offer_hist = offer_hist.merge(
            self.offers[["offer_id", "label"]], on="offer_id", how="left")
        offers = [
            {"offer": r["label"], "offer_type": r["offer_type"],
             "received_day": round(float(r["received_hours"]) / 24, 1),
             "viewed": bool(r["viewed"]), "completed": bool(r["completed"]),
             "spend_in_window": round(float(r["spend_in_window"]), 2)}
            for _, r in offer_hist.sort_values("received_hours").iterrows()
        ]
        return {
            "person_id": person_id,
            "gender": None if pd.isna(row["gender"]) else row["gender"],
            "age": None if pd.isna(row["age"]) else int(row["age"]),
            "income": None if pd.isna(row["income"]) else int(row["income"]),
            "became_member_on": row["became_member_on"],
            "tenure_days": int(row["tenure_days"]),
            "segment": row["segment_name"],
            "rfm": {"recency_days": round(float(row["recency_days"]), 1),
                    "frequency": int(row["frequency"]),
                    "monetary": round(float(row["monetary"]), 2),
                    "r_score": int(row["r_score"]), "f_score": int(row["f_score"]),
                    "m_score": int(row["m_score"]), "rfm_cell": row["rfm_cell"],
                    "rfm_score": int(row["rfm_score"])},
            "avg_order_value": round(float(row["avg_order_value"]), 2),
            "clv_12m": round(float(row["clv_12m"]), 2),
            "expected_lifetime_months": float(row["expected_lifetime_months"]),
            "churn_prob": round(float(row["churn_prob"]), 4),
            "churn_risk_band": str(row["churn_risk_band"]),
            "churned_flag": int(row["churned"]),
            "top_drivers": self._customer_drivers(pos, top=5),
            "recommended_action": row["recommended_action"],
            "engagement": {
                "offers_received": int(row["offers_received"]),
                "offers_viewed": int(row["offers_viewed"]),
                "offers_completed": int(row["offers_completed"]),
                "offer_view_rate": round(float(row["offer_view_rate"]), 3),
                "offer_completion_rate": round(
                    float(row["offer_completion_rate"]), 3),
            },
            "transaction_timeline": timeline,
            "offer_history": offers,
        }

    def churn_drivers(self) -> dict:
        return {
            "model": self.model_meta["model"],
            "test_roc_auc": self.model_meta["test_roc_auc"],
            "xgboost_roc_auc": self.model_meta["xgboost_roc_auc"],
            "target": self.model_meta["target"],
            "note": self.model_meta["note"],
            "feature_importances": self.model_meta["feature_importances"],
        }

    def uplift(self) -> dict:
        r = self._offer_response_lookup
        by_type = []
        for t, g in r.groupby("offer_type"):
            viewed = g[g["viewed"] == 1]
            not_viewed = g[g["viewed"] == 0]
            spend_treated = float(viewed["spend_in_window"].mean()) if len(viewed) else 0.0
            spend_control = float(not_viewed["spend_in_window"].mean()) if len(not_viewed) else 0.0
            by_type.append({
                "offer_type": t,
                "instances": int(len(g)),
                "view_rate": round(float(g["viewed"].mean()), 3),
                "completion_rate": round(float(g["completed"].mean()), 3),
                "avg_spend_viewed": round(spend_treated, 2),
                "avg_spend_not_viewed": round(spend_control, 2),
                "spend_uplift": round(spend_treated - spend_control, 2),
            })
        by_offer = []
        offs = self.offers.set_index("offer_id")
        for oid, g in r.groupby("offer_id"):
            if oid not in offs.index:
                continue
            o = offs.loc[oid]
            by_offer.append({
                "offer_id": oid, "label": o["label"], "offer_type": o["offer_type"],
                "difficulty": int(o["difficulty"]), "reward": int(o["reward"]),
                "instances": int(len(g)),
                "view_rate": round(float(g["viewed"].mean()), 3),
                "completion_rate": round(float(g["completed"].mean()), 3),
                "avg_spend": round(float(g["spend_in_window"].mean()), 2),
            })
        by_offer.sort(key=lambda d: d["completion_rate"], reverse=True)
        return {"by_offer_type": by_type, "by_offer": by_offer,
                "segment_options": self._segment_order,
                "offer_type_options": sorted(r["offer_type"].unique().tolist())}

    def simulate_campaign(self, offer_type: str, target_segment: str | None,
                          audience_size: int) -> dict:
        r = self._offer_response_lookup
        pool = r[r["offer_type"] == offer_type]
        seg_note = "all segments"
        if target_segment and target_segment != "All":
            seg_pool = pool[pool["segment_name"] == target_segment]
            if len(seg_pool) >= 30:
                pool = seg_pool
                seg_note = target_segment
            else:
                seg_note = f"{target_segment} (fell back to all: thin history)"

        if pool.empty:
            return {"error": "No historical data for that offer type."}

        completion = float(pool["completed"].mean())
        view = float(pool["viewed"].mean())
        treated = pool[pool["viewed"] == 1]
        control = pool[pool["viewed"] == 0]
        spend_treated = float(treated["spend_in_window"].mean()) if len(treated) else 0.0
        spend_control = float(control["spend_in_window"].mean()) if len(control) else 0.0
        incr_per_cust = max(spend_treated - spend_control, 0.0)

        reward = float(self.offers.loc[
            self.offers["offer_type"] == offer_type, "reward"].mean())

        # Retention proxy: churn rate of engaged (completed) vs not, in the pool's
        # customers -> translated into a retention-lift percentage-point estimate.
        pool_cust = self.customers[
            self.customers["person_id"].isin(pool["person_id"])]
        engaged_ids = set(pool.loc[pool["completed"] == 1, "person_id"])
        eng = pool_cust[pool_cust["person_id"].isin(engaged_ids)]
        non = pool_cust[~pool_cust["person_id"].isin(engaged_ids)]
        churn_eng = float(eng["churned"].mean()) if len(eng) else 0.0
        churn_non = float(non["churned"].mean()) if len(non) else 0.0
        retention_lift_pp = max(churn_non - churn_eng, 0.0)

        responders = int(round(audience_size * completion))
        incr_revenue = incr_per_cust * audience_size
        reward_cost = reward * responders
        net_uplift = incr_revenue - reward_cost
        retained = int(round(audience_size * retention_lift_pp))

        return {
            "inputs": {"offer_type": offer_type, "target_segment": seg_note,
                       "audience_size": audience_size},
            "historical_instances": int(len(pool)),
            "expected_view_rate": round(view, 3),
            "expected_completion_rate": round(completion, 3),
            "expected_responders": responders,
            "incremental_spend_per_customer": round(incr_per_cust, 2),
            "projected_incremental_revenue": round(incr_revenue, 2),
            "estimated_reward_cost": round(reward_cost, 2),
            "projected_net_uplift": round(net_uplift, 2),
            "retention_lift_pp": round(retention_lift_pp, 4),
            "customers_retained": retained,
            "roi": round(net_uplift / reward_cost, 2) if reward_cost > 0 else None,
        }


@lru_cache(maxsize=1)
def get_engine() -> AnalyticsEngine:
    return AnalyticsEngine()
