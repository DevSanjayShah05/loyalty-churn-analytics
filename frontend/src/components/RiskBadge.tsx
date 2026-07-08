import type { RiskBand } from "../types";

export default function RiskBadge({ band }: { band: RiskBand }) {
  return (
    <span className={`badge risk-${band}`}>
      <span className="badge-dot" />
      {band}
    </span>
  );
}
