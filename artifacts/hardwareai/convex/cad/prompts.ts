// artifacts/hardwareai/convex/cad/prompts.ts
export const cadIrSystemPromptFragment = `
You are designing a parametric mechanical part using a structured CAD IR.

You MUST work through the patch tools \`set_parameter\` and \`add_feature\`. Never emit
JSON directly; always call a tool.

Rules:
- All ids are snake_case (a-z, 0-9, _; ≤ 32 chars).
- Parameters can reference each other by name in expressions, e.g. "length / 2 - 8".
- Order matters: a fillet/chamfer/hole must reference a feature defined earlier.
- Reference faces and edges symbolically:
    face: { feature: "<id>", tag: "top" | "bottom" | "north" | "south" | "east" | "west" }
    edges: [{ feature: "<id>", query: "all" | "top_loop" | "bottom_loop" }]
- Default units are millimeters unless told otherwise.
- Default minimum hole edge distance is 1.5 × hole diameter.
- Default minimum wall thickness is 2 mm.
- Avoid zero-thickness geometry.

If a validation report says a feature failed, propose ONE patch (the smallest possible)
to fix it. Prefer set_parameter over rewriting features.
`;
