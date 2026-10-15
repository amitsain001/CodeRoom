import { pool } from "../../config/database";

// Create a new interview room.
export async function createRoom(
  interviewerId: string,
  questionTitle: string,
  questionDescription: string
) {
  const result = await pool.query(
    `INSERT INTO rooms (
       interviewer_id,
       question_title,
       question_description,
       status
     )
     VALUES ($1, $2, $3, 'waiting')
     RETURNING
       id,
       interviewer_id,
       candidate_id,
       question_title,
       question_description,
       status,
       created_at`,
    [
      interviewerId,
      questionTitle,
      questionDescription || null,
    ]
  );

  return result.rows[0];
}

// Allow a candidate to join an available room.
export async function joinRoom(
  roomId: string,
  candidateId: string
) {
  // The conditional UPDATE prevents two different candidates
  // from claiming the same waiting room simultaneously.
  const result = await pool.query(
    `UPDATE rooms
     SET candidate_id = $2,
         status = 'active'
     WHERE id = $1
       AND status = 'waiting'
       AND candidate_id IS NULL
       AND interviewer_id <> $2
     RETURNING
       id,
       interviewer_id,
       candidate_id,
       question_title,
       question_description,
       status,
       created_at`,
    [roomId, candidateId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}
