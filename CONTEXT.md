# Fabware

Hardware-AI design assistant. The agent turns user intent into manufacturable parts: laser-cut sheet metal, 3D-printed plastic, and McMaster off-the-shelf hardware, joined into assemblies. The system gates each output on validators (geometry, manufacturability, cost) so a buildable BOM falls out of the conversation.

## Language

### Sheet-metal domain

**Part**:
A single manufactured piece — sheet-metal, 3D-printed, or purchased. Has a `kind`, a `role` (unique within a project), a `pose` in the assembly frame, and a kind-specific DSL.
_Avoid_: object, item, component.

**FlatPattern**:
The unfolded 2D shape of a sheet-metal part — outline polyline, holes, slots, tabs, and bend tangent lines, in the part's local frame. What goes to the laser cutter. The flat pattern is the source of truth for DXF, PDF shop drawings, weight, cost, and most validators; the assembled (folded) view is derived from it plus the bend operations.
_Avoid_: blank, layout, template.

**Outline**:
The closed 2D path that defines a sheet-metal part's perimeter (rectangle, polygon, star, circle, regular_polygon). Tabs become notches in the Outline — they're not separate from it.
_Avoid_: profile, silhouette, boundary.

**Feature**:
A modification of a Part's DSL that doesn't change its overall shape: hole, bend, slot, tab, fillet. Each Feature has a `kind` and a `name`.

**Pose**:
A part's 6-DOF placement in the assembly frame: `{ x, y, z, rotX, rotY, rotZ }`. Rotation is intrinsic Euler XYZ in radians. The renderer permutes y↔z to land in three.js Y-up.
_Avoid_: position (only the translation), transform.

**Interface** _(Fabware-specific, not the LANGUAGE.md sense)_:
A connection between two Parts: bolted, weld_seam, weld_joint, hinged, riveted, pem_inserted. Carries `featureRefs` naming the feature on each side and `hardwareRefs` for the McMaster bits the joint needs. **Do not confuse with the architectural Interface** in `LANGUAGE.md`. When the architectural sense is meant, say "module interface" or "the surface a caller sees".

**Archetype**:
A parameterized recipe that emits a Part-list + Interface-list for a common shape (hinged_enclosure, box_with_lid, divided_tray, etc.). Built by a TS function in `convex/archetypes/`.

**Assembly**:
The collection of Parts + Interfaces under one Project. Validated as a whole by `assemblyRules.ts` (per-interface checks) + `intersectRules.ts` (geometric intersection).

### Architecture

See `LANGUAGE.md` (in the `improve-codebase-architecture` skill) for the architectural vocabulary used in deepening conversations: Module / Interface / Implementation / Depth / Seam / Adapter / Leverage / Locality.

## Relationships

- A **Project** has many **Parts** and many fabware-**Interfaces** between them.
- Each sheet-metal **Part** has a **FlatPattern** (computed from its DSL).
- A **FlatPattern** has one **Outline**, zero or more **Holes**, **Slots**, **Tabs**, **Bends**.
- A fabware-**Interface** references zero or more named **Features** on each Part.

## Flagged ambiguities

- "Interface" is overloaded: the fabware sense (a Part-to-Part connection in `interfaces` table) and the architectural sense (a module's caller-visible surface). Prefer "fabware-Interface" or "module Interface" when the context is ambiguous; otherwise the surrounding paragraph disambiguates.
