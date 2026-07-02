/** Load an image from URL (object URL or data URL). */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load image")));
    image.src = url;
  });
}

/**
 * Crop a rectangular region from `imageSrc` into a JPEG data URL (lossy).
 * @param {string} imageSrc
 * @param {{ x: number; y: number; width: number; height: number }} pixelCrop
 */
export async function getCroppedImgDataUrl(imageSrc, pixelCrop) {
  const image = await loadImage(imageSrc);
  const sx = Math.max(0, Math.round(pixelCrop.x));
  const sy = Math.max(0, Math.round(pixelCrop.y));
  const sw = Math.max(1, Math.round(pixelCrop.width));
  const sh = Math.max(1, Math.round(pixelCrop.height));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/jpeg", 0.92);
}
