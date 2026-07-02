import { useCallback, useMemo, useState } from "react";
import { Download, FileText, Search } from "lucide-react";
import { useData } from "../context/DataContext.jsx";
import { useUiPrefs } from "../context/UiPrefsContext.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  ALL_SECTOR_LABELS,
  inferSector,
  rowTextSearchHaystack,
  normalizeSearchQuery,
  victimRowsFromItems,
} from "../utils/insights.js";
import { exportIntelligenceTableJpg, exportIntelligenceTablePdf } from "../utils/hubExport.js";

export default function Reports() {
  const { items, loading, error } = useData();
  const { formatDateTime } = useUiPrefs();
  const [filterGroup, setFilterGroup] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [searchText, setSearchText] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const q = normalizeSearchQuery(searchText);

  const groupOptions = useMemo(() => {
    const s = new Set();
    for (const r of items) s.add(r.group || "Unknown");
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      if (filterGroup && (row.group || "Unknown") !== filterGroup) return false;
      if (filterSector && inferSector(row) !== filterSector) return false;
      if (q && !rowTextSearchHaystack(row).includes(q)) return false;
      return true;
    });
  }, [items, filterGroup, filterSector, q]);

  const rows = useMemo(() => victimRowsFromItems(filteredItems), [filteredItems]);

  const filterSummary = useMemo(() => {
    const g = filterGroup || "All groups";
    const s = filterSector || "All sectors";
    const search = q ? ` · Search: "${searchText.trim()}"` : "";
    return `${g} · ${s}${search}`;
  }, [filterGroup, filterSector, q, searchText]);

  const reportExportMeta = useMemo(
    () => ({
      filterGroupLabel: filterGroup || "All",
      filterSectorLabel: filterSector || "All",
      searchNote: q ? searchText.trim() : "",
      filterSummary,
      total: filteredItems.length,
      rows: rows.map((r) => ({
        entity: r.entity,
        sector: r.sector,
        group: r.group,
        status: r.status,
        date: r.date,
      })),
    }),
    [filterGroup, filterSector, q, searchText, filterSummary, filteredItems.length, rows]
  );

  const exportNameBase = useMemo(() => {
    const g = (filterGroup || "all").replace(/\s+/g, "-");
    const sec = (filterSector || "all").replace(/\s+/g, "-");
    return `intelligence-report-${g}-${sec}`;
  }, [filterGroup, filterSector]);

  const onExportPdf = useCallback(async () => {
    setExportErr("");
    setExportBusy(true);
    try {
      await exportIntelligenceTablePdf(
        { ...reportExportMeta, generatedAt: new Date().toISOString() },
        exportNameBase
      );
    } catch (e) {
      setExportErr(e?.message || "PDF export failed.");
    } finally {
      setExportBusy(false);
    }
  }, [exportNameBase, reportExportMeta]);

  const onExportJpg = useCallback(async () => {
    setExportErr("");
    setExportBusy(true);
    try {
      await exportIntelligenceTableJpg(
        { ...reportExportMeta, generatedAt: new Date().toISOString() },
        exportNameBase
      );
    } catch (e) {
      setExportErr(e?.message || "JPG export failed.");
    } finally {
      setExportBusy(false);
    }
  }, [exportNameBase, reportExportMeta]);

  return (
    <>
      {error && <div className="cw-banner err">{error}</div>}
      {loading && (
        <div className="cw-banner load">
          <span className="cw-spin" aria-hidden />
        </div>
      )}

      <div className="cw-page-head">
        <h1 className="cw-page-title">
          <FileText size={26} />
          Intelligence hub
        </h1>
      </div>

      <div
        className="cw-card"
        style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}
      >
        <div className="cw-reports-search-wrap" style={{ flex: "1 1 200px", minWidth: 0, position: "relative" }}>
          <Search
            size={15}
            strokeWidth={2}
            style={{
              position: "absolute",
              left: "0.65rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--cw-muted)",
              pointerEvents: "none",
            }}
            aria-hidden
          />
          <input
            type="search"
            name="reports-hub-search"
            className="cw-search cw-search--field"
            style={{ width: "100%", paddingLeft: "2.1rem" }}
            placeholder="Search entities, groups, details…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search report rows"
          />
        </div>
        <select
          className="cw-search"
          style={{ maxWidth: 220, paddingLeft: "0.65rem" }}
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          aria-label="Filter by ransomware group"
        >
          <option value="">All groups</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          className="cw-search"
          style={{ maxWidth: 220, paddingLeft: "0.65rem" }}
          value={filterSector}
          onChange={(e) => setFilterSector(e.target.value)}
          aria-label="Filter by sector"
        >
          <option value="">All sectors</option>
          {[...ALL_SECTOR_LABELS].sort((a, b) => a.localeCompare(b)).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className="cw-btn-export" onClick={onExportPdf} disabled={exportBusy || loading}>
          {exportBusy ? "Exporting…" : "Export as PDF"}
          <Download size={18} strokeWidth={2.5} />
        </button>
        <button type="button" className="cw-btn-outline" onClick={onExportJpg} disabled={exportBusy || loading}>
          Export as JPG
        </button>
        {exportErr ? (
          <span style={{ fontSize: "0.78rem", color: "#f87171", flex: "1 1 100%" }} role="alert">
            {exportErr}
          </span>
        ) : null}
      </div>

      <div className="cw-reports-export-root">
        <div className="cw-reports-export-head">
          <h2 className="cw-reports-export-title">Intelligence report</h2>
          <p className="cw-reports-export-meta">Generated {formatDateTime(new Date())}</p>
          <p className="cw-reports-export-filters">Filters: {filterSummary}</p>
        </div>

        <div className="cw-card cw-reports-summary-card" style={{ margin: "0 0 1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.65rem", color: "#94a3b8", letterSpacing: "0.1em" }}>INCIDENTS IN VIEW</div>
              <div style={{ marginTop: "0.35rem", fontWeight: 800, fontSize: "1.35rem" }}>{filteredItems.length}</div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.35rem" }}>
                After group, sector, and keyword filters
              </div>
            </div>
            <StatusBadge>DYNAMIC</StatusBadge>
          </div>
        </div>

        <div className="cw-reports-table-wrap">
          <table className="cw-reports-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Sector</th>
                <th>Group</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="cw-reports-table-empty">
                    No rows match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cw-reports-table-entity">{r.entity}</td>
                    <td>{r.sector}</td>
                    <td>{r.group}</td>
                    <td>
                      <StatusBadge>{r.status}</StatusBadge>
                    </td>
                    <td>{r.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
