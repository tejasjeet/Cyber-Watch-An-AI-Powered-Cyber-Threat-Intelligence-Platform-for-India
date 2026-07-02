/** In-memory victim rows last produced by the Python scraper (dashboard reads this, not Mongo). */
let items = [];

export function setIntelItems(next) {
  items = Array.isArray(next) ? next : [];
}

export function getIntelItems() {
  return items;
}

export function clearIntelItems() {
  items = [];
}
