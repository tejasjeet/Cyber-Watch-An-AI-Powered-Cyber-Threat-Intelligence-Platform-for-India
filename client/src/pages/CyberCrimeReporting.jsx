import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileWarning } from "lucide-react";
import { FRAUD_CATEGORIES, getCategoryById } from "../data/reportCategories.js";
import FraudCategoryIcon from "../components/reporting/FraudCategoryIcon.jsx";
import { apiPath } from "../utils/apiPath.js";
import { authHeaders } from "../context/AuthContext.jsx";
import {
  VICTIM_QUESTIONS,
  enrichCategoryQuestions,
  validateReportCompleteness,
} from "../utils/reportValidation.js";
import { isValidCityForState } from "../data/indiaLocations.js";
import ReportChat from "../components/reporting/ReportChat.jsx";
import EvidenceUpload from "../components/reporting/EvidenceUpload.jsx";
import LocationStep from "../components/reporting/LocationStep.jsx";
import ReportResults from "../components/reporting/ReportResults.jsx";
import "../styles/cyberCrimeReporting.css";

const STEPS = ["Your details", "Category", "AI Chat", "Evidence", "Location", "Report"];

const STEP_INDEX = { victim: 0, category: 1, chat: 2, evidence: 3, location: 4, results: 5 };

function preserveVictimAnswers(prev) {
  const next = {};
  for (const q of VICTIM_QUESTIONS) {
    if (prev[q.key]) next[q.key] = prev[q.key];
  }
  return next;
}

export default function CyberCrimeReporting() {
  const categoriesRef = useRef(null);
  const [phase, setPhase] = useState("start");
  const [categoryId, setCategoryId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState([]);
  const [location, setLocation] = useState({ country: "India", state: "", city: "" });
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const category = getCategoryById(categoryId);
  const stepIndex = STEP_INDEX[phase] ?? -1;

  const scrollToCategories = () => {
    setPhase("victim");
  };

  const selectCategory = (id) => {
    setCategoryId(id);
    setAnswers((prev) => preserveVictimAnswers(prev));
    setReport(null);
    setError("");
    setPhase("chat");
  };

  const generateReport = useCallback(async () => {
    if (!categoryId || !category) return;

    if (!isValidCityForState(location.state, location.city)) {
      setError("Please select a valid city for the chosen state.");
      return;
    }

    const attachments = files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
    const completeness = validateReportCompleteness({ answers, location, category, attachments });
    if (!completeness.ok) {
      setError(`Please complete the following before generating: ${completeness.missing.join("; ")}.`);
      return;
    }

    setError("");
    setGenerating(true);
    setPhase("results");
    try {
      const enriched = enrichCategoryQuestions(category.questions);
      const r = await fetch(apiPath("/api/report/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          category: categoryId,
          answers,
          location,
          attachments,
          questions: enriched.map((q) => ({ key: q.key, label: q.label, required: q.required, type: q.type })),
          victimQuestions: VICTIM_QUESTIONS.map((q) => ({ key: q.key, label: q.label, required: q.required, type: q.type })),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error([data.error, data.hint].filter(Boolean).join(" — ") || `Generation failed (HTTP ${r.status})`);
      }
      setReport(data);
    } catch (e) {
      setError(e?.message || String(e));
      setPhase("location");
    } finally {
      setGenerating(false);
    }
  }, [categoryId, category, answers, location, files]);

  return (
    <div className="ccr-page">
      {error ? (
        <div className="cw-banner err" role="alert">
          {error}
        </div>
      ) : null}

      <div className="cw-page-head">
        <h1 className="cw-page-title">
          <FileWarning size={26} strokeWidth={1.75} />
          AI Cyber Crime Reporting Assistant
        </h1>
      </div>

      <section className="ccr-hero">
        <div className="ccr-hero-eyebrow">VICTIM SUPPORT</div>
        <h2 className="ccr-hero-title">AI Cyber Crime Reporting Assistant</h2>
        <p className="ccr-hero-sub">
          Report cyber fraud quickly with AI assistance. Generate professionally formatted cyber crime complaints,
          incident summaries, and downloadable reports.
        </p>
        {phase === "start" ? (
          <button type="button" className="ccr-btn-primary" onClick={scrollToCategories}>
            START REPORTING
          </button>
        ) : null}
      </section>

      {phase !== "start" ? (
        <div className="ccr-wizard-steps">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`ccr-step-pill ${i === stepIndex ? "ccr-step-pill--active" : ""} ${i < stepIndex ? "ccr-step-pill--done" : ""}`}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {phase === "victim" ? (
          <motion.div key="victim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReportChat
              key="victim-chat"
              title="Your details"
              introMessage="Before we begin, I need a few details about you for the complaint."
              questions={VICTIM_QUESTIONS}
              answers={answers}
              onAnswersChange={setAnswers}
              onComplete={() => setPhase("category")}
            />
          </motion.div>
        ) : null}

        {phase === "category" ? (
          <motion.section
            key="categories"
            ref={categoriesRef}
            className="ccr-glass"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <h3 className="ccr-section-title">Select fraud category</h3>
            <div className="ccr-category-grid">
              {FRAUD_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`ccr-category-card ${categoryId === cat.id ? "ccr-category-card--active" : ""}`}
                    onClick={() => selectCategory(cat.id)}
                  >
                    <FraudCategoryIcon categoryId={cat.id} size={24} />
                    <span className="ccr-category-label">{cat.label}</span>
                  </button>
                ))}
            </div>
            <button type="button" className="ccr-btn-outline" style={{ marginTop: "0.75rem" }} onClick={() => setPhase("victim")}>
              Back to your details
            </button>
          </motion.section>
        ) : null}

        {phase === "chat" && category ? (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReportChat
              key={categoryId}
              category={category}
              answers={answers}
              onAnswersChange={setAnswers}
              onComplete={() => setPhase("evidence")}
            />
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
              <button type="button" className="ccr-btn-outline" onClick={() => setPhase("category")}>
                Change category
              </button>
            </div>
          </motion.div>
        ) : null}

        {phase === "evidence" ? (
          <motion.div key="evidence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EvidenceUpload files={files} onChange={setFiles} />
            <div className="ccr-step-actions">
              <button type="button" className="ccr-btn-outline" onClick={() => setPhase("chat")}>
                Back to chat
              </button>
              <button type="button" className="ccr-btn-primary" onClick={() => setPhase("location")}>
                Continue to location
              </button>
            </div>
          </motion.div>
        ) : null}

        {phase === "location" ? (
          <motion.div key="location" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LocationStep location={location} onChange={setLocation} />
            <div className="ccr-step-actions">
              <button type="button" className="ccr-btn-outline" onClick={() => setPhase("evidence")}>
                Back
              </button>
              <button
                type="button"
                className="ccr-btn-primary"
                disabled={!location.state || !location.city}
                onClick={generateReport}
              >
                Generate complaint report
              </button>
            </div>
          </motion.div>
        ) : null}

        {phase === "results" ? (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ReportResults
              report={report}
              categoryLabel={category?.label}
              victimName={answers.victimName}
              generating={generating}
              evidenceFiles={files}
            />
            {!generating && report ? (
              <button
                type="button"
                className="ccr-btn-outline"
                style={{ marginTop: "1rem" }}
                onClick={() => {
                  setPhase("start");
                  setCategoryId(null);
                  setAnswers({});
                  setFiles([]);
                  setLocation({ country: "India", state: "", city: "" });
                  setReport(null);
                  setError("");
                }}
              >
                Start new report
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
