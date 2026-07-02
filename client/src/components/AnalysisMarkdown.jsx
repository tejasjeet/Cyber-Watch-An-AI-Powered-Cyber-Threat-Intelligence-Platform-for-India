import { useId, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";

let mermaidInited = false;

function ensureMermaid() {
  if (mermaidInited) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "strict",
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  });
  mermaidInited = true;
}

/** react-markdown may pass code children as an array; String(children) joins with commas and breaks Mermaid. */
function codeChildrenToPlainText(children) {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(codeChildrenToPlainText).join("");
  if (typeof children === "object" && children !== null && "props" in children) {
    return codeChildrenToPlainText(children.props?.children);
  }
  return "";
}

function MermaidBlock({ chart }) {
  const wrapRef = useRef(null);
  const rid = useId().replace(/:/g, "");
  const renderSeq = useRef(0);
  const [err, setErr] = useState(null);
  const [showSource, setShowSource] = useState(false);
  const def = String(chart).replace(/\r\n/g, "\n").trim();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    ensureMermaid();
    renderSeq.current += 1;
    const seq = renderSeq.current;
    let cancelled = false;

    setErr(null);
    setShowSource(false);

    if (!def) {
      setErr("Empty diagram.");
      setShowSource(false);
      el.innerHTML = "";
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const parseOk = await mermaid.parse(def, { suppressErrors: true });
        if (cancelled || seq !== renderSeq.current || !wrapRef.current) return;
        if (parseOk === false) {
          wrapRef.current.innerHTML = "";
          setErr("Diagram is not valid Mermaid (model output). Source below.");
          setShowSource(true);
          return;
        }
        const id = `cw-mmd-${rid}-${seq}`;
        const { svg } = await mermaid.render(id, def);
        if (cancelled || seq !== renderSeq.current || !wrapRef.current) return;
        wrapRef.current.innerHTML = svg;
        setErr(null);
        setShowSource(false);
      } catch {
        if (cancelled || seq !== renderSeq.current || !wrapRef.current) return;
        wrapRef.current.innerHTML = "";
        setErr("Diagram could not be rendered. Source below.");
        setShowSource(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, rid]);

  return (
    <figure className="cw-mermaid-figure">
      {err ? <figcaption className="cw-mermaid-err">{err}</figcaption> : null}
      <div
        ref={wrapRef}
        className="cw-mermaid-wrap"
        style={showSource ? { display: "none" } : undefined}
        aria-hidden={showSource ? "true" : undefined}
      />
      {showSource ? (
        <pre className="cw-md-pre cw-mermaid-fallback">
          <code className="language-mermaid">{def}</code>
        </pre>
      ) : null}
    </figure>
  );
}

function MdCode({ inline, className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1] ?? "";
  const body = codeChildrenToPlainText(children).replace(/\n$/, "");

  if (!inline && lang === "mermaid") {
    return <MermaidBlock chart={body} />;
  }

  if (inline) {
    return (
      <code className="cw-md-code-inline" {...props}>
        {children}
      </code>
    );
  }

  return (
    <pre className="cw-md-pre">
      <code className={className} {...props}>
        {children}
      </code>
    </pre>
  );
}

export default function AnalysisMarkdown({ source }) {
  if (!source) return null;
  return (
    <div className="cw-analyse-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: MdCode }}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
