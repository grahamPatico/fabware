// FlatPattern — the unfolded 2D shape of a sheet-metal Part. The source of
// truth for every consumer that needs flat-pattern geometry: laser-cut DXF,
// shop-drawing PDF, weight, cost, bend simulator's cut step, hole-to-edge
// rule, and the renderer's THREE.Shape builder.
//
// Pure local-frame computation — no Pose, no three.js, no I/O. Pose
// projection is a separate adapter (see `featuresInWorld.ts`); three.js
// adapters live on the frontend and consume the plain `Vec2[]` outline.
//
// `flatPattern(dsl)` is a single eager call. Every consumer reads the field
// it cares about; tabs are integrated into `outlineSegments` for rectangle
// outlines (the only kind tabs currently apply to).

import type { PartDsl, Outline, BendFeature, HoleFeature, SlotFeatureT, TabFeature } from "./dsl";

export interface Vec2 { x: number; y: number }

export interface HoleInstance {
  center: Vec2;
  diameter: number;
  featureName: string;
}

export interface SlotInstance {
  center: Vec2;
  length: number;
  width: number;
  featureName: string;
}

export interface TabInstance {
  edge: "top" | "bottom" | "left" | "right";
  /** Distance along the edge, measured from origin (left for top/bottom, bottom for left/right). */
  centerOnEdge: number;
  length: number;
  width: number;
  featureName: string;
}

export interface BendTangent {
  axis: "horizontal" | "vertical";
  positionRatio: number;
  start: Vec2;
  end: Vec2;
  featureName: string;
}

export interface FlatPattern {
  /** Closed polyline of the outline. For circular outlines this is empty and `circle` is set instead. */
  outlineSegments: Vec2[];
  /** Set when the outline is a true circle; consumers that want raw arcs use this. */
  circle: { center: Vec2; radius: number } | null;
  /** Outline AABB width × height (inches). Tabs that protrude outside the AABB do widen it. */
  width: number;
  height: number;
  /** Net area inside the outline, in². Tabs that protrude add to this; holes/slots do not subtract here. */
  outlineArea: number;
  /** Length of the outline path in inches. */
  outlinePerimeter: number;
  holes: HoleInstance[];
  slots: SlotInstance[];
  tabs: TabInstance[];
  bendTangents: BendTangent[];
}

// ---------------------------------------------------------------------------
// Outline → vertices

function rectangleVerts(w: number, h: number): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

function circleAreaPerimeter(r: number): { area: number; perimeter: number } {
  return { area: Math.PI * r * r, perimeter: 2 * Math.PI * r };
}

function regularPolygonVerts(sides: number, radius: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) });
  }
  return pts;
}

function starVerts(numPoints: number, outerRadius: number, innerRadius: number): Vec2[] {
  const total = numPoints * 2;
  const pts: Vec2[] = [];
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: outerRadius + r * Math.cos(angle), y: outerRadius + r * Math.sin(angle) });
  }
  return pts;
}

function polygonShoelaceArea(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(pts: Vec2[]): number {
  if (pts.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = a.x - b.x, dy = a.y - b.y;
    p += Math.sqrt(dx * dx + dy * dy);
  }
  return p;
}

function aabb(pts: Vec2[]): { width: number; height: number } {
  if (pts.length === 0) return { width: 0, height: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Holes / slots / tabs / bends → instances

function holeInstances(features: PartDsl["features"], width: number, height: number): HoleInstance[] {
  const out: HoleInstance[] = [];
  for (const f of features) {
    if (f.kind !== "hole") continue;
    const h = f as HoleFeature;
    out.push(...holePositionsFor(h, width, height).map(p => ({
      center: p, diameter: h.diameter, featureName: h.name,
    })));
  }
  return out;
}

function slotInstances(features: PartDsl["features"], width: number, height: number): SlotInstance[] {
  const out: SlotInstance[] = [];
  for (const f of features) {
    if (f.kind !== "slot") continue;
    const s = f as SlotFeatureT;
    out.push(...slotPositionsFor(s, width, height).map(p => ({
      center: p, length: s.length, width: s.width, featureName: s.name,
    })));
  }
  return out;
}

function tabInstances(features: PartDsl["features"], width: number, height: number): TabInstance[] {
  const out: TabInstance[] = [];
  for (const f of features) {
    if (f.kind !== "tab") continue;
    const t = f as TabFeature;
    const len = t.edge === "top" || t.edge === "bottom" ? width : height;
    const step = len / (t.count + 1);
    for (let i = 1; i <= t.count; i++) {
      out.push({
        edge: t.edge,
        centerOnEdge: i * step,
        length: t.length,
        width: t.width,
        featureName: t.name,
      });
    }
  }
  return out;
}

function bendTangents(features: PartDsl["features"], width: number, height: number): BendTangent[] {
  const out: BendTangent[] = [];
  for (const f of features) {
    if (f.kind !== "bend") continue;
    const b = f as BendFeature;
    if (b.axis === "horizontal") {
      const y = b.positionRatio * height;
      out.push({ axis: "horizontal", positionRatio: b.positionRatio,
        start: { x: 0, y }, end: { x: width, y },
        featureName: b.name });
    } else {
      const x = b.positionRatio * width;
      out.push({ axis: "vertical", positionRatio: b.positionRatio,
        start: { x, y: 0 }, end: { x, y: height },
        featureName: b.name });
    }
  }
  return out;
}

/**
 * Hole-pattern positions for a single feature. Consolidated from four prior
 * copies (bendSim, featuresInWorld, dxf, pdf, AssembledView). Coordinates
 * are part-local with the outline's bottom-left at origin.
 */
export function holePositionsFor(h: HoleFeature, width: number, height: number): Vec2[] {
  if (h.positions && h.positions.length > 0) {
    return h.positions.slice(0, h.count).map(p => ({ x: p.x, y: p.y }));
  }
  const inset = h.inset ?? 0.375;
  const insetX = h.insetX ?? inset;
  const insetY = h.insetY ?? inset;
  const out: Vec2[] = [];
  switch (h.pattern) {
    case "corner": {
      const corners: Vec2[] = [
        { x: insetX,         y: insetY          },
        { x: width - insetX, y: insetY          },
        { x: insetX,         y: height - insetY },
        { x: width - insetX, y: height - insetY },
      ];
      const n = Math.min(h.count, 4);
      for (let i = 0; i < n; i++) out.push(corners[i]);
      if (h.count > 4) {
        const edges: Vec2[] = [
          { x: width / 2,        y: insetY          },
          { x: width / 2,        y: height - insetY },
          { x: insetX,           y: height / 2      },
          { x: width - insetX,   y: height / 2      },
        ];
        for (let i = 0; i < h.count - 4; i++) out.push(edges[i % 4]);
      }
      break;
    }
    case "center":
      out.push({ x: width / 2, y: height / 2 });
      break;
    case "top_row": {
      const y = height - insetY;
      const step = (width - 2 * insetX) / Math.max(h.count - 1, 1);
      for (let i = 0; i < h.count; i++) out.push({ x: insetX + i * step, y });
      break;
    }
    case "bottom_row": {
      const y = insetY;
      const step = (width - 2 * insetX) / Math.max(h.count - 1, 1);
      for (let i = 0; i < h.count; i++) out.push({ x: insetX + i * step, y });
      break;
    }
  }
  return out;
}

function slotPositionsFor(s: SlotFeatureT, width: number, height: number): Vec2[] {
  const inset = 0.375;
  const out: Vec2[] = [];
  switch (s.pattern) {
    case "corner":
      out.push(
        { x: inset,         y: inset          },
        { x: width - inset, y: inset          },
        { x: inset,         y: height - inset },
        { x: width - inset, y: height - inset },
      );
      break;
    case "center":
      out.push({ x: width / 2, y: height / 2 });
      break;
    case "top_row":
    case "bottom_row": {
      const y = s.pattern === "top_row" ? height - inset : inset;
      const step = (width - 2 * inset) / Math.max(s.count - 1, 1);
      for (let i = 0; i < s.count; i++) out.push({ x: inset + i * step, y });
      break;
    }
  }
  return out.slice(0, s.count);
}

// ---------------------------------------------------------------------------
// Outline assembly with tab integration

/**
 * Walk a rectangle outline counter-clockwise from (0,0), splicing tab
 * notches into each named edge as it goes. Tabs on top/bottom edges
 * protrude outward in +y / -y; tabs on left/right edges protrude in -x / +x.
 */
function rectangleWithTabs(width: number, height: number, tabs: TabInstance[]): Vec2[] {
  if (tabs.length === 0) return rectangleVerts(width, height);

  const tabsByEdge: Record<TabInstance["edge"], TabInstance[]> = {
    bottom: [], right: [], top: [], left: [],
  };
  for (const t of tabs) tabsByEdge[t.edge].push(t);
  for (const k of Object.keys(tabsByEdge) as TabInstance["edge"][]) {
    tabsByEdge[k].sort((a, b) => a.centerOnEdge - b.centerOnEdge);
  }

  const out: Vec2[] = [];

  // Bottom edge: walk +x at y=0; tabs protrude in -y by tab.width.
  out.push({ x: 0, y: 0 });
  for (const t of tabsByEdge.bottom) {
    const x0 = t.centerOnEdge - t.length / 2;
    const x1 = t.centerOnEdge + t.length / 2;
    out.push({ x: x0, y: 0 });
    out.push({ x: x0, y: -t.width });
    out.push({ x: x1, y: -t.width });
    out.push({ x: x1, y: 0 });
  }
  out.push({ x: width, y: 0 });

  // Right edge: walk +y at x=width; tabs protrude in +x.
  for (const t of tabsByEdge.right) {
    const y0 = t.centerOnEdge - t.length / 2;
    const y1 = t.centerOnEdge + t.length / 2;
    out.push({ x: width, y: y0 });
    out.push({ x: width + t.width, y: y0 });
    out.push({ x: width + t.width, y: y1 });
    out.push({ x: width, y: y1 });
  }
  out.push({ x: width, y: height });

  // Top edge: walk -x at y=height; tabs protrude in +y.
  // Iterate top tabs from right to left.
  for (let i = tabsByEdge.top.length - 1; i >= 0; i--) {
    const t = tabsByEdge.top[i];
    const x1 = t.centerOnEdge + t.length / 2;
    const x0 = t.centerOnEdge - t.length / 2;
    out.push({ x: x1, y: height });
    out.push({ x: x1, y: height + t.width });
    out.push({ x: x0, y: height + t.width });
    out.push({ x: x0, y: height });
  }
  out.push({ x: 0, y: height });

  // Left edge: walk -y at x=0; tabs protrude in -x.
  for (let i = tabsByEdge.left.length - 1; i >= 0; i--) {
    const t = tabsByEdge.left[i];
    const y1 = t.centerOnEdge + t.length / 2;
    const y0 = t.centerOnEdge - t.length / 2;
    out.push({ x: 0, y: y1 });
    out.push({ x: -t.width, y: y1 });
    out.push({ x: -t.width, y: y0 });
    out.push({ x: 0, y: y0 });
  }
  // close — return to (0, 0); polygons are implicitly closed by caller.

  return out;
}

// ---------------------------------------------------------------------------
// Public entry point

export function flatPattern(dsl: PartDsl): FlatPattern {
  const w = dsl.width;
  const h = dsl.height;
  const outline: Outline = dsl.outline ?? { kind: "rectangle" };

  const tabs = tabInstances(dsl.features, w, h);
  const holes = holeInstances(dsl.features, w, h);
  const slots = slotInstances(dsl.features, w, h);
  const bends = bendTangents(dsl.features, w, h);

  if (outline.kind === "circle") {
    const { area, perimeter } = circleAreaPerimeter(outline.radius);
    return {
      outlineSegments: [],
      circle: { center: { x: outline.radius, y: outline.radius }, radius: outline.radius },
      width: outline.radius * 2,
      height: outline.radius * 2,
      outlineArea: area,
      outlinePerimeter: perimeter,
      holes, slots, tabs, bendTangents: bends,
    };
  }

  let segments: Vec2[];
  if (outline.kind === "rectangle") {
    segments = rectangleWithTabs(w, h, tabs);
  } else if (outline.kind === "regular_polygon") {
    segments = regularPolygonVerts(outline.sides, outline.radius);
  } else if (outline.kind === "star") {
    segments = starVerts(outline.numPoints, outline.outerRadius, outline.innerRadius);
  } else {
    // arbitrary polygon — re-anchor to bbox origin
    let minX = Infinity, minY = Infinity;
    for (const p of outline.points) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; }
    segments = outline.points.map(p => ({ x: p.x - minX, y: p.y - minY }));
  }

  const bb = aabb(segments);
  return {
    outlineSegments: segments,
    circle: null,
    width: bb.width,
    height: bb.height,
    outlineArea: polygonShoelaceArea(segments),
    outlinePerimeter: polygonPerimeter(segments),
    holes, slots, tabs, bendTangents: bends,
  };
}
