import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, materialsTable, thicknessesTable } from "@workspace/db";
import { GetMaterialThicknessesParams } from "@workspace/api-zod";

const router = Router();

router.get("/materials", async (req, res): Promise<void> => {
  const materials = await db.select().from(materialsTable).orderBy(materialsTable.name);
  res.json(materials);
});

router.get("/materials/:id/thicknesses", async (req, res): Promise<void> => {
  const parsed = GetMaterialThicknessesParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const thicknesses = await db
    .select()
    .from(thicknessesTable)
    .where(eq(thicknessesTable.materialId, parsed.data.id))
    .orderBy(thicknessesTable.inches);
  res.json(thicknesses);
});

router.get("/capabilities", async (req, res): Promise<void> => {
  res.json({
    cutting: {
      method: "Fiber Laser Cutting",
      maxWidth: 60,
      maxHeight: 120,
      minFeatureSize: 0.02,
    },
    bending: {
      maxLength: 96,
      minFlange: 0.375,
      tolerances: "+/- 1 degree bend angle, +/- 0.005\" flange length",
    },
    finishing: [
      "Powder Coat (150+ colors)",
      "Anodizing (aluminum only)",
      "Tumbling",
      "Deburring",
      "Tapping",
    ],
    fileFormats: ["DXF", "SVG", "AI", "PDF", "DWG"],
    uploadUrl: "https://sendcutsend.com/upload",
    turnaround: "Standard: 3-5 business days. Rush: 1-2 business days.",
  });
});

export default router;
