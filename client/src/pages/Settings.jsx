import { Link } from "react-router-dom";
import { ChevronRight, Palette, Zap, Shield, Clock, UserCircle } from "lucide-react";
import { useUiPrefs } from "../context/UiPrefsContext.jsx";

const THEMES = [
  { id: "cyber-dark", title: "Cyber Dark", sub: "Default mission control" },
  { id: "midnight-blue", title: "Midnight Blue", sub: "Cool blues & indigo glow" },
  { id: "matrix-green", title: "Matrix Green", sub: "Terminal phosphor vibe" },
  { id: "crimson-red", title: "Crimson Red", sub: "High-alert crimson accents" },
];

const ANIM = [
  { id: "minimal", title: "Minimal", sub: "Faster transitions, less glow" },
  { id: "standard", title: "Standard", sub: "Balanced motion" },
  { id: "high", title: "High", sub: "Richer glow & entrance motion" },
];

const THREAT = [
  { id: "classic", title: "Classic", sub: "SOC-style flat badges" },
  { id: "neon", title: "Neon", sub: "Critical red · High orange · Moderate blue glow" },
];

const TIME_FMT = [
  { id: "24h", title: "24 hour", sub: "e.g. 14:30" },
  { id: "12h", title: "12 hour", sub: "e.g. 2:30 PM" },
];

function OptGrid({ children }) {
  return <div className="cw-settings-opt-grid">{children}</div>;
}

function OptBtn({ active, onClick, title, sub }) {
  return (
    <button type="button" className={`cw-settings-opt${active ? " cw-settings-opt--active" : ""}`} onClick={onClick}>
      <span className="cw-settings-opt-title">{title}</span>
      <span className="cw-settings-opt-sub">{sub}</span>
    </button>
  );
}

export default function Settings() {
  const {
    themeId,
    setThemeId,
    animationIntensity,
    setAnimationIntensity,
    threatColorMode,
    setThreatColorMode,
    timeFormat,
    setTimeFormat,
    formatDateTime,
  } = useUiPrefs();

  const preview = formatDateTime(new Date());

  return (
    <>
      <div className="cw-page-head">
        <h1 className="cw-page-title">Settings</h1>
        <p className="cw-page-sub" style={{ marginTop: "0.35rem", color: "var(--cw-muted)", fontSize: "0.82rem" }}>
          Appearance, motion, and display preferences are saved in this browser.
        </p>
      </div>

      <div className="cw-card cw-settings-section" style={{ maxWidth: 820 }}>
        <h2 className="cw-card-title" style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
          <UserCircle size={18} aria-hidden />
          1. Account settings
        </h2>
        <p className="cw-settings-hint">Edit display name, phone, avatar, and sign-in identity.</p>
        <Link to="/profile" className="cw-settings-link-card">
          <div>
            <strong>My profile</strong>
            <span>Open profile editor</span>
          </div>
          <ChevronRight size={18} aria-hidden />
        </Link>
      </div>

      <div className="cw-card cw-settings-section" style={{ maxWidth: 820 }}>
        <h2 className="cw-card-title" style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
          <Palette size={18} aria-hidden />
          2. Theme
        </h2>
        <p className="cw-settings-hint">
          Updates glow, buttons, chart accents, borders, and shell backdrop instantly (CSS variables).
        </p>
        <OptGrid>
          {THEMES.map((t) => (
            <OptBtn
              key={t.id}
              active={themeId === t.id}
              onClick={() => setThemeId(t.id)}
              title={t.title}
              sub={t.sub}
            />
          ))}
        </OptGrid>
      </div>

      <div className="cw-card cw-settings-section" style={{ maxWidth: 820 }}>
        <h2 className="cw-card-title" style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
          <Zap size={18} aria-hidden />
          3. Animation intensity
        </h2>
        <p className="cw-settings-hint">
          Controls transition speed, background glow, hover lift, and decorative motion. Try switching
          modes and hovering cards on the dashboard — refresh the page to see entrance animation changes.
        </p>
        <OptGrid>
          {ANIM.map((t) => (
            <OptBtn
              key={t.id}
              active={animationIntensity === t.id}
              onClick={() => setAnimationIntensity(t.id)}
              title={t.title}
              sub={t.sub}
            />
          ))}
        </OptGrid>
      </div>

      <div className="cw-card cw-settings-section" style={{ maxWidth: 820 }}>
        <h2 className="cw-card-title" style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
          <Shield size={18} aria-hidden />
          4. Threat level color mode
        </h2>
        <p className="cw-settings-hint">
          <strong>Classic</strong> — flat SOC badges. <strong>Neon</strong> — critical red, high orange, moderate blue with glow
          (CRITICAL / ALERT / PROBING emphasis).
        </p>
        <OptGrid>
          {THREAT.map((t) => (
            <OptBtn
              key={t.id}
              active={threatColorMode === t.id}
              onClick={() => setThreatColorMode(t.id)}
              title={t.title}
              sub={t.sub}
            />
          ))}
        </OptGrid>
      </div>

      <div className="cw-card cw-settings-section" style={{ maxWidth: 820 }}>
        <h2 className="cw-card-title" style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
          <Clock size={18} aria-hidden />
          5. Time format
        </h2>
        <p className="cw-settings-hint">
          Used for notification timestamps and report headers. Preview: <strong style={{ color: "var(--cw-cyan)" }}>{preview}</strong>
        </p>
        <OptGrid>
          {TIME_FMT.map((t) => (
            <OptBtn
              key={t.id}
              active={timeFormat === t.id}
              onClick={() => setTimeFormat(t.id)}
              title={t.title}
              sub={t.sub}
            />
          ))}
        </OptGrid>
      </div>
    </>
  );
}
