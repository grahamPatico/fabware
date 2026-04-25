import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function Part({ w, h, t, position }: { w: number; h: number; t: number; position: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number } }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <boxGeometry args={[w, t, h]} />
      <meshStandardMaterial color="#d0d4da" metalness={0.4} roughness={0.6} />
    </mesh>
  );
}

export default function AssembledView({ projectId }: { projectId: Id<"projects"> }) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  return (
    <Canvas camera={{ position: [20, 20, 20], fov: 35 }} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />
      <Grid args={[40, 40]} cellColor="#333" sectionColor="#555" fadeDistance={30} infiniteGrid />
      <OrbitControls />
      {parts?.map(p => (
        <Part
          key={p._id}
          w={p.width ?? 1}
          h={p.height ?? 1}
          t={p.thickness ?? 0.075}
          position={p.position}
        />
      ))}
    </Canvas>
  );
}
