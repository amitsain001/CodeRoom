import dotenv from "dotenv";

// Load environment variables before initializing dependencies.
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import { createServer } from "http";

import authRoutes from "./modules/auth/auth.routes";
import roomRoutes from "./modules/rooms/room.routes";
import { initializeSocket } from "./config/socket";
import { connectDatabase, pool } from "./config/database";
import executionRoutes from "./modules/execution/execution.routes";
import { redis } from "./config/redis";
import aiRoutes from "./modules/ai/ai.routes";

const app = express();

// Create one HTTP server shared by Express and Socket.IO.
const httpServer = createServer(app);
const io = initializeSocket(httpServer);

const PORT = Number(process.env.PORT) || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health-check endpoint
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    const redisStatus = await redis.ping();

    res.status(200).json({
      success: true,
      message: "CodeRoom backend is running!",
      services: {
        postgres: "connected",
        redis: redisStatus === "PONG" ? "connected" : "unavailable",
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      message: "A required service is unavailable.",
    });
  }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/execution", executionRoutes);
// New Phase 4 route.
app.use("/api/ai", aiRoutes);

// Connect dependencies before accepting requests.
async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await redis.ping();

    // Start the same HTTP server used by Socket.IO.
    httpServer.listen(PORT, () => {
      console.log(`CodeRoom server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start CodeRoom:", error);

    await redis.quit().catch(() => {});
    await pool.end().catch(() => {});

    process.exitCode = 1;
  }
}

void startServer();
