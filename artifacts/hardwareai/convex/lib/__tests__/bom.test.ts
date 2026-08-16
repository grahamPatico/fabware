import { describe, it, expect } from "vitest";
import { generateBom, type BomInputs } from "../bom";

// The BOM emitter only reads a handful of fields off each doc; cast rather
// than building full Convex documents.
function inputs(over: Partial<BomInputs>): BomInputs {
  return {
    projectName: "Test",
    parts: [],
    interfaces: [],
    assemblyParts: [],
    ...over,
  } as BomInputs;
}

function hardwareSection(csv: string): string[] {
  const lines = csv.split("\n");
  const start = lines.indexOf("## Hardware (McMaster)");
  return lines.slice(start + 1).filter(l => l.trim().length > 0);
}

const purchased = (over: Record<string, unknown>) => ({
  kind: "purchased",
  role: "screw_a",
  label: "M3 x 3 set screw",
  purchasedPartNumber: "91251A540",
  purchasedQuantity: 4,
  ...over,
}) as any;

describe("generateBom hardware section", () => {
  it("emits the description / unit_cost_usd / url columns", () => {
    const csv = generateBom(inputs({ parts: [purchased({})] }));
    const [header] = hardwareSection(csv);
    expect(header).toBe("mcmaster_part_number,quantity,source,notes,description,unit_cost_usd,url");
  });

  it("uses mcmasterUrl and a blank cost for a plain purchased part", () => {
    const csv = generateBom(inputs({ parts: [purchased({})] }));
    const [, line] = hardwareSection(csv);
    expect(line).toBe(
      "91251A540,4,purchased_part,M3 x 3 set screw,M3 x 3 set screw,,https://www.mcmaster.com/91251A540/",
    );
  });

  it("uses the step.parts page URL and the row's unit cost when present", () => {
    const csv = generateBom(inputs({
      parts: [purchased({
        purchasedPartNumber: "step.parts:din913_set_screw_m3x3",
        unitCostUsd: 0.4,
        stepPageUrl: "https://www.step.parts/parts/din913_set_screw_m3x3",
      })],
    }));
    const [, line] = hardwareSection(csv);
    // The step.parts id keeps its snake_case; McMaster numbers stay upper-case.
    expect(line).toContain("step.parts:din913_set_screw_m3x3,4,purchased_part");
    expect(line).toContain(",0.40,");
    expect(line.endsWith("https://www.step.parts/parts/din913_set_screw_m3x3")).toBe(true);
  });

  it("quotes cells containing commas so the CSV stays parseable", () => {
    const csv = generateBom(inputs({
      parts: [purchased({ label: "Bearing, 608ZZ, shielded" })],
    }));
    const [, line] = hardwareSection(csv);
    expect(line).toContain('"Bearing, 608ZZ, shielded"');
    // 7 columns once the quoted cells are accounted for.
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.filter(c => c !== "");
    expect(cells.length).toBe(7);
  });

  it("still merges assemblyParts and interface hardware onto one line", () => {
    const csv = generateBom(inputs({
      assemblyParts: [{ mcmasterPartNumber: "91251A540", quantity: 2, name: "1/4-20 SHCS" } as any],
      interfaces: [{ kind: "bolted", hardwareRefs: [{ mcmasterPartNumber: "91251a540", quantity: 3, role: "body" }] } as any],
    }));
    const rows = hardwareSection(csv);
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain("91251A540,5,assembly_part+interface");
    expect(rows[1]).toContain("1/4-20 SHCS");
    expect(rows[1]).toContain("https://www.mcmaster.com/91251A540/");
  });
});
