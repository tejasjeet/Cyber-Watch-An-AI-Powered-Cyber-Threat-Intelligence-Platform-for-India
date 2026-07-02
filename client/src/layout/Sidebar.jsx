import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Radio,
  Map,
  ShieldAlert,
  UsersRound,
  UserX,
  Database,
  FileBarChart,
  UserCircle2,
  Link2,
  FileWarning,
} from "lucide-react";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/live", label: "Live Feed", icon: Radio },
  { to: "/map", label: "Map View", icon: Map },
  { to: "/attacks", label: "Attacks", icon: ShieldAlert },
  { to: "/groups", label: "Ransomware Groups", icon: UsersRound },
  { to: "/victims", label: "Victims", icon: UserX },
  { to: "/leaks", label: "Data Leaks", icon: Database },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/phishing-scanner", label: "Phishing Scanner", icon: Link2 },
  { to: "/crime-reporting", label: "Crime Reporting", icon: FileWarning },
];

export default function Sidebar() {
  return (
    <aside className="cw-sidebar">
      <div className="cw-brand">
        <div className="cw-brand-title">CYBER WATCH</div>
        <div className="cw-brand-sub">INDIA MISSION CONTROL</div>
      </div>
      <nav className="cw-nav">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon strokeWidth={1.75} />
            {label.toUpperCase()}
          </NavLink>
        ))}
        <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
          <UserCircle2 strokeWidth={1.75} />
          MY PROFILE
        </NavLink>
      </nav>
      <div className="cw-sidebar-foot">
        <span className="cw-dot-live" />
        SYSTEM STATUS
      </div>
    </aside>
  );
}
