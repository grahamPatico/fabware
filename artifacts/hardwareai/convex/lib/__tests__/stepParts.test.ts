import { describe, it, expect } from "vitest";
import {
  STEP_PARTS_ORIGIN,
  buildStepPartsSearchUrl,
  buildStepPartUrl,
  trimStepPartRecord,
  summarizeStepPartForAgent,
} from "../stepParts";

// Copied verbatim from GET https://api.step.parts/v1/parts?q=M3&tag=screw&pageSize=2
// (items[0]). Frozen here so the tests never hit the network.
const FIXTURE_SET_SCREW = {
  id: "din913_set_screw_m3x3",
  name: "DIN 913 set screw, M3 x 3",
  description: "DIN 913, set screw, M3 x 3.",
  category: "fastener",
  family: "set-screw",
  tags: ["screw", "metric"],
  aliases: ["M3 set screw", "DIN 913 M3x3", "DIN913 M3x3"],
  standard: { body: "DIN", number: "913", designation: "DIN 913" },
  attributes: {
    thread: "M3",
    lengthMm: 3,
    nominalSize: "M3 x 3",
    driveStyle: "hex-socket",
  },
  stepUrl:
    "https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/din913_set_screw_m3x3.step",
  glbUrl:
    "https://8ljrorjug0ps5al0.public.blob.vercel-storage.com/preview/glb/din913_set_screw_m3x3-527708f07fb56cd0d4a49def35f1d6d12695f3ebbb75ba226e8546921833bac2.glb",
  pngUrl:
    "https://8ljrorjug0ps5al0.public.blob.vercel-storage.com/preview/png/din913_set_screw_m3x3-527708f07fb56cd0d4a49def35f1d6d12695f3ebbb75ba226e8546921833bac2.png",
  byteSize: 31410,
  sha256: "527708f07fb56cd0d4a49def35f1d6d12695f3ebbb75ba226e8546921833bac2",
  pageUrl: "https://www.step.parts/parts/din913_set_screw_m3x3",
  apiUrl: "https://api.step.parts/v1/parts/din913_set_screw_m3x3",
};

// A bearing row — no `standard` key at all, and a boolean attribute.
const FIXTURE_BEARING = {
  id: "bearing_608zz",
  name: "608ZZ ball bearing",
  description: "Deep groove ball bearing, 608ZZ.",
  category: "bearing",
  family: "deep-groove-ball-bearing",
  tags: ["ball-bearing", "shielded", "metric"],
  aliases: ["608ZZ", "608ZZ bearing"],
  attributes: {
    bearingCode: "608ZZ",
    sealType: "ZZ",
    shielded: true,
    nominalSize: "608ZZ",
  },
  stepUrl:
    "https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/bearing_608zz.step",
  glbUrl:
    "https://8ljrorjug0ps5al0.public.blob.vercel-storage.com/preview/glb/bearing_608zz-62d262cc91fb6e213ae85f182811201787e583d527d9a7718ea30a08e1f19fc9.glb",
  pngUrl:
    "https://8ljrorjug0ps5al0.public.blob.vercel-storage.com/preview/png/bearing_608zz-62d262cc91fb6e213ae85f182811201787e583d527d9a7718ea30a08e1f19fc9.png",
  byteSize: 39700,
  pageUrl: "https://www.step.parts/parts/bearing_608zz",
};

describe("buildStepPartsSearchUrl", () => {
  it("URL-encodes the query and defaults pageSize to 8", () => {
    const url = buildStepPartsSearchUrl({ q: "M3 set screw" });
    expect(url.startsWith(`${STEP_PARTS_ORIGIN}/v1/parts?`)).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("M3 set screw");
    expect(parsed.searchParams.get("pageSize")).toBe("8");
    expect(url).not.toContain(" ");
  });

  it("carries category / family / standard facets", () => {
    const url = buildStepPartsSearchUrl({
      q: "hex nut",
      category: "fastener",
      family: "hex-nut",
      standard: "ISO 4032",
    });
    const p = new URL(url).searchParams;
    expect(p.get("category")).toBe("fastener");
    expect(p.get("family")).toBe("hex-nut");
    expect(p.get("standard")).toBe("ISO 4032");
  });

  it("clamps pageSize to 1..25 and floors fractions", () => {
    expect(new URL(buildStepPartsSearchUrl({ q: "a", pageSize: 0 })).searchParams.get("pageSize")).toBe("1");
    expect(new URL(buildStepPartsSearchUrl({ q: "a", pageSize: 99 })).searchParams.get("pageSize")).toBe("25");
    expect(new URL(buildStepPartsSearchUrl({ q: "a", pageSize: 4.7 })).searchParams.get("pageSize")).toBe("4");
    expect(new URL(buildStepPartsSearchUrl({ q: "a", pageSize: NaN })).searchParams.get("pageSize")).toBe("8");
  });

  it("omits blank params instead of emitting empty values", () => {
    const url = buildStepPartsSearchUrl({ q: "  ", category: "" });
    const p = new URL(url).searchParams;
    expect(p.has("q")).toBe(false);
    expect(p.has("category")).toBe(false);
    expect(p.get("pageSize")).toBe("8");
  });
});

describe("buildStepPartUrl", () => {
  it("targets the single-record endpoint", () => {
    expect(buildStepPartUrl("din913_set_screw_m3x3")).toBe(
      `${STEP_PARTS_ORIGIN}/v1/parts/din913_set_screw_m3x3`,
    );
  });

  it("encodes ids with unsafe characters", () => {
    expect(buildStepPartUrl("a b/c")).toBe(`${STEP_PARTS_ORIGIN}/v1/parts/a%20b%2Fc`);
  });
});

describe("trimStepPartRecord", () => {
  it("keeps the fields fabware stores", () => {
    const rec = trimStepPartRecord(FIXTURE_SET_SCREW);
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe("din913_set_screw_m3x3");
    expect(rec!.family).toBe("set-screw");
    expect(rec!.standard).toEqual({ body: "DIN", number: "913", designation: "DIN 913" });
    expect(rec!.attributes.thread).toBe("M3");
    expect(rec!.attributes.lengthMm).toBe(3);
    expect(rec!.glbUrl).toContain(".glb");
    expect(rec!.pageUrl).toBe("https://www.step.parts/parts/din913_set_screw_m3x3");
    // byteSize / sha256 / apiUrl are dropped from the trimmed record.
    expect(rec as unknown as Record<string, unknown>).not.toHaveProperty("byteSize");
  });

  it("normalizes a missing `standard` to null and keeps boolean attributes", () => {
    const rec = trimStepPartRecord(FIXTURE_BEARING);
    expect(rec!.standard).toBeNull();
    expect(rec!.attributes.shielded).toBe(true);
  });

  it("returns null on shape mismatch", () => {
    expect(trimStepPartRecord(null)).toBeNull();
    expect(trimStepPartRecord("din913")).toBeNull();
    expect(trimStepPartRecord({ name: "no id" })).toBeNull();
    expect(trimStepPartRecord({ ...FIXTURE_SET_SCREW, id: "" })).toBeNull();
    expect(trimStepPartRecord({ ...FIXTURE_SET_SCREW, tags: "screw" })).toBeNull();
  });

  it("drops non-scalar attribute values", () => {
    const rec = trimStepPartRecord({
      ...FIXTURE_SET_SCREW,
      attributes: { thread: "M3", holes: [1, 2, 3], meta: { a: 1 } },
    });
    expect(rec!.attributes).toEqual({ thread: "M3" });
  });
});

describe("summarizeStepPartForAgent", () => {
  it("renders one line with name, id, family and key attributes", () => {
    const rec = trimStepPartRecord(FIXTURE_SET_SCREW)!;
    const line = summarizeStepPartForAgent(rec);
    expect(line).toContain("DIN 913 set screw, M3 x 3");
    expect(line).toContain("id: din913_set_screw_m3x3");
    expect(line).toContain("set-screw");
    expect(line).toContain("thread=M3");
    expect(line).toContain("lengthMm=3");
    expect(line).not.toContain("\n");
  });

  it("orders priority attributes before the rest", () => {
    const rec = trimStepPartRecord(FIXTURE_BEARING)!;
    const line = summarizeStepPartForAgent(rec);
    expect(line.indexOf("nominalSize=608ZZ")).toBeLessThan(line.indexOf("sealType=ZZ"));
    expect(line).toContain("shielded=true");
  });

  it("survives a record with no attributes and no standard", () => {
    const rec = trimStepPartRecord({
      id: "vslot_motor_plate_nema17",
      name: "vslot motor plate nema17",
      category: "enclosure",
      family: "v-slot-plates-and-brackets",
      attributes: {},
    })!;
    const line = summarizeStepPartForAgent(rec);
    expect(line).toBe("vslot motor plate nema17 (id: vslot_motor_plate_nema17) · enclosure / v-slot-plates-and-brackets");
  });
});
