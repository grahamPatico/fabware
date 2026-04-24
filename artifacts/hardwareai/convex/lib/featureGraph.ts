import type { PartDsl, Feature, HoleFeature, BendFeature } from "./dsl";

export type EdgeType = "cut" | "bend" | "hole" | "slot";
export type AnnotationType = "dimension" | "callout" | "title" | "notes";

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  name: string;
  points: GraphPoint[];
  matched_parameters: string[];
  metadata?: Record<string, string | number>;
}

export interface GraphAnnotation {
  id: string;
  text: string;
  position: GraphPoint;
  type: AnnotationType;
  matched_parameters: string[];
  variableName?: string;
  variableValue?: string;
}

export interface FeatureGraph {
  version: number;
  bbox: { width: number; height: number };
  edges: GraphEdge[];
  annotations: GraphAnnotation[];
}

export function buildFeatureGraph(dsl: PartDsl): FeatureGraph {
  const edges: GraphEdge[] = [];
  const annotations: GraphAnnotation[] = [];
  const w = dsl.width;
  const h = dsl.height;

  edges.push({
    id: "outline_top",
    type: "cut",
    name: "outline_top",
    points: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
    ],
    matched_parameters: ["width"],
  });
  edges.push({
    id: "outline_right",
    type: "cut",
    name: "outline_right",
    points: [
      { x: w, y: 0 },
      { x: w, y: h },
    ],
    matched_parameters: ["height"],
  });
  edges.push({
    id: "outline_bottom",
    type: "cut",
    name: "outline_bottom",
    points: [
      { x: w, y: h },
      { x: 0, y: h },
    ],
    matched_parameters: ["width"],
  });
  edges.push({
    id: "outline_left",
    type: "cut",
    name: "outline_left",
    points: [
      { x: 0, y: h },
      { x: 0, y: 0 },
    ],
    matched_parameters: ["height"],
  });

  // Overall dimension annotations
  annotations.push({
    id: "dim_width",
    text: `WIDTH = ${w.toFixed(3)}"`,
    position: { x: w / 2, y: -0.4 },
    type: "dimension",
    matched_parameters: ["width"],
    variableName: "width",
    variableValue: `${w}"`,
  });
  annotations.push({
    id: "dim_height",
    text: `HEIGHT = ${h.toFixed(3)}"`,
    position: { x: -0.5, y: h / 2 },
    type: "dimension",
    matched_parameters: ["height"],
    variableName: "height",
    variableValue: `${h}"`,
  });

  for (const feature of dsl.features) {
    addFeatureToGraph(feature, dsl, edges, annotations);
  }

  // Title block annotations
  annotations.push({
    id: "title_material",
    text: `MATERIAL = ${dsl.material}`,
    position: { x: 0, y: h + 0.6 },
    type: "title",
    matched_parameters: ["material"],
    variableName: "material",
    variableValue: dsl.material,
  });
  annotations.push({
    id: "title_thickness",
    text: `THICKNESS = ${dsl.thickness}"`,
    position: { x: 0, y: h + 0.85 },
    type: "title",
    matched_parameters: ["thickness"],
    variableName: "thickness",
    variableValue: `${dsl.thickness}"`,
  });
  if (dsl.finish) {
    annotations.push({
      id: "title_finish",
      text: `FINISH = POWDER COAT ${dsl.finish.color.toUpperCase()}`,
      position: { x: 0, y: h + 1.1 },
      type: "title",
      matched_parameters: ["finish.color"],
      variableName: "finish",
      variableValue: dsl.finish.color,
    });
  }

  return {
    version: 1,
    bbox: { width: w, height: h },
    edges,
    annotations,
  };
}

function addFeatureToGraph(
  feature: Feature,
  dsl: PartDsl,
  edges: GraphEdge[],
  annotations: GraphAnnotation[],
): void {
  switch (feature.kind) {
    case "hole":
      addHoles(feature, dsl, edges, annotations);
      break;
    case "bend":
      addBend(feature, dsl, edges, annotations);
      break;
    case "slot":
      addSlots(feature, dsl, edges, annotations);
      break;
    case "fillet":
      // Fillets modify outline corners — for now, just annotate
      annotations.push({
        id: `fillet_${feature.name}`,
        text: `FILLET R = ${feature.radius}" (${feature.corners})`,
        position: { x: dsl.width / 2, y: dsl.height + 0.3 },
        type: "callout",
        matched_parameters: [`features.${feature.name}.radius`],
        variableName: feature.name,
        variableValue: `R${feature.radius}"`,
      });
      break;
  }
}

function holePositions(feature: HoleFeature, w: number, h: number): GraphPoint[] {
  const inset = feature.inset ?? 0.375;
  switch (feature.pattern) {
    case "corner": {
      const all = [
        { x: inset, y: inset },
        { x: w - inset, y: inset },
        { x: inset, y: h - inset },
        { x: w - inset, y: h - inset },
      ];
      if (feature.count <= 4) return all.slice(0, feature.count);
      // Counts > 4: corners + evenly distribute remaining along the perimeter
      const extra: GraphPoint[] = [];
      const remaining = feature.count - 4;
      for (let i = 0; i < remaining; i++) {
        const t = (i + 1) / (remaining + 1);
        extra.push({ x: inset + (w - 2 * inset) * t, y: inset });
      }
      return [...all, ...extra];
    }
    case "center": {
      if (feature.count === 1) return [{ x: w / 2, y: h / 2 }];
      const pts: GraphPoint[] = [];
      const spacing = (w - 2 * inset) / Math.max(feature.count - 1, 1);
      for (let i = 0; i < feature.count; i++) {
        pts.push({ x: inset + spacing * i, y: h / 2 });
      }
      return pts;
    }
    case "top_row": {
      const pts: GraphPoint[] = [];
      const spacing = (w - 2 * inset) / Math.max(feature.count - 1, 1);
      for (let i = 0; i < feature.count; i++) {
        pts.push({ x: inset + spacing * i, y: inset });
      }
      return pts;
    }
    case "bottom_row": {
      const pts: GraphPoint[] = [];
      const spacing = (w - 2 * inset) / Math.max(feature.count - 1, 1);
      for (let i = 0; i < feature.count; i++) {
        pts.push({ x: inset + spacing * i, y: h - inset });
      }
      return pts;
    }
  }
}

function addHoles(
  feature: HoleFeature,
  dsl: PartDsl,
  edges: GraphEdge[],
  annotations: GraphAnnotation[],
): void {
  const positions = holePositions(feature, dsl.width, dsl.height);
  positions.forEach((p, i) => {
    edges.push({
      id: `hole_${feature.name}_${i}`,
      type: "hole",
      name: `${feature.name}_${i}`,
      points: [p],
      matched_parameters: [
        `features.${feature.name}.diameter`,
        `features.${feature.name}.pattern`,
      ],
      metadata: { diameter: feature.diameter, cx: p.x, cy: p.y },
    });
  });
  annotations.push({
    id: `callout_${feature.name}`,
    text: `${feature.count}X DIA ${feature.diameter.toFixed(3)}" — ${feature.name.toUpperCase()}`,
    position: { x: dsl.width + 0.2, y: 0.2 },
    type: "callout",
    matched_parameters: [
      `features.${feature.name}.count`,
      `features.${feature.name}.diameter`,
    ],
    variableName: feature.name,
    variableValue: `Ø${feature.diameter}" × ${feature.count}`,
  });
}

function addBend(
  feature: BendFeature,
  dsl: PartDsl,
  edges: GraphEdge[],
  annotations: GraphAnnotation[],
): void {
  const isHorizontal = feature.axis === "horizontal";
  const pos = isHorizontal
    ? dsl.height * feature.positionRatio
    : dsl.width * feature.positionRatio;
  const points = isHorizontal
    ? [
        { x: 0, y: pos },
        { x: dsl.width, y: pos },
      ]
    : [
        { x: pos, y: 0 },
        { x: pos, y: dsl.height },
      ];
  edges.push({
    id: `bend_${feature.name}`,
    type: "bend",
    name: feature.name,
    points,
    matched_parameters: [
      `features.${feature.name}.angle`,
      `features.${feature.name}.radius`,
      `features.${feature.name}.axis`,
    ],
    metadata: { angle: feature.angle, radius: feature.radius },
  });
  annotations.push({
    id: `callout_${feature.name}`,
    text: `BEND ${feature.angle}° R${feature.radius}" — ${feature.name.toUpperCase()}`,
    position: isHorizontal
      ? { x: 0.1, y: pos - 0.1 }
      : { x: pos + 0.1, y: 0.1 },
    type: "callout",
    matched_parameters: [
      `features.${feature.name}.angle`,
      `features.${feature.name}.radius`,
    ],
    variableName: feature.name,
    variableValue: `${feature.angle}° R${feature.radius}"`,
  });
}

function addSlots(
  feature: { kind: "slot"; name: string; count: number; length: number; width: number; pattern: string },
  dsl: PartDsl,
  edges: GraphEdge[],
  annotations: GraphAnnotation[],
): void {
  const inset = 0.5;
  const slotPositions = (): GraphPoint[] => {
    switch (feature.pattern) {
      case "corner":
        return [
          { x: inset, y: inset },
          { x: dsl.width - inset - feature.length, y: inset },
          { x: inset, y: dsl.height - inset - feature.width },
          { x: dsl.width - inset - feature.length, y: dsl.height - inset - feature.width },
        ].slice(0, feature.count);
      case "top_row":
      case "bottom_row": {
        const y =
          feature.pattern === "top_row" ? inset : dsl.height - inset - feature.width;
        const usable = dsl.width - 2 * inset - feature.length;
        const spacing = usable / Math.max(feature.count - 1, 1);
        const pts: GraphPoint[] = [];
        for (let i = 0; i < feature.count; i++) {
          pts.push({ x: inset + spacing * i, y });
        }
        return pts;
      }
      case "center":
      default: {
        if (feature.count === 1) {
          return [
            {
              x: dsl.width / 2 - feature.length / 2,
              y: dsl.height / 2 - feature.width / 2,
            },
          ];
        }
        const usable = dsl.width - 2 * inset - feature.length;
        const spacing = usable / Math.max(feature.count - 1, 1);
        const pts: GraphPoint[] = [];
        for (let i = 0; i < feature.count; i++) {
          pts.push({ x: inset + spacing * i, y: dsl.height / 2 - feature.width / 2 });
        }
        return pts;
      }
    }
  };
  const positions = slotPositions();
  positions.forEach((p, i) => {
    edges.push({
      id: `slot_${feature.name}_${i}`,
      type: "slot",
      name: `${feature.name}_${i}`,
      points: [
        { x: p.x, y: p.y },
        { x: p.x + feature.length, y: p.y },
        { x: p.x + feature.length, y: p.y + feature.width },
        { x: p.x, y: p.y + feature.width },
        { x: p.x, y: p.y },
      ],
      matched_parameters: [
        `features.${feature.name}.length`,
        `features.${feature.name}.width`,
      ],
      metadata: { length: feature.length, width: feature.width },
    });
  });
  annotations.push({
    id: `callout_${feature.name}`,
    text: `${feature.count}X SLOT ${feature.length.toFixed(3)}" × ${feature.width.toFixed(3)}"`,
    position: { x: dsl.width + 0.2, y: 0.5 },
    type: "callout",
    matched_parameters: [
      `features.${feature.name}.length`,
      `features.${feature.name}.width`,
    ],
    variableName: feature.name,
    variableValue: `${feature.length}"×${feature.width}"`,
  });
}
