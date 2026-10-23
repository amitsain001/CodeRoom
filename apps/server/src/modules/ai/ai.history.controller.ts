import { Request, Response } from "express";
import { pool } from "../../config/database";

// GET /api/ai/history
// Candidates see their own interview history.
// Interviewers see interviews conducted in their rooms.

export async function getInterviewHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const userId = req.user.sub;
    const role = req.user.role;

    let query: string;
    let values: string[];

    if (role === "candidate") {
      query = `
        SELECT
          s.id,
          s.room_id,
          s.submitted_code,
          s.score,
          s.feedback,
          s.duration_seconds,
          s.started_at,
          s.completed_at,
          s.created_at,
          s.language_id,
          s.ai_model,
          s.question_snapshot,
          r.question_title,
          r.interviewer_id
        FROM sessions s
        INNER JOIN rooms r ON r.id = s.room_id
        WHERE r.candidate_id = $1
        ORDER BY s.created_at DESC
        LIMIT 100
      `;

      values = [userId];
    } else {
      query = `
        SELECT
          s.id,
          s.room_id,
          s.submitted_code,
          s.score,
          s.feedback,
          s.duration_seconds,
          s.started_at,
          s.completed_at,
          s.created_at,
          s.language_id,
          s.ai_model,
          s.question_snapshot,
          r.question_title,
          r.candidate_id
        FROM sessions s
        INNER JOIN rooms r ON r.id = s.room_id
        WHERE r.interviewer_id = $1
        ORDER BY s.created_at DESC
        LIMIT 100
      `;

      values = [userId];
    }

    const result = await pool.query(query, values);

    res.status(200).json({
      success: true,
      message: "Interview history retrieved successfully",
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get interview history error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve interview history",
    });
  }
}