import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchOverview, fetchSegments } from "../api";
import type { Overview as OverviewT, Segment } from "../types";
import { segmentColor } from "../segmentColors";

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function Overview() {
  const [ov, setOv] = useState<OverviewT | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchOverview(), fetchSegments()])
      .then(([o, s]) => {
        setOv(o);
        setSegments(s.segments);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !ov) {
    return (
      <div className="page">
        <div className="empty-state">Loading portfolio metrics...</div>
      </div>
    );
  }

  const revenueData = segments.map((s) => ({
    name: s.segment,
    value: Math.round(s.revenue_share * ov.total_revenue),
  }));
  const churnData = segments.map((s) => ({
    name: s.segment,
    value: Math.round(s.churn_rate * 1000) / 10,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Portfolio Overview</h1>
        <p className="page-desc">
          A 30-day snapshot of the Starbucks rewards loyalty base: {ov.n_customers.toLocaleString()}{" "}
          members, RFM-scored, clustered, and scored for churn risk and 12-month lifetime value.
        </p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-tile">
          <div className="kpi-label">Loyalty members</div>
          <div className="kpi-value">{ov.n_customers.toLocaleString()}</div>
          <div className="kpi-note">{ov.n_active.toLocaleString()} transacted in-window</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Window revenue</div>
          <div className="kpi-value">{fmtUSD(ov.total_revenue)}</div>
          <div className="kpi-note">Avg order value {fmtUSD(ov.avg_order_value)}</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Projected 12mo CLV</div>
          <div className="kpi-value">{fmtUSD(ov.total_clv_12m)}</div>
          <div className="kpi-note">Avg {fmtUSD(ov.avg_clv_12m)} / member</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Churn rate</div>
          <div className="kpi-value">{fmtPct(ov.churn_rate)}</div>
          <div className="kpi-note">{ov.high_risk_customers.toLocaleString()} flagged high-risk</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Churn model quality</div>
          <div className="kpi-value">{ov.model_roc_auc.toFixed(2)}</div>
          <div className="kpi-note">Test ROC-AUC, logistic regression</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Active offers</div>
          <div className="kpi-value">{ov.n_offers}</div>
          <div className="kpi-note">BOGO, discount &amp; informational</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Revenue by segment</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={revenueData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--gridline)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10.5, fill: "var(--text-muted)" }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={58}
                  axisLine={{ stroke: "var(--border-strong)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10.5, fill: "var(--text-muted)" }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => fmtUSD(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {revenueData.map((d) => (
                    <Cell key={d.name} fill={segmentColor(d.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Churn rate by segment</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={churnData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--gridline)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10.5, fill: "var(--text-muted)" }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={58}
                  axisLine={{ stroke: "var(--border-strong)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10.5, fill: "var(--text-muted)" }}
                  tickFormatter={(v) => `${v}%`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => `${v}%`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} fill="var(--status-critical)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
