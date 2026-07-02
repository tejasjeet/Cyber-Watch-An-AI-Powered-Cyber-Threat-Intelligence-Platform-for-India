import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Stethoscope, Landmark, ExternalLink, BarChart3, List } from "lucide-react";
import { useData } from "../context/DataContext.jsx";
import {
  ALL_SECTOR_LABELS,
  victimRowsFromItems,
  inferSector,
  inferState,
  pickVictimStatus,
  safeHostname,
  parseRowTime,
  rowTextSearchHaystack,
  normalizeSearchQuery,
} from "../utils/insights.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { analysisPagePath } from "../utils/analysisUrl.js";
import { formatDateKeyIST } from "../utils/datetimeIST.js";

const STATE_NONE = "__none__";

function companyKey(row) {
  const host = safeHostname(row.website);
  const t = (row.target || "").trim();
  const raw = (host || t || row.victim_id || "").toLowerCase();
  return raw || String(row.victim_id);
}

function companyDisplay(row) {
  return (safeHostname(row.website) || (row.target || "").trim() || "—").toUpperCase();
}

function buildCompanyAggregates(filteredItems) {
  const m = new Map();
  for (const row of filteredItems) {
    const key = companyKey(row);
    const display = companyDisplay(row);
    const ts = parseRowTime(row) || 0;
    const g = row.group || "Unknown";

    if (!m.has(key)) {
      m.set(key, {
        key,
        display,
        count: 0,
        groups: new Map(),
        sectors: new Set(),
        lastTs: 0,
        previewRow: row,
      });
    }
    const agg = m.get(key);
    agg.count += 1;
    agg.groups.set(g, (agg.groups.get(g) || 0) + 1);
    agg.sectors.add(inferSector(row));
    if (ts >= agg.lastTs) {
      agg.lastTs = ts;
      agg.previewRow = row;
    }
  }

  return [...m.values()].map((a) => ({
    ...a,
    groupsList: [...a.groups.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])),
    sectorsLabel: [...a.sectors].sort().join(", ") || "—",
    lastDate:
      a.lastTs > 0
        ? formatDateKeyIST(a.lastTs)
        : a.previewRow.discovered_date ||
          (a.previewRow.updated_at ? String(a.previewRow.updated_at).slice(0, 10) : "—"),
  }));
}

function sortIncidentItems(items, sortId) {
  const arr = [...items];
  const cmpEntity = (a, b) => companyDisplay(a).localeCompare(companyDisplay(b));
  switch (sortId) {
    case "discovered_asc":
      arr.sort((a, b) => (parseRowTime(a) || 0) - (parseRowTime(b) || 0));
      break;
    case "entity_desc":
      arr.sort((a, b) => cmpEntity(b, a));
      break;
    case "entity_asc":
      arr.sort(cmpEntity);
      break;
    case "group_asc":
      arr.sort((a, b) => (a.group || "Unknown").localeCompare(b.group || "Unknown"));
      break;
    case "sector_asc":
      arr.sort((a, b) => inferSector(a).localeCompare(inferSector(b)));
      break;
    case "status_asc":
      arr.sort((a, b) => pickVictimStatus(a).localeCompare(pickVictimStatus(b)));
      break;
    case "discovered_desc":
    default:
      arr.sort((a, b) => (parseRowTime(b) || 0) - (parseRowTime(a) || 0));
      break;
  }
  return arr;
}

function sortCompanyAggregates(aggs, sortId) {
  const arr = [...aggs];
  switch (sortId) {
    case "company_count_asc":
      arr.sort((a, b) => a.count - b.count || a.display.localeCompare(b.display));
      break;
    case "company_name_asc":
      arr.sort((a, b) => a.display.localeCompare(b.display));
      break;
    case "company_groups_desc":
      arr.sort((a, b) => b.groups.size - a.groups.size || b.count - a.count);
      break;
    case "company_count_desc":
    default:
      arr.sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
      break;
  }
  return arr;
}

export default function Victims() {
  const { items, loading, error, load } = useData();
  const [searchText, setSearchText] = useState("");
  const q = normalizeSearchQuery(searchText);

  const [view, setView] = useState("incidents");
  const [filterSector, setFilterSector] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterState, setFilterState] = useState("");
  const [sortIncidents, setSortIncidents] = useState("discovered_desc");
  const [sortCompany, setSortCompany] = useState("company_count_desc");

  const filterOptions = useMemo(() => {
    const sectors = [...ALL_SECTOR_LABELS];
    const groups = [...new Set(items.map((r) => r.group || "Unknown"))].sort((a, b) => a.localeCompare(b));
    const statuses = [...new Set(items.map((r) => pickVictimStatus(r)))].sort((a, b) => a.localeCompare(b));
    const states = new Set();
    for (const r of items) {
      const st = inferState(r);
      if (st) states.add(st);
    }
    const stateList = [...states].sort((a, b) => a.localeCompare(b));
    return { sectors, groups, statuses, stateList };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      if (q && !rowTextSearchHaystack(row).includes(q)) return false;
      if (filterSector && inferSector(row) !== filterSector) return false;
      if (filterGroup && (row.group || "Unknown") !== filterGroup) return false;
      if (filterStatus && pickVictimStatus(row) !== filterStatus) return false;
      if (filterState) {
        const st = inferState(row);
        if (filterState === STATE_NONE) {
          if (st) return false;
        } else if (st !== filterState) return false;
      }
      return true;
    });
  }, [items, q, filterSector, filterGroup, filterStatus, filterState]);

  const sortedIncidents = useMemo(
    () => sortIncidentItems(filteredItems, sortIncidents),
    [filteredItems, sortIncidents]
  );

  const companyAggregates = useMemo(
    () => sortCompanyAggregates(buildCompanyAggregates(filteredItems), sortCompany),
    [filteredItems, sortCompany]
  );

  const rows = useMemo(() => victimRowsFromItems(sortedIncidents), [sortedIncidents]);

  const gov = items.filter((r) => inferSector(r) === "Government").length;
  const health = items.filter((r) => inferSector(r) === "Healthcare").length;
  const fin = items.filter((r) => inferSector(r) === "Finance").length;

  const filtersActive = !!(filterSector || filterGroup || filterStatus || filterState || q);

  const clearFilters = () => {
    setFilterSector("");
    setFilterGroup("");
    setFilterStatus("");
    setFilterState("");
    setSearchText("");
  };

  return (
    <>
      {error && <div className="cw-banner err">{error}</div>}
      {loading && (
        <div className="cw-banner load">
          <span className="cw-spin" aria-hidden />
        </div>
      )}

      <div className="cw-page-head">
        <h1 className="cw-page-title">Impacted assets</h1>
      </div>

      <div className="cw-grid cols-3" style={{ marginBottom: "1rem" }}>
        <div className="cw-kpi kpi-blue">
          <div className="cw-kpi-label">Government entities (inferred)</div>
          <div className="cw-kpi-val" style={{ color: "#7dd3fc" }}>
            {gov}
          </div>
          <Building2 size={28} style={{ position: "absolute", right: 10, top: 10, opacity: 0.2 }} />
        </div>
        <div className="cw-kpi kpi-pink">
          <div className="cw-kpi-label">Healthcare entities</div>
          <div className="cw-kpi-val" style={{ color: "#fb7185" }}>
            {health}
          </div>
          <Stethoscope size={28} style={{ position: "absolute", right: 10, top: 10, opacity: 0.2 }} />
        </div>
        <div className="cw-kpi kpi-green">
          <div className="cw-kpi-label">Finance entities</div>
          <div className="cw-kpi-val" style={{ color: "#86efac" }}>
            {fin}
          </div>
          <Landmark size={28} style={{ position: "absolute", right: 10, top: 10, opacity: 0.2 }} />
        </div>
      </div>

      <div className="cw-victims-toolbar">
        <div className="cw-victims-field" style={{ flex: "1 1 220px", minWidth: 0 }}>
          <label htmlFor="v-search">Search</label>
            <input
            id="v-search"
            type="search"
            name="victims-table-search"
            className="cw-search cw-search--field"
            placeholder="Entity, group, details…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search incidents"
          />
        </div>
        <div className="cw-victims-view-toggle" role="group" aria-label="Table view">
          <button
            type="button"
            className={view === "incidents" ? "active" : ""}
            onClick={() => setView("incidents")}
          >
            <List size={14} aria-hidden />
            ALL INCIDENTS
          </button>
          <button
            type="button"
            className={view === "by-company" ? "active" : ""}
            onClick={() => setView("by-company")}
          >
            <BarChart3 size={14} aria-hidden />
            BY COMPANY
          </button>
        </div>

        <div className="cw-victims-field">
          <label htmlFor="v-sector">Sector</label>
          <select
            id="v-sector"
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
            aria-label="Filter by sector"
          >
            <option value="">All sectors</option>
            {filterOptions.sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="cw-victims-field">
          <label htmlFor="v-group">Threat group</label>
          <select
            id="v-group"
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            aria-label="Filter by ransomware group"
          >
            <option value="">All groups</option>
            {filterOptions.groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="cw-victims-field">
          <label htmlFor="v-status">Status</label>
          <select
            id="v-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {filterOptions.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="cw-victims-field">
          <label htmlFor="v-state">Inferred state</label>
          <select
            id="v-state"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            aria-label="Filter by inferred Indian state"
          >
            <option value="">Any</option>
            <option value={STATE_NONE}>No state inferred</option>
            {filterOptions.stateList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {view === "incidents" ? (
          <div className="cw-victims-field">
            <label htmlFor="v-sort-i">Sort incidents</label>
            <select
              id="v-sort-i"
              value={sortIncidents}
              onChange={(e) => setSortIncidents(e.target.value)}
              aria-label="Sort incidents"
            >
              <option value="discovered_desc">Detection date (newest)</option>
              <option value="discovered_asc">Detection date (oldest)</option>
              <option value="entity_asc">Company / entity (A–Z)</option>
              <option value="entity_desc">Company / entity (Z–A)</option>
              <option value="group_asc">Group (A–Z)</option>
              <option value="sector_asc">Sector (A–Z)</option>
              <option value="status_asc">Status (A–Z)</option>
            </select>
          </div>
        ) : (
          <div className="cw-victims-field">
            <label htmlFor="v-sort-c">Sort companies</label>
            <select
              id="v-sort-c"
              value={sortCompany}
              onChange={(e) => setSortCompany(e.target.value)}
              aria-label="Sort company aggregates"
            >
              <option value="company_count_desc">Most incidents first</option>
              <option value="company_count_asc">Fewest incidents first</option>
              <option value="company_name_asc">Company name (A–Z)</option>
              <option value="company_groups_desc">Most distinct groups first</option>
            </select>
          </div>
        )}

        {filtersActive ? (
          <button type="button" className="cw-btn-ghost" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="cw-card" style={{ overflow: "auto" }}>
        {view === "incidents" ? (
          <table className="cw-table">
            <thead>
              <tr>
                <th>Entity name</th>
                <th>Sector</th>
                <th>Attributed group</th>
                <th>Status</th>
                <th>Detection date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="cw-reports-table-empty" style={{ padding: "1.5rem 1rem", textAlign: "center" }}>
                    {items.length === 0 ? (
                      "No incidents loaded yet. Check the API connection or wait for data sync."
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                        {!filtersActive && items.length > 0 ? (
                          <>
                            <span>Data is loaded but the table did not render. Try reloading intel.</span>
                            <button type="button" className="cw-btn-outline" onClick={() => void load(false)}>
                              Reload intel
                            </button>
                          </>
                        ) : (
                          <>
                            <span>No incidents match the current filters or search.</span>
                            {filtersActive ? (
                              <button type="button" className="cw-btn-outline" onClick={clearFilters}>
                                Clear filters & search
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                <tr key={r.id != null && r.id !== "" ? String(r.id) : `row-${idx}`}>
                  <td>{r.entity}</td>
                  <td>{r.sector}</td>
                  <td>
                    <a href={r.row.source_url} target="_blank" rel="noreferrer">
                      {r.group}
                    </a>
                  </td>
                  <td>
                    <StatusBadge>{r.status}</StatusBadge>
                  </td>
                  <td>{r.date}</td>
                  <td>
                    <div className="cw-action-cell">
                      <Link className="cw-btn-analyse" to={analysisPagePath(r.row.victim_id)}>
                        ANALYSE
                        <ExternalLink size={14} strokeWidth={2.25} aria-hidden />
                      </Link>
                      {r.row.source_url ? (
                        <a href={r.row.source_url} target="_blank" rel="noreferrer" className="cw-link-source">
                          Source
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="cw-table">
            <thead>
              <tr>
                <th>Company / entity</th>
                <th>Incidents</th>
                <th>Attacks by group</th>
                <th>Sectors (inferred)</th>
                <th>Last detection</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {companyAggregates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="cw-reports-table-empty" style={{ padding: "1.5rem 1rem", textAlign: "center" }}>
                    {items.length === 0
                      ? "No incidents loaded yet."
                      : "No companies match the current filters or search."}
                  </td>
                </tr>
              ) : (
                companyAggregates.map((a) => (
                <tr key={a.key}>
                  <td>{a.display}</td>
                  <td>
                    <strong>{a.count}</strong>
                  </td>
                  <td>
                    <div className="cw-victims-groups-cell">
                      {a.groupsList.map(([name, n]) => (
                        <span key={name} className="g" title={`${name}: ${n} incident(s)`}>
                          {name}
                          {n > 1 ? ` ×${n}` : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--cw-muted)" }}>{a.sectorsLabel}</td>
                  <td>{a.lastDate}</td>
                  <td>
                    <div className="cw-action-cell">
                      <Link className="cw-btn-analyse" to={analysisPagePath(a.previewRow.victim_id)}>
                        ANALYSE
                        <ExternalLink size={14} strokeWidth={2.25} aria-hidden />
                      </Link>
                      {a.previewRow.source_url ? (
                        <a
                          href={a.previewRow.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="cw-link-source"
                        >
                          Source
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
