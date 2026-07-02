import { motion } from "framer-motion";
import { FileText, ListChecks, Clock, Lightbulb, Gauge, Download, ExternalLink } from "lucide-react";
import { downloadReportPdf, downloadReportDocx } from "../../utils/reportExport.js";

const cardAnim = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07 } }),
};

function ReadinessRing({ score }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="ccr-readiness-ring">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ccr-readiness-center">
        <span className="ccr-readiness-val">{score}%</span>
        <span style={{ fontSize: "0.65rem", color: "#64748b" }}>Completed</span>
      </div>
    </div>
  );
}

export default function ReportResults({ report, categoryLabel, victimName, generating, evidenceFiles = [] }) {
  if (generating) {
    return (
      <div className="ccr-results-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ccr-glass ccr-span-6">
            <div className="ccr-skeleton" style={{ width: "40%" }} />
            <div className="ccr-skeleton" />
            <div className="ccr-skeleton" />
            <div className="ccr-skeleton" style={{ width: "70%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (!report) return null;

  const { complaint, summary, timeline, recommendations, readinessScore, readinessChecklist } = report;
  const missing = readinessChecklist?.missing || [];
  const downloadsReady = missing.length === 0;

  return (
    <>
      <div className="ccr-results-grid" id="ccr-report-print">
        <motion.div className="ccr-glass ccr-span-12" custom={0} variants={cardAnim} initial="hidden" animate="visible">
          <h3 className="ccr-section-title">
            <FileText size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Generated complaint
          </h3>
          <div className="ccr-complaint-text" id="ccr-complaint-body">
            {complaint}
          </div>
        </motion.div>

        <motion.div className="ccr-glass ccr-span-6" custom={1} variants={cardAnim} initial="hidden" animate="visible">
          <h3 className="ccr-section-title">
            <ListChecks size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Incident summary
          </h3>
          <div className="ccr-summary-grid">
            {[
              ["Victim", summary?.victim],
              ["Contact", summary?.contact],
              ["Age", summary?.age],
              ["Fraud type", summary?.fraudType || categoryLabel],
              ["Amount lost", summary?.amountLost],
              ["Date", summary?.date],
              ["Evidence attached", summary?.evidenceAttached],
              ["Suspect details", summary?.suspectDetails],
            ].map(([label, val]) => (
              <div key={label} className="ccr-summary-item">
                <div className="ccr-summary-label">{label.toUpperCase()}</div>
                <div className="ccr-summary-val">{val || "—"}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div className="ccr-glass ccr-span-6" custom={2} variants={cardAnim} initial="hidden" animate="visible">
          <h3 className="ccr-section-title">
            <Clock size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Incident timeline
          </h3>
          <div className="ccr-timeline">
            {(timeline || []).map((ev, i) => (
              <motion.div
                key={i}
                className="ccr-timeline-item"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="ccr-timeline-date">{ev.date}</div>
                <div className="ccr-timeline-title">{ev.title}</div>
                <div className="ccr-timeline-detail">{ev.detail}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div className="ccr-glass ccr-span-6" custom={3} variants={cardAnim} initial="hidden" animate="visible">
          <h3 className="ccr-section-title">
            <Lightbulb size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            AI recommendations
          </h3>
          <ul className="ccr-rec-list">
            {(recommendations || []).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </motion.div>

        <motion.div className="ccr-glass ccr-span-6" custom={4} variants={cardAnim} initial="hidden" animate="visible">
          <h3 className="ccr-section-title">
            <Gauge size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Complaint readiness score
          </h3>
          <ReadinessRing score={readinessScore ?? 0} />
          <div className="ccr-checklist">
            {(readinessChecklist?.completed || []).map((c) => (
              <div key={c} className="ccr-check-ok">
                ✓ {c}
              </div>
            ))}
            {missing.map((m) => (
              <div key={m} className="ccr-check-miss">
                ⚠ {m}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="ccr-glass">
        <h3 className="ccr-section-title">Downloads</h3>
        {downloadsReady ? (
          <div className="ccr-download-row">
            <button
              type="button"
              className="ccr-btn-primary"
              onClick={() =>
                downloadReportPdf({
                  complaint,
                  summary,
                  category: categoryLabel,
                  victimName: victimName || summary?.victim,
                  evidenceFiles,
                })
              }
            >
              <Download size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Download PDF
            </button>
            <button
              type="button"
              className="ccr-btn-outline"
              onClick={() =>
                downloadReportDocx({
                  complaint,
                  summary,
                  category: categoryLabel,
                  victimName: victimName || summary?.victim,
                  evidenceFiles,
                })
              }
            >
              Download DOCX
            </button>
          </div>
        ) : (
          <div className="ccr-download-blocked">
            <p className="ccr-check-miss" style={{ margin: "0 0 0.75rem" }}>
              Complete all required items before downloading. Still missing:
            </p>
            <ul className="ccr-rec-list">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="ccr-glass">
        <p className="ccr-disclaimer">
          This AI assistant prepares a professional complaint based on the information you provide. It does not submit
          complaints directly to government agencies.
        </p>
        <a
          href="https://cybercrime.gov.in"
          target="_blank"
          rel="noopener noreferrer"
          className="ccr-btn-primary"
          style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
        >
          Continue to National Cyber Crime Portal
          <ExternalLink size={14} style={{ marginLeft: 8 }} />
        </a>
      </div>
    </>
  );
}
