import { Request, Response } from "express";
import { pool } from "../../config/database";
import { generateInterviewFeedback } from "./gemini.service";

// POST /api/ai/rooms/:roomId/feedback
//
// Generate AI feedback for the authenticated candidate's
// interview and save the completed session to PostgreSQL.

export async function generateRoomFeedback(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // 1. Ensure the request is authenticated.
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    // Only candidates may submit their code for evaluation.
    if (req.user.role !== "candidate") {
      res.status(403).json({
        success: false,
        message: "Only candidates can submit code for AI feedback",
      });
      return;
    }

    // 2. Validate the room ID.
    const roomId = req.params.roomId;

    if (
      typeof roomId !== "string" ||
      !/^[1-9]\d*$/.test(roomId)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid room ID",
      });
      return;
    }

    // 3. Validate the request body.
    const {
      submittedCode,
      languageId,
      language,
      durationSeconds,
    } = req.body ?? {};

    if (
      typeof submittedCode !== "string" ||
      !submittedCode.trim()
    ) {
      res.status(400).json({
        success: false,
        message: "Submitted code is required",
      });
      return;
    }

    if (Buffer.byteLength(submittedCode, "utf8") > 50_000) {
      res.status(413).json({
        success: false,
        message: "Submitted code exceeds the 50 KB limit",
      });
      return;
    }

    if (
      !Number.isInteger(languageId) ||
      languageId <= 0
    ) {
      res.status(400).json({
        success: false,
        message: "A valid languageId is required",
      });
      return;
    }

    if (
      typeof language !== "string" ||
      !language.trim() ||
      language.trim().length > 100
    ) {
      res.status(400).json({
        success: false,
        message: "A valid programming language is required",
      });
      return;
    }

    if (
      durationSeconds !== undefined &&
      (
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 0 ||
        durationSeconds > 86_400
      )
    ) {
      res.status(400).json({
        success: false,
        message: "durationSeconds must be an integer between 0 and 86400",
      });
      return;
    }

    // 4. Confirm that this candidate belongs to the room.
    // The database lookup also retrieves the interview question.
    const roomResult = await pool.query(
      `SELECT
         id,
         interviewer_id,
         candidate_id,
         question_title,
         question_description,
         status
       FROM rooms
       WHERE id = $1`,
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Interview room not found",
      });
      return;
    }

    const room = roomResult.rows[0];

    if (String(room.candidate_id) !== req.user.sub) {
      res.status(403).json({
        success: false,
        message: "You are not the candidate assigned to this room",
      });
      return;
    }

    if (
      room.status !== "active" &&
      room.status !== "completed"
    ) {
      res.status(409).json({
        success: false,
        message: "The interview room is not ready for submission",
      });
      return;
    }

    // 5. Prevent duplicate reports for a room.
    // The current schema allows multiple sessions per room,
    // so this check is an application-level safeguard.
    const existingResult = await pool.query(
      `SELECT id
       FROM sessions
       WHERE room_id = $1
       LIMIT 1`,
      [roomId]
    );

    if (existingResult.rows.length > 0) {
      res.status(409).json({
        success: false,
        message: "A report has already been submitted for this room",
      });
      return;
    }

    // 6. Ask Gemini to analyze the solution.
    const aiResult = await generateInterviewFeedback({
      questionTitle: room.question_title,
      questionDescription: room.question_description ?? "",
      submittedCode: submittedCode.trim(),
      language: language.trim(),
    });

    const feedback = aiResult.feedback;

    // Use correctness as the overall score for now.
    // We can introduce a weighted scoring policy later.
    const overallScore = feedback.correctnessScore;

    // 7. Persist the interview report.
    const sessionResult = await pool.query(
      `INSERT INTO sessions (
         room_id,
         submitted_code,
         score,
         feedback,
         duration_seconds,
         started_at,
         completed_at,
         language_id,
         ai_model,
         question_snapshot
       )
       VALUES (
         $1, $2, $3, $4::jsonb, $5,
         NOW(), NOW(), $6, $7, $8
       )
       RETURNING
         id,
         room_id,
         submitted_code,
         score,
         feedback,
         duration_seconds,
         started_at,
         completed_at,
         created_at,
         language_id,
         ai_model,
         question_snapshot`,
      [
        roomId,
        submittedCode.trim(),
        overallScore,
        JSON.stringify(feedback),
        durationSeconds ?? null,
        languageId,
        aiResult.model,
        JSON.stringify({
          title: room.question_title,
          description: room.question_description ?? "",
        }),
      ]
    );

    // 8. Mark the room completed.
    await pool.query(
      `UPDATE rooms
       SET status = 'completed'
       WHERE id = $1
         AND candidate_id = $2`,
      [roomId, req.user.sub]
    );

    res.status(201).json({
      success: true,
      message: "Interview feedback generated successfully",
      data: sessionResult.rows[0],
    });
  } catch (error) {
    console.error("Generate interview feedback error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to generate interview feedback",
    });
  }
}