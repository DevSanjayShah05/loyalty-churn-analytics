# Foot & Frequency

**A Customer Loyalty, Segmentation & Churn Analytics Suite for food & beverage loyalty programs.**

Foot & Frequency is a CRM-style analyst tool — the kind of internal console a Consumer
Insights / Commercial Performance & Insights Analyst would use to answer questions like:
*Which segment of our loyalty base is driving revenue? Who is about to churn, and why?
What's this customer worth over the next 12 months? If we send this offer to this
segment, what's the expected lift?*

It is built on top of real, publicly released loyalty-program transaction data (the
Starbucks Rewards Capstone dataset) and implements the analytical stack a commercial
analytics team would actually run: RFM scoring, unsupervised segmentation, a supervised
churn model with explainability, discounted lifetime-value estimation, and offer
response / uplift analysis feeding a campaign simulator.

---

## Data source & honesty about what "real" means here

**Dataset: [Starbucks Rewards Capstone Challenge](https://github.com/joshuayeung/Starbucks-Capstone-Challenge)**
(originally distributed by Starbucks for the Udacity Data Scientist Nanodegree capstone
project; the three raw files used here — `portfolio.json`, `profile.json`,
`transcript.json` — were pulled directly from that public mirror, which reproduces the
original Udacity-distributed files byte-for-byte and is one of dozens of public mirrors
of the same dataset).

- **17,000** loyalty program members (demographics: age, gender, income, signup date)
- **10** distinct offers (BOGO, percentage/dollar discount, purely informational) with
  reward, difficulty, channel, and duration attributes
- **306,534** timestamped events over a **30-day** observation window: `offer received`,
  `offer viewed`, `offer completed`, and `transaction` (with dollar amount)

**Important honesty note:** Starbucks and Udacity describe this as *simulated* data that
was designed to mimic real customer behavior on the Starbucks Rewards mobile app — it is
not a raw export of production transaction logs. It is, however, the standard public
benchmark for loyalty-program analytics case studies precisely because it was built to
be structurally realistic: genuine offer mechanics (real BOGO/discount economics, real
channel mixes), a plausible right-skewed spend distribution, and response behavior that
varies meaningfully by demographic and offer design — which is exactly the structure
this suite needs to demonstrate RFM, clustering, churn modeling, CLV, and uplift analysis
faithfully. It was preferred over the fallback option (UCI Online Retail II) specifically
*because* it is F&B-loyalty-native and includes offer-response data, which Online Retail
II does not.

Raw files are not committed to this repo (`data_raw/` is git-ignored, ~40MB). The ETL
pipeline (`backend/etl/process_data.py`) transforms them into four compact Parquet
tables (~3MB total, committed under `backend/data/`) that the API reads at startup. See
[Reproducing the data](#reproducing-the-processed-data) below to regenerate them from
scratch.

---

## Methodology

### 1. RFM scoring
Each customer's Recency (days since last transaction, relative to the end of the 30-day
window), Frequency (transaction count), and Monetary (total spend) values are converted
to 1–5 quintile scores (`pandas.qcut` on rank to handle heavy ties). The three scores sum
to an RFM total (3–15) and combine into an `RFM cell` (e.g. `555` = best-in-class).

### 2. Segmentation (K-Means)
Customers are clustered (`k=5`, standardized features: recency, frequency, monetary,
tenure, offer-completion rate) into five segments. **Segment names are assigned by
matching each cluster's actual centroid profile to a descriptive label** — they are not
hard-coded to a fixed taxonomy. In this run, the natural clusters were:

| Segment | Profile |
|---|---|
| Loyal High-Value | Small group of whales — highest spend & CLV, strong offer engagement |
| Loyal Regulars | Large, frequent, engaged, moderate spend — the revenue backbone |
| Steady Regulars | Frequent but lower per-order value, moderate offer engagement |
| New / Developing | Newest tenure, still building purchase habits, highest churn |
| Lapsed | Long since any activity, near-zero frequency, effectively churned |

*Note: the data did not yield a cluster that was simultaneously "new" and cleanly
separable from "at risk" — those are two different axes (tenure vs. propensity), not one
cluster. Rather than force a name onto a cluster it doesn't describe, at-risk customers
are surfaced through the dedicated Churn Risk view, which cuts across all five segments.*

### 3. Churn prediction
A logistic regression classifier (class-weight balanced) predicts churn probability per
customer. **Churn is defined as no purchase in the final 7 days of the 30-day window**
(16.3% base rate) — a deliberately short inactivity threshold appropriate for a
high-frequency loyalty program, chosen after inspecting the full recency distribution
(median recency is 3 days; 90th percentile is 9.25 days).

**Leakage guard:** `recency_days` is excluded from the model's feature set, since it is
literally what the churn label is derived from — including it would make the model
trivially perfect and useless for identifying *drivers*. The 11 features used instead are
frequency, monetary, avg. order value, tenure, age, income, offer view/completion rates,
offers received, and gender indicators.

- **Test ROC-AUC: 0.82** (25% held-out split, stratified)
- Cross-checked against a gradient-boosted tree (XGBoost, same features): **0.81** —
  close agreement suggests the linear model isn't leaving much signal on the table
- Per-feature global importances (`|coefficient|`, standardized) and **per-customer signed
  contributions** (coefficient × standardized value) are exposed via the API, powering the
  "top churn drivers" shown for the whole model and for each individual customer

### 4. Customer lifetime value (CLV)
A 12-month, retention-discounted CLV: monthly spend (observed in the 30-day window,
treated as a monthly run-rate) is projected forward, discounted by `(1 − churn_prob)^t`
survival at each month `t` and a small monthly time-value discount (~12% annualized).

### 5. Offer response & uplift analysis
For every `offer received` event, the pipeline reconstructs the offer's validity window
(`received_time` → `received_time + duration`) and checks whether the customer viewed
and/or completed it within that window, plus their spend during it. This powers:
- Response-rate and average-spend comparisons (viewed vs. not-viewed) by offer type and
  by individual offer
- A **campaign simulator**: pick an offer type + target segment + audience size, and get
  a projected incremental revenue, reward cost, net uplift, ROI, and retention-lift
  estimate — all derived from the historical response rates of similar offers/segments.

**Caveat stated explicitly in the UI:** this is a historical-comparison projection, not a
causal/randomized estimate. "Viewed vs. not-viewed" can reflect selection effects (more
engaged customers may be more likely to view *and* more likely to buy regardless of the
offer), not purely the offer's causal effect. A production version would want a proper
holdout/control design or uplift modeling (e.g., two-model or class-transformation
approaches) to isolate incrementality.

---

## Architecture

```
loyalty-churn-analytics/
├── backend/
│   ├── etl/process_data.py     # raw JSON -> processed Parquet tables
│   ├── app/analytics.py        # RFM, KMeans, churn model, CLV, uplift (in-memory engine)
│   ├── app/main.py             # FastAPI routes
│   ├── data/*.parquet          # committed, processed, ~3MB total
│   └── requirements.txt
├── frontend/
│   ├── src/pages/               # Overview, SegmentBoard, ChurnRiskTable,
│   │                             CustomerProfile, CampaignSimulator
│   ├── src/components/          # RiskBadge, SegmentBadge, Sidebar
│   ├── src/api.ts, src/types.ts # typed API client
│   └── src/theme.css            # CRM design system (light, structured, data-table-heavy)
└── data_raw/                    # (git-ignored) raw Starbucks JSON, fetched by ETL
```

**Backend:** Python, FastAPI, pandas, scikit-learn, XGBoost (cross-check only). The
`AnalyticsEngine` builds the full analytics layer once at startup (RFM → clusters →
churn model → CLV → uplift lookups) and serves it from memory — no database, everything
reproducible from the committed Parquet files.

**Frontend:** React + TypeScript + Vite. Deliberately styled as a light, structured,
data-table-heavy CRM console (Salesforce/HubSpot-adjacent) rather than a dark
chart-dense analytics dashboard — segmented Kanban board, sortable/filterable tables,
color-coded status badges, and a customer-record detail page. Recharts is used only
where a chart genuinely adds value (revenue/churn-by-segment bars, a spend timeline, an
uplift comparison) — the primary interface is structured data, not charts for their own
sake.

### Views
1. **Overview** — portfolio KPI tiles (members, revenue, CLV, churn rate, model quality) + supporting charts
2. **Segment Board** — Kanban columns per K-Means segment with live counts and key stats
3. **Churn Risk** — sortable/filterable customer table, color-coded risk badges, global + per-row driver preview, plus a model-transparency panel
4. **Customer 360** — RFM scorecard, purchase timeline, CLV, churn drivers, recommended action, offer engagement history
5. **Campaign Simulator** — pick an offer type/segment/audience size, get a projected uplift, ROI, and retention lift, backed by real historical response-rate comparisons

---

## Setup & run

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs at `http://localhost:8000/docs` once running.

### Frontend

```bash
cd frontend
npm install
npm run dev        # dev server on :5173, proxies /api -> :8000
npm run build       # production build -> frontend/dist
```

### Reproducing the processed data

The committed `backend/data/*.parquet` files are already built. To regenerate them from
the raw Starbucks JSON (e.g. after modifying the ETL logic):

```bash
mkdir -p data_raw && cd data_raw
curl -sSL -o portfolio.json https://raw.githubusercontent.com/joshuayeung/Starbucks-Capstone-Challenge/master/data/portfolio.json
curl -sSL -o profile.json   https://raw.githubusercontent.com/joshuayeung/Starbucks-Capstone-Challenge/master/data/profile.json
curl -sSL -o transcript.json https://raw.githubusercontent.com/joshuayeung/Starbucks-Capstone-Challenge/master/data/transcript.json
cd ..
python backend/etl/process_data.py --raw-dir data_raw --out-dir backend/data
```

---

## Screenshots

*(placeholder — add screenshots of the Overview, Segment Board, Churn Risk table, and
Customer 360 views here, e.g. `docs/screenshots/*.png`, once captured from a running
instance.)*

---

## Limitations & TODOs

- **Single 30-day snapshot.** The dataset covers one observation window; there's no
  multi-period history to validate churn predictions against actual subsequent behavior
  or to build true cohort-retention curves.
- **Simulated, not production, data** (see Data Source section above) — realistic in
  structure but not real Starbucks transaction records.
- **Uplift is correlational, not causal.** No randomized holdout exists in the source
  data; the campaign simulator's projections should be read as directional estimates,
  not guaranteed outcomes.
- **CLV model is a simple retention-discounted projection**, not a full probabilistic
  model (e.g., BG/NBD + Gamma-Gamma) — a reasonable analyst-grade approximation, but a
  more rigorous version would model purchase frequency and dropout as separate
  stochastic processes.
- **No auth, no persistence layer.** This is a read-mostly analytics console over static
  processed data, not a multi-tenant production CRM.
- **Frontend bundle isn't code-split** (single ~650KB JS chunk) — fine for a portfolio
  demo, would want route-based lazy-loading in production.
- Segment names are derived from this specific run's cluster centroids; re-running the
  ETL/clustering on updated data could shift cluster composition and warrants re-checking
  that the assigned names still fit.
