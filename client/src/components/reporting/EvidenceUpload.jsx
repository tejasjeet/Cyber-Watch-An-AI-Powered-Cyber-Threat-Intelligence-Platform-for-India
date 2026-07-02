import { useCallback, useState } from "react";
import { Upload, FileText, X } from "lucide-react";

const ACCEPT = "image/*,.pdf,.txt,.csv,.doc,.docx";

export default function EvidenceUpload({ files, onChange }) {
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (fileList) => {
      const next = [...files];
      for (const f of fileList) {
        if (next.length >= 12) break;
        const id = `${f.name}-${f.size}-${Date.now()}-${Math.random()}`;
        const entry = { id, name: f.name, type: f.type, size: f.size, file: f };
        if (f.type.startsWith("image/")) {
          entry.preview = URL.createObjectURL(f);
        }
        next.push(entry);
      }
      onChange(next);
    },
    [files, onChange]
  );

  function remove(id) {
    const item = files.find((f) => f.id === id);
    if (item?.preview) URL.revokeObjectURL(item.preview);
    onChange(files.filter((f) => f.id !== id));
  }

  return (
    <div className="ccr-glass ccr-evidence-panel">
      <h3 className="ccr-section-title">Evidence upload</h3>
      <p className="ccr-evidence-desc">
        Upload images, screenshots, PDFs, chat exports, or bank statements.
      </p>

      <label
        className={`ccr-dropzone ${dragOver ? "ccr-dropzone--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <span className="ccr-dropzone-icon" aria-hidden="true">
          <Upload size={26} strokeWidth={1.75} />
        </span>
        <span className="ccr-dropzone-title">Drag &amp; drop files here</span>
        <span className="ccr-dropzone-sub">or click to browse · up to 12 files</span>
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className="ccr-dropzone-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 ? (
        <div className="ccr-file-grid">
          {files.map((f) => (
            <div key={f.id} className="ccr-file-card">
              {f.preview ? (
                <img src={f.preview} alt="" />
              ) : (
                <div className="ccr-file-card-icon">
                  <FileText size={28} strokeWidth={1.5} />
                </div>
              )}
              <div className="ccr-file-card-name">{f.name}</div>
              <button type="button" className="ccr-file-remove" onClick={() => remove(f.id)}>
                <X size={12} /> Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
