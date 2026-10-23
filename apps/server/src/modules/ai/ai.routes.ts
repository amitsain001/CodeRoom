import { Router } from "express";
import { authenticateToken } from "../../middleware/auth.middleware";
import { generateRoomFeedback } from "./ai.controller";
import { getInterviewHistory } from "./ai.history.controller";

const router = Router();

// All AI endpoints require a valid JWT.
router.use(authenticateToken);

// Generate and save an interview report.
router.post(
  "/rooms/:roomId/feedback",
  generateRoomFeedback
);

// Retrieve the authenticated user's interview history.
router.get(
  "/history",
  getInterviewHistory
);

export default router;