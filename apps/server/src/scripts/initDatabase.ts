import fs from "node:fs/promises";
import path from "node:path";

import { pool } from "../config/database";

async function initDatabase(): Promise<void> {
  const client = await pool.connect();

  try {
    // Check whether our application tables already exist.
    const result = await client.query(`
      SELECT
        to_regclass('public.users') AS users,
        to_regclass('public.rooms') AS rooms,
        to_regclass('public.sessions') AS sessions
    `);

    const tables = result.rows[0];

    if (tables.users || tables.rooms || tables.sessions) {
      throw new Error(
        "Some application tables already exist. " +
        "Refusing to recreate the schema."
      );
    }

    // Load the SQL file relative to this script.
    const schemaPath = path.resolve(
      __dirname,
      "../../database/schema.sql"
    );

    const schema = await fs.readFile(schemaPath, "utf8");

    // Create all tables in one transaction.
    await client.query("BEGIN");

    try {
      await client.query(schema);
      await client.query("COMMIT");

      console.log("Database schema created successfully!");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase().catch((error: unknown) => {
  console.error("Database initialization failed:", error);
  process.exitCode = 1;
});
