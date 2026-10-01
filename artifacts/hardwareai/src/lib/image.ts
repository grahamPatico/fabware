// Reference images are stored inline on the message document, so they have to
// be small before they leave the browser. Everything is re-encoded as JPEG.

export interface PreparedImage {
  /** Base64 payload, no `data:` prefix. */
  data: string;
  mediaType: string;
  /** Full data URL for an <img> preview. */
  preview: string;
}

// Tried in order until the payload fits. The first is the largest size the
// model reads at full fidelity; detailed photos fall through to the smaller
// ones rather than being refused.
const ATTEMPTS: ReadonlyArray<{ longEdge: number; quality: number }> = [
  { longEdge: 1568, quality: 0.85 },
  { longEdge: 1568, quality: 0.7 },
  { longEdge: 1280, quality: 0.7 },
  { longEdge: 1024, quality: 0.65 },
];
/** Mirrors the server backstop in `convex/agentRuns.ts`. */
const MAX_BASE64_CHARS = 900_000;

const TOO_LARGE = "That image is too large even after resizing. Try a smaller one.";
const UNREADABLE = "Couldn't read that image. Try a PNG or JPEG.";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(UNREADABLE));
    };
    img.src = url;
  });
}

/**
 * Draw `file` to a canvas, scale the long edge down to at most 1568 px (never
 * up), and export it as a JPEG, stepping size and quality down until it fits.
 * Rejects with a readable Error when the file is not a decodable image or is
 * still too large at the smallest setting.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");

  const img = await loadImage(file);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (!srcW || !srcH) throw new Error(UNREADABLE);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(UNREADABLE);

  for (const { longEdge, quality } of ATTEMPTS) {
    const scale = Math.min(1, longEdge / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    canvas.width = width;
    canvas.height = height;
    // JPEG has no alpha channel: without a backing fill, transparent pixels
    // come out black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const preview = canvas.toDataURL("image/jpeg", quality);
    const comma = preview.indexOf(",");
    const data = comma >= 0 ? preview.slice(comma + 1) : "";
    if (!data || !preview.startsWith("data:image/jpeg")) throw new Error(UNREADABLE);
    if (data.length <= MAX_BASE64_CHARS) return { data, mediaType: "image/jpeg", preview };
  }
  throw new Error(TOO_LARGE);
}
