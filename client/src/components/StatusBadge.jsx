import "./StatusBadge.css";

const MAP = {
  ALERT: "st-alert",
  MITIGATED: "st-mitigated",
  CRITICAL: "st-critical",
  PROBING: "st-probing",
  "DATA LEAK VERIFIED": "st-leak",
  VERIFIED: "st-verified",
  ACTIVE: "st-active",
  DISBANDED: "st-disbanded",
  "IN MAINTENANCE": "st-maint",
  DYNAMIC: "st-dynamic",
  RESTRICTED: "st-restricted",
  "TOP SECRET": "st-secret",
  CONFIDENTIAL: "st-conf",
};

export default function StatusBadge({ children, className = "" }) {
  const key = String(children || "").trim();
  const cls = MAP[key] || "st-default";
  return <span className={`status-badge ${cls} ${className}`.trim()}>{children}</span>;
}
