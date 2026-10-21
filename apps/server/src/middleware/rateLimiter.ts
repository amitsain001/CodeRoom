import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";

const RATE_LIMIT = 5;
const WINDOW_SECONDS = 60;

export async function executionRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Use the authenticated user's ID as the rate-limit identity.
    const userId = req.user?.sub;

    // Never allow unidentified users through this middleware.
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    // Include the user ID in the Redis key.
    const key = `rate-limit:execution:user:${userId}`;

    // Increment this user's request counter.
    const requestCount = await redis.incr(key);

    // Start the 60-second expiration when the key is created.
    if (requestCount === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    const ttl = await redis.ttl(key);

    res.setHeader("X-RateLimit-Limit", RATE_LIMIT);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, RATE_LIMIT - requestCount),
    );

    if (requestCount > RATE_LIMIT) {
      res.setHeader("Retry-After", Math.max(1, ttl));

      res.status(429).json({
        success: false,
        message: "Too many code execution requests. Please try again shortly.",
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Execution rate limiter failed:", error);

    // Fail closed if Redis cannot enforce the limit.
    res.status(503).json({
      success: false,
      message: "Code execution is temporarily unavailable.",
    });
  }
}