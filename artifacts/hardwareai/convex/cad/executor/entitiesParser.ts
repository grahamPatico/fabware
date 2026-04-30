// convex/cad/executor/entitiesParser.ts
//
// Parses the raw `entities` array emitted by the Python sandbox runner
// (entities.json) into a typed EntityRegistry that the rest of the CAD IR
// pipeline can query.

import type { EntityRegistry, FaceId, EdgeId, VertexId } from "../ir/types";

interface RawEntity {
  kind: "face" | "edge" | "vertex";
  id: string;
  feature: string;
  tag: string;
  topologyHash?: string;
}

function isRawEntity(v: unknown): v is RawEntity {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    (e.kind === "face" || e.kind === "edge" || e.kind === "vertex") &&
    typeof e.id === "string" &&
    typeof e.feature === "string" &&
    typeof e.tag === "string"
  );
}

/**
 * Parse the raw `entities` array from a sandbox run result into a typed
 * EntityRegistry. Unknown or malformed entries are silently skipped.
 */
export function parseEntities(raw: unknown[]): EntityRegistry {
  const registry: EntityRegistry = { faces: {}, edges: {}, vertices: {} };

  for (const item of raw) {
    if (!isRawEntity(item)) continue;

    if (item.kind === "face") {
      const faceId = item.id as FaceId;
      registry.faces[faceId] = {
        feature: item.feature,
        tag: item.tag,
        topologyHash: item.topologyHash ?? "",
      };
    } else if (item.kind === "edge") {
      const edgeId = item.id as EdgeId;
      registry.edges[edgeId] = {
        feature: item.feature,
        tag: item.tag,
        topologyHash: item.topologyHash ?? "",
      };
    } else if (item.kind === "vertex") {
      const vertexId = item.id as VertexId;
      registry.vertices[vertexId] = {
        feature: item.feature,
        tag: item.tag,
      };
    }
  }

  return registry;
}
