// Supplier registry for the production journey. Pure data — imported by both
// Convex functions and the React client.
//
// Each entry states how fabware is allowed to use the supplier's data and CAD.
// These rules come from the suppliers' published terms (checked 2026-10-12);
// change `cadPolicy` only after re-reading the terms or getting permission in
// writing.

export type SupplierId =
  | "mcmaster"
  | "polycase"
  | "sendcutsend"
  | "step_parts"
  | "print_self"
  | "jlc3dp"
  | "craftcloud"
  | "jlcpcb"
  | "oshpark"
  | "pcbway"
  | "digikey"
  | "mouser"
  | "lcsc";

export type SupplierCategory =
  | "hardware"
  | "enclosure"
  | "sheet_metal"
  | "printing"
  | "pcb"
  | "components";

/**
 * How fabware reads the supplier's catalog.
 * - "link_only": no data is fetched; fabware only builds links to their site.
 * - "official_feed": a feed the supplier publishes for this purpose.
 * - "catalog_api": a third-party or open catalog API.
 */
export type DataAccess = "link_only" | "official_feed" | "catalog_api";

/**
 * What 3D geometry fabware may show for the supplier's parts.
 * - "none": never download, store or render their CAD. Link out.
 * - "nominal_from_dimensions": a simplified solid fabware builds from the
 *   published dimensions. Never the supplier's own files.
 * - "open_models": models published for reuse; show them with attribution.
 * - "user_geometry": the geometry is the user's own design.
 */
export type CadPolicy = "none" | "nominal_from_dimensions" | "open_models" | "user_geometry";

export interface Supplier {
  id: SupplierId;
  name: string;
  category: SupplierCategory;
  /** One line on what to buy here. */
  bestFor: string;
  homepage: string;
  /** Search link with `{q}` replaced by the URL-encoded query; null when the site has no usable search link. */
  searchUrlTemplate: string | null;
  /** Direct part link with `{pn}` replaced by the cleaned part number. */
  partUrlTemplate: string | null;
  dataAccess: DataAccess;
  cadPolicy: CadPolicy;
  /** Plain statement of the rule, shown to users next to the supplier. */
  cadNote: string;
  /** Where the rule comes from. */
  termsUrl: string | null;
}

export const SUPPLIERS: readonly Supplier[] = [
  {
    id: "mcmaster",
    name: "McMaster-Carr",
    category: "hardware",
    bestFor: "Fasteners, hinges, latches, seals, bearings and raw stock, shipped fast.",
    homepage: "https://www.mcmaster.com",
    searchUrlTemplate: "https://www.mcmaster.com/{q}/",
    partUrlTemplate: "https://www.mcmaster.com/{pn}/",
    dataAccess: "link_only",
    cadPolicy: "none",
    cadNote:
      "McMaster's terms allow its CAD models only for deciding whether to buy from McMaster. " +
      "They forbid copying, keeping or sharing the models, automated access to the site, and AI training. " +
      "Fabware links to the McMaster page by part number and never downloads, stores or shows McMaster CAD.",
    termsUrl: "https://www.mcmaster.com/termsandconditions",
  },
  {
    id: "polycase",
    name: "Polycase",
    category: "enclosure",
    bestFor: "Off-the-shelf plastic and metal electronics enclosures, with machining and printing.",
    homepage: "https://www.polycase.com",
    searchUrlTemplate: "https://www.polycase.com/catalogsearch/result/?q={q}",
    partUrlTemplate: null,
    dataAccess: "catalog_api",
    cadPolicy: "nominal_from_dimensions",
    cadNote:
      "Polycase publishes STEP files and drawings so you can design around its enclosures, " +
      "but states no license to redistribute them. Fabware shows a simplified box built from " +
      "Polycase's published dimensions and links to Polycase for the official files. It does not host them.",
    termsUrl: "https://www.polycase.com/terms-conditions",
  },
  {
    id: "sendcutsend",
    name: "SendCutSend",
    category: "sheet_metal",
    bestFor: "Laser-cut and bent sheet metal, plus tapping, hardware insertion and powder coat.",
    homepage: "https://sendcutsend.com",
    searchUrlTemplate: null,
    partUrlTemplate: null,
    dataAccess: "official_feed",
    cadPolicy: "user_geometry",
    cadNote:
      "Fabware reads SendCutSend's public material and design-rule feeds to check your parts. " +
      "The geometry you upload to SendCutSend is your own design.",
    termsUrl: null,
  },
  {
    id: "step_parts",
    name: "step.parts",
    category: "hardware",
    bestFor: "Open 3D models of standard fasteners, bearings, motors and dev boards for layout.",
    homepage: "https://www.step.parts",
    searchUrlTemplate: "https://www.step.parts/?q={q}",
    partUrlTemplate: "https://www.step.parts/parts/{pn}",
    dataAccess: "catalog_api",
    cadPolicy: "open_models",
    cadNote:
      "step.parts is an open catalog of STEP models with a source link on each part. " +
      "Fabware shows these models for layout and links to the part's page. It is not a store: buy the part from a supplier.",
    termsUrl: "https://github.com/earthtojake/step.parts",
  },
  {
    id: "print_self",
    name: "Your own 3D printer",
    category: "printing",
    bestFor: "Fast, cheap iterations in PLA or PETG when you have a printer.",
    homepage: "",
    searchUrlTemplate: null,
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "user_geometry",
    cadNote: "You print your own design from the STL fabware exports.",
    termsUrl: null,
  },
  {
    id: "jlc3dp",
    name: "JLC3DP",
    category: "printing",
    bestFor: "Low-cost printed parts in resin, nylon (MJF/SLS) and metal, shipped from China.",
    homepage: "https://jlc3dp.com",
    searchUrlTemplate: null,
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "user_geometry",
    cadNote: "You upload your own STL or STEP. Fabware does not read JLC3DP data.",
    termsUrl: null,
  },
  {
    id: "craftcloud",
    name: "Craftcloud",
    category: "printing",
    bestFor: "Comparing quotes from many 3D print shops for one upload.",
    homepage: "https://craftcloud3d.com",
    searchUrlTemplate: null,
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "user_geometry",
    cadNote: "You upload your own STL or STEP. Fabware does not read Craftcloud data.",
    termsUrl: null,
  },
  {
    id: "jlcpcb",
    name: "JLCPCB",
    category: "pcb",
    bestFor: "Cheap, fast prototype boards and assembly from the LCSC parts library.",
    homepage: "https://jlcpcb.com",
    searchUrlTemplate: "https://jlcpcb.com/parts/componentSearch?searchTxt={q}",
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "user_geometry",
    cadNote: "You upload your own Gerbers. Fabware does not read JLCPCB data.",
    termsUrl: null,
  },
  {
    id: "oshpark",
    name: "OSH Park",
    category: "pcb",
    bestFor: "Small US-made prototype boards, sold in threes, with good default quality.",
    homepage: "https://oshpark.com",
    searchUrlTemplate: null,
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "user_geometry",
    cadNote: "You upload your own board file. Fabware does not read OSH Park data.",
    termsUrl: null,
  },
  {
    id: "pcbway",
    name: "PCBWay",
    category: "pcb",
    bestFor: "Boards with unusual stackups, flex, or larger assembly runs.",
    homepage: "https://www.pcbway.com",
    searchUrlTemplate: null,
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "user_geometry",
    cadNote: "You upload your own Gerbers. Fabware does not read PCBWay data.",
    termsUrl: null,
  },
  {
    id: "digikey",
    name: "DigiKey",
    category: "components",
    bestFor: "Electronic components with deep stock, datasheets and parametric search.",
    homepage: "https://www.digikey.com",
    searchUrlTemplate: "https://www.digikey.com/en/products/result?keywords={q}",
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "none",
    cadNote: "Fabware links to DigiKey search results. It does not copy DigiKey data or models.",
    termsUrl: null,
  },
  {
    id: "mouser",
    name: "Mouser",
    category: "components",
    bestFor: "Electronic components, a second source when DigiKey is out of stock.",
    homepage: "https://www.mouser.com",
    searchUrlTemplate: "https://www.mouser.com/c/?q={q}",
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "none",
    cadNote: "Fabware links to Mouser search results. It does not copy Mouser data or models.",
    termsUrl: null,
  },
  {
    id: "lcsc",
    name: "LCSC",
    category: "components",
    bestFor: "Low-cost components that JLCPCB can place for you during assembly.",
    homepage: "https://www.lcsc.com",
    searchUrlTemplate: "https://www.lcsc.com/search?q={q}",
    partUrlTemplate: null,
    dataAccess: "link_only",
    cadPolicy: "none",
    cadNote: "Fabware links to LCSC search results. It does not copy LCSC data or models.",
    termsUrl: null,
  },
];

export const SUPPLIER_IDS: readonly SupplierId[] = SUPPLIERS.map((s) => s.id);

export function getSupplier(id: string): Supplier | undefined {
  return SUPPLIERS.find((s) => s.id === id);
}

export function isSupplierId(value: string): value is SupplierId {
  return getSupplier(value) !== undefined;
}

/** True when fabware may show 3D geometry for this supplier's parts. */
export function mayShowGeometry(id: SupplierId): boolean {
  const policy = getSupplier(id)?.cadPolicy;
  return policy !== undefined && policy !== "none";
}

function cleanPartNumber(partNumber: string): string {
  return partNumber.trim().replace(/[^A-Za-z0-9_\-]/g, "");
}

/**
 * The best link for a sourcing line: the part page when the supplier has one
 * and a part number is known, else a search for `query`, else the homepage.
 * Returns "" for suppliers with no site (your own printer).
 */
export function supplierLink(
  id: SupplierId,
  opts: { partNumber?: string | null; query?: string | null } = {},
): string {
  const supplier = getSupplier(id);
  if (!supplier) return "";
  const pn = opts.partNumber ? cleanPartNumber(opts.partNumber) : "";
  if (pn && supplier.partUrlTemplate) {
    // McMaster part numbers are upper-case alphanumerics only.
    const value = id === "mcmaster" ? pn.toUpperCase().replace(/[^A-Z0-9]/g, "") : pn;
    if (value) return supplier.partUrlTemplate.replace("{pn}", encodeURIComponent(value));
  }
  const query = (opts.query ?? "").trim();
  if (query && supplier.searchUrlTemplate) {
    return supplier.searchUrlTemplate.replace("{q}", encodeURIComponent(query));
  }
  return supplier.homepage;
}
