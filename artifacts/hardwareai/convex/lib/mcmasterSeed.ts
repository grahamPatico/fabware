// Curated seed lookup of common McMaster-Carr parts so the AI designer can
// suggest real part numbers without calling out. Values are hand-verified
// catalog entries as of 2026-04; treat as advisory, not authoritative.

export interface SeedPart {
  partNumber: string;
  name: string;
  category: string;
  keywords: string[];
  description: string;
}

export const MCMASTER_SEED: SeedPart[] = [
  // ----- Socket-head cap screws (SHCS), alloy steel, plain -----
  {
    partNumber: "91251A536",
    name: "1/4\"-20 × 1/2\" SHCS, alloy steel",
    category: "fastener",
    keywords: ["shcs", "socket head", "1/4-20", "quarter inch", "cap screw"],
    description: "Black-oxide alloy-steel socket-head cap screw, 1/4\"-20, 1/2\" long.",
  },
  {
    partNumber: "91251A540",
    name: "1/4\"-20 × 1\" SHCS, alloy steel",
    category: "fastener",
    keywords: ["shcs", "socket head", "1/4-20", "quarter inch", "cap screw"],
    description: "Black-oxide alloy-steel socket-head cap screw, 1/4\"-20, 1\" long.",
  },
  {
    partNumber: "91251A194",
    name: "M5 × 10 mm SHCS, alloy steel",
    category: "fastener",
    keywords: ["shcs", "socket head", "m5", "metric", "cap screw"],
    description: "Black-oxide alloy-steel socket-head cap screw, M5 × 10 mm.",
  },
  {
    partNumber: "91251A196",
    name: "M5 × 16 mm SHCS, alloy steel",
    category: "fastener",
    keywords: ["shcs", "socket head", "m5", "metric", "cap screw"],
    description: "Black-oxide alloy-steel socket-head cap screw, M5 × 16 mm.",
  },

  // ----- Button-head cap screws -----
  {
    partNumber: "92949A148",
    name: "#8-32 × 1/2\" button-head, alloy steel",
    category: "fastener",
    keywords: ["button head", "#8-32", "8-32", "cap screw", "low profile"],
    description: "Low-profile black-oxide button-head cap screw, #8-32, 1/2\" long.",
  },

  // ----- Hex nuts -----
  {
    partNumber: "90480A029",
    name: "1/4\"-20 hex nut, steel, zinc-plated",
    category: "nut",
    keywords: ["hex nut", "1/4-20", "quarter inch"],
    description: "Zinc-plated grade-2 steel hex nut, 1/4\"-20.",
  },
  {
    partNumber: "90591A153",
    name: "M5 hex nut, steel, zinc-plated",
    category: "nut",
    keywords: ["hex nut", "m5", "metric"],
    description: "Zinc-plated class-8 steel hex nut, M5 × 0.8 mm.",
  },

  // ----- Nylon-insert locknuts -----
  {
    partNumber: "90631A029",
    name: "1/4\"-20 nylon-insert locknut, steel, zinc",
    category: "nut",
    keywords: ["locknut", "nyloc", "1/4-20", "quarter inch"],
    description: "Steel nylon-insert locknut, 1/4\"-20, zinc-plated.",
  },

  // ----- Washers -----
  {
    partNumber: "92141A029",
    name: "1/4\" flat washer, steel, zinc",
    category: "washer",
    keywords: ["washer", "flat washer", "1/4", "quarter inch"],
    description: "Zinc-plated steel flat washer for 1/4\" screws.",
  },
  {
    partNumber: "91131A155",
    name: "M5 flat washer, steel, zinc",
    category: "washer",
    keywords: ["washer", "flat washer", "m5", "metric"],
    description: "Zinc-plated steel flat washer for M5 screws.",
  },

  // ----- Threaded inserts -----
  {
    partNumber: "92395A111",
    name: "1/4\"-20 press-fit threaded insert for sheet metal",
    category: "insert",
    keywords: ["press fit", "pem", "threaded insert", "1/4-20", "sheet metal"],
    description: "Self-clinching press-fit threaded insert for 1/4\"-20 screws, installs in sheet metal.",
  },

  // ----- Ball bearings -----
  {
    partNumber: "6383K21",
    name: "608-2RS skateboard bearing, 8 mm ID × 22 mm OD",
    category: "bearing",
    keywords: ["bearing", "608", "skate", "8mm", "22mm"],
    description: "Sealed deep-groove ball bearing, 8 mm bore, 22 mm OD, 7 mm wide.",
  },

  // ----- 80/20 style aluminum extrusion -----
  {
    partNumber: "47065T101",
    name: "1\" × 1\" T-slotted aluminum extrusion, 1\" long (cut to length)",
    category: "extrusion",
    keywords: ["extrusion", "80/20", "t-slot", "aluminum", "1 inch"],
    description: "T-slotted 6105-T5 aluminum extrusion, single-rail 1\"×1\" profile. Sold per length.",
  },

  // ----- Compression springs -----
  {
    partNumber: "9657K311",
    name: "Compression spring, 0.360\" OD × 1\" free length",
    category: "spring",
    keywords: ["compression spring", "spring"],
    description: "Music-wire compression spring, 0.360\" OD, 1\" free length, ~2 lb/in rate.",
  },

  // ----- Magnets -----
  {
    partNumber: "5862K105",
    name: "Neodymium disc magnet, 1/4\" dia × 1/8\" thick",
    category: "magnet",
    keywords: ["magnet", "neodymium", "neo", "disc"],
    description: "N42 neodymium disc magnet, 1/4\" diameter, 1/8\" thick.",
  },
];

export function findSeedPart(query: string): SeedPart | undefined {
  const q = query.toLowerCase();
  return MCMASTER_SEED.find(
    (p) =>
      p.partNumber.toLowerCase() === q ||
      p.name.toLowerCase().includes(q) ||
      p.keywords.some((k) => q.includes(k)),
  );
}

export function lookupSeedPart(partNumber: string): SeedPart | undefined {
  const clean = partNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return MCMASTER_SEED.find(
    (p) => p.partNumber.toUpperCase().replace(/[^A-Z0-9]/g, "") === clean,
  );
}
