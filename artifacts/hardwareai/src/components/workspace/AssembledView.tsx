import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";
import { useQuery } from "convex/react";
import * as THREE from "three";
import { Home, Square } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { holeWorldPositions } from "../../../convex/lib/featuresInWorld";
import { PartDslSchema } from "../../../convex/lib/dsl";

type Pose = { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number };

type Outline =
  | { kind: "rectangle" }
  | { kind: "polygon"; points: Array<{ x: number; y: number }> }
  | { kind: "star"; numPoints: number; outerRadius: number; innerRadius: number }
  | { kind: "circle"; radius: number }
  | { kind: "regular_polygon"; sides: number; radius: number };

function buildShape(outline: Outline, fallbackW: number, fallbackH: number): THREE.Shape {
  const shape = new THREE.Shape();
  if (outline.kind === "rectangle") {
    const w = fallbackW, h = fallbackH;
    shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2); shape.lineTo(-w / 2, h / 2);
    shape.closePath();
    return shape;
  }
  if (outline.kind === "polygon") {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of outline.points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    outline.points.forEach((p, i) => {
      const x = p.x - cx, y = p.y - cy;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    shape.closePath();
    return shape;
  }
  if (outline.kind === "circle") {
    const r = outline.radius;
    shape.absarc(0, 0, r, 0, Math.PI * 2, false);
    return shape;
  }
  if (outline.kind === "regular_polygon") {
    const { sides, radius } = outline;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }
  // star
  const { numPoints, outerRadius, innerRadius } = outline;
  for (let i = 0; i < numPoints * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i / (numPoints * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

interface ExtrudedPartMeshProps {
  outline: Outline;
  width: number;
  height: number;
  thickness: number;
  position: Pose;
  selected: boolean;
  showBounds: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  color: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
}

function ExtrudedPartMesh({
  outline, width, height, thickness, position, selected, showBounds, onClick,
  color, metalness = 0.4, roughness = 0.6, opacity = 1,
}: ExtrudedPartMeshProps) {
  const geometry = useMemo(() => {
    const shape = buildShape(outline, width, height);
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
  }, [outline, width, height, thickness]);

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
      />
      {(showBounds || selected) && (
        <Edges color={selected ? "#38bdf8" : "#666666"} lineWidth={selected ? 2.5 : 1} threshold={1} />
      )}
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
}: MeshProps) {
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
      />
      {(showBounds || selected) && (
        <Edges
          color={selected ? "#38bdf8" : "#666666"}
          lineWidth={selected ? 2.5 : 1}
          threshold={1}
        />
      )}
    </mesh>
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
      const holes = holeWorldPositions(dslA, partA.position).filter(h => h.featureName === refA.featureName);
      const partB = partsById.get(iface.partB);
      const lenAcrossParts = (partA.thickness ?? 0.075) + (partB?.thickness ?? 0.075) + 0.25;
      const firstHardware = (iface.hardwareRefs ?? [])[0];
      const labelText = firstHardware
        ? `${firstHardware.quantity}× ${firstHardware.mcmasterPartNumber} (${iface.kind})`
        : iface.kind;
      holes.forEach((h, idx) => {
        out.push({
          key: `${iface._id}:${idx}`,
          // data → three.js frame swap
          position: [h.worldPoint.x, h.worldPoint.z, h.worldPoint.y],
          // Group rotation = part's pose rotation in renderer frame.
          // The cylinder inside the group is pre-rotated π/2 around X so its
          // long axis (default three.js Y) points along the group's local Z,
          // which after the part's rotation = perpendicular to the part face.
          groupRotation: [partA.position.rotX, partA.position.rotZ, partA.position.rotY],
          length: lenAcrossParts,
          diameter: Math.max(0.12, h.diameter * 0.9),
          color: tone,
          title: labelText,
        });
      });
    }
    return out;
  }, [parts, interfaces]);

  return (
    <>
      {bolts.map(b => (
        <group key={b.key} position={b.position} rotation={b.groupRotation}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[b.diameter / 2, b.diameter / 2, b.length, 14]} />
            <meshStandardMaterial color={b.color} metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Bolt head — slightly wider, capped at top of cylinder */}
          <mesh position={[0, 0, b.length / 2 - 0.015]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[b.diameter * 0.85, b.diameter * 0.85, 0.05, 14]} />
            <meshStandardMaterial color={b.color} metalness={0.75} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </>
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

function sheetMetalAppearance(material: string | undefined): { color: string; metalness: number; roughness: number; opacity: number; transparent: boolean } {
  const m = (material ?? "").toLowerCase();
  if (m.includes("acrylic") && m.includes("clear")) {
    return { color: "#9ad0e8", metalness: 0, roughness: 0.05, opacity: 0.28, transparent: true };
  }
  if (m.includes("acrylic") && m.includes("black")) {
    return { color: "#1a1a1d", metalness: 0, roughness: 0.15, opacity: 0.92, transparent: false };
  }
  if (m.includes("aluminum")) {
    return { color: "#cfd2d7", metalness: 0.55, roughness: 0.45, opacity: 1, transparent: false };
  }
  if (m.includes("stainless")) {
    return { color: "#d8dadd", metalness: 0.65, roughness: 0.35, opacity: 1, transparent: false };
  }
  if (m.includes("copper")) {
    return { color: "#c08552", metalness: 0.7, roughness: 0.4, opacity: 1, transparent: false };
  }
  if (m.includes("brass")) {
    return { color: "#caa75a", metalness: 0.7, roughness: 0.4, opacity: 1, transparent: false };
  }
  if (m.includes("galvanized")) {
    return { color: "#bcc3cb", metalness: 0.5, roughness: 0.55, opacity: 1, transparent: false };
  }
  return { color: "#d0d4da", metalness: 0.4, roughness: 0.6, opacity: 1, transparent: false };
}

export default function AssembledView({ projectId, focusedPartId = null, onFocusPart, hiddenPartIds }: AssembledViewProps) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const interfaces = useQuery(api.interfaces.listForProject, projectId ? { projectId } : "skip");
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const controlsRef = useRef<any>(null);
  const [homeSignal, setHomeSignal] = useState(0);
  const [showBounds, setShowBounds] = useState(false);
  const [showBolts, setShowBolts] = useState(true);

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
      </div>
      {focusedPart && (
        <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-md bg-primary/15 backdrop-blur border border-primary/40 shadow-lg shadow-black/40 font-mono text-[11px] flex items-center gap-2">
          <span className="text-primary font-bold">{focusedPart.label}</span>
          <span className="text-primary/60">·</span>
          <span className="text-muted-foreground">{focusedPart.role}</span>
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
      <Canvas
        camera={{ position: [20, 20, 20], fov: 35 }}
        shadows
        onPointerMissed={() => onFocusPart?.(null)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />
        <Grid args={[40, 40]} cellColor="#333" sectionColor="#555" fadeDistance={60} infiniteGrid />
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
          if (kind === "printed") {
            const bb = printedBoundingBox(p);
            return (
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
            return (
              <PartMesh
                key={p._id}
                size={[0.5, 0.5, 0.5]}
                position={p.position}
                selected={selected}
                showBounds={showBounds}
                onClick={() => handlePartClick(p._id)}
                color="#f5b647"
                wireframe
              />
            );
          }
          const appearance = sheetMetalAppearance(p.material);
          let outline: Outline | undefined;
          if (p.dslJson) {
            try {
              const parsedDsl = JSON.parse(p.dslJson);
              if (parsedDsl?.outline?.kind && parsedDsl.outline.kind !== "rectangle") {
                outline = parsedDsl.outline as Outline;
              }
            } catch { /* ignore */ }
          }
          if (outline) {
            return (
              <ExtrudedPartMesh
                key={p._id}
                outline={outline}
                width={p.width ?? 1}
                height={p.height ?? 1}
                thickness={p.thickness ?? 0.075}
                position={p.position}
                selected={selected}
                showBounds={showBounds}
                onClick={() => handlePartClick(p._id)}
                color={appearance.color}
                metalness={appearance.metalness}
                roughness={appearance.roughness}
                opacity={appearance.opacity}
              />
            );
          }
          return (
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
