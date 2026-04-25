import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function SheetMetalPart({ w, h, t, position }: { w: number; h: number; t: number; position: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number } }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <boxGeometry args={[w, t, h]} />
      <meshStandardMaterial color="#d0d4da" metalness={0.4} roughness={0.6} />
    </mesh>
  );
}

function PrintedPart({ w, d, h, position }: { w: number; d: number; h: number; position: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number } }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <boxGeometry args={[w / 25.4, h / 25.4, d / 25.4]} />
      <meshStandardMaterial color="#a374ff" metalness={0.0} roughness={0.8} />
    </mesh>
  );
}

function PurchasedPart({ position }: { position: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number }; label: string }) {
  return (
    <group position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#f5b647" wireframe />
      </mesh>
    </group>
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

export default function AssembledView({ projectId }: { projectId: Id<"projects"> }) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  return (
    <Canvas camera={{ position: [20, 20, 20], fov: 35 }} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />
      <Grid args={[40, 40]} cellColor="#333" sectionColor="#555" fadeDistance={30} infiniteGrid />
      <OrbitControls />
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
    </Canvas>
  );
}
