import { Router, type IRouter } from "express";
import healthRouter from "./health";
import statsRouter from "./stats";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(statsRouter);
router.use(adminRouter);

export default router;
