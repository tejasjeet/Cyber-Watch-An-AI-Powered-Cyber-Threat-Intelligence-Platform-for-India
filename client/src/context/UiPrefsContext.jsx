import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "cw_ui_prefs_v1";

/** @typedef {'cyber-dark' | 'midnight-blue' | 'matrix-green' | 'crimson-red'} ThemeId */
/** @typedef {'minimal' | 'standard' | 'high'} AnimationIntensity */
/** @typedef {'classic' | 'neon'} ThreatColorMode */
/** @typedef {'12h' | '24h'} TimeFormat */

const DEFAULTS = {
  themeId: /** @type {ThemeId} */ ("cyber-dark"),
  animationIntensity: /** @type {AnimationIntensity} */ ("standard"),
  threatColorMode: /** @type {ThreatColorMode} */ ("classic"),
  timeFormat: /** @type {TimeFormat} */ ("24h"),
};

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw);
    return {
      themeId: ["cyber-dark", "midnight-blue", "matrix-green", "crimson-red"].includes(o.themeId)
        ? o.themeId
        : DEFAULTS.themeId,
      animationIntensity: ["minimal", "standard", "high"].includes(o.animationIntensity)
        ? o.animationIntensity
        : DEFAULTS.animationIntensity,
      threatColorMode: o.threatColorMode === "neon" ? "neon" : "classic",
      timeFormat: o.timeFormat === "12h" ? "12h" : "24h",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeStored(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function applyDom(prefs) {
  const root = document.documentElement;
  if (prefs.themeId === "cyber-dark") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", prefs.themeId);
  }
  root.setAttribute("data-anim", prefs.animationIntensity);
  root.setAttribute("data-threat", prefs.threatColorMode);
  root.style.colorScheme = prefs.themeId === "matrix-green" ? "dark" : "dark";
}

const UiPrefsContext = createContext(null);

export function UiPrefsProvider({ children }) {
  const [prefs, setPrefsState] = useState(() => readStored());

  useLayoutEffect(() => {
    applyDom(prefs);
    writeStored(prefs);
  }, [prefs]);

  const setThemeId = useCallback((themeId) => {
    const id = ["cyber-dark", "midnight-blue", "matrix-green", "crimson-red"].includes(themeId) ? themeId : DEFAULTS.themeId;
    setPrefsState((p) => ({ ...p, themeId: id }));
  }, []);

  const setAnimationIntensity = useCallback((animationIntensity) => {
    const v = ["minimal", "standard", "high"].includes(animationIntensity) ? animationIntensity : DEFAULTS.animationIntensity;
    setPrefsState((p) => ({ ...p, animationIntensity: v }));
  }, []);

  const setThreatColorMode = useCallback((threatColorMode) => {
    const v = threatColorMode === "neon" ? "neon" : "classic";
    setPrefsState((p) => ({ ...p, threatColorMode: v }));
  }, []);

  const setTimeFormat = useCallback((timeFormat) => {
    const v = timeFormat === "12h" ? "12h" : "24h";
    setPrefsState((p) => ({ ...p, timeFormat: v }));
  }, []);

  const formatDateTime = useCallback(
    (input) => {
      const d = input instanceof Date ? input : new Date(input);
      if (!Number.isFinite(d.getTime())) return "—";
      const hour12 = prefs.timeFormat === "12h";
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        hour12,
        timeZone: "Asia/Kolkata",
      }).format(d);
    },
    [prefs.timeFormat]
  );

  const value = useMemo(
    () => ({
      ...prefs,
      setThemeId,
      setAnimationIntensity,
      setThreatColorMode,
      setTimeFormat,
      formatDateTime,
    }),
    [prefs, setThemeId, setAnimationIntensity, setThreatColorMode, setTimeFormat, formatDateTime]
  );

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}

export function useUiPrefs() {
  const ctx = useContext(UiPrefsContext);
  if (!ctx) throw new Error("useUiPrefs must be used within UiPrefsProvider");
  return ctx;
}
