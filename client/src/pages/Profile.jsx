import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import ProfilePhotoCropDialog from "../components/ProfilePhotoCropDialog.jsx";

/** Original file pick limit; image is compressed for preview + header storage. */
const MAX_BYTES = 100 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export default function Profile() {
  const { user, displayUser, updateProfile, loading: authLoading } = useAuth();
  const fileRef = useRef(null);
  const cropBlobUrlRef = useRef(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    if (!displayUser) return;
    setDisplayName(displayUser.displayName || "");
    setPhone(displayUser.phone || "");
    setPhotoUrl(displayUser.sessionAvatarUrl ?? null);
  }, [displayUser]);

  const revokeCropBlobUrl = useCallback(() => {
    if (cropBlobUrlRef.current) {
      URL.revokeObjectURL(cropBlobUrlRef.current);
      cropBlobUrlRef.current = null;
    }
    setCropSrc(null);
  }, []);

  const closeCropDialog = useCallback(() => {
    setCropOpen(false);
    queueMicrotask(() => revokeCropBlobUrl());
  }, [revokeCropBlobUrl]);

  const onCropDialogComplete = useCallback((dataUrl) => {
    setPhotoUrl(dataUrl);
    setPhotoError("");
    setCropOpen(false);
    queueMicrotask(() => revokeCropBlobUrl());
  }, [revokeCropBlobUrl]);

  useEffect(() => {
    return () => revokeCropBlobUrl();
  }, [revokeCropBlobUrl]);

  const onFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setPhotoError("Please choose an image file.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setPhotoError("That file is too large to use here.");
        return;
      }

      setPhotoError("");
      revokeCropBlobUrl();
      const url = URL.createObjectURL(file);
      cropBlobUrlRef.current = url;
      setCropSrc(url);
      setCropOpen(true);
    },
    [revokeCropBlobUrl]
  );

  const openPicker = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const clearPhoto = useCallback(() => {
    setPhotoUrl(null);
    setPhotoError("");
  }, []);

  const onSave = useCallback(async () => {
    setSaveErr("");
    setSaveMsg("");
    if (!user) return;
    const name = displayName.trim();
    if (name.length < 2) {
      setSaveErr("Display name must be at least 2 characters.");
      return;
    }
    const p = phone.trim();
    const serverName = (user.displayName || "").trim();
    const serverPhone = (user.phone || "").trim();
    const serverAvatar = user.avatarDataUrl ?? null;
    const localAvatar = photoUrl ?? null;

    const patch = {};
    if (name !== serverName) patch.displayName = name;
    if (p !== serverPhone) patch.phone = p;
    if (localAvatar !== serverAvatar) {
      patch.avatarDataUrl = localAvatar;
    }

    if (Object.keys(patch).length === 0) {
      setSaveMsg("No changes to save");
      return;
    }

    setSaveBusy(true);
    try {
      const res = await updateProfile(patch);
      if (!res.ok) {
        setSaveErr(res.error || "Could not save");
        return;
      }
      setSaveMsg("Saved");
    } catch (e) {
      setSaveErr(e?.message || "Network error — check that the API server is running.");
    } finally {
      setSaveBusy(false);
    }
  }, [user, displayName, phone, photoUrl, updateProfile]);

  const initial = (displayName || user?.email || "?").slice(0, 1).toUpperCase();

  if (authLoading) {
    return (
      <div className="cw-page-head">
        <h1 className="cw-page-title">My profile</h1>
      </div>
    );
  }

  return (
    <div className="cw-profile-page">
      <ProfilePhotoCropDialog
        open={cropOpen}
        imageUrl={cropSrc || ""}
        onCancel={closeCropDialog}
        onComplete={onCropDialogComplete}
      />

      <div className="cw-page-head">
        <h1 className="cw-page-title">My profile</h1>
      </div>

      <div className="cw-card cw-profile-card cw-profile-card--wide">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          aria-label="Choose profile picture"
          style={{ display: "none" }}
          onChange={onFileChange}
        />

        <div className="cw-profile-grid">
          <aside className="cw-profile-preview-col">
            <div className="cw-profile-preview-label">Preview</div>
            <div className="cw-profile-mega-avatar cw-avatar cw-avatar--photo">
              {photoUrl ? <img src={photoUrl} alt="Profile photo preview" /> : <span aria-hidden>{initial}</span>}
            </div>
          </aside>

          <div className="cw-profile-form-col">
            <div className="cw-profile-actions-top">
              <button type="button" className="cw-btn-outline" onClick={openPicker} disabled={cropOpen}>
                Choose photo
              </button>
              {photoUrl || user?.avatarDataUrl ? (
                <button type="button" className="cw-btn-outline cw-profile-remove-photo" onClick={clearPhoto}>
                  Remove photo
                </button>
              ) : null}
            </div>
            {photoError ? (
              <div className="cw-profile-inline-err" role="alert">
                {photoError}
              </div>
            ) : null}

            <label className="cw-profile-field-label">Email</label>
            <input className="cw-search cw-search--field cw-profile-field" readOnly value={user?.email || ""} />

            <label className="cw-profile-field-label">Display name</label>
            <input
              className="cw-search cw-search--field cw-profile-field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />

            <label className="cw-profile-field-label">Phone</label>
            <input
              className="cw-search cw-search--field cw-profile-field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />

            {saveErr ? (
              <div className="cw-profile-inline-err" role="alert">
                {saveErr}
              </div>
            ) : null}
            {saveMsg ? (
              <div className="cw-profile-inline-ok" role="status">
                {saveMsg}
              </div>
            ) : null}

            <button type="button" className="cw-profile-save-btn" onClick={onSave} disabled={saveBusy}>
              {saveBusy ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
