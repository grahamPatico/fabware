// convex/cad/patch/__tests__/toolCallToPatch.test.ts
//
// Round-trip tests for the agent-tool-call → Patch dispatcher. The Phase 19
// gap-closure fix propagates `stepUrl` through the `add_part` external
// branch so EXTERNAL-01 (agent-authored STEP imports) reaches the
// downstream codegen consumer.

import { describe, expect, it } from "vitest";
import { toolCallToPatch } from "../toolCallToPatch";
import { applyPatch } from "../apply";
import { compileAssembly } from "../../codegen/compileAssembly";
import { emptyIr } from "../../ir/empty";
import type { CadIr, ExternalPartRef } from "../../ir/types";

describe("toolCallToPatch — add_part external (Phase 19 stepUrl round-trip)", () => {
  it("propagates stepUrl from agent tool call through to the constructed PartRef", () => {
    const patch = toolCallToPatch({
      name: "add_part",
      input: {
        id: "bearing",
        kind: "external",
        vendor: "Misumi",
        partNumber: "B-6800ZZ",
        description: "Deep-groove ball bearing",
        stepUrl: "https://assets.misumi-ec.com/steps/B-6800ZZ.step",
        origin: { x: 10, y: 0, z: 0 },
        boundingBox: { width: 19, height: 19, depth: 6 },
      },
    });

    expect(patch).not.toBeNull();
    expect(patch!.kind).toBe("add_part");
    if (patch!.kind !== "add_part") return; // narrow
    const part = patch!.part as ExternalPartRef;
    expect(part.kind).toBe("external");
    expect(part.vendor).toBe("Misumi");
    expect(part.partNumber).toBe("B-6800ZZ");
    expect(part.stepUrl).toBe("https://assets.misumi-ec.com/steps/B-6800ZZ.step");
  });

  it("round-trips agent-authored add_part {stepUrl} → applyPatch → compileAssembly → import_step()", () => {
    let ir: CadIr = emptyIr("mm");

    // Agent emits an add_part tool call with a stepUrl
    const toolCall = {
      name: "add_part",
      input: {
        id: "bearing",
        kind: "external",
        vendor: "Misumi",
        partNumber: "B-6800ZZ",
        stepUrl: "https://assets.misumi-ec.com/steps/B-6800ZZ.step",
        origin: { x: 0, y: 0, z: 0 },
      },
    };

    // Dispatch to a typed Patch
    const patch = toolCallToPatch(toolCall);
    expect(patch).not.toBeNull();

    // Apply the patch (schema-validated)
    const result = applyPatch(ir, patch!);
    expect(result.schemaViolations).toEqual([]);
    ir = result.ir;

    // The stepUrl survived applyPatch
    const stored = ir.parts!["bearing"] as ExternalPartRef;
    expect(stored.stepUrl).toBe("https://assets.misumi-ec.com/steps/B-6800ZZ.step");

    // compileAssembly emits an import_step() call for the external part
    const scripts = compileAssembly(ir);
    expect(scripts["bearing"]).toBeDefined();
    expect(scripts["bearing"]).toContain("import_step");
    // The path uses the sandboxed convention <vendor>__<partNumber>.step
    expect(scripts["bearing"]).toContain("Misumi__B-6800ZZ.step");
  });

  it("omits stepUrl on the constructed PartRef when the tool call does not include one", () => {
    const patch = toolCallToPatch({
      name: "add_part",
      input: {
        id: "screw",
        kind: "external",
        vendor: "McMaster-Carr",
        partNumber: "91290A115",
      },
    });
    expect(patch).not.toBeNull();
    if (patch!.kind !== "add_part") return; // narrow
    const part = patch!.part as ExternalPartRef;
    expect(part.stepUrl).toBeUndefined();
  });

  it("ignores non-string stepUrl values (defensive)", () => {
    const patch = toolCallToPatch({
      name: "add_part",
      input: {
        id: "screw",
        kind: "external",
        vendor: "McMaster-Carr",
        partNumber: "91290A115",
        stepUrl: 42, // wrong type
      },
    });
    expect(patch).not.toBeNull();
    if (patch!.kind !== "add_part") return;
    const part = patch!.part as ExternalPartRef;
    expect(part.stepUrl).toBeUndefined();
  });
});
