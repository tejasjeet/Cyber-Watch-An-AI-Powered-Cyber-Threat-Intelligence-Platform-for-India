const SESSION_PROFILE_KEY = "ri_session_profile";

export function loadSessionProfile() {
  try {
    const raw = localStorage.getItem(SESSION_PROFILE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return {};
    return {
      displayName: typeof o.displayName === "string" ? o.displayName : undefined,
      phone: typeof o.phone === "string" ? o.phone : undefined,
      avatarDataUrl:
        typeof o.avatarDataUrl === "string"
          ? o.avatarDataUrl
          : o.avatarDataUrl === null
            ? null
            : undefined,
    };
  } catch {
    return {};
  }
}

export function persistSessionProfile(profile) {
  localStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(profile));
}

export function clearSessionProfile() {
  localStorage.removeItem(SESSION_PROFILE_KEY);
}

/**
 * Resize to fit inside maxDim and export as JPEG data URL for localStorage + header avatar.
 */
export function compressImageFileToDataUrl(file, maxDim = 640, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h) {
        reject(new Error("Invalid image dimensions"));
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const width = Math.max(1, Math.round(w * scale));
      const height = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unsupported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

/** Resize a JPEG/PNG data URL to fit inside `maxDim` (longest side) and re-encode as JPEG. */
export function resizeDataUrlToJpeg(dataUrl, maxDim = 960, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error("Invalid image dimensions"));
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const width = Math.max(1, Math.round(w * scale));
      const height = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unsupported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = dataUrl;
  });
}
