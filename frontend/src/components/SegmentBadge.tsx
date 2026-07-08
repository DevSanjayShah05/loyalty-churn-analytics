import { segmentColor } from "../segmentColors";

export default function SegmentBadge({ segment }: { segment: string }) {
  return (
    <span className="seg-badge">
      <span
        className="badge-dot"
        style={{ background: segmentColor(segment), width: 8, height: 8 }}
      />
      {segment}
    </span>
  );
}
