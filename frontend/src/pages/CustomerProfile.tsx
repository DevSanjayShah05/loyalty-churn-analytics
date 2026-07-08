import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchCustomer360 } from "../api";
import type { Customer360 } from "../types";
import RiskBadge from "../components/RiskBadge";
import SegmentBadge from "../components/SegmentBadge";

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function CustomerProfile() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState<Customer360 | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!personId) return;
    setC(null);
    setNotFound(false);
    fetchCustomer360(personId).catch(() => setNotFound(true)).then((r) => {
      if (r) setC(r as Customer360);
    });
  }, [personId]);

  if (notFound) {
    return (
      <div className="page">
        <div className="empty-state">Customer not found.</div>
        <button className="btn" onClick={() => navigate(-1)}>&larr; Back</button>
      </div>
    );
  }

  if (!c) {
    return (
      <div className="page">
        <div className="empty-state">Loading customer 360...</div>
      </div>
    );
  }

  const maxDriver = Math.max(...c.top_drivers.map((d) => Math.abs(d.contribution)), 0.01);

  return (
    <div className="page">
      <button className="link-btn" style={{ marginBottom: 14 }} onClick={() => navigate(-1)}>
        &larr; Back to list
      </button>

      <div className="profile-header">
        <div className="profile-id-block">
          <div className="avatar">{c.person_id.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="mono" style={{ fontSize: 13, color: "var(--text-primary)" }}>{c.person_id}</div>
            <div className="profile-meta">
              <SegmentBadge segment={c.segment} /> &middot; Member since {c.became_member_on} &middot;{" "}
              {c.tenure_days.toLocaleString()} days tenure
              {c.gender && ` · ${c.gender}`}
              {c.age && ` · Age ${c.age}`}
              {c.income && ` · $${c.income.toLocaleString()} income`}
            </div>
          </div>
        </div>
        <RiskBadge band={c.churn_risk_band} />
      </div>

      <div className="profile-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">RFM Scorecard</span></div>
            <div className="card-body">
              <div className="rfm-cells">
                <div className="rfm-cell">
                  <div className="rfm-cell-label">Recency</div>
                  <div className="rfm-cell-value">{c.rfm.r_score}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{c.rfm.recency_days}d ago</div>
                </div>
                <div className="rfm-cell">
                  <div className="rfm-cell-label">Frequency</div>
                  <div className="rfm-cell-value">{c.rfm.f_score}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{c.rfm.frequency} orders</div>
                </div>
                <div className="rfm-cell">
                  <div className="rfm-cell-label">Monetary</div>
                  <div className="rfm-cell-value">{c.rfm.m_score}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{fmtUSD(c.rfm.monetary)}</div>
                </div>
                <div className="rfm-cell">
                  <div className="rfm-cell-label">RFM Total</div>
                  <div className="rfm-cell-value">{c.rfm.rfm_score}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>cell {c.rfm.rfm_cell}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Purchase history timeline</span></div>
            <div className="card-body">
              {c.transaction_timeline.length === 0 ? (
                <div className="empty-state">No transactions recorded in this 30-day window.</div>
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={c.transaction_timeline} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--seq-300)" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="var(--seq-300)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--gridline)" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(v) => `d${v}`}
                      tick={{ fontSize: 10.5, fill: "var(--text-muted)" }}
                      axisLine={{ stroke: "var(--border-strong)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 10.5, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip
                      formatter={(v) => fmtUSD(Number(v))}
                      labelFormatter={(v) => `Day ${v}`}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                    />
                    <Area type="monotone" dataKey="amount" stroke="var(--seq-500)" strokeWidth={2} fill="url(#spendFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Offer engagement history</span></div>
            <div className="card-body">
              {c.offer_history.length === 0 ? (
                <div className="empty-state">No offers received.</div>
              ) : (
                c.offer_history.map((o, i) => (
                  <div className="offer-item" key={i}>
                    <span>{o.offer} &middot; day {o.received_day}</span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <span className={`pill ${o.viewed ? "pill-good" : "pill-muted"}`}>
                        {o.viewed ? "Viewed" : "Not viewed"}
                      </span>
                      <span className={`pill ${o.completed ? "pill-good" : "pill-muted"}`}>
                        {o.completed ? "Completed" : "Incomplete"}
                      </span>
                      <span className="pill">{fmtUSD(o.spend_in_window)}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-body">
              <div className="hero-metric">
                <div className="value">{fmtUSD(c.clv_12m)}</div>
                <div className="label">Projected 12-month customer lifetime value</div>
              </div>
              <div className="result-row">
                <span className="k">Churn probability</span>
                <span className="v">{(c.churn_prob * 100).toFixed(1)}%</span>
              </div>
              <div className="result-row">
                <span className="k">Expected lifetime</span>
                <span className="v">{c.expected_lifetime_months.toFixed(1)} mo</span>
              </div>
              <div className="result-row">
                <span className="k">Avg order value</span>
                <span className="v">{fmtUSD(c.avg_order_value)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Top churn drivers (this customer)</span></div>
            <div className="card-body">
              {c.top_drivers.map((d) => (
                <div className="driver-row" key={d.feature}>
                  <span style={{ width: 140, flexShrink: 0 }}>{d.feature}</span>
                  <div className="driver-bar-track">
                    <div
                      className="driver-bar-fill"
                      style={{
                        width: `${(Math.abs(d.contribution) / maxDriver) * 100}%`,
                        background: d.contribution > 0 ? "var(--status-critical)" : "var(--status-good)",
                        marginLeft: d.contribution > 0 ? "50%" : undefined,
                      }}
                    />
                  </div>
                  <span style={{ width: 100, textAlign: "right", fontSize: 11, color: "var(--text-secondary)" }}>
                    {d.direction}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Recommended action</span></div>
            <div className="card-body">
              <div className="action-callout">
                <span>&#9679;</span>
                <span>{c.recommended_action}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Offer engagement</span></div>
            <div className="card-body">
              <div className="result-row">
                <span className="k">Offers received</span>
                <span className="v">{c.engagement.offers_received}</span>
              </div>
              <div className="result-row">
                <span className="k">View rate</span>
                <span className="v">{(c.engagement.offer_view_rate * 100).toFixed(0)}%</span>
              </div>
              <div className="result-row">
                <span className="k">Completion rate</span>
                <span className="v">{(c.engagement.offer_completion_rate * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
