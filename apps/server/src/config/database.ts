import dotenv from "dotenv";

// Load the backend environment variables before reading them.
dotenv.config();

import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

const parsedUrl = new URL(databaseUrl);

const username = decodeURIComponent(parsedUrl.username);
const password = decodeURIComponent(parsedUrl.password);
const database = decodeURIComponent(
  parsedUrl.pathname.slice(1)
);

if (!password) {
  throw new Error(
    "PostgreSQL password is missing from DATABASE_URL"
  );
}

console.log("PostgreSQL configuration:", {
  host: parsedUrl.hostname,
  port: parsedUrl.port,
  database,
  usernamePresent: Boolean(username),
  passwordPresent: Boolean(password),
  passwordType: typeof password
});

export const pool = new Pool({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port) || 5432,
  database,
  user: username,
  password
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error.message);
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
