// Small orbitable viewer for one GLB. Loaded lazily so three.js stays out of
// the plan page until someone opens a 3D box.

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Spinner } from "@/components/ui/spinner";
import { glbSceneScale } from "@/lib/glbUnits";

interface LoadedModel {
  meshes: Array<{ key: string; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>;
  /** Uniform factor taking the file's own units to inches. */
  scale: number;
  /** Post-scale translation putting the bbox center on the origin. */
  offset: [number, number, number];
  /** Longest side in inches, used to place the camera. */
  longest: number;
}

function loadGlb(url: string): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(maxDim) || maxDim <= 0) {
          reject(new Error("empty model"));
          return;
        }
        const scale = glbSceneScale(maxDim);
        const meshes: LoadedModel["meshes"] = [];
        scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) meshes.push({ key: mesh.uuid, geometry: mesh.geometry, matrix: mesh.matrixWorld.clone() });
        });
        resolve({
          meshes,
          scale,
          offset: [-center.x * scale, -center.y * scale, -center.z * scale],
          longest: maxDim * scale,
        });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

export default function GlbBoxViewer({ url }: { url: string }) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setModel(null);
    setFailed(false);
    loadGlb(url)
      .then((loaded) => {
        if (!cancelled) setModel(loaded);
      })
      .catch((err) => {
        console.error("3D box failed to load", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center font-mono text-xs text-muted-foreground">
        The 3D box didn't load. Try again later.
      </div>
    );
  }
  if (!model) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner className="text-muted-foreground" />
      </div>
    );
  }

  const distance = model.longest * 2.2;
  return (
    <Canvas
      camera={{ position: [distance * 0.7, distance * 0.55, distance * 0.7], fov: 35, near: distance / 100, far: distance * 20 }}
      aria-label="3D view of the box. Drag to turn it."
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[distance, distance * 1.5, distance * 0.5]} intensity={0.9} />
      <group position={model.offset} scale={model.scale}>
        {model.meshes.map((mesh) => (
          <mesh key={mesh.key} geometry={mesh.geometry} matrix={mesh.matrix} matrixAutoUpdate={false}>
            <meshStandardMaterial color="#cfd2d7" metalness={0.1} roughness={0.7} />
            <Edges color="#6b7280" threshold={20} />
          </mesh>
        ))}
      </group>
      <OrbitControls makeDefault enablePan={false} />
    </Canvas>
  );
}
