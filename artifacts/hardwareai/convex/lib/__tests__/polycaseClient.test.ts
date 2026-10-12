import { describe, it, expect, vi } from "vitest";
import type { RequirementsContent } from "../journey";
import {
  buildEnclosureRequirements, fetchEnclosure, mapRecommendation, polycaseModelGlbUrl,
} from "../polycaseClient";
import { POLYCASE_RECOMMEND_RESPONSE } from "./fixtures/polycaseRecommend";

const REQ: RequirementsContent = {
  summary: "", functional: [],
  envelope: { widthIn: 4, depthIn: 3, heightIn: 2, note: "" },
  environment: { location: "outdoor", waterproof: true, notes: "" },
  power: "", quantity: null, budgetUsd: null, tier: "mvp", constraints: [], successCriteria: [],
};

describe("buildEnclosureRequirements", () => {
  it("sends the envelope in millimetres as the minimum internal size", () => {
    const text = buildEnclosureRequirements(REQ, { need: "Box for the controller", searchQuery: "NEMA 4X polycarbonate" });
    expect(text).toBe(
      "Enclosure for: Box for the controller. NEMA 4X polycarbonate. " +
      "Minimum internal size 102 x 76 x 51 mm. Outdoor use. Must be waterproof.",
    );
  });

  it("leaves the size out when a dimension is unknown, and does not repeat the need", () => {
    const text = buildEnclosureRequirements(
      { ...REQ, envelope: { widthIn: 4, depthIn: null, heightIn: 2, note: "" }, environment: { location: "indoor", waterproof: false, notes: "" } },
      { need: "Desk box", searchQuery: "desk box" },
    );
    expect(text).toBe("Enclosure for: Desk box. Indoor use.");
  });

  it("works with no requirements stage", () => {
    expect(buildEnclosureRequirements(null, { need: "Box", searchQuery: "ABS box" })).toBe("Enclosure for: Box. ABS box.");
  });
});

describe("mapRecommendation", () => {
  it("maps the top-ranked recommendation of a real response", () => {
    expect(mapRecommendation(POLYCASE_RECOMMEND_RESPONSE)).toEqual({
      productName: "SK-14 Enclosure with Knockouts (Gray, no clear cover)",
      partNumber: "SK-14-02",
      productUrl: "https://www.polycase.com/sk-14",
      priceUsd: 25.36,
      fitSummary:
        "Internal space 101 × 101 × 54 mm meets the requested minimum. " +
        "Rated for outdoor use (environment is \"outdoor\"). " +
        "Sealed against water (published waterproof, IP65+, or an outdoor NEMA type). " +
        "Published NEMA 4X meets the requested NEMA 4X.",
      purchaseNote:
        "Double-check before purchasing: confirm dimensions against the Polycase 2D drawing or STEP model, " +
        "and confirm compatibility, mounting hardware, price and stock on polycase.com. " +
        "Customization is confirmed only by Polycase at drawing review.",
      modelGlbUrl: null,
      asOf: "2026-08-22",
    });
  });

  it("never carries Polycase's product photo", () => {
    expect(JSON.stringify(POLYCASE_RECOMMEND_RESPONSE)).toContain("imageUrl");
    const live = mapRecommendation(POLYCASE_RECOMMEND_RESPONSE);
    expect(JSON.stringify(live)).not.toMatch(/imageUrl|\/media\/|\.jpg/);
  });

  it("picks by rank, not by position", () => {
    const response = structuredClone(POLYCASE_RECOMMEND_RESPONSE) as any;
    response.result.recommendations.reverse();
    expect(mapRecommendation(response)?.partNumber).toBe("SK-14-02");
  });

  it("falls back to the first price break, then to an unknown price", () => {
    const response = structuredClone(POLYCASE_RECOMMEND_RESPONSE) as any;
    response.result.recommendations[0].price.basePriceUsd = null;
    expect(mapRecommendation(response)?.priceUsd).toBe(25.36);
    response.result.recommendations[0].price = null;
    expect(mapRecommendation(response)?.priceUsd).toBeNull();
  });

  it("reads the date from the catalog version when no source carries one", () => {
    const response = structuredClone(POLYCASE_RECOMMEND_RESPONSE) as any;
    response.result.sources = [];
    expect(mapRecommendation(response)?.asOf).toBe("2026-08-22");
  });

  it("only ever links to polycase.com", () => {
    const response = structuredClone(POLYCASE_RECOMMEND_RESPONSE) as any;
    response.result.recommendations[0].productUrl = "https://evil.example/sk-14";
    expect(mapRecommendation(response)?.productUrl).toBe("https://www.polycase.com/catalogsearch/result/?q=SK-14-02");
  });

  it("returns null for anything unusable", () => {
    expect(mapRecommendation(null)).toBeNull();
    expect(mapRecommendation("nope")).toBeNull();
    expect(mapRecommendation({ ok: false, error: "x" })).toBeNull();
    expect(mapRecommendation({ ok: true, result: { recommendations: [] } })).toBeNull();
    expect(mapRecommendation({ ok: true, result: { recommendations: [{ rank: 1, productName: "No number" }] } })).toBeNull();
  });
});

describe("fetchEnclosure", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("sets the model link only after the model loads", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fake = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string | undefined });
      return url.endsWith("/model.glb") ? new Response("glTF", { status: 200 }) : json(POLYCASE_RECOMMEND_RESPONSE);
    };
    const live = await fetchEnclosure("Enclosure for: a box.", fake);
    expect(live?.modelGlbUrl).toBe("https://polycase-mcp.vercel.app/api/models/SK-14-02/model.glb");
    expect(calls[0]).toEqual({
      url: "https://polycase-mcp.vercel.app/api/tools/recommend_enclosure",
      method: "POST",
      body: JSON.stringify({ requirements: "Enclosure for: a box." }),
    });
    // Only the catalog service is ever contacted, never polycase.com.
    expect(calls.every((c) => c.url.startsWith("https://polycase-mcp.vercel.app/"))).toBe(true);
  });

  it("keeps the record but no model when the model route answers 422", async () => {
    const fake = async (url: string) =>
      url.endsWith("/model.glb") ? json({ ok: false }, 422) : json(POLYCASE_RECOMMEND_RESPONSE);
    const live = await fetchEnclosure("x", fake);
    expect(live?.partNumber).toBe("SK-14-02");
    expect(live?.modelGlbUrl).toBeNull();
  });

  it("returns null on a bad status, a thrown error or a bad body", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchEnclosure("x", async () => json({}, 500))).toBeNull();
    expect(await fetchEnclosure("x", async () => { throw new Error("offline"); })).toBeNull();
    expect(await fetchEnclosure("x", async () => new Response("<html>", { status: 200 }))).toBeNull();
    expect(logged).toHaveBeenCalledTimes(2); // the real errors are logged, not thrown
    logged.mockRestore();
  });

  it("encodes part numbers in the model path", () => {
    expect(polycaseModelGlbUrl("ML-44F*15")).toBe("https://polycase-mcp.vercel.app/api/models/ML-44F*15/model.glb");
    expect(polycaseModelGlbUrl("A/B 1")).toBe("https://polycase-mcp.vercel.app/api/models/A%2FB%201/model.glb");
  });
});
