import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Overview", icon: "grid" },
  { to: "/segments", label: "Segment Board", icon: "columns" },
  { to: "/churn", label: "Churn Risk", icon: "alert" },
  { to: "/campaign", label: "Campaign Simulator", icon: "target" },
];

function Icon({ name }: { name: string }) {
  const common = {
    className: "nav-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "columns":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="4.5" height="16" rx="1" />
          <rect x="9.75" y="4" width="4.5" height="10" rx="1" />
          <rect x="16.5" y="4" width="4.5" height="13" rx="1" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M10.3 3.9 2 18a1.8 1.8 0 0 0 1.5 2.7h17a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 16.5h.01" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.6" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-text">
          <span className="brand-title">Foot &amp; Frequency</span>
          <span className="brand-sub">Loyalty Analytics</span>
        </div>
      </div>

      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/"}
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          <Icon name={l.icon} />
          {l.label}
        </NavLink>
      ))}

      <div className="sidebar-footer">
        Starbucks Capstone dataset
        <br />
        17,000 loyalty members
      </div>
    </nav>
  );
}
