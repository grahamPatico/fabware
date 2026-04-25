import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useQuery } from "convex/react";
import * as THREE from "three";
import { Home } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Pose = { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number };

function SheetMetalPart({ w, h, t, position }: { w: number; h: number; t: number; position: Pose }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]} castShadow receiveShadow>
      <boxGeometry args={[w, t, h]} />
      <meshStandardMaterial color="#d0d4da" metalness={0.4} roughness={0.6} />
    </mesh>
  );
}

function PrintedPart({ w, d, h, position }: { w: number; d: number; h: number; position: Pose }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]} castShadow receiveShadow>
      <boxGeometry args={[w / 25.4, h / 25.4, d / 25.4]} />
      <meshStandardMaterial color="#a374ff" metalness={0.0} roughness={0.8} />
    </mesh>
  );
}

function PurchasedPart({ position }: { position: Pose; label: string }) {
  return (
    <group position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#f5b647" wireframe />
      </mesh>
    </group>
  );
}

// Reference-scale anchors — translucent stand-ins so users see what fits inside.
// Inches throughout (assembly frame is inches).
const REFERENCE_KINDS: Record<string, { diameter: number; color: string }> = {
  "tennis ball":    { diameter: 2.575, color: "#d4ff00" },     // ITF regulation ~65mm
  "tennis":         { diameter: 2.575, color: "#d4ff00" },
  "baseball":       { diameter: 2.9,   color: "#f5e3c2" },
  "softball":       { diameter: 3.8,   color: "#fff5b8" },
  "basketball":     { diameter: 9.5,   color: "#cc6633" },
  "soccer ball":    { diameter: 8.7,   color: "#ffffff" },
  "golf ball":      { diameter: 1.68,  color: "#ffffff" },
  "raspberry pi":   { diameter: 3.5,   color: "#5cba6f" },     // RPi 4 board diagonal-ish
  "raspberry pi zero": { diameter: 2.6, color: "#5cba6f" },
};

function findReferenceKind(kind: string): { diameter: number; color: string } | null {
  const k = kind.toLowerCase().trim();
  for (const [pattern, val] of Object.entries(REFERENCE_KINDS)) {
    if (k.includes(pattern)) return val;
  }
  return null;
}

function ReferenceAnchors({
  scope,
  centerX,
  centerY,
  centerZ,
}: {
  scope: { referenceScale?: { kind: string; quantity?: number; dimensions?: { w: number; d: number; h: number } } | null } | null;
  centerX: number;
  centerY: number;
  centerZ: number;
}) {
  if (!scope?.referenceScale) return null;
  const ref = findReferenceKind(scope.referenceScale.kind);
  if (!ref) return null;
  const qty = Math.max(1, Math.min(scope.referenceScale.quantity ?? 1, 12));
  const r = ref.diameter / 2;
  // Lay out in a row along X, centered on the assembly's interior centroid
  const spacing = ref.diameter * 1.05;
  const totalWidth = (qty - 1) * spacing;
  const startX = centerX - totalWidth / 2;
  return (
    <>
      {Array.from({ length: qty }).map((_, i) => (
        <mesh
          key={i}
          position={[startX + i * spacing, centerZ + r, centerY]}
          castShadow
        >
          <sphereGeometry args={[r, 24, 16]} />
          <meshStandardMaterial color={ref.color} transparent opacity={0.55} roughness={0.45} />
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
  // Compute world AABB. Y/Z are swapped between assembly frame and Three.js (Z-up vs Y-up).
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    const tx = p.position.x;
    const ty = p.position.z;       // assembly Z → three Y
    const tz = p.position.y;       // assembly Y → three Z
    // Approximate AABB by half-extents (ignoring rotation; gives a slightly loose fit)
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
  // Place camera on a 1,1,1 isometric line, scaled to fit
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
  // Re-frame whenever the part set changes meaningfully (count or any position) or homeSignal increments.
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

export default function AssembledView({ projectId }: { projectId: Id<"projects"> }) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const controlsRef = useRef<any>(null);
  const [homeSignal, setHomeSignal] = useState(0);
  // Build a uniform list with bounding-box-ish dims so the framer can compute bounds
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

  // Compute centroid for placing reference anchors
  const centroid = useMemo(() => {
    if (!partBounds.length) return { x: 0, y: 0, z: 0 };
    const sx = partBounds.reduce((a, p) => a + p.position.x, 0) / partBounds.length;
    const sy = partBounds.reduce((a, p) => a + p.position.y, 0) / partBounds.length;
    const sz = partBounds.reduce((a, p) => a + p.position.z, 0) / partBounds.length;
    return { x: sx, y: sy, z: sz };
  }, [partBounds]);

  return (
    <div className="relative w-full h-full">
      <button
        type="button"
        onClick={() => setHomeSignal(s => s + 1)}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card/80 backdrop-blur border border-border hover:border-primary/60 hover:bg-card transition-colors shadow-lg shadow-black/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        title="Frame all parts"
      >
        <Home className="w-3.5 h-3.5" />
        Home
      </button>
      <Canvas camera={{ position: [20, 20, 20], fov: 35 }} shadows>
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />
        <Grid args={[40, 40]} cellColor="#333" sectionColor="#555" fadeDistance={60} infiniteGrid />
        <OrbitControls ref={controlsRef as any} makeDefault />
        <SceneController parts={partBounds} controlsRef={controlsRef} homeSignal={homeSignal} />
        {parts?.map(p => {
          const kind = p.kind ?? "sheet_metal";
          if (kind === "printed") {
            const bb = printedBoundingBox(p);
            return <PrintedPart key={p._id} w={bb.w} d={bb.d} h={bb.h} position={p.position} />;
          }
          if (kind === "purchased") {
            return <PurchasedPart key={p._id} position={p.position} label={p.label} />;
          }
          return (
            <SheetMetalPart
              key={p._id}
              w={p.width ?? 1}
              h={p.height ?? 1}
              t={p.thickness ?? 0.075}
              position={p.position}
            />
          );
        })}
        <ReferenceAnchors
          scope={project?.scope ?? null}
          centerX={centroid.x}
          centerY={centroid.y}
          centerZ={centroid.z}
        />
      </Canvas>
    </div>
  );
}

