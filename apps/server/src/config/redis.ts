import Redis from "ioredis";

// Create a Redis client using our environment variables.
export const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,

  // Retry connections with a short delay.
  retryStrategy: (times) => Math.min(times * 500, 3000),
});

// Log successful connection events.
redis.on("connect", () => {
  console.log("Redis connected successfully!");
});

// Log Redis connection errors.
redis.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});