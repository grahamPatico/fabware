// Sanitizer for the concept sketch. The SVG is written by a model and shown
// inline in the plan, so it is treated as hostile: anything that can run
// script, load a remote resource or embed other content is removed, and the
// result is rejected outright if something dangerous is still there.
//
// This is a deliberately small allow-by-removal pass for one kind of
// document (a line drawing). It is not a general-purpose SVG sanitizer.

export const MAX_CONCEPT_SVG_BYTES = 60_000;
const DEFAULT_VIEWBOX = "0 0 800 600";

// Elements removed with everything inside them.
const BLOCKED_ELEMENTS = [
  "script", "foreignObject", "iframe", "image", "object", "embed", "audio", "video", "canvas",
  // Animation can rewrite an attribute (href, say) after the page has checked it.
  "animate", "animateTransform", "animateMotion", "set",
];

const DRAWABLE = /<(path|rect|circle|ellipse|line|polyline|polygon)\b/i;

/** The first complete `<svg>…</svg>`, respecting nested `<svg>` elements. */
function firstSvg(raw: string): string | null {
  const open = raw.search(/<svg[\s>/]/i);
  if (open === -1) return null;
  const token = /<svg[\s>/]|<\/svg\s*>/gi;
  token.lastIndex = open;
  let depth = 0;
  for (let m = token.exec(raw); m; m = token.exec(raw)) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return raw.slice(open, m.index + m[0].length);
    } else {
      depth += 1;
    }
  }
  return null;
}

/** Apply `replace` until the text stops changing, so removals can't be nested to survive one pass. */
function untilStable(text: string, replace: (t: string) => string): string {
  for (let i = 0; i < 20; i++) {
    const next = replace(text);
    if (next === text) return next;
    text = next;
  }
  return text;
}

function removeElement(text: string, name: string): string {
  const paired = new RegExp(`<${name}\\b[\\s\\S]*?<\\/${name}\\s*>`, "gi");
  const single = new RegExp(`<\\/?${name}\\b[^>]*>`, "gi");
  return text.replace(paired, "").replace(single, "");
}

const ATTR_VALUE = `(?:"[^"]*"|'[^']*'|[^\\s>]+)`;

function scrub(svg: string): string {
  let out = svg;
  // Comments, CDATA, processing instructions, doctype and entity declarations.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");
  out = out.replace(/<\?[\s\S]*?\?>/g, "");
  out = out.replace(/<![a-z][^>]*>/gi, "");

  for (const name of BLOCKED_ELEMENTS) out = removeElement(out, name);

  // A stylesheet that can load something remote goes entirely.
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (block, css: string) =>
    /@import|url\s*\(|expression\s*\(|javascript:/i.test(css) ? "" : block);

  // <use> may only point inside this document.
  out = out.replace(/<use\b[^>]*>/gi, (tag) => {
    const href = tag.match(/(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const target = (href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
    return href && !target.startsWith("#") ? "" : tag;
  });

  // Event handlers: onload=, onclick=, and so on.
  out = out.replace(new RegExp(`(?<=[\\s/"'])on[a-z0-9_:.-]*\\s*=\\s*${ATTR_VALUE}`, "gi"), "");

  // Links may only be #fragments.
  out = out.replace(new RegExp(`(?<=[\\s/"'])(?:xlink:)?href\\s*=\\s*(${ATTR_VALUE})`, "gi"), (attr, value: string) => {
    const target = value.replace(/^["']|["']$/g, "").trim();
    return target.startsWith("#") ? attr : "";
  });

  // url(...) may only reference a #fragment (gradients, clip paths).
  out = out.replace(/url\(\s*(['"]?)\s*([^)'"]*)\1\s*\)/gi, (whole, _q, target: string) =>
    target.trim().startsWith("#") ? whole : "none");

  // Script URLs anywhere, including ones split by whitespace.
  out = out.replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, "");
  out = out.replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, "");
  out = out.replace(/data\s*:\s*text\/html/gi, "");
  return out;
}

// What must not survive. Character references are refused too: they are how
// a blocked word gets spelled past a text filter, and a line drawing has no
// use for them.
const STILL_DANGEROUS = [
  /<\s*\/?\s*(script|foreignObject|iframe|image|object|embed)\b/i,
  /javascript\s*:/i,
  /[\s/"']on[a-z0-9_:.-]*\s*=/i,
  /&#/,
  /@import/i,
];

function withRootAttributes(svg: string): string {
  return svg.replace(/^<svg\b([^>]*)>/i, (_tag, attrs: string) => {
    let next = attrs;
    if (!/\sxmlns\s*=/i.test(next)) next = ` xmlns="http://www.w3.org/2000/svg"${next}`;
    if (!/\sviewBox\s*=/i.test(next)) {
      const w = next.match(/\swidth\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);
      const h = next.match(/\sheight\s*=\s*["']?\s*(\d+(?:\.\d+)?)/i);
      next += ` viewBox="${w && h ? `0 0 ${w[1]} ${h[1]}` : DEFAULT_VIEWBOX}"`;
    }
    return `<svg${next}>`;
  });
}

/**
 * A safe copy of the first `<svg>` in `raw`, or null when there is none, it
 * is over 60 KB, nothing drawable is left, or it can't be made safe.
 */
export function sanitizeConceptSvg(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const svg = firstSvg(raw);
  if (!svg) return null;
  if (new TextEncoder().encode(svg).length > MAX_CONCEPT_SVG_BYTES) return null;

  const clean = withRootAttributes(untilStable(svg, scrub).trim());
  if (!/^<svg\b/i.test(clean) || !/<\/svg\s*>$/i.test(clean)) return null;
  if (STILL_DANGEROUS.some((pattern) => pattern.test(clean))) return null;
  if (!DRAWABLE.test(clean)) return null;
  return clean;
}
