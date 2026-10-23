import dotenv from "dotenv";

dotenv.config();

import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

const parsedUrl = new URL(databaseUrl);

const username = decodeURIComponent(parsedUrl.username);
const password = decodeURIComponent(parsedUrl.password);
const database = decodeURIComponent(parsedUrl.pathname.slice(1));

if (!username || !password || !database) {
  throw new Error(
    "DATABASE_URL must contain a username, password, and database name"
  );
}

const isNeon =
  parsedUrl.hostname.endsWith(".neon.tech") ||
  parsedUrl.hostname.endsWith(".neon.build");

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isNeon ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export async function connectDatabase(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
    console.log("PostgreSQL connected successfully!");
  } finally {
    client.release();
  }
}