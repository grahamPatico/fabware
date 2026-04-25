// Re-export the public API from registry
export { registerArchetype, listArchetypes, getArchetype } from "./registry";

// Side-effect imports to populate the registry
import "./hingedEnclosure";
import "./boxWithLid";
import "./bracketPlusPanel";
import "./dividedTray";
import "./shelfWithBrackets";
import "./slidingEnclosure";
