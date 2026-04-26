import { _registerPlugin } from "./registry";
import { sheetMetalPlugin } from "./sheet_metal";

// Register each plugin at module load. Future plugins (printed, hardware-assembly)
// follow the same pattern in their own Plan-N PRs.
_registerPlugin(sheetMetalPlugin);
