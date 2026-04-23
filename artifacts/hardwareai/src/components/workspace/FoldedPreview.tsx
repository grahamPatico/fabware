import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

class WebGLErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("FoldedPreview: 3D context unavailable", error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

interface FoldedPreviewProps {
  svg: string;
  width: number;
  height: number;
  thickness: number;
  bendAnglesDeg: number[];
  /** Fractions from the top of the flat pattern where bend lines sit (0..1). */
  bendPositionsFromTop?: number[];
}

const SCALE = 40;
const OFF = 70;

function svgPartRect(width: number, height: number) {
  const svgWidth = Math.max(width * SCALE + 160, 360);
  const svgHeight = Math.max(height * SCALE + 160, 240);
  const pw = width * SCALE;
  const ph = height * SCALE;
  return { svgWidth, svgHeight, pw, ph };
}

function useSvgImage(svg: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const i = new Image();
    i.onload = () => {
      if (!cancelled) setImg(i);
    };
    i.onerror = () => {
      if (!cancelled) setImg(null);
    };
    i.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [svg]);
  return img;
}

function makeRegionTexture(
  img: HTMLImageElement,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): THREE.Texture {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  tex.repeat.set(wPx / iw, hPx / ih);
  tex.offset.set(xPx / iw, 1 - (yPx + hPx) / ih);
  tex.needsUpdate = true;
  return tex;
}

interface Segment {
  /** Height of this segment in part units. */
  h: number;
  faceTex: THREE.Texture;
  /** Bend angle (rad) of the hinge to the NEXT segment (above this one). */
  nextHingeRad: number;
}

const EDGE_COLOR = "#6a6f76";

function SegmentMesh({
  width,
  thickness,
  segments,
  idx,
}: {
  width: number;
  thickness: number;
  segments: Segment[];
  idx: number;
}) {
  const seg = segments[idx];
  const hasNext = idx + 1 < segments.length;
  return (
    <group>
      <mesh position={[0, seg.h / 2, 0]}>
        <boxGeometry args={[width, seg.h, thickness]} />
        {/* PX +X */}
        <meshStandardMaterial attach="material-0" color={EDGE_COLOR} metalness={0.6} roughness={0.5} />
        <meshStandardMaterial attach="material-1" color={EDGE_COLOR} metalness={0.6} roughness={0.5} />
        <meshStandardMaterial attach="material-2" color={EDGE_COLOR} metalness={0.6} roughness={0.5} />
        <meshStandardMaterial attach="material-3" color={EDGE_COLOR} metalness={0.6} roughness={0.5} />
        {/* +Z front face */}
        <meshStandardMaterial
          attach="material-4"
          map={seg.faceTex}
          metalness={0.55}
          roughness={0.42}
        />
        {/* -Z back face */}
        <meshStandardMaterial
          attach="material-5"
          map={seg.faceTex}
          metalness={0.55}
          roughness={0.42}
        />
      </mesh>
      {hasNext && (
        <group position={[0, seg.h, 0]} rotation={[seg.nextHingeRad, 0, 0]}>
          <SegmentMesh width={width} thickness={thickness} segments={segments} idx={idx + 1} />
        </group>
      )}
    </group>
  );
}

function FoldedScene({
  img,
  width,
  height,
  thickness,
  bendAnglesDeg,
  bendPositionsFromTop,
}: {
  img: HTMLImageElement;
  width: number;
  height: number;
  thickness: number;
  bendAnglesDeg: number[];
  bendPositionsFromTop: number[];
}) {
  const segments = useMemo<Segment[]>(() => {
    const { pw, ph } = svgPartRect(width, height);

    // Pair each bend angle with its position-from-top, then sort top→bottom.
    const bends = bendPositionsFromTop
      .map((p, i) => ({
        pFromTop: Math.max(0.05, Math.min(0.95, p)),
        angleRad: ((bendAnglesDeg[i] ?? 90) * Math.PI) / 180,
      }))
      .sort((a, b) => a.pFromTop - b.pFromTop);

    // We render bottom→top. Convert positions to "from bottom", then ascending.
    const fromBottom = bends
      .map((b) => ({ pFromBottom: 1 - b.pFromTop, angleRad: b.angleRad }))
      .sort((a, b) => a.pFromBottom - b.pFromBottom);

    // Segment fractions along the height (bottom→top).
    const fracs: number[] = [];
    let prev = 0;
    for (const b of fromBottom) {
      fracs.push(b.pFromBottom - prev);
      prev = b.pFromBottom;
    }
    fracs.push(1 - prev);

    // SVG image texture slices: SVG y origin is at top, part rect spans
    // [OFF, OFF + ph]. Segment 0 (bottom of part) maps to the BOTTOM of the
    // SVG part rect (largest SVG y). Segment N (top of part) maps to the TOP.
    let cumFromBottom = 0;
    const segs: Segment[] = fracs.map((frac, i) => {
      const segBottomFrac = cumFromBottom;
      const segTopFrac = cumFromBottom + frac;
      cumFromBottom = segTopFrac;
      // SVG y of segment top edge (smaller y in SVG space because SVG y grows downward,
      // and segment top in real life = closer to TOP of flat pattern).
      const ySvgTop = OFF + ph * (1 - segTopFrac);
      const ySvgBottom = OFF + ph * (1 - segBottomFrac);
      const tex = makeRegionTexture(img, OFF, ySvgTop, pw, ySvgBottom - ySvgTop);
      return {
        h: height * frac,
        faceTex: tex,
        nextHingeRad: i < fromBottom.length ? fromBottom[i].angleRad : 0,
      };
    });
    return segs;
  }, [img, width, height, thickness, bendAnglesDeg, bendPositionsFromTop]);

  // Center vertically on the bottom segment.
  const baseH = segments[0]?.h ?? height;
  return (
    <group position={[0, -baseH / 2, 0]}>
      <SegmentMesh width={width} thickness={thickness} segments={segments} idx={0} />
    </group>
  );
}

function defaultBendPositions(n: number): number[] {
  if (n <= 0) return [];
  // Match the SVG generator's single-bend convention (40% from top).
  if (n === 1) return [0.4];
  // Otherwise distribute evenly between the top and bottom edges.
  return Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
}

function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export default function FoldedPreview({
  svg,
  width,
  height,
  thickness,
  bendAnglesDeg,
  bendPositionsFromTop,
}: FoldedPreviewProps) {
  const img = useSvgImage(svg);
  const [webglOk] = useState<boolean>(() => detectWebGL());
  const positions = useMemo(
    () =>
      bendPositionsFromTop && bendPositionsFromTop.length === bendAnglesDeg.length
        ? bendPositionsFromTop
        : defaultBendPositions(bendAnglesDeg.length),
    [bendPositionsFromTop, bendAnglesDeg.length],
  );
  const camDist = Math.max(width, height) * 1.8 + 4;
  const angleSummary = bendAnglesDeg.map((a) => `${a}°`).join(" / ");

  const fallback = (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-muted-foreground/70 font-mono p-6">
      <span className="text-xs uppercase tracking-widest">3D preview unavailable</span>
      <span className="text-[10px] mt-2 opacity-70">
        Your browser couldn't open a WebGL context. Switch back to the flat view to continue.
      </span>
    </div>
  );

  if (!webglOk) {
    return (
      <div
        className="w-full h-full max-w-2xl max-h-[60vh] aspect-[4/3] border border-white/10 bg-black/40 backdrop-blur-sm rounded shadow-2xl overflow-hidden relative"
        data-testid="folded-preview"
      >
        {fallback}
      </div>
    );
  }

  return (
    <div className="w-full h-full max-w-2xl max-h-[60vh] aspect-[4/3] border border-white/10 bg-black/40 backdrop-blur-sm rounded shadow-2xl overflow-hidden relative" data-testid="folded-preview">
      <WebGLErrorBoundary fallback={fallback}>
        <Canvas
          camera={{ position: [camDist * 0.7, camDist * 0.6, camDist * 0.9], fov: 38 }}
          gl={{ antialias: true, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false }}
          onCreated={({ gl }) => {
            gl.setClearColor("#0a0e14");
          }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[8, 12, 6]} intensity={1.0} />
          <directionalLight position={[-6, 4, -8]} intensity={0.4} color="#88aaff" />
          <Suspense fallback={null}>
            {img && bendAnglesDeg.length > 0 && (
              <FoldedScene
                img={img}
                width={width}
                height={height}
                thickness={thickness}
                bendAnglesDeg={bendAnglesDeg}
                bendPositionsFromTop={positions}
              />
            )}
          </Suspense>
          <OrbitControls
            enablePan={false}
            minDistance={camDist * 0.6}
            maxDistance={camDist * 2}
            target={[0, 0, 0]}
          />
        </Canvas>
      </WebGLErrorBoundary>
      <div className="absolute bottom-2 left-3 text-[10px] font-mono uppercase tracking-widest text-white/40 pointer-events-none">
        Drag to rotate · Scroll to zoom · Bend {angleSummary} ({bendAnglesDeg.length}×)
      </div>
    </div>
  );
}
