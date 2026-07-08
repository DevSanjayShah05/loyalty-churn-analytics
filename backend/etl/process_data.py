"""
Foot & Frequency -- ETL pipeline.

Transforms the raw Starbucks Capstone Challenge JSON files (portfolio.json,
profile.json, transcript.json) into three compact, analysis-ready tables that
the FastAPI service reads at startup:

    backend/data/customers.parquet      one row per customer (RFM inputs,
                                        demographics, offer engagement, churn flag)
    backend/data/transactions.parquet   per-customer transaction timeline
    backend/data/offer_response.parquet one row per offer instance a customer
                                        received (viewed / completed / spend in window)

Raw files are NOT committed. Run this once to regenerate the processed data:

    python backend/etl/process_data.py --raw-dir data_raw

Source: Starbucks Capstone Challenge (Udacity Data Scientist Nanodegree).
Time is measured in hours from the start of a ~30-day observation window.
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd

# The observation window runs 0 -> 714 hours. Round up to a clean 30 days so
# recency is measured against the true end of the study period.
WINDOW_END_HOURS = 720.0  # 30 days
CHURN_INACTIVITY_DAYS = 7  # no purchase in the final 7 days of the window => churned


def _read_json_lines(path: str) -> list[dict]:
    rows = []
    with open(path) as fh:
        for line in fh:
            line = line.strip().rstrip(",")
            if not line or line in "[]":
                continue
            rows.append(json.loads(line))
    return rows


def load_raw(raw_dir: str):
    portfolio = pd.DataFrame(_read_json_lines(os.path.join(raw_dir, "portfolio.json")))
    profile = pd.DataFrame(_read_json_lines(os.path.join(raw_dir, "profile.json")))
    transcript = pd.DataFrame(_read_json_lines(os.path.join(raw_dir, "transcript.json")))
    return portfolio, profile, transcript


def build_offers(portfolio: pd.DataFrame) -> pd.DataFrame:
    df = portfolio.rename(columns={"id": "offer_id"}).copy()
    df["channels"] = df["channels"].apply(lambda c: ",".join(c))
    df["duration_hours"] = df["duration"] * 24
    # A friendly, human label for the CRM UI.
    def label(row):
        if row["offer_type"] == "informational":
            return f"Info ({int(row['duration'])}d)"
        if row["offer_type"] == "bogo":
            return f"BOGO ${int(row['difficulty'])} / ${int(row['reward'])}"
        return f"Discount ${int(row['reward'])} off ${int(row['difficulty'])}"
    df["label"] = df.apply(label, axis=1)
    return df[
        ["offer_id", "label", "offer_type", "difficulty", "reward",
         "duration", "duration_hours", "channels"]
    ]


def build_events(transcript: pd.DataFrame):
    """Split the transcript into transaction and offer-event frames."""
    val = transcript["value"]
    transcript = transcript.copy()
    transcript["amount"] = val.apply(lambda v: v.get("amount"))
    transcript["offer_id"] = val.apply(
        lambda v: v.get("offer id", v.get("offer_id"))
    )
    txns = transcript[transcript["event"] == "transaction"][
        ["person", "time", "amount"]
    ].copy()
    offer_events = transcript[transcript["event"] != "transaction"][
        ["person", "event", "time", "offer_id"]
    ].copy()
    return txns, offer_events


def build_customers(profile: pd.DataFrame, txns: pd.DataFrame,
                    offer_events: pd.DataFrame) -> pd.DataFrame:
    profile = profile.rename(columns={"id": "person_id"}).copy()
    # Age 118 is Starbucks' sentinel for "unknown"; treat as missing.
    profile.loc[profile["age"] == 118, "age"] = np.nan
    profile["became_member_on"] = pd.to_datetime(
        profile["became_member_on"], format="%Y%m%d"
    )
    snapshot = profile["became_member_on"].max()
    profile["tenure_days"] = (snapshot - profile["became_member_on"]).dt.days
    profile["signup_year"] = profile["became_member_on"].dt.year

    # ---- RFM inputs from transactions ----
    txns = txns.copy()
    txns["day"] = txns["time"] / 24.0
    grp = txns.groupby("person")
    rfm = grp.agg(
        frequency=("amount", "size"),
        monetary=("amount", "sum"),
        last_txn_hours=("time", "max"),
        first_txn_hours=("time", "min"),
    )
    rfm["recency_days"] = (WINDOW_END_HOURS - rfm["last_txn_hours"]) / 24.0
    rfm["avg_order_value"] = rfm["monetary"] / rfm["frequency"]

    # ---- Offer engagement ----
    oe = offer_events.groupby(["person", "event"]).size().unstack(fill_value=0)
    oe = oe.rename(columns={
        "offer received": "offers_received",
        "offer viewed": "offers_viewed",
        "offer completed": "offers_completed",
    })
    for c in ["offers_received", "offers_viewed", "offers_completed"]:
        if c not in oe:
            oe[c] = 0

    cust = profile.merge(rfm, left_on="person_id", right_index=True, how="left")
    cust = cust.merge(oe, left_on="person_id", right_index=True, how="left")

    # Customers with no transactions: frequency 0, recency = full window.
    cust["frequency"] = cust["frequency"].fillna(0).astype(int)
    cust["monetary"] = cust["monetary"].fillna(0.0)
    cust["avg_order_value"] = cust["avg_order_value"].fillna(0.0)
    cust["recency_days"] = cust["recency_days"].fillna(WINDOW_END_HOURS / 24.0)
    for c in ["offers_received", "offers_viewed", "offers_completed"]:
        cust[c] = cust[c].fillna(0).astype(int)

    cust["offer_view_rate"] = np.where(
        cust["offers_received"] > 0,
        cust["offers_viewed"] / cust["offers_received"], 0.0)
    cust["offer_completion_rate"] = np.where(
        cust["offers_received"] > 0,
        cust["offers_completed"] / cust["offers_received"], 0.0)

    # ---- Churn label: no purchase in the final CHURN_INACTIVITY_DAYS days ----
    cust["churned"] = (
        (cust["recency_days"] > CHURN_INACTIVITY_DAYS) | (cust["frequency"] == 0)
    ).astype(int)

    cust["became_member_on"] = cust["became_member_on"].dt.strftime("%Y-%m-%d")
    return cust


def build_offer_response(offer_events: pd.DataFrame, txns: pd.DataFrame,
                         offers: pd.DataFrame) -> pd.DataFrame:
    """One row per 'offer received' instance with in-window response signals."""
    dur = offers.set_index("offer_id")["duration_hours"].to_dict()
    otype = offers.set_index("offer_id")["offer_type"].to_dict()
    reward = offers.set_index("offer_id")["reward"].to_dict()
    difficulty = offers.set_index("offer_id")["difficulty"].to_dict()

    # Index events & transactions per person for fast window lookups.
    ev_by_person = defaultdict(lambda: {"viewed": [], "completed": [], "received": []})
    for r in offer_events.itertuples(index=False):
        key = {"offer viewed": "viewed", "offer completed": "completed",
               "offer received": "received"}[r.event]
        ev_by_person[r.person][key].append((r.time, r.offer_id))

    txn_by_person = defaultdict(list)
    for r in txns.itertuples(index=False):
        txn_by_person[r.person].append((r.time, r.amount))

    records = []
    for person, ev in ev_by_person.items():
        person_txns = sorted(txn_by_person.get(person, []))
        for t_recv, oid in ev["received"]:
            d = dur.get(oid, 168.0)
            w_end = t_recv + d
            viewed = any(oid == vid and t_recv <= tv <= w_end
                         for tv, vid in ev["viewed"])
            completed = any(oid == cid and t_recv <= tc <= w_end
                            for tc, cid in ev["completed"])
            spend = sum(a for tt, a in person_txns if t_recv <= tt <= w_end)
            n_txn = sum(1 for tt, a in person_txns if t_recv <= tt <= w_end)
            records.append({
                "person_id": person,
                "offer_id": oid,
                "offer_type": otype.get(oid, "unknown"),
                "reward": reward.get(oid, 0),
                "difficulty": difficulty.get(oid, 0),
                "received_hours": t_recv,
                "viewed": int(viewed),
                "completed": int(completed),
                "spend_in_window": round(float(spend), 2),
                "txns_in_window": n_txn,
            })
    return pd.DataFrame(records)


def build_transactions(txns: pd.DataFrame) -> pd.DataFrame:
    out = txns.rename(columns={"person": "person_id"}).copy()
    out["day"] = (out["time"] / 24.0).round(2)
    out["amount"] = out["amount"].round(2)
    return out[["person_id", "day", "amount"]]


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    default_raw = os.path.abspath(os.path.join(here, "..", "..", "data_raw"))
    default_out = os.path.abspath(os.path.join(here, "..", "data"))
    ap.add_argument("--raw-dir", default=default_raw)
    ap.add_argument("--out-dir", default=default_out)
    args = ap.parse_args()

    print(f"Loading raw data from {args.raw_dir} ...")
    portfolio, profile, transcript = load_raw(args.raw_dir)
    print(f"  profiles={len(profile)} events={len(transcript)} offers={len(portfolio)}")

    offers = build_offers(portfolio)
    txns, offer_events = build_events(transcript)
    customers = build_customers(profile, txns, offer_events)
    offer_response = build_offer_response(offer_events, txns, offers)
    transactions = build_transactions(txns)

    os.makedirs(args.out_dir, exist_ok=True)
    offers.to_parquet(os.path.join(args.out_dir, "offers.parquet"), index=False)
    customers.to_parquet(os.path.join(args.out_dir, "customers.parquet"), index=False)
    offer_response.to_parquet(
        os.path.join(args.out_dir, "offer_response.parquet"), index=False)
    transactions.to_parquet(
        os.path.join(args.out_dir, "transactions.parquet"), index=False)

    print("Wrote:")
    for f in ["offers", "customers", "offer_response", "transactions"]:
        p = os.path.join(args.out_dir, f"{f}.parquet")
        print(f"  {p}  ({os.path.getsize(p)/1e6:.2f} MB)")
    print(f"Churn rate: {customers['churned'].mean():.1%}  "
          f"({int(customers['churned'].sum())}/{len(customers)})")
    print(f"Generated {datetime.now():%Y-%m-%d %H:%M}")


if __name__ == "__main__":
    main()
