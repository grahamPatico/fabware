import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import chatRouter from "./chat";
import partsRouter from "./parts";
import revisionsRouter from "./revisions";
import materialsRouter from "./materials";
import assemblyPartsRouter from "./assemblyParts";
import fdmRouter from "./fdm";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(chatRouter);
router.use(partsRouter);
router.use(revisionsRouter);
router.use(materialsRouter);
router.use(assemblyPartsRouter);
router.use(fdmRouter);

export default router;
