import { _registerPlugin } from "./registry";
import { sheetMetalPlugin } from "./sheet_metal";
import { cadIrPlugin } from "../cad/plugin";

// Register each plugin at module load. Future plugins (printed, hardware-assembly)
// follow the same pattern in their own Plan-N PRs.
_registerPlugin(sheetMetalPlugin);
_registerPlugin(cadIrPlugin);
