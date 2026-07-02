/** API base for fetch (e.g. VITE_API_BASE=http://localhost:4000 in .env). */
export function apiPath(p) {
  const base = import.meta.env.VITE_API_BASE || "";
  return `${base}${p}`;
}
