# report_helpers.py
# Helper module imported by AI-generated build123d scripts running inside the
# Vercel Sandbox.  The runner copies this file alongside the generated script
# so the script can do:
#
#   from report_helpers import report_entities, apply_pattern, write_entities_json
#
# After all features are emitted the script calls write_entities_json() which
# serialises the accumulated entity list to /out/entities.json.

import json
import os
from typing import Any

_entities: list[dict[str, Any]] = []


def report_entities(feature_id: str, body: Any) -> None:
    """Record a feature body in the entity list.

    Parameters
    ----------
    feature_id:
        The string id of the feature as defined in the CAD IR.
    body:
        The build123d BuildPart / Compound / Part object produced by the
        feature.  We extract the bounding box and vertex count as a cheap
        geometry summary; the full STEP export is handled separately.
    """
    entry: dict[str, Any] = {"id": feature_id}
    try:
        bb = body.bounding_box()
        entry["bounding_box"] = {
            "min": [bb.min.X, bb.min.Y, bb.min.Z],
            "max": [bb.max.X, bb.max.Y, bb.max.Z],
        }
    except Exception:
        entry["bounding_box"] = None

    try:
        entry["vertex_count"] = len(body.vertices())
    except Exception:
        entry["vertex_count"] = None

    _entities.append(entry)


def apply_pattern(
    source_id: str,
    count: int,
    axis: str,
    spacing: float,
    parent_body: Any,
) -> None:
    """Record a linear-pattern feature.

    The actual geometry is emitted by the generated script; this helper only
    records the intent for the entity report so downstream validators can check
    it.
    """
    _entities.append(
        {
            "id": f"{source_id}_pattern",
            "kind": "pattern",
            "count": count,
            "axis": axis,
            "spacing": spacing,
        }
    )


def write_entities_json(path: str = "/out/entities.json") -> None:
    """Write the accumulated entity list to *path* as JSON."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(_entities, fh, indent=2)
