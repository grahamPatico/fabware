import { describe, it, expect } from "vitest";
// Importing from ".." triggers index.ts which side-effect-loads all archetypes.
import { listArchetypes } from "..";

describe("archetype registry", () => {
  it("has all 6 archetypes registered", () => {
    const ids = listArchetypes().map(a => a.id).sort();
    expect(ids).toEqual([
      "box_with_lid",
      "bracket_plus_panel",
      "divided_tray",
      "hinged_enclosure",
      "shelf_with_brackets",
      "sliding_enclosure",
    ]);
  });
});
