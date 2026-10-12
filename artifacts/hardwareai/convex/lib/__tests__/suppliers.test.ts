import { describe, it, expect } from "vitest";
import { SUPPLIERS, SUPPLIER_IDS, getSupplier, isSupplierId, mayShowGeometry, supplierLink } from "../suppliers";

describe("supplierLink", () => {
  it("links to the McMaster part page with the part number cleaned up", () => {
    expect(supplierLink("mcmaster", { partNumber: " 91251a-536 " })).toBe("https://www.mcmaster.com/91251A536/");
    expect(supplierLink("mcmaster", { partNumber: "91251A536/../x", query: "ignored" }))
      .toBe("https://www.mcmaster.com/91251A536X/");
  });

  it("falls back to a search when there is no part number", () => {
    expect(supplierLink("mcmaster", { partNumber: null, query: "M4 x 12 socket head screw" }))
      .toBe("https://www.mcmaster.com/M4%20x%2012%20socket%20head%20screw/");
    expect(supplierLink("digikey", { query: "ESP32-C3 module" }))
      .toBe("https://www.digikey.com/en/products/result?keywords=ESP32-C3%20module");
  });

  it("searches when the supplier has no part page, even with a part number", () => {
    expect(supplierLink("polycase", { partNumber: "WC-33", query: "WC-33" }))
      .toBe("https://www.polycase.com/catalogsearch/result/?q=WC-33");
  });

  it("falls back to the homepage when there is nothing to search for", () => {
    expect(supplierLink("mcmaster")).toBe("https://www.mcmaster.com");
    expect(supplierLink("mcmaster", { partNumber: "!!!", query: "  " })).toBe("https://www.mcmaster.com");
    expect(supplierLink("sendcutsend", { query: "bracket" })).toBe("https://sendcutsend.com");
  });

  it("returns an empty link for a supplier with no site", () => {
    expect(supplierLink("print_self", { query: "knob" })).toBe("");
  });
});

describe("supplier registry", () => {
  it("never allows McMaster geometry, and only links to McMaster", () => {
    expect(mayShowGeometry("mcmaster")).toBe(false);
    expect(getSupplier("mcmaster")?.dataAccess).toBe("link_only");
    expect(getSupplier("mcmaster")?.cadPolicy).toBe("none");
  });

  it("allows only a nominal solid for Polycase", () => {
    expect(mayShowGeometry("polycase")).toBe(true);
    expect(getSupplier("polycase")?.cadPolicy).toBe("nominal_from_dimensions");
  });

  it("has unique ids and recognises them", () => {
    expect(new Set(SUPPLIER_IDS).size).toBe(SUPPLIERS.length);
    expect(isSupplierId("lcsc")).toBe(true);
    expect(isSupplierId("amazon")).toBe(false);
  });
});
