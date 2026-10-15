import { Request, Response } from "express";
import {
  createRoom as createRoomService,
  joinRoom as joinRoomService,
} from "./room.service";

// POST /api/rooms
// Only interviewers can create rooms.
export async function createRoom(
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

    if (req.user.role !== "interviewer") {
      res.status(403).json({
        success: false,
        message: "Only interviewers can create rooms",
      });
      return;
    }

    const {
      questionTitle,
      questionDescription = "",
    } = req.body ?? {};

    if (
      typeof questionTitle !== "string" ||
      !questionTitle.trim() ||
      questionTitle.trim().length > 255 ||
      typeof questionDescription !== "string"
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid question title and description are required",
      });
      return;
    }

    const room = await createRoomService(
      req.user.sub,
      questionTitle.trim(),
      questionDescription.trim()
    );

    res.status(201).json({
      success: true,
      message: "Room created successfully",
      data: room,
    });
  } catch (error) {
    console.error("Create room error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create room",
    });
  }
}

// POST /api/rooms/:roomId/join
// Only candidates can join rooms.
export async function joinRoom(
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

    if (req.user.role !== "candidate") {
      res.status(403).json({
        success: false,
        message: "Only candidates can join rooms",
      });
      return;
    }

    // Validate the room ID before passing it to the service.
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

    const room = await joinRoomService(
      roomId,
      req.user.sub
    );

    if (!room) {
      res.status(409).json({
        success: false,
        message: "Room is unavailable or already occupied",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Joined room successfully",
      data: room,
    });
  } catch (error) {
    console.error("Join room error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to join room",
    });
  }
}
