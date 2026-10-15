
import { Router } from "express";
import {
  register,
  login,
  getMe,
} from "./auth.controller";
import { authenticateToken } from "../../middleware/auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);

// Only authenticated users can access this endpoint.
router.get("/me", authenticateToken, getMe);

export default router;
