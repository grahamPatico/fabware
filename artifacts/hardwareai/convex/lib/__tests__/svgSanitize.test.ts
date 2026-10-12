import { describe, it, expect } from "vitest";
import { MAX_CONCEPT_SVG_BYTES, sanitizeConceptSvg } from "../svgSanitize";

const wrap = (inner: string, attrs = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"') =>
  `<svg ${attrs}>${inner}</svg>`;
const SHAPE = '<rect x="10" y="10" width="100" height="50" fill="none" stroke="#f97316"/>';

describe("sanitizeConceptSvg", () => {
  it("passes a clean drawing through unchanged", () => {
    const svg = wrap(`<rect width="800" height="600" fill="#0f1620"/><g stroke="#e2e8f0"><path d="M10 10 L 90 90"/></g>`);
    expect(sanitizeConceptSvg(svg)).toBe(svg);
  });

  it("extracts the SVG from surrounding prose and code fences", () => {
    const out = sanitizeConceptSvg("Here you go:\n```svg\n" + wrap(SHAPE) + "\n```\nEnjoy <b>it</b>.");
    expect(out).toBe(wrap(SHAPE));
  });

  it("takes only the first SVG and keeps nested ones intact", () => {
    const nested = wrap(`<svg x="5">${SHAPE}</svg>${SHAPE}`);
    expect(sanitizeConceptSvg(nested + wrap('<circle r="1"/>'))).toBe(nested);
  });

  it("adds a missing xmlns and viewBox", () => {
    expect(sanitizeConceptSvg(`<svg>${SHAPE}</svg>`))
      .toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">${SHAPE}</svg>`);
    expect(sanitizeConceptSvg(`<svg width="400" height="300">${SHAPE}</svg>`)).toContain('viewBox="0 0 400 300"');
  });

  it("returns null when there is nothing usable", () => {
    expect(sanitizeConceptSvg("")).toBeNull();
    expect(sanitizeConceptSvg("I can't draw that.")).toBeNull();
    expect(sanitizeConceptSvg("<svg><rect/>")).toBeNull(); // never closed
    expect(sanitizeConceptSvg(wrap(""))).toBeNull();
    expect(sanitizeConceptSvg(wrap("<script>alert(1)</script>"))).toBeNull(); // nothing left to draw
    expect(sanitizeConceptSvg(undefined as unknown as string)).toBeNull();
  });

  it("rejects anything over 60 KB", () => {
    const big = wrap(SHAPE + `<path d="${"M0 0 L1 1 ".repeat(7000)}"/>`);
    expect(big.length).toBeGreaterThan(MAX_CONCEPT_SVG_BYTES);
    expect(sanitizeConceptSvg(big)).toBeNull();
  });

  const hostile: Array<[string, string]> = [
    ["script element", `<script>alert(1)</script>${SHAPE}`],
    ["script with attributes and odd case", `<SCRIPT type="text/ecmascript" href="x.js">alert(1)</ScRiPt >${SHAPE}`],
    ["self-closing script", `<script xlink:href="https://evil.example/x.js"/>${SHAPE}`],
    ["unclosed script", `${SHAPE}<script>alert(1)`],
    ["script split to survive one removal", `<scr<script></script>ipt>alert(1)</scr<script></script>ipt>${SHAPE}`],
    ["foreignObject", `<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject>${SHAPE}`],
    ["iframe", `<iframe src="https://evil.example"></iframe>${SHAPE}`],
    ["image", `<image href="https://evil.example/track.png" width="1" height="1"/>${SHAPE}`],
    ["image with a data URL", `<image xlink:href="data:image/svg+xml;base64,PHN2Zz4=" />${SHAPE}`],
    ["onload on the root", SHAPE],
    ["onclick on a shape", `<rect width="5" height="5" onclick="alert(1)"/>${SHAPE}`],
    ["handler with no space before it", `<rect width="5" height="5"/onmouseover=alert(1)>${SHAPE}`],
    ["handler after a quote", `<rect fill="red"onfocus="alert(1)" width="5" height="5"/>${SHAPE}`],
    ["javascript link", `<a href="javascript:alert(1)">${SHAPE}</a>`],
    ["javascript link with whitespace", `<a xlink:href=" java\tscript:alert(1)">${SHAPE}</a>`],
    ["javascript link in mixed case", `<a href='JaVaScRiPt:alert(1)'>${SHAPE}</a>`],
    ["external link", `<a href="https://evil.example">${SHAPE}</a>`],
    ["external use", `<use href="https://evil.example/sprite.svg#x"/>${SHAPE}`],
    ["external use via xlink", `<use xlink:href="//evil.example/s.svg#x"></use>${SHAPE}`],
    ["style with @import", `<style>@import url("https://evil.example/x.css");</style>${SHAPE}`],
    ["style with url()", `<style>rect{fill:url(https://evil.example/p.svg#a)}</style>${SHAPE}`],
    ["external url() in an attribute", `<rect width="5" height="5" fill="url(https://evil.example/p.svg#a)"/>${SHAPE}`],
    ["external url() in a style attribute", `<rect width="5" height="5" style="background:url('//evil.example/x')"/>${SHAPE}`],
    ["animation that sets a link", `<a>${SHAPE}<set attributeName="href" to="javascript:alert(1)"/></a>`],
    ["animate element", `<animate attributeName="href" values="javascript:alert(1)"/>${SHAPE}`],
    ["entity declaration", `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${SHAPE}`],
    ["CDATA script", `<![CDATA[<script>alert(1)</script>]]>${SHAPE}`],
    ["comment hiding a script", `<!-- <script>alert(1)</script> -->${SHAPE}`],
    ["embed and object", `<embed src="x.swf"/><object data="x.html"></object>${SHAPE}`],
  ];

  const UNSAFE = /<\s*\/?\s*(script|foreignObject|iframe|image|embed|object|animate|set)\b|javascript:|\son\w+\s*=|evil\.example|@import|<!|data:/i;

  it.each(hostile)("neutralises: %s", (name, inner) => {
    const attrs = name === "onload on the root"
      ? 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" onload="alert(1)"'
      : undefined;
    const out = sanitizeConceptSvg(wrap(inner, attrs));
    // Either refused outright, or returned with nothing dangerous left.
    if (out !== null) {
      expect(out).not.toMatch(UNSAFE);
      expect(out).toContain("<rect");
      expect(out.startsWith("<svg")).toBe(true);
    }
  });

  it("keeps the drawing when it strips an attack", () => {
    const out = sanitizeConceptSvg(wrap(`<script>alert(1)</script><a href="javascript:alert(1)">${SHAPE}</a>`));
    expect(out).toBe(wrap(`<a>${SHAPE}</a>`.replace("<a>", "<a >")));
  });

  it("refuses character references, which can spell a blocked word", () => {
    expect(sanitizeConceptSvg(wrap(`<a href="jav&#x61;script:alert(1)">${SHAPE}</a>`))).not.toMatch(/&#|script:/i);
    expect(sanitizeConceptSvg(wrap(`<rect width="1" height="1" o&#110;load="x"/>`))).toBeNull();
  });

  it("keeps internal references: gradients, clip paths and local <use>", () => {
    const svg = wrap(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#f97316"/></linearGradient>' +
      '<path id="p" d="M0 0 L5 5"/></defs>' +
      '<rect width="50" height="50" fill="url(#g)"/><use href="#p"/><use xlink:href="#p" x="5"/>',
    );
    expect(sanitizeConceptSvg(svg)).toBe(svg);
  });

  it("keeps a harmless stylesheet", () => {
    const svg = wrap(`<style>.a{stroke:#e2e8f0;fill:none}</style><path class="a" d="M0 0 L5 5"/>`);
    expect(sanitizeConceptSvg(svg)).toBe(svg);
  });
});
