import { Router } from "express";
import {
  createRoom,
  joinRoom,
} from "./room.controller";
import { authenticateToken } from "../../middleware/auth.middleware";

const router = Router();

// All room routes require a valid JWT.
router.use(authenticateToken);

// Interviewer creates a room.
router.post("/", createRoom);

// Candidate joins a room using its ID.
router.post("/:roomId/join", joinRoom);

export default router;
