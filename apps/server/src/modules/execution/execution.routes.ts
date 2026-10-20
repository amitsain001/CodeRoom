import { Router, Request, Response } from "express";
import {
  executeCode,
  getLanguages,
} from "./judge0.service";

const router = Router();

// GET /api/execution/languages
// Returns the languages supported by our Judge0 provider.
router.get("/languages", async (_req: Request, res: Response) => {
  try {
    const languages = await getLanguages();

    res.status(200).json({
      success: true,
      languages,
    });
  } catch (error) {
    console.error("Failed to fetch Judge0 languages:", error);

    res.status(502).json({
      success: false,
      message: "Unable to fetch supported programming languages.",
    });
  }
});

// POST /api/execution/run
// Submits code to Judge0 and returns its execution result.
router.post("/run", async (req: Request, res: Response) => {
  try {
    const { sourceCode, languageId, stdin = "" } = req.body ?? {};

    // Validate the submitted code.
    if (typeof sourceCode !== "string" || !sourceCode.trim()) {
      res.status(400).json({
        success: false,
        message: "Source code is required.",
      });
      return;
    }

    if (sourceCode.length > 50_000) {
      res.status(413).json({
        success: false,
        message: "Source code must not exceed 50 KB.",
      });
      return;
    }

    if (
      !Number.isInteger(languageId) ||
      languageId <= 0
    ) {
      res.status(400).json({
        success: false,
        message: "A valid language ID is required.",
      });
      return;
    }

    if (typeof stdin !== "string" || stdin.length > 10_000) {
      res.status(400).json({
        success: false,
        message: "Input must be a string no longer than 10 KB.",
      });
      return;
    }

    const result = await executeCode(sourceCode, languageId, stdin);

    res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Code execution request failed:", error);

    res.status(502).json({
      success: false,
      message: "Code execution service is temporarily unavailable.",
    });
  }
});

export default router;