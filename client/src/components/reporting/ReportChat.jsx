import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { enrichCategoryQuestions, validateQuestionAnswer } from "../../utils/reportValidation.js";

const DEFAULT_INTRO =
  "Hello! I'm CyberWatch AI. I'll help you prepare a professional cyber crime complaint. I'll ask you a few questions to gather the required information.";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function ReportChat({
  category,
  questions: questionsProp,
  title,
  introMessage,
  answers,
  onAnswersChange,
  onComplete,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [typing, setTyping] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [chatReady, setChatReady] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const aliveRef = useRef(true);
  const initGenRef = useRef(0);

  const rawQuestions = questionsProp || category?.questions || [];
  const questions = enrichCategoryQuestions(rawQuestions);
  const chatTitle = title || (category ? `AI Assistant — ${category.label}` : "AI Assistant");
  const intro = introMessage || DEFAULT_INTRO;
  const sessionKey = category?.id || title || "chat";

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (!chatReady || typing || questionIndex >= questions.length) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [chatReady, typing, questionIndex, questions.length]);

  useEffect(() => {
    if (!questions.length) return;

    const gen = ++initGenRef.current;
    setMessages([]);
    setQuestionIndex(0);
    setInput("");
    setEditKey(null);
    setChatReady(false);
    setTyping(true);

    (async () => {
      await delay(350);
      if (initGenRef.current !== gen) return;
      await delay(400);
      if (initGenRef.current !== gen) return;

      const q = questions[0];
      const initial = [{ role: "ai", text: intro, id: "intro" }];
      if (q) {
        initial.push({ role: "ai", text: q.label, fieldKey: q.key, id: `q-${q.key}` });
      }
      setMessages(initial);
      setQuestionIndex(0);
      setTyping(false);
      setChatReady(true);
    })();

    return () => {
      initGenRef.current += 1;
    };
  }, [sessionKey, questions.length, intro]);

  const askQuestion = useCallback(
    async (idx) => {
      const q = questions[idx];
      if (!q || !aliveRef.current) return;
      setTyping(true);
      await delay(350);
      if (!aliveRef.current) return;
      setMessages((prev) => [...prev, { role: "ai", text: q.label, fieldKey: q.key, id: `q-${q.key}-${Date.now()}` }]);
      setQuestionIndex(idx);
      setTyping(false);
    },
    [questions]
  );

  function submitAnswer(text) {
    const trimmed = text.trim();
    if (!trimmed || typing || !chatReady) return;
    const q = questions[questionIndex];
    if (!q) return;

    const result = validateQuestionAnswer(q, trimmed);
    if (!result.ok) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text: trimmed, fieldKey: q.key, id: `a-err-${Date.now()}` },
        { role: "ai", text: result.error, isError: true, id: `err-${Date.now()}` },
      ]);
      setInput("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    const stored = result.value ?? trimmed;
    const nextAnswers = { ...answers, [q.key]: stored };
    onAnswersChange(nextAnswers);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: result.display || stored, fieldKey: q.key, id: `a-${q.key}-${Date.now()}` },
    ]);
    setInput("");
    const wasEdit = editKey;
    setEditKey(null);

    const nextIdx = wasEdit != null ? questions.findIndex((x) => x.key === wasEdit) + 1 : questionIndex + 1;
    if (nextIdx >= questions.length) {
      setTimeout(() => onComplete(nextAnswers), 300);
      return;
    }
    askQuestion(nextIdx);
  }

  function startEdit(key) {
    if (typing) return;
    setEditKey(key);
    const q = questions.find((x) => x.key === key);
    if (q) {
      setInput(answers[key] || "");
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Let's update: ${q.label}`, fieldKey: key, id: `edit-${key}` },
      ]);
      setQuestionIndex(questions.findIndex((x) => x.key === key));
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const seenKeys = new Set();
  const answeredQuestions = questions.filter((q) => {
    if (!answers[q.key] || seenKeys.has(q.key)) return false;
    seenKeys.add(q.key);
    return true;
  });

  const inputDisabled = typing || !chatReady || questionIndex >= questions.length;

  return (
    <div className="ccr-glass ccr-chat-wrap">
      <h3 className="ccr-section-title">{chatTitle}</h3>

      {answeredQuestions.length > 0 ? (
        <div className="ccr-answers-chips">
          {answeredQuestions.map((q) => (
            <button key={q.key} type="button" className="ccr-answer-chip" onClick={() => startEdit(q.key)}>
              {q.label.replace(/\?$/, "").slice(0, 36)}
              {q.label.length > 36 ? "…" : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ccr-chat-messages">
        {messages.map((m) => (
          <motion.div
            key={m.id || `${m.fieldKey}-${m.text}`}
            className={`ccr-chat-bubble ccr-chat-bubble--${m.isError ? "error" : m.role === "ai" ? "ai" : "user"}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {m.text}
          </motion.div>
        ))}
        {typing ? (
          <div className="ccr-chat-bubble ccr-chat-bubble--ai">
            <div className="ccr-typing" aria-label="AI is typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="ccr-chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          submitAnswer(input);
        }}
      >
        <input
          ref={inputRef}
          className="ccr-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={chatReady ? "Type your answer…" : "Starting assistant…"}
          disabled={inputDisabled}
          autoFocus
        />
        <button
          type="submit"
          className="ccr-btn-primary"
          disabled={inputDisabled || !input.trim()}
          aria-label="Send"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
