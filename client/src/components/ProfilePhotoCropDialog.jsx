import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import "./ProfilePhotoCropDialog.css";
import { X } from "lucide-react";
import { getCroppedImgDataUrl } from "../utils/cropImageToDataUrl.js";
import { resizeDataUrlToJpeg } from "../utils/sessionProfile.js";

/**
 * Full-screen crop + zoom dialog (portaled to `document.body` so it is not clipped by route transforms).
 */
export default function ProfilePhotoCropDialog({ imageUrl, open, onCancel, onComplete }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setPixels(null);
      setErr("");
      setBusy(false);
    }
  }, [open, imageUrl]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setPixels(areaPixels);
  }, []);

  const handleApply = useCallback(async () => {
    if (!imageUrl || !pixels) {
      setErr("Adjust the image slightly so the crop can be calculated.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const cropped = await getCroppedImgDataUrl(imageUrl, pixels);
      const out = await resizeDataUrlToJpeg(cropped, 960, 0.86);
      onComplete(out);
    } catch (e) {
      setErr(e?.message || "Could not crop this image.");
    } finally {
      setBusy(false);
    }
  }, [imageUrl, pixels, onComplete]);

  if (!open || !imageUrl) return null;

  const ui = (
    <div
      className="cw-analyse-backdrop cw-profile-crop-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-profile-crop-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="cw-analyse-modal cw-profile-crop-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cw-analyse-head">
          <h2 id="cw-profile-crop-title" className="cw-analyse-title">
            Adjust profile photo
          </h2>
          <button type="button" className="cw-analyse-close" aria-label="Close" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <div className="cw-profile-crop-body">
          <p className="cw-profile-crop-hint">
            Drag to reposition. Zoom in or out, then apply — the result is cropped to a circle in the header preview.
          </p>
          <div className="cw-profile-crop-stage">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="cw-profile-crop-zoom">
            <label htmlFor="cw-profile-zoom">Zoom</label>
            <input
              id="cw-profile-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <span className="cw-profile-crop-zoom-val">{zoom.toFixed(2)}×</span>
          </div>
          {err ? (
            <div className="cw-profile-inline-err" role="alert" style={{ marginTop: "0.5rem" }}>
              {err}
            </div>
          ) : null}
        </div>
        <div className="cw-profile-crop-actions">
          <button type="button" className="cw-btn-outline" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cw-profile-save-btn" style={{ marginTop: 0 }} onClick={handleApply} disabled={busy}>
            {busy ? "Applying…" : "Apply crop"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
