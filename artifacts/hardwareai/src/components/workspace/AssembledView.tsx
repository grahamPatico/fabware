import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";
import { useQuery, useMutation } from "convex/react";
import * as THREE from "three";
import { Home, Square } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CadPreview } from "../CadPreview";
import { holeWorldPositions } from "../../../convex/lib/featuresInWorld";
import { holesPostBend } from "../../../convex/lib/bentGeometry";
import { fastenerStackFromPartNumber } from "../../../convex/lib/fastenerStack";
import { PartDslSchema } from "../../../convex/lib/dsl";
import { flatPattern, type FlatPattern as FlatPatternRecord } from "../../../convex/lib/flatPattern";
import { MCMASTER_SEED } from "../../../convex/lib/mcmasterSeed";

type Pose = { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number };

interface HoleMark {
  /** Center in part-local frame, with origin at outline bottom-left. */
  center: { x: number; y: number };
  diameter: number;
}

interface HoleMarksProps {
  /** Local box dimensions matching the sheet-metal convention: [width, thickness, height]. */
  size: [number, number, number];
  holes: HoleMark[];
}

/**
 * Render hole-pattern positions (already computed by `flatPattern`) as thin
 * black cylinders embedded in the part. Cylinder axis = part's local Y
 * (thickness direction), length = thickness * 1.02 so the disk caps are
 * visible on both faces. Visual-only — true cutouts via THREE.Shape.holes
 * is queued as a follow-up.
 */
function HoleMarks({ size, holes }: HoleMarksProps) {
  const [w, t, h] = size;
  const meshes = useMemo(() => {
    const out: Array<{ key: string; pos: [number, number, number]; r: number }> = [];
    holes.forEach((hole, idx) => {
      if (!Number.isFinite(hole.diameter) || hole.diameter <= 0) return;
      out.push({
        key: `hole-${idx}`,
        pos: [hole.center.x - w / 2, 0, hole.center.y - h / 2],
        r: hole.diameter / 2,
      });
    });
    return out;
  }, [w, t, h, holes]);
  if (meshes.length === 0) return null;
  return (
    <>
      {meshes.map(m => (
        <mesh key={m.key} position={m.pos}>
          <cylinderGeometry args={[m.r, m.r, t * 1.02, 18]} />
          <meshStandardMaterial color="#0a0a0a" metalness={0.05} roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}

interface BendLinesProps {
  /** Local box dimensions matching the sheet-metal convention: [width, thickness, height]. */
  size: [number, number, number];
  bends: Array<{ axis: "horizontal" | "vertical"; positionRatio: number }>;
}

/**
 * Dashed yellow lines drawn on a sheet-metal part's top surface (y = +thickness/2)
 * showing where each bend tangent sits. Mounted as a child of the part mesh so
 * it inherits the same pose rotation.
 *
 * `axis = "horizontal"` → bend runs across the WIDTH at a specific HEIGHT-position.
 * `axis = "vertical"`   → bend runs across the HEIGHT at a specific WIDTH-position.
 */
function BendLines({ size, bends }: BendLinesProps) {
  const [w, t, h] = size;
  const yTop = t / 2 + 0.001; // hair above the surface so it doesn't z-fight

  const segments = useMemo(() => {
    const points: number[] = [];
    for (const b of bends) {
      if (b.axis === "horizontal") {
        const z = (b.positionRatio - 0.5) * h;
        points.push(-w / 2, yTop, z, w / 2, yTop, z);
      } else {
        const x = (b.positionRatio - 0.5) * w;
        points.push(x, yTop, -h / 2, x, yTop, h / 2);
      }
    }
    return new Float32Array(points);
  }, [w, t, h, bends, yTop]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(segments, 3));
    return g;
  }, [segments]);

  // Dashed materials need computeLineDistances. Using a custom lineSegments
  // ref to call it after geometry mounts.
  const ref = useRef<THREE.LineSegments | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.computeLineDistances();
  }, [segments]);

  if (bends.length === 0) return null;
  return (
    <lineSegments ref={ref as any} geometry={geom}>
      <lineDashedMaterial
        color="#facc15"
        dashSize={Math.max(0.08, Math.min(w, h) * 0.04)}
        gapSize={Math.max(0.05, Math.min(w, h) * 0.025)}
        linewidth={2}
        depthTest={false}
        transparent
        opacity={0.95}
      />
    </lineSegments>
  );
}

/**
 * Build a `THREE.Shape` from a pre-computed `FlatPattern`. The pattern's
 * `outlineSegments` already include tab notches; we just re-anchor to the
 * AABB center so the extrude geometry centers on the part origin.
 */
function shapeFromPattern(pattern: FlatPatternRecord): THREE.Shape {
  const shape = new THREE.Shape();
  if (pattern.circle) {
    shape.absarc(0, 0, pattern.circle.radius, 0, Math.PI * 2, false);
    return shape;
  }
  const pts = pattern.outlineSegments;
  if (pts.length < 3) {
    // Empty fallback to avoid undefined ExtrudeGeometry.
    shape.moveTo(0, 0);
    return shape;
  }
  const cx = pattern.width / 2, cy = pattern.height / 2;
  pts.forEach((p, i) => {
    const x = p.x - cx, y = p.y - cy;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

interface ExtrudedPartMeshProps {
  pattern: FlatPatternRecord;
  thickness: number;
  position: Pose;
  selected: boolean;
  showBounds: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  color: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  bends?: BendLinesProps["bends"];
  holes?: HoleMark[];
  textureKey?: TextureKey;
}

function ExtrudedPartMesh({
  pattern, thickness, position, selected, showBounds, onClick,
  color, metalness = 0.4, roughness = 0.6, opacity = 1, bends, holes, textureKey,
}: ExtrudedPartMeshProps) {
  const width = pattern.width;
  const height = pattern.height;
  const maps = useMemo(() => getMaterialMaps(textureKey ?? null), [textureKey]);
  const geometry = useMemo(() => {
    const shape = shapeFromPattern(pattern);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 24,
    });
    // Center the extrude along its own thickness so position offsets match box
    // geometry (which is centered on the part's centroid).
    geom.translate(0, 0, -thickness / 2);
    // Rotate -π/2 around X so the extrude's local-Z (thickness) axis becomes
    // local-Y, matching the existing box convention used by sheet-metal
    // pose math (size = [width, thickness, height] along three.js x,y,z).
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, [pattern, thickness]);

  return (
    <mesh
      position={[position.x, position.z, position.y]}
      rotation={[position.rotX, position.rotZ, position.rotY]}
      geometry={geometry}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={selected ? "#7dd3fc" : color}
        metalness={metalness}
        roughness={roughness}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={selected ? "#0ea5e9" : "#000000"}
        emissiveIntensity={selected ? 0.25 : 0}
        normalMap={maps?.normal ?? null}
        roughnessMap={maps?.roughness ?? null}
      />
      {(showBounds || selected) && (
        <Edges color={selected ? "#38bdf8" : "#666666"} lineWidth={selected ? 2.5 : 1} threshold={1} />
      )}
      {bends && bends.length > 0 && <BendLines size={[width, thickness, height]} bends={bends} />}
      {holes && holes.length > 0 && <HoleMarks size={[width, thickness, height]} holes={holes} />}
    </mesh>
  );
}

interface MeshProps {
  size: [number, number, number];
  position: Pose;
  selected: boolean;
  showBounds: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  color: string;
  metalness?: number;
  roughness?: number;
  wireframe?: boolean;
  opacity?: number;
  bends?: BendLinesProps["bends"];
  holes?: HoleMark[];
  textureKey?: TextureKey;
}

function PartMesh({
  size,
  position,
  selected,
  showBounds,
  onClick,
  color,
  metalness = 0.3,
  roughness = 0.6,
  wireframe = false,
  opacity = 1,
  bends,
  holes,
  textureKey,
}: MeshProps) {
  const maps = useMemo(() => getMaterialMaps(textureKey ?? null), [textureKey]);
  return (
    <mesh
      position={[position.x, position.z, position.y]}
      rotation={[position.rotX, position.rotZ, position.rotY]}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={selected ? "#7dd3fc" : color}
        metalness={metalness}
        roughness={roughness}
        wireframe={wireframe}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={selected ? "#0ea5e9" : "#000000"}
        emissiveIntensity={selected ? 0.25 : 0}
        normalMap={maps?.normal ?? null}
        roughnessMap={maps?.roughness ?? null}
      />
      {(showBounds || selected) && (
        <Edges
          color={selected ? "#38bdf8" : "#666666"}
          lineWidth={selected ? 2.5 : 1}
          threshold={1}
        />
      )}
      {bends && bends.length > 0 && <BendLines size={size} bends={bends} />}
      {holes && holes.length > 0 && <HoleMarks size={size} holes={holes} />}
    </mesh>
  );
}

interface PipeMeshProps {
  position: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number };
  outerDiameter: number;
  wallThickness: number;
  length: number;
  material: string;
  selected: boolean;
  showBounds: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

// Pipes render as a hollow tube — outer cylinder + slightly-darker inner
// cylinder to fake the bore. Long axis is local +Z (pose-rotated like
// every other part).
function PipeMesh({ position, outerDiameter, wallThickness, length, material, selected, showBounds, onClick }: PipeMeshProps) {
  const r = outerDiameter / 2;
  const innerR = Math.max(0, r - wallThickness);
  const appearance = sheetMetalAppearance(material);
  return (
    <group
      position={[position.x, position.z, position.y]}
      rotation={[position.rotX, position.rotZ, position.rotY]}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      {/* Outer wall: long axis along local +Y (three.js cylinder default).
          Pre-rotate π/2 around X so the cylinder's axis aligns with the
          part's local +Z (data-frame length direction). After the group's
          pose rotation, the pipe axis lands wherever the user pointed it. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, length / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, length, 28, 1, false]} />
        <meshStandardMaterial
          color={selected ? "#7dd3fc" : appearance.color}
          metalness={appearance.metalness}
          roughness={appearance.roughness}
          emissive={selected ? "#0ea5e9" : "#000000"}
          emissiveIntensity={selected ? 0.25 : 0}
        />
        {(showBounds || selected) && (
          <Edges color={selected ? "#38bdf8" : "#666666"} lineWidth={selected ? 2 : 1} />
        )}
      </mesh>
      {/* Inner bore — only when wall is meaningfully thinner than outer.
          Slightly shorter than the outer so the cap rings are visible. */}
      {innerR > 0.05 && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, length / 2]}>
          <cylinderGeometry args={[innerR, innerR, length * 1.001, 28, 1, true]} />
          <meshStandardMaterial color="#0a0a0a" metalness={0.1} roughness={0.9} side={2} />
        </mesh>
      )}
    </group>
  );
}

// Reference-scale anchors — translucent stand-ins so users see what fits inside.
const REFERENCE_KINDS: Record<string, { diameter: number; color: string }> = {
  "tennis ball":    { diameter: 2.575, color: "#d4ff00" },
  "tennis":         { diameter: 2.575, color: "#d4ff00" },
  "baseball":       { diameter: 2.9,   color: "#f5e3c2" },
  "softball":       { diameter: 3.8,   color: "#fff5b8" },
  "basketball":     { diameter: 9.5,   color: "#cc6633" },
  "soccer ball":    { diameter: 8.7,   color: "#ffffff" },
  "golf ball":      { diameter: 1.68,  color: "#ffffff" },
  "raspberry pi":   { diameter: 3.5,   color: "#5cba6f" },
  "raspberry pi zero": { diameter: 2.6, color: "#5cba6f" },
};

function findReferenceKind(kind: string): { diameter: number; color: string } | null {
  const k = kind.toLowerCase().trim();
  for (const [pattern, val] of Object.entries(REFERENCE_KINDS)) {
    if (k.includes(pattern)) return val;
  }
  return null;
}

function parseQuantityFromKind(kind: string): number | null {
  const m = kind.match(/^\s*(\d+)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function ReferenceAnchors({
  scope,
  centerX,
  centerY,
  floorZ,
}: {
  scope: { referenceScale?: { kind: string; quantity?: number; dimensions?: { w: number; d: number; h: number } } | null } | null;
  centerX: number;
  centerY: number;
  floorZ: number;
}) {
  if (!scope?.referenceScale) return null;
  const ref = findReferenceKind(scope.referenceScale.kind);
  if (!ref) return null;
  const explicitQty = scope.referenceScale.quantity ?? parseQuantityFromKind(scope.referenceScale.kind);
  const qty = Math.max(1, Math.min(explicitQty ?? 1, 12));
  const r = ref.diameter / 2;
  const spacing = ref.diameter * 1.05;
  const totalWidth = (qty - 1) * spacing;
  const startX = centerX - totalWidth / 2;
  return (
    <>
      {Array.from({ length: qty }).map((_, i) => (
        <mesh
          key={i}
          position={[startX + i * spacing, floorZ + r, centerY]}
          castShadow
        >
          <sphereGeometry args={[r, 24, 16]} />
          <meshStandardMaterial color={ref.color} transparent opacity={0.6} roughness={0.45} />
        </mesh>
      ))}
    </>
  );
}

function frameCamera(
  parts: Array<{ position: Pose; w: number; h: number; t: number }>,
  camera: THREE.PerspectiveCamera,
  controls: any,
) {
  if (parts.length === 0) {
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
    return;
  }
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    const tx = p.position.x;
    const ty = p.position.z;
    const tz = p.position.y;
    const r = Math.max(p.w, p.h, p.t) / 2;
    min.x = Math.min(min.x, tx - r);
    min.y = Math.min(min.y, ty - r);
    min.z = Math.min(min.z, tz - r);
    max.x = Math.max(max.x, tx + r);
    max.y = Math.max(max.y, ty + r);
    max.z = Math.max(max.z, tz + r);
  }
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(max, min);
  const longestEdge = Math.max(size.x, size.y, size.z) || 1;
  const fovRad = (camera.fov * Math.PI) / 180;
  const distance = (longestEdge * 0.5) / Math.tan(fovRad / 2);
  const dir = new THREE.Vector3(1, 0.8, 1).normalize();
  const newPos = new THREE.Vector3().copy(center).addScaledVector(dir, distance * 1.6);
  camera.position.copy(newPos);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 50;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

function SceneController({
  parts,
  controlsRef,
  homeSignal,
}: {
  parts: Array<{ position: Pose; w: number; h: number; t: number }>;
  controlsRef: React.MutableRefObject<any>;
  homeSignal: number;
}) {
  const { camera } = useThree();
  const partKey = useMemo(
    () => parts.map(p => `${p.w}x${p.h}x${p.t}@${p.position.x},${p.position.y},${p.position.z}`).join("|"),
    [parts],
  );
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      frameCamera(parts, camera, controlsRef.current);
    }
  }, [partKey, homeSignal, camera, controlsRef, parts]);
  return null;
}

interface BoltMeshesProps {
  parts: Array<any>;
  interfaces: Array<any>;
}

const BOLT_TONE: Record<string, string> = {
  bolted: "#9aa3ad",
  riveted: "#caa75a",
  pem_inserted: "#76c4e8",
};

/**
 * Render small cylinders at every bolted/riveted/pem_inserted hole shared by
 * an interface. The cylinder's long axis follows the part's local Z (its
 * thickness direction) so the bolt sticks out perpendicular to the surface.
 *
 * NOTE: this lives in the renderer (three.js) frame. Hole world positions come
 * out of `holeWorldPositions` in the data frame; we swap Y↔Z to land in three.
 * See docs/conventions/coordinate-frames.md for why.
 */
function BoltMeshes({ parts, interfaces }: BoltMeshesProps) {
  const bolts = useMemo(() => {
    if (!parts || !interfaces) return [];
    const partsById = new Map(parts.map(p => [p._id, p]));
    const out: Array<{
      key: string;
      position: [number, number, number];
      groupRotation: [number, number, number];
      length: number;
      diameter: number;
      color: string;
      title: string;
      headDiameter: number;
      headHeight: number;
      showNut: boolean;
      nutDiameter: number;
      nutHeight: number;
      stackHeight: number;
    }> = [];

    for (const iface of interfaces) {
      const tone = BOLT_TONE[iface.kind];
      if (!tone) continue;
      const partA = partsById.get(iface.partA);
      if (!partA?.dslJson) continue;
      let dslA: any;
      try { dslA = PartDslSchema.parse(JSON.parse(partA.dslJson)); }
      catch { continue; }
      const refA = (iface.featureRefs ?? []).find((r: any) => r.partId === partA._id);
      if (!refA) continue;
      // Use post-bend geometry so bolts on a folded flange land in the
      // correct world plane (not the unfolded flat-pattern position). The
      // resulting BentHole carries a per-hole face-normal we'd ideally use
      // for orientation; for now we still apply the part's group rotation
      // because the renderer doesn't yet fold parts visually.
      const bentHoles = holesPostBend(dslA, partA.position).filter(h => h.featureName === refA.featureName);
      const partB = partsById.get(iface.partB);
      const partAT = partA.thickness ?? 0.075;
      const partBT = partB?.thickness ?? 0.075;
      const stackHeight = partAT + partBT;
      const firstHardware = (iface.hardwareRefs ?? [])[0];
      const stack = firstHardware ? fastenerStackFromPartNumber(firstHardware.mcmasterPartNumber) : null;
      // Length: stack-up + protrusion past the nut. For rivets, no protrusion.
      const protrusion = stack?.kind === "rivet" ? 0 : 0.20;
      const lenAcrossParts = stackHeight + protrusion;
      const headDiameter = stack ? stack.clearanceDiameter * 1.6 : 0.34;
      const headHeight = stack?.kind === "rivet" ? 0.05 : 0.07;
      const showNut = iface.kind === "bolted" && stack?.kind === "bolt";
      const nutDiameter = stack ? stack.clearanceDiameter * 1.7 : 0.38;
      const nutHeight = 0.10;
      const labelText = firstHardware
        ? `${firstHardware.quantity}× ${firstHardware.mcmasterPartNumber} (${iface.kind})`
        : iface.kind;
      bentHoles.forEach((h, idx) => {
        out.push({
          key: `${iface._id}:${idx}`,
          position: [h.worldPoint.x, h.worldPoint.z, h.worldPoint.y],
          groupRotation: [partA.position.rotX, partA.position.rotZ, partA.position.rotY],
          length: lenAcrossParts,
          diameter: Math.max(0.10, h.diameter * 0.9),
          color: tone,
          title: labelText,
          headDiameter,
          headHeight,
          showNut,
          nutDiameter,
          nutHeight,
          stackHeight,
        });
      });
    }
    return out;
  }, [parts, interfaces]);

  return (
    <>
      {bolts.map(b => (
        <group key={b.key} position={b.position} rotation={b.groupRotation}>
          {/* Shaft: long axis along the group's local Z (which is the part
              face-normal post-pose). Z is up in three.js after the
              cylinder pre-rotation by π/2 around X. */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[b.diameter / 2, b.diameter / 2, b.length, 18]} />
            <meshStandardMaterial color={b.color} metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Hex head on the near side (positive Z). For rivets the head is
              flatter and brass-toned (BOLT_TONE.riveted handles color). */}
          <mesh position={[0, 0, b.length / 2 - b.headHeight / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[b.headDiameter / 2, b.headDiameter / 2, b.headHeight, 6]} />
            <meshStandardMaterial color={b.color} metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Hex nut on the far side when this is a bolted joint with a
              FastenerStack that needs one. Positioned just past the
              stack-up so the nut visibly grips the underside. */}
          {b.showNut && (
            <mesh position={[0, 0, -b.stackHeight - b.nutHeight / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[b.nutDiameter / 2, b.nutDiameter / 2, b.nutHeight, 6]} />
              <meshStandardMaterial color="#7d8690" metalness={0.7} roughness={0.35} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

/**
 * Render a purchased McMaster part with category-aware geometry instead of a
 * generic placeholder cube. We look up the part number in the curated seed
 * catalog; failing that, infer category from the label string (handles the
 * common case of hinges and brand-new entries).
 */
function purchasedCategory(part: { purchasedPartNumber?: string | null; label?: string | null }): string {
  const num = (part.purchasedPartNumber ?? "").trim().toUpperCase();
  const seed = MCMASTER_SEED.find((s: any) => s.partNumber.toUpperCase() === num);
  if (seed) return seed.category;
  const lab = (part.label ?? "").toLowerCase();
  if (/hinge|pivot/.test(lab)) return "hinge";
  if (/screw|bolt|cap screw|machine screw/.test(lab)) return "fastener";
  if (/nut/.test(lab)) return "nut";
  if (/washer/.test(lab)) return "washer";
  if (/spring/.test(lab)) return "spring";
  if (/bearing/.test(lab)) return "bearing";
  if (/magnet/.test(lab)) return "magnet";
  return "other";
}

interface PurchasedMeshProps {
  position: Pose;
  selected: boolean;
  showBounds: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  category: string;
}

function PurchasedMesh({ position, selected, showBounds, onClick, category }: PurchasedMeshProps) {
  const baseColor = selected ? "#7dd3fc" : "#cdb380";
  const common = {
    castShadow: true,
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(e); },
    onPointerOver: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => { document.body.style.cursor = ""; },
  } as const;
  const mat = (
    <meshStandardMaterial
      color={baseColor}
      metalness={0.6}
      roughness={0.35}
      emissive={selected ? "#0ea5e9" : "#000000"}
      emissiveIntensity={selected ? 0.25 : 0}
    />
  );
  const wrap = (children: React.ReactNode, sizeForBounds: [number, number, number]) => (
    <group
      position={[position.x, position.z, position.y]}
      rotation={[position.rotX, position.rotZ, position.rotY]}
    >
      {children}
      {(showBounds || selected) && (
        <mesh>
          <boxGeometry args={sizeForBounds} />
          <meshBasicMaterial visible={false} />
          <Edges color={selected ? "#38bdf8" : "#666666"} lineWidth={selected ? 2 : 1} threshold={1} />
        </mesh>
      )}
    </group>
  );
  if (category === "fastener") {
    // 1/4-20 cap screw approximation: shaft Ø0.25" × 0.75" + head Ø0.4" × 0.16".
    return wrap(
      <>
        <mesh {...common} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.125, 0.125, 0.75, 16]} />{mat}
        </mesh>
        <mesh {...common} position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.16, 16]} />{mat}
        </mesh>
      </>,
      [0.4, 0.91, 0.4],
    );
  }
  if (category === "nut") {
    return wrap(
      <mesh {...common} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.18, 6]} />{mat}
      </mesh>,
      [0.44, 0.18, 0.44],
    );
  }
  if (category === "washer") {
    return wrap(
      <mesh {...common} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.05, 12, 32]} />{mat}
      </mesh>,
      [0.54, 0.1, 0.54],
    );
  }
  if (category === "bearing") {
    return wrap(
      <mesh {...common}>
        <torusGeometry args={[0.5, 0.18, 16, 32]} />{mat}
      </mesh>,
      [1.36, 0.36, 1.36],
    );
  }
  if (category === "spring") {
    return wrap(
      <mesh {...common} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 1.2, 8]} />
        <meshStandardMaterial color={baseColor} metalness={0.5} roughness={0.4} wireframe />
      </mesh>,
      [0.36, 1.2, 0.36],
    );
  }
  if (category === "magnet") {
    return wrap(
      <mesh {...common}>
        <boxGeometry args={[0.5, 0.25, 0.5]} />
        <meshStandardMaterial color={selected ? "#7dd3fc" : "#7c7d80"} metalness={0.4} roughness={0.5} />
      </mesh>,
      [0.5, 0.25, 0.5],
    );
  }
  if (category === "hinge") {
    // Two leaf plates joined by a barrel along the hinge axis.
    return wrap(
      <>
        <mesh {...common} position={[-0.6, 0, 0]}>
          <boxGeometry args={[1.2, 0.06, 1.6]} />{mat}
        </mesh>
        <mesh {...common} position={[0.6, 0, 0]}>
          <boxGeometry args={[1.2, 0.06, 1.6]} />{mat}
        </mesh>
        <mesh {...common} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 1.6, 16]} />{mat}
        </mesh>
      </>,
      [2.4, 0.16, 1.6],
    );
  }
  // default — small cube
  return wrap(
    <mesh {...common}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />{mat}
    </mesh>,
    [0.5, 0.5, 0.5],
  );
}

function printedBoundingBox(p: { dslJson?: string | null }): { w: number; d: number; h: number } {
  if (!p.dslJson) return { w: 25, d: 25, h: 5 };
  try {
    const dsl = JSON.parse(p.dslJson);
    const prim = dsl.primitive;
    if (prim?.kind === "box") return { w: prim.width, d: prim.depth, h: prim.height };
    if (prim?.kind === "cylinder") return { w: prim.radius * 2, d: prim.radius * 2, h: prim.height };
    if (prim?.kind === "plate_with_holes") return { w: prim.width, d: prim.depth, h: prim.thickness };
  } catch {
    // fall through
  }
  return { w: 25, d: 25, h: 5 };
}

interface AssembledViewProps {
  projectId: Id<"projects">;
  focusedPartId?: Id<"parts"> | null;
  onFocusPart?: (id: Id<"parts"> | null) => void;
  hiddenPartIds?: Set<string>;
}

type TextureKey =
  | "brushed-aluminum"
  | "stainless"
  | "mild-steel"
  | "galvanized"
  | "copper"
  | "brass"
  | "acrylic-clear"
  | "acrylic-black"
  | null;

function sheetMetalAppearance(material: string | undefined): {
  color: string; metalness: number; roughness: number; opacity: number; transparent: boolean; texture: TextureKey;
} {
  const m = (material ?? "").toLowerCase();
  if (m.includes("acrylic") && m.includes("clear")) {
    return { color: "#9ad0e8", metalness: 0, roughness: 0.05, opacity: 0.28, transparent: true, texture: null };
  }
  if (m.includes("acrylic") && m.includes("black")) {
    return { color: "#1a1a1d", metalness: 0, roughness: 0.15, opacity: 0.92, transparent: false, texture: null };
  }
  if (m.includes("aluminum")) {
    return { color: "#cfd2d7", metalness: 0.55, roughness: 0.45, opacity: 1, transparent: false, texture: "brushed-aluminum" };
  }
  if (m.includes("stainless")) {
    return { color: "#d8dadd", metalness: 0.65, roughness: 0.35, opacity: 1, transparent: false, texture: "stainless" };
  }
  if (m.includes("copper")) {
    return { color: "#c08552", metalness: 0.7, roughness: 0.4, opacity: 1, transparent: false, texture: "copper" };
  }
  if (m.includes("brass")) {
    return { color: "#caa75a", metalness: 0.7, roughness: 0.4, opacity: 1, transparent: false, texture: "brass" };
  }
  if (m.includes("galvanized")) {
    return { color: "#bcc3cb", metalness: 0.5, roughness: 0.55, opacity: 1, transparent: false, texture: "galvanized" };
  }
  return { color: "#d0d4da", metalness: 0.4, roughness: 0.6, opacity: 1, transparent: false, texture: "mild-steel" };
}

/**
 * Procedural normal + roughness maps per material. Built once on first use,
 * cached in a module-level Map, and reused as `<meshStandardMaterial normalMap roughnessMap>`.
 * Subtle deviations only — the goal is to differentiate brushed aluminum from
 * mild steel under directional lighting, not to draw attention to the texture.
 */
const TEXTURE_CACHE = new Map<TextureKey, { normal: THREE.Texture; roughness: THREE.Texture }>();

function getMaterialMaps(key: TextureKey): { normal: THREE.Texture; roughness: THREE.Texture } | null {
  if (key === null) return null;
  const cached = TEXTURE_CACHE.get(key);
  if (cached) return cached;

  const SIZE = 256;
  // Pseudo-random with a fixed seed per key so textures look stable.
  let seed = key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  function build(generator: (x: number, y: number) => { dx: number; dy: number; rough: number }): { normal: THREE.Texture; roughness: THREE.Texture } {
    const normalData = new Uint8Array(SIZE * SIZE * 4);
    const roughData = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const { dx, dy, rough } = generator(x, y);
        // Normal vector (dx, dy, 1) normalised → encoded RGB.
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const nx = dx / len, ny = dy / len, nz = 1 / len;
        const i = (y * SIZE + x) * 4;
        normalData[i] = Math.round((nx * 0.5 + 0.5) * 255);
        normalData[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        normalData[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        normalData[i + 3] = 255;
        const rg = Math.max(0, Math.min(255, Math.round(rough * 255)));
        roughData[i] = rg; roughData[i + 1] = rg; roughData[i + 2] = rg; roughData[i + 3] = 255;
      }
    }
    const normal = new THREE.DataTexture(normalData, SIZE, SIZE, THREE.RGBAFormat);
    normal.wrapS = THREE.RepeatWrapping;
    normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(8, 8);
    normal.needsUpdate = true;
    const roughness = new THREE.DataTexture(roughData, SIZE, SIZE, THREE.RGBAFormat);
    roughness.wrapS = THREE.RepeatWrapping;
    roughness.wrapT = THREE.RepeatWrapping;
    roughness.repeat.set(8, 8);
    roughness.needsUpdate = true;
    return { normal, roughness };
  }

  let result: { normal: THREE.Texture; roughness: THREE.Texture };
  if (key === "brushed-aluminum") {
    // Long horizontal striations.
    result = build((x, _y) => {
      const r = rand();
      const dx = (r - 0.5) * 0.6;
      return { dx, dy: 0, rough: 0.45 + (Math.sin(x * 0.5) + r) * 0.04 };
    });
  } else if (key === "stainless") {
    // Very fine isotropic grain.
    result = build(() => {
      const r = rand(), g = rand();
      return { dx: (r - 0.5) * 0.15, dy: (g - 0.5) * 0.15, rough: 0.32 + r * 0.06 };
    });
  } else if (key === "mild-steel") {
    // Coarser random grain.
    result = build(() => {
      const r = rand(), g = rand();
      return { dx: (r - 0.5) * 0.4, dy: (g - 0.5) * 0.4, rough: 0.55 + r * 0.1 };
    });
  } else if (key === "galvanized") {
    // Spotty zinc grain — patches with slightly varied roughness.
    result = build((x, y) => {
      const r = rand();
      const blob = Math.sin(x * 0.3 + r * 6) * Math.cos(y * 0.3 + r * 6);
      return { dx: blob * 0.3, dy: blob * 0.3, rough: 0.5 + Math.abs(blob) * 0.15 };
    });
  } else if (key === "copper" || key === "brass") {
    // Soft horizontal grain; slightly less pronounced for brass.
    const amp = key === "copper" ? 0.35 : 0.25;
    result = build(() => {
      const r = rand();
      return { dx: (r - 0.5) * amp, dy: 0, rough: 0.38 + r * 0.06 };
    });
  } else {
    result = build(() => ({ dx: 0, dy: 0, rough: 0.6 }));
  }

  TEXTURE_CACHE.set(key, result);
  return result;
}

export default function AssembledView({ projectId, focusedPartId = null, onFocusPart, hiddenPartIds }: AssembledViewProps) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const interfaces = useQuery(api.interfaces.listForProject, projectId ? { projectId } : "skip");
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const controlsRef = useRef<any>(null);
  const [homeSignal, setHomeSignal] = useState(0);
  const [showBounds, setShowBounds] = useState(false);
  const [showBolts, setShowBolts] = useState(true);
  const [hingeOpenDeg, setHingeOpenDeg] = useState(0);

  // Phase 19 gap-closure: useCadIr toggle + CAD IR glb preview.
  const setUseCadIr = useMutation(api.projects.setUseCadIr);
  // Only fetch revision artifacts when a part is focused AND uses the CAD IR
  // pipeline — avoid burning a query on every part-click.
  const focusedPartUseCadIr = focusedPartId
    ? (parts?.find((p: { _id: Id<"parts"> }) => p._id === focusedPartId) as { useCadIr?: boolean } | undefined)?.useCadIr === true
    : false;
  const cadArtifacts = useQuery(
    api.cad.queries.headRevisionArtifacts,
    focusedPartId && focusedPartUseCadIr ? { partId: focusedPartId } : "skip",
  );

  // Compute the hinge pivot + axis from archetype params, when present. Used
  // to wrap the lid / door part in a group whose rotation animates the open
  // angle around the actual hinge edge — not the part center.
  const hingeRig: null | {
    role: string;
    pivotThree: [number, number, number]; // three.js coords
    axisThree: [number, number, number];  // unit, three.js coords
    sign: 1 | -1;                          // direction the door swings open
  } = useMemo(() => {
    if (!project || project.archetypeId !== "hinged_enclosure") return null;
    const p: any = project.archetypeParams;
    if (!p) return null;
    const t = p.thickness ?? 0.075;
    const innerW = p.innerWidth, innerD = p.innerDepth, innerH = p.innerHeight;
    if (typeof innerW !== "number" || typeof innerD !== "number" || typeof innerH !== "number") return null;
    if (p.doorFace === "front") {
      // Door swings around a vertical axis at one of the front-vertical edges.
      // Three.js: vertical = +Y. Pivot in three.js coords = (data.x, data.z, data.y)
      // for the vertical line at the hinge edge of the front face (y_data = -t/2).
      if (p.hingeSide === "left") {
        return {
          role: "door_front",
          pivotThree: [-t / 2, innerH / 2, -t / 2],
          axisThree: [0, 1, 0],
          sign: 1,
        };
      }
      // default right
      return {
        role: "door_front",
        pivotThree: [innerW + t / 2, innerH / 2, -t / 2],
        axisThree: [0, 1, 0],
        sign: -1,
      };
    }
    // doorFace === "top". Lid pivots around a horizontal axis at the top edge
    // of the named hinge wall. Three.js Y = vertical, lid at three.js Y =
    // innerH + t/2. Hinge edge for hingeSide=back is the back-top edge.
    if (p.hingeSide === "back") {
      return { role: "lid", pivotThree: [innerW / 2, innerH + t / 2, innerD + t / 2], axisThree: [1, 0, 0], sign: -1 };
    }
    if (p.hingeSide === "front") {
      return { role: "lid", pivotThree: [innerW / 2, innerH + t / 2, -t / 2], axisThree: [1, 0, 0], sign: 1 };
    }
    if (p.hingeSide === "left") {
      return { role: "lid", pivotThree: [-t / 2, innerH + t / 2, innerD / 2], axisThree: [0, 0, 1], sign: 1 };
    }
    if (p.hingeSide === "right") {
      return { role: "lid", pivotThree: [innerW + t / 2, innerH + t / 2, innerD / 2], axisThree: [0, 0, 1], sign: -1 };
    }
    return null;
  }, [project]);
  const hingedRoleId = hingeRig?.role ?? null;

  const partBounds = useMemo(() => {
    if (!parts) return [];
    return parts.map(p => {
      const kind = p.kind ?? "sheet_metal";
      if (kind === "printed") {
        const bb = printedBoundingBox(p);
        return { position: p.position, w: bb.w / 25.4, h: bb.h / 25.4, t: bb.d / 25.4 };
      }
      if (kind === "purchased") {
        return { position: p.position, w: 0.5, h: 0.5, t: 0.5 };
      }
      return { position: p.position, w: p.width ?? 1, h: p.height ?? 1, t: p.thickness ?? 0.075 };
    });
  }, [parts]);

  const bbox = useMemo(() => {
    if (!partBounds.length) return { cx: 0, cy: 0, floorZ: 0 };
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity;
    for (const p of partBounds) {
      const rxy = Math.max(p.w, p.h, p.t) / 2;
      minX = Math.min(minX, p.position.x - rxy);
      maxX = Math.max(maxX, p.position.x + rxy);
      minY = Math.min(minY, p.position.y - rxy);
      maxY = Math.max(maxY, p.position.y + rxy);
      minZ = Math.min(minZ, p.position.z - p.t / 2);
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, floorZ: minZ };
  }, [partBounds]);

  const handlePartClick = (id: Id<"parts">) => {
    if (!onFocusPart) return;
    onFocusPart(id === focusedPartId ? null : id);
  };

  const focusedPart = parts?.find(p => p._id === focusedPartId);

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHomeSignal(s => s + 1)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card/80 backdrop-blur border border-border hover:border-primary/60 hover:bg-card transition-colors shadow-lg shadow-black/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          title="Frame all parts"
        >
          <Home className="w-3.5 h-3.5" />
          Home
        </button>
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card/80 backdrop-blur border border-border shadow-lg shadow-black/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBounds}
            onChange={(e) => setShowBounds(e.target.checked)}
            className="accent-primary w-3 h-3"
          />
          <Square className="w-3.5 h-3.5" />
          Bounds
        </label>
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card/80 backdrop-blur border border-border shadow-lg shadow-black/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBolts}
            onChange={(e) => setShowBolts(e.target.checked)}
            className="accent-primary w-3 h-3"
          />
          Bolts
        </label>
        {hingeRig && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card/80 backdrop-blur border border-border shadow-lg shadow-black/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Open</span>
            <input
              type="range"
              min={0}
              max={150}
              step={1}
              value={hingeOpenDeg}
              onChange={(e) => setHingeOpenDeg(parseInt(e.target.value, 10))}
              className="w-28 accent-primary"
            />
            <span className="tabular-nums w-7 text-right text-foreground">{hingeOpenDeg}°</span>
          </div>
        )}
      </div>
      {focusedPart && (
        <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-md bg-primary/15 backdrop-blur border border-primary/40 shadow-lg shadow-black/40 font-mono text-[11px] flex items-center gap-2">
          <span className="text-primary font-bold">{focusedPart.label}</span>
          <span className="text-primary/60">·</span>
          <span className="text-muted-foreground">{focusedPart.role}</span>
          {/*
            Phase 19 gap-closure: discreet developer-flag toggle for the CAD IR
            pipeline. Per-part. Opt-in. The legacy Slice-1 preview path stays
            live regardless of this flag — when enabled, the CadPreview overlay
            appears below this chip rendering the persisted glb.
          */}
          <span className="text-primary/40 mx-1">·</span>
          <label
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer select-none"
            title="Use CAD IR pipeline for this part (developer flag)"
          >
            <input
              type="checkbox"
              checked={focusedPartUseCadIr}
              onChange={(e) => {
                if (focusedPart?._id) {
                  setUseCadIr({ partId: focusedPart._id, enabled: e.target.checked });
                }
              }}
              className="accent-primary w-3 h-3"
            />
            Cad IR
          </label>
          <button
            type="button"
            onClick={() => onFocusPart?.(null)}
            className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}
      {/*
        Phase 19 gap-closure: glTF preview overlay. Renders the build123d GLB
        produced by the CAD IR sandbox executor and persisted on the head
        revision. Anchored bottom-left when a focused part has useCadIr=true
        and a head-revision GLB is available.
      */}
      {focusedPart && focusedPartUseCadIr && cadArtifacts?.glbUrl && (
        <div className="absolute bottom-3 left-3 z-10 w-[420px] max-w-[40%] rounded-md bg-card/80 backdrop-blur border border-border shadow-lg shadow-black/40 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>CAD IR preview · {cadArtifacts.revisionHash.slice(0, 8)}</span>
          </div>
          <div className="bg-[#0a0f18]">
            <CadPreview glbUrl={cadArtifacts.glbUrl} />
          </div>
        </div>
      )}
      {/*
        ME-04: graceful degradation when the toggle is on but no GLB exists
        (e.g. legacy part with no CAD IR head revision yet, a head revision
        predating the gap-closure commits, or a revision whose sandbox
        failed). The toggle was previously silent on this path — the user
        flipped the switch and saw nothing change.
      */}
      {focusedPart && focusedPartUseCadIr && !cadArtifacts?.glbUrl && (
        <div className="absolute bottom-3 left-3 z-10 w-[420px] max-w-[40%] rounded-md bg-card/80 backdrop-blur border border-border shadow-lg shadow-black/40 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>CAD IR preview</span>
          </div>
          <div className="bg-[#0a0f18] px-3 py-4 text-[11px] text-muted-foreground leading-snug">
            CAD IR preview not available — re-run the part to produce one.
          </div>
        </div>
      )}
      <Canvas
        camera={{ position: [20, 20, 20], fov: 35 }}
        shadows
        onPointerMissed={() => onFocusPart?.(null)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />
        {/* Place the grid just below the lowest part so the floor never
            cuts through a part. Data-frame Z maps to three.js Y; we use
            bbox.floorZ (lowest data-z) and subtract a small margin. */}
        <group position={[0, bbox.floorZ - 0.05, 0]}>
          <Grid args={[40, 40]} cellColor="#333" sectionColor="#555" fadeDistance={60} infiniteGrid />
        </group>
        <OrbitControls ref={controlsRef as any} makeDefault />
        <SceneController parts={partBounds} controlsRef={controlsRef} homeSignal={homeSignal} />
        {showBolts && parts && interfaces && (
          <BoltMeshes
            parts={parts.filter(p => !hiddenPartIds?.has(p._id as unknown as string))}
            interfaces={interfaces}
          />
        )}
        {parts?.map(p => {
          const kind = p.kind ?? "sheet_metal";
          const selected = p._id === focusedPartId;
          if (hiddenPartIds?.has(p._id as unknown as string)) return null;
          const isHinged = hingeRig && p.role === hingeRig.role;
          const wrapWithHinge = (mesh: React.ReactNode) => {
            if (!isHinged || hingeOpenDeg === 0 || !hingeRig) return mesh;
            const angleRad = (hingeOpenDeg * Math.PI) / 180 * hingeRig.sign;
            // Pivot the part around the hinge edge by composing two groups:
            // outer translates to pivot, applies rotation around axis,
            // inner translates back so the part's world position is preserved
            // when angle == 0.
            const [ax, ay, az] = hingeRig.axisThree;
            // Build Euler from axis + angle. Three.js group accepts rotation
            // as Euler XYZ — for our axes (unit X, Y, or Z) we can map directly.
            const eul: [number, number, number] = ax !== 0
              ? [angleRad * ax, 0, 0]
              : ay !== 0
                ? [0, angleRad * ay, 0]
                : [0, 0, angleRad * az];
            return (
              <group position={hingeRig.pivotThree} rotation={eul}>
                <group position={[-hingeRig.pivotThree[0], -hingeRig.pivotThree[1], -hingeRig.pivotThree[2]]}>
                  {mesh}
                </group>
              </group>
            );
          };
          if (kind === "printed") {
            const bb = printedBoundingBox(p);
            return wrapWithHinge(
              <PartMesh
                key={p._id}
                size={[bb.w / 25.4, bb.h / 25.4, bb.d / 25.4]}
                position={p.position}
                selected={selected}
                showBounds={showBounds}
                onClick={() => handlePartClick(p._id)}
                color="#a374ff"
                metalness={0}
                roughness={0.8}
              />
            );
          }
          if (kind === "purchased") {
            return wrapWithHinge(
              <PurchasedMesh
                key={p._id}
                position={p.position}
                selected={selected}
                showBounds={showBounds}
                onClick={() => handlePartClick(p._id)}
                category={purchasedCategory(p)}
              />
            );
          }
          if (kind === "pipe") {
            return wrapWithHinge(
              <PipeMesh
                key={p._id}
                position={p.position}
                outerDiameter={p.pipeOuterDiameter ?? 1}
                wallThickness={p.pipeWallThickness ?? 0.065}
                length={p.pipeLength ?? 6}
                material={p.material ?? "Mild Steel (CRS)"}
                selected={selected}
                showBounds={showBounds}
                onClick={() => handlePartClick(p._id)}
              />
            );
          }
          const appearance = sheetMetalAppearance(p.material);
          let pattern: FlatPatternRecord | null = null;
          let isFreeformOutline = false;
          if (p.dslJson) {
            try {
              const parsedDsl = PartDslSchema.parse(JSON.parse(p.dslJson));
              pattern = flatPattern(parsedDsl);
              const outlineKind = parsedDsl.outline?.kind ?? "rectangle";
              isFreeformOutline = outlineKind !== "rectangle";
            } catch { /* ignore */ }
          }
          const bends = pattern?.bendTangents.map(b => ({ axis: b.axis, positionRatio: b.positionRatio }));
          const holes: HoleMark[] | undefined = pattern?.holes.map(h => ({
            center: { x: h.center.x, y: h.center.y },
            diameter: h.diameter,
          }));
          if (pattern && isFreeformOutline) {
            return wrapWithHinge(
              <ExtrudedPartMesh
                key={p._id}
                pattern={pattern}
                thickness={p.thickness ?? 0.075}
                position={p.position}
                selected={selected}
                showBounds={showBounds}
                onClick={() => handlePartClick(p._id)}
                color={appearance.color}
                metalness={appearance.metalness}
                roughness={appearance.roughness}
                opacity={appearance.opacity}
                bends={bends}
                holes={holes}
                textureKey={appearance.texture}
              />
            );
          }
          return wrapWithHinge(
            <PartMesh
              key={p._id}
              size={[p.width ?? 1, p.thickness ?? 0.075, p.height ?? 1]}
              position={p.position}
              selected={selected}
              showBounds={showBounds}
              onClick={() => handlePartClick(p._id)}
              color={appearance.color}
              metalness={appearance.metalness}
              roughness={appearance.roughness}
              opacity={appearance.opacity}
              bends={bends}
              holes={holes}
              textureKey={appearance.texture}
            />
          );
        })}
        <ReferenceAnchors
          scope={project?.scope ?? null}
          centerX={bbox.cx}
          centerY={bbox.cy}
          floorZ={bbox.floorZ}
        />
      </Canvas>
    </div>
  );
}
