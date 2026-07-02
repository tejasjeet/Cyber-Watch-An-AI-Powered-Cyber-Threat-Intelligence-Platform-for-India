import { useEffect, useState } from "react";
import "../styles/authIntro.css";

function introTimings() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return { fadeAt: 0, unmountAt: 120 };
    }
  } catch {
    /* ignore */
  }
  return { fadeAt: 2550, unmountAt: 3300 };
}

/**
 * Full-screen "CYBER THREAT" split from center halves, scan line, then fade out before auth form.
 */
export default function AuthIntro({ onComplete }) {
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const { fadeAt, unmountAt } = introTimings();
    const fadeTimer = window.setTimeout(() => setFade(true), fadeAt);
    const doneTimer = window.setTimeout(() => {
      onComplete?.();
    }, unmountAt);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div className={`auth-intro-root ${fade ? "auth-intro-root--fade" : ""}`} aria-hidden="true">
      <div className="auth-intro-grid" />
      <div className="auth-intro-scan" />
      <div className="auth-intro-cluster">
        <div className="auth-intro-title-wrap">
          <div className="auth-intro-split auth-intro-split--top">
            <span>CYBER THREAT</span>
          </div>
          <div className="auth-intro-split auth-intro-split--bottom">
            <span>CYBER THREAT</span>
          </div>
          <div className="auth-intro-cut-line" aria-hidden />
        </div>
        <div className="auth-intro-sub">INDIA MISSION CONTROL</div>
        <div className="auth-intro-tag">SECURE ACCESS GATEWAY</div>
      </div>
    </div>
  );
}
