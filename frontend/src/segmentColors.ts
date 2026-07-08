// Fixed categorical color assignment for the 5 CRM segments, in the same
// order the backend returns them (_segment_order in analytics.py). Colors
// are assigned by position, never by rank/churn-rate/value, per the dataviz
// palette rule: "categorical hues are assigned in fixed order, never cycled."
export const SEGMENT_ORDER = [
  "Loyal High-Value",
  "Loyal Regulars",
  "Steady Regulars",
  "New / Developing",
  "Lapsed",
];

const SEGMENT_COLOR_VARS: Record<string, string> = {
  "Loyal High-Value": "var(--series-1)",
  "Loyal Regulars": "var(--series-2)",
  "Steady Regulars": "var(--series-3)",
  "New / Developing": "var(--series-4)",
  Lapsed: "var(--series-5)",
};

export function segmentColor(segment: string): string {
  return SEGMENT_COLOR_VARS[segment] ?? "var(--series-6)";
}
