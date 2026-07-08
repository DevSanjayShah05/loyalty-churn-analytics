import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchChurnDrivers, fetchCustomers } from "../api";
import type { ChurnDrivers, CustomerRow, RiskBand } from "../types";
import RiskBadge from "../components/RiskBadge";
import SegmentBadge from "../components/SegmentBadge";
import { SEGMENT_ORDER } from "../segmentColors";

const PAGE_SIZE = 20;

const SORT_COLUMNS: { key: string; label: string }[] = [
  { key: "churn_prob", label: "Churn Risk" },
  { key: "clv_12m", label: "12mo CLV" },
  { key: "monetary", label: "Total Spend" },
  { key: "frequency", label: "Frequency" },
  { key: "recency_days", label: "Recency (days)" },
  { key: "rfm_score", label: "RFM Score" },
];

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function ChurnRiskTable() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const segment = params.get("segment") ?? "";
  const risk = params.get("risk") ?? "";
  const search = params.get("search") ?? "";
  const sortBy = params.get("sort_by") ?? "churn_prob";
  const descending = params.get("descending") !== "false";
  const page = Number(params.get("page") ?? "0");

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<ChurnDrivers | null>(null);

  useEffect(() => {
    fetchChurnDrivers().then(setDrivers);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCustomers({
      segment: segment || undefined,
      risk: risk || undefined,
      search: search || undefined,
      sort_by: sortBy,
      descending,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
      })
      .finally(() => setLoading(false));
  }, [segment, risk, search, sortBy, descending, page]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  function toggleSort(col: string) {
    const next = new URLSearchParams(params);
    if (sortBy === col) {
      next.set("descending", String(!descending));
    } else {
      next.set("sort_by", col);
      next.set("descending", "true");
    }
    setParams(next);
  }

  function goPage(delta: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(Math.max(0, page + delta)));
    setParams(next);
  }

  const maxImportance = drivers
    ? Math.max(...drivers.feature_importances.map((f) => f.importance))
    : 1;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Churn Risk</h1>
        <p className="page-desc">
          Logistic-regression churn propensity scored for every member. Sort, filter, and drill
          into a customer to see their individual drivers and recommended retention action.
        </p>
      </div>

      {drivers && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <span className="card-title">Model transparency &mdash; global churn drivers</span>
            <span className="pill">
              ROC-AUC {drivers.test_roc_auc.toFixed(2)}
              {drivers.xgboost_roc_auc ? ` · XGB check ${drivers.xgboost_roc_auc.toFixed(2)}` : ""}
            </span>
          </div>
          <div className="card-body">
            {drivers.feature_importances.slice(0, 6).map((f) => (
              <div className="driver-row" key={f.feature}>
                <span style={{ width: 170, flexShrink: 0 }}>{f.label}</span>
                <div className="driver-bar-track">
                  <div
                    className="driver-bar-fill"
                    style={{
                      width: `${(f.importance / maxImportance) * 100}%`,
                      background: f.coefficient > 0 ? "var(--status-critical)" : "var(--status-good)",
                    }}
                  />
                </div>
                <span style={{ width: 130, textAlign: "right", color: "var(--text-secondary)", fontSize: 11.5 }}>
                  {f.direction}
                </span>
              </div>
            ))}
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
              {drivers.target}. {drivers.note}
            </p>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <select className="select" value={segment} onChange={(e) => updateParam("segment", e.target.value)}>
          <option value="">All segments</option>
          {SEGMENT_ORDER.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="select" value={risk} onChange={(e) => updateParam("risk", e.target.value)}>
          <option value="">All risk bands</option>
          {(["Low", "Medium", "High"] as RiskBand[]).map((r) => (
            <option key={r} value={r}>{r} risk</option>
          ))}
        </select>
        <input
          className="text-input"
          placeholder="Search by customer ID..."
          value={search}
          onChange={(e) => updateParam("search", e.target.value)}
        />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{total.toLocaleString()} customers</span>
      </div>

      <div className="card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Segment</th>
                {SORT_COLUMNS.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sortBy === c.key && <span className="sort-arrow">{descending ? "↓" : "↑"}</span>}
                  </th>
                ))}
                <th>Risk</th>
                <th>Top driver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person_id} onClick={() => navigate(`/customers/${r.person_id}`)}>
                  <td className="mono">{r.person_id.slice(0, 10)}&hellip;</td>
                  <td><SegmentBadge segment={r.segment} /></td>
                  <td>{r.churn_prob.toFixed(3)}</td>
                  <td>{fmtUSD(r.clv_12m)}</td>
                  <td>{fmtUSD(r.monetary)}</td>
                  <td>{r.frequency}</td>
                  <td>{r.recency_days.toFixed(1)}</td>
                  <td>{r.rfm_score}</td>
                  <td><RiskBadge band={r.churn_risk_band} /></td>
                  <td style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {r.top_drivers[0]?.feature ?? "—"}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-state">No customers match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>
            Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button className="btn" disabled={page === 0} onClick={() => goPage(-1)}>Prev</button>
          <button className="btn" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => goPage(1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
