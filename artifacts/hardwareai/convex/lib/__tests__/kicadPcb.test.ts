import { describe, it, expect } from "vitest";
import type { PcbBoard } from "../journey";
import { boardOutlineKicadPcb, kicadFilename, outlineSegments } from "../kicadPcb";

const board = (over: Partial<PcbBoard> = {}): PcbBoard => ({
  widthMm: 80, heightMm: 50, cornerRadiusMm: 0, thicknessMm: 1.6, layers: 2,
  mountingHoles: [], outlineBasis: "Fits the enclosure with 2 mm clearance", ...over,
});

const count = (text: string, needle: string) => text.split(needle).length - 1;

/** True when every parenthesis outside a quoted string is matched. */
function balanced(text: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "(") depth++;
    else if (c === ")" && --depth < 0) return false;
  }
  return depth === 0 && !inString;
}

describe("boardOutlineKicadPcb", () => {
  it("draws a square-cornered outline as four lines on Edge.Cuts", () => {
    const pcb = boardOutlineKicadPcb(board(), "Gate controller");
    expect(balanced(pcb)).toBe(true);
    expect(pcb.startsWith('(kicad_pcb (version 20221018) (generator "fabware")')).toBe(true);
    expect(count(pcb, "(gr_line")).toBe(4);
    expect(count(pcb, "(gr_arc")).toBe(0);
    expect(count(pcb, '(layer "Edge.Cuts")')).toBe(4);
    expect(pcb).toContain("(gr_line (start 100 100) (end 180 100)");
    expect(pcb).toContain("(gr_line (start 180 150) (end 100 150)");
    expect(pcb).toContain("(general (thickness 1.6))");
    expect(pcb).toContain('(title "Gate controller")');
  });

  it("draws rounded corners as four lines and four arcs that meet end to end", () => {
    const pcb = boardOutlineKicadPcb(board({ cornerRadiusMm: 3 }), "Round");
    expect(balanced(pcb)).toBe(true);
    expect(count(pcb, "(gr_line")).toBe(4);
    expect(count(pcb, "(gr_arc")).toBe(4);
    // Every endpoint is shared by exactly two segments: a closed outline.
    const ends = new Map<string, number>();
    for (const m of pcb.matchAll(/\((?:start|end) ([\d.-]+ [\d.-]+)\)/g)) ends.set(m[1], (ends.get(m[1]) ?? 0) + 1);
    expect(ends.size).toBe(8);
    expect([...ends.values()].every((n) => n === 2)).toBe(true);
    // Top-right corner: from the top edge, through the 45 degree point, to the right edge.
    expect(pcb).toContain("(gr_arc (start 177 100) (mid 179.1213 100.8787) (end 180 103)");
  });

  it("skips zero-length sides when the radius is half the board", () => {
    const segments = outlineSegments({ widthMm: 40, heightMm: 40, cornerRadiusMm: 20 });
    expect(segments.filter((s) => s.startsWith("(gr_line"))).toHaveLength(0);
    expect(segments.filter((s) => s.startsWith("(gr_arc"))).toHaveLength(4);
    // A radius larger than the board allows is pulled in, not drawn inside out.
    expect(outlineSegments({ widthMm: 40, heightMm: 20, cornerRadiusMm: 99 })
      .filter((s) => s.startsWith("(gr_line"))).toHaveLength(2);
  });

  it("adds one unplated footprint per mounting hole, offset from the board origin", () => {
    const holes = [
      { xMm: 4, yMm: 4, diameterMm: 3.2 }, { xMm: 76, yMm: 4, diameterMm: 3.2 },
      { xMm: 4, yMm: 46, diameterMm: 3.2 }, { xMm: 76, yMm: 46, diameterMm: 2.5 },
    ];
    const pcb = boardOutlineKicadPcb(board({ mountingHoles: holes }), "Holes");
    expect(balanced(pcb)).toBe(true);
    expect(count(pcb, "(footprint ")).toBe(4);
    expect(count(pcb, "np_thru_hole circle")).toBe(4);
    expect(pcb).toContain("(at 104 104)");
    expect(pcb).toContain("(at 176 146)");
    expect(pcb).toContain('(pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2) (layers "*.Cu" "*.Mask"))');
    expect(pcb).toContain("(size 2.5 2.5) (drill 2.5)");
    expect(pcb).toContain('"H4"');
    expect(count(boardOutlineKicadPcb(board(), "None"), "(footprint ")).toBe(0);
  });

  it("writes a two or four layer stack", () => {
    const two = boardOutlineKicadPcb(board({ layers: 2 }), "2L");
    const four = boardOutlineKicadPcb(board({ layers: 4 }), "4L");
    expect(two).not.toContain("In1.Cu");
    expect(four).toContain('(1 "In1.Cu" signal)');
    expect(four).toContain('(2 "In2.Cu" signal)');
    for (const pcb of [two, four]) {
      expect(pcb).toContain('(0 "F.Cu" signal)');
      expect(pcb).toContain('(31 "B.Cu" signal)');
      expect(pcb).toContain('(44 "Edge.Cuts" user)');
    }
  });

  it("escapes quotes and newlines in the title block", () => {
    const pcb = boardOutlineKicadPcb(board({ outlineBasis: 'Fits the "HD-35F"\n(checked)' }), 'My "best" board\\v2');
    expect(balanced(pcb)).toBe(true);
    expect(pcb).toContain('(title "My \\"best\\" board\\\\v2")');
    expect(pcb).toContain('(comment 2 "Fits the \\"HD-35F\\" (checked)")');
  });

  it("is deterministic", () => {
    expect(boardOutlineKicadPcb(board(), "A")).toBe(boardOutlineKicadPcb(board(), "A"));
  });
});

describe("kicadFilename", () => {
  it("makes a safe file name", () => {
    expect(kicadFilename("Gate Opener v2 (solar)")).toBe("gate-opener-v2-solar-outline.kicad_pcb");
    expect(kicadFilename("../../etc")).toBe("etc-outline.kicad_pcb");
    expect(kicadFilename("***")).toBe("board-outline.kicad_pcb");
  });
});
