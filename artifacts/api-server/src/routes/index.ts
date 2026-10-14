import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import dashboardRouter from "./dashboard";
import healthRouter from "./health";
import leadAuthorityRouter from "./lead-authority";
import leadEvidenceRouter from "./lead-evidence";
import jobsRouter from "./jobs";
import leadsRouter from "./leads";
import {
  clientServiceRequestsOperatorRouter,
  publicClientServiceRequestsRouter,
} from "./client-service-requests";
import sourceCollectionRouter from "./source-collection";
import sourcesRouter from "./sources";
import workersRouter from "./workers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicClientServiceRequestsRouter);
router.use(requireAuth);
router.use(dashboardRouter);
router.use(leadsRouter);
router.use(leadAuthorityRouter);
router.use(leadEvidenceRouter);
router.use(sourcesRouter);
router.use(sourceCollectionRouter);
router.use(clientServiceRequestsOperatorRouter);
router.use(workersRouter);
router.use(jobsRouter);

export default router;
