import { describe, it, expect } from "vitest";
// Side-effect imports — each module calls registerArchetype on load.
import "../hingedEnclosure";
import "../boxWithLid";
import "../bracketPlusPanel";
import "../dividedTray";
import "../shelfWithBrackets";
import "../slidingEnclosure";
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
