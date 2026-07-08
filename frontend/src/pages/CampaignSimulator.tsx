import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchUplift, simulateCampaign } from "../api";
import type { CampaignResult, UpliftResponse } from "../types";

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function CampaignSimulator() {
  const [uplift, setUplift] = useState<UpliftResponse | null>(null);
  const [offerType, setOfferType] = useState("discount");
  const [targetSegment, setTargetSegment] = useState("All");
  const [audienceSize, setAudienceSize] = useState(2000);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchUplift().then((r) => {
      setUplift(r);
      if (r.offer_type_options.length > 0) setOfferType(r.offer_type_options[0]);
    });
  }, []);

  async function runSimulation() {
    setRunning(true);
    try {
      const r = await simulateCampaign({
        offer_type: offerType,
        target_segment: targetSegment === "All" ? undefined : targetSegment,
        audience_size: audienceSize,
      });
      setResult(r);
    } finally {
      setRunning(false);
    }
  }

  const spendCompare =
    uplift?.by_offer_type.map((t) => ({
      name: t.offer_type,
      Viewed: t.avg_spend_viewed,
      "Not viewed": t.avg_spend_not_viewed,
    })) ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Campaign Simulator</h1>
        <p className="page-desc">
          Projects incremental spend and retention lift for a hypothetical offer send, using
          observed response rates from the historical BOGO / discount / informational offer log.
        </p>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header"><span className="card-title">Simulate a send</span></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field">
              <label>Offer type</label>
              <select className="select" value={offerType} onChange={(e) => setOfferType(e.target.value)}>
                {uplift?.offer_type_options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Target segment</label>
              <select className="select" value={targetSegment} onChange={(e) => setTargetSegment(e.target.value)}>
                <option value="All">All segments</option>
                {uplift?.segment_options.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Audience size</label>
              <input
                className="text-input"
                type="number"
                min={1}
                max={17000}
                value={audienceSize}
                onChange={(e) => setAudienceSize(Number(e.target.value))}
              />
            </div>
            <button className="btn btn-primary" onClick={runSimulation} disabled={running}>
              {running ? "Simulating..." : "Run simulation"}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Projected outcome</span></div>
          <div className="card-body">
            {!result && <div className="empty-state">Run a simulation to see projected uplift.</div>}
            {result?.error && <div className="empty-state">{result.error}</div>}
            {result && !result.error && (
              <>
                <div className="hero-metric">
                  <div className="value">{fmtUSD(result.projected_net_uplift)}</div>
                  <div className="label">Projected net revenue uplift</div>
                </div>
                <div className="result-row">
                  <span className="k">Target</span>
                  <span className="v">{result.inputs.target_segment}</span>
                </div>
                <div className="result-row">
                  <span className="k">Expected view rate</span>
                  <span className="v">{(result.expected_view_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="result-row">
                  <span className="k">Expected completion rate</span>
                  <span className="v">{(result.expected_completion_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="result-row">
                  <span className="k">Expected responders</span>
                  <span className="v">{result.expected_responders.toLocaleString()}</span>
                </div>
                <div className="result-row">
                  <span className="k">Incremental spend / customer</span>
                  <span className="v">{fmtUSD(result.incremental_spend_per_customer)}</span>
                </div>
                <div className="result-row">
                  <span className="k">Estimated reward cost</span>
                  <span className="v">{fmtUSD(result.estimated_reward_cost)}</span>
                </div>
                <div className="result-row">
                  <span className="k">Retention lift</span>
                  <span className="v">
                    +{(result.retention_lift_pp * 100).toFixed(1)} pp ({result.customers_retained.toLocaleString()} retained)
                  </span>
                </div>
                <div className="result-row">
                  <span className="k">ROI</span>
                  <span className="v">{result.roi !== null ? `${result.roi.toFixed(1)}x` : "n/a"}</span>
                </div>
                <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>
                  Based on {result.historical_instances.toLocaleString()} historical offer instances of
                  this type. Not a causal estimate &mdash; viewed vs. not-viewed comparison may reflect
                  selection effects, not just offer impact.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-header">
          <span className="card-title">Observed spend uplift: viewed vs. not viewed, by offer type</span>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={spendCompare} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--gridline)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--border-strong)" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 10.5, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtUSD(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Viewed" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Not viewed" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
