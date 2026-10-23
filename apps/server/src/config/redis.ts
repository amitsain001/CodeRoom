import Redis from "ioredis";

// Use the hosted Upstash Redis URL when configured.
// Fall back to local Redis during local development.
const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, {
      tls: {},
      retryStrategy: (times) => Math.min(times * 500, 3000),
      maxRetriesPerRequest: 3,
    })
  : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
      retryStrategy: (times) => Math.min(times * 500, 3000),
      maxRetriesPerRequest: 3,
    });

redis.on("connect", () => {
  console.log("Redis connected successfully!");
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});