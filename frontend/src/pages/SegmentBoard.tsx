import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSegments } from "../api";
import type { Segment } from "../types";
import { segmentColor } from "../segmentColors";

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function SegmentBoard() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSegments()
      .then((r) => setSegments(r.segments))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="empty-state">Loading segment board...</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Segment Board</h1>
        <p className="page-desc">
          K-Means clustering (recency, frequency, monetary, tenure, offer-completion rate)
          grouped into five CRM segments. Each column is a live pipeline stage &mdash; click through
          to drill into churn risk within a segment.
        </p>
      </div>

      <div className="kanban-board">
        {segments.map((s) => (
          <div className="kanban-col" key={s.segment}>
            <div className="kanban-col-head">
              <div className="kanban-seg-bar" style={{ background: segmentColor(s.segment) }} />
              <div className="kanban-seg-name">{s.segment}</div>
              <div>
                <span className="kanban-seg-count">{s.count.toLocaleString()}</span>
                <span className="kanban-seg-pct">{(s.pct_of_base * 100).toFixed(1)}% of base</span>
              </div>
            </div>
            <div className="kanban-stats">
              <div className="kanban-stat-row">
                <span className="kanban-stat-label">Avg RFM score</span>
                <span className="kanban-stat-value">{s.avg_rfm_score.toFixed(1)} / 15</span>
              </div>
              <div className="kanban-stat-row">
                <span className="kanban-stat-label">Avg recency</span>
                <span className="kanban-stat-value">{s.avg_recency_days.toFixed(1)}d</span>
              </div>
              <div className="kanban-stat-row">
                <span className="kanban-stat-label">Avg frequency</span>
                <span className="kanban-stat-value">{s.avg_frequency.toFixed(1)} orders</span>
              </div>
              <div className="kanban-stat-row">
                <span className="kanban-stat-label">Avg spend</span>
                <span className="kanban-stat-value">{fmtUSD(s.avg_monetary)}</span>
              </div>
              <div className="kanban-stat-row">
                <span className="kanban-stat-label">Avg 12mo CLV</span>
                <span className="kanban-stat-value">{fmtUSD(s.avg_clv_12m)}</span>
              </div>
              <div className="kanban-stat-row">
                <span className="kanban-stat-label">Revenue share</span>
                <span className="kanban-stat-value">{(s.revenue_share * 100).toFixed(1)}%</span>
              </div>
              <div className="kanban-stat-row">
                <span className="kanban-stat-label">Churn rate</span>
                <span className="kanban-stat-value" style={{ color: s.churn_rate > 0.3 ? "var(--status-critical)" : undefined }}>
                  {(s.churn_rate * 100).toFixed(1)}%
                </span>
              </div>
              <button
                className="btn"
                style={{ marginTop: 6 }}
                onClick={() => navigate(`/churn?segment=${encodeURIComponent(s.segment)}`)}
              >
                View members &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
