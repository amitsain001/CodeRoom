import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./database";
import { redis } from "./redis";

interface AuthPayload {
  sub: string;
  role: "candidate" | "interviewer";
}

interface ChatPayload {
  roomId?: unknown;
  message?: unknown;
}

interface CodeChangePayload {
  roomId?: unknown;
  code?: unknown;
}

interface CodeRequestPayload {
  roomId?: unknown;
}

interface Participant {
  userId: string;
  role: "candidate" | "interviewer";
}

interface AckResponse {
  success: boolean;
  message?: string;
  roomId?: string;
  participants?: Participant[];
}

type AckCallback = (result: AckResponse) => void;

function getCodeKey(roomId: string): string {
  return `room:${roomId}:code`;
}

function isValidRoomId(roomId: unknown): roomId is string {
  return typeof roomId === "string" && /^[1-9]\d*$/.test(roomId);
}

function getAck(callback: unknown): AckCallback {
  return typeof callback === "function"
    ? (callback as AckCallback)
    : () => {};
}

export function initializeSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  // Verify the JWT before accepting a socket connection.
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const secret = process.env.JWT_SECRET;

    if (typeof token !== "string" || !secret) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const decoded = jwt.verify(token, secret);

      if (
        typeof decoded === "string" ||
        typeof decoded.sub !== "string" ||
        (decoded.role !== "candidate" && decoded.role !== "interviewer")
      ) {
        next(new Error("Invalid authentication token"));
        return;
      }

      socket.data.user = {
        sub: decoded.sub,
        role: decoded.role,
      } satisfies AuthPayload;

      next();
    } catch {
      next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthPayload;

    console.log(`Socket connected: user ${user.sub}`);

    // Join only an active room assigned to this user.
    socket.on(
      "room:join",
      async (roomId: unknown, callback?: AckCallback) => {
        const reply = getAck(callback);

        if (!isValidRoomId(roomId)) {
          reply({ success: false, message: "Invalid room ID" });
          return;
        }

        const socketRoom = `room:${roomId}`;

        try {
          const result = await pool.query(
            `SELECT id
             FROM rooms
             WHERE id = $1
               AND status = 'active'
               AND (interviewer_id = $2 OR candidate_id = $2)`,
            [roomId, user.sub]
          );

          if (result.rows.length === 0) {
            reply({
              success: false,
              message: "Room not found or access denied",
            });
            return;
          }

          const alreadyJoined = socket.rooms.has(socketRoom);
          await socket.join(socketRoom);

          if (!alreadyJoined) {
            socket.to(socketRoom).emit("room:user-joined", {
              userId: user.sub,
              role: user.role,
            });
          }

          // Restore the saved code for the joining participant.
          const savedCode = await redis.get(getCodeKey(roomId));

          if (savedCode !== null) {
            socket.emit("code:load", { roomId, code: savedCode });
          }

          const sockets = await io.in(socketRoom).fetchSockets();

          const participants: Participant[] = sockets.map((participant) => {
            const participantUser = participant.data.user as AuthPayload;

            return {
              userId: participantUser.sub,
              role: participantUser.role,
            };
          });

          reply({ success: true, roomId, participants });
        } catch (error) {
          console.error("Socket room join error:", error);

          // Clean up if joining did not complete successfully.
          try {
            await socket.leave(socketRoom);
          } catch {
            // Preserve the original error.
          }

          reply({ success: false, message: "Unable to join room" });
        }
      }
    );

    // Return saved code only to a participant who has joined the room.
    socket.on(
      "code:request",
      async (
        payload: CodeRequestPayload,
        callback?: AckCallback
      ) => {
        const reply = getAck(callback);
        const roomId = payload?.roomId;

        if (!isValidRoomId(roomId)) {
          reply({ success: false, message: "Invalid room ID" });
          return;
        }

        if (!socket.rooms.has(`room:${roomId}`)) {
          reply({
            success: false,
            message: "Join the room before requesting code",
          });
          return;
        }

        try {
          const savedCode = await redis.get(getCodeKey(roomId));

          if (savedCode !== null) {
            socket.emit("code:load", { roomId, code: savedCode });
          }

          reply({ success: true });
        } catch (error) {
          console.error("Failed to load editor code:", error);
          reply({ success: false, message: "Unable to load saved code" });
        }
      }
    );

    // Leave a room explicitly.
    socket.on("room:leave", async (roomId: unknown) => {
      if (!isValidRoomId(roomId)) return;

      const socketRoom = `room:${roomId}`;

      if (socket.rooms.has(socketRoom)) {
        try {
          await socket.leave(socketRoom);

          socket.to(socketRoom).emit("room:user-left", {
            userId: user.sub,
            role: user.role,
          });
        } catch (error) {
          console.error("Socket room leave error:", error);
        }
      }
    });

    // Send chat messages to participants in the same room.
    socket.on(
      "chat:send",
      (
        payload: ChatPayload,
        callback?: AckCallback
      ) => {
        const reply = getAck(callback);
        const { roomId, message } = payload ?? {};

        if (!isValidRoomId(roomId)) {
          reply({ success: false, message: "Invalid room ID" });
          return;
        }

        if (
          typeof message !== "string" ||
          !message.trim() ||
          message.trim().length > 1000
        ) {
          reply({
            success: false,
            message: "Message must contain 1–1000 characters",
          });
          return;
        }

        const socketRoom = `room:${roomId}`;

        if (!socket.rooms.has(socketRoom)) {
          reply({
            success: false,
            message: "Join the room before sending messages",
          });
          return;
        }

        io.to(socketRoom).emit("chat:message", {
          roomId,
          userId: user.sub,
          role: user.role,
          message: message.trim(),
          sentAt: new Date().toISOString(),
        });

        reply({ success: true });
      }
    );

    // Save code to Redis, then send it to the other participants.
    socket.on(
      "code:change",
      async (payload: CodeChangePayload) => {
        const { roomId, code } = payload ?? {};

        if (!isValidRoomId(roomId)) return;

        if (
          typeof code !== "string" ||
          Buffer.byteLength(code, "utf8") > 100_000
        ) {
          socket.emit("code:save-error", {
            roomId,
            message: "Code must not exceed 100 KB",
          });
          return;
        }

        const socketRoom = `room:${roomId}`;

        if (!socket.rooms.has(socketRoom)) return;

        try {
          await redis.set(getCodeKey(roomId), code);

          socket.to(socketRoom).emit("code:update", {
            roomId,
            code,
            updatedBy: user.sub,
          });
        } catch (error) {
          console.error("Failed to save editor code:", error);

          socket.emit("code:save-error", {
            roomId,
            message: "Unable to save code. Please try again.",
          });
        }
      }
    );

    // Notify other participants when this socket leaves or disconnects.
    socket.on("disconnecting", () => {
      for (const socketRoom of socket.rooms) {
        if (socketRoom.startsWith("room:")) {
          socket.to(socketRoom).emit("room:user-left", {
            userId: user.sub,
            role: user.role,
          });
        }
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: user ${user.sub}`);
    });
  });

  return io;
}