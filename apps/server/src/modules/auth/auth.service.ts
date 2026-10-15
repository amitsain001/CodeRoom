import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../../config/database";

// Data received from the registration request.
interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role?: "candidate" | "interviewer";
}

// Keep the JWT secret outside the source code.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  return secret;
}

export async function registerUser(input: RegisterInput) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  // Validate basic input before querying the database.
  if (!name || name.length > 100) {
    throw new Error("Name is required and must be at most 100 characters");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new Error("Please provide a valid email address");
  }

  // bcrypt has a 72-byte password input limit.
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error("Password must be at least 8 characters and at most 72 UTF-8 bytes");
  }

  // Public registration creates candidates only.
  // Interviewer accounts must be provisioned through a trusted process.
  if (input.role !== undefined && input.role !== "candidate") {
    throw new Error("Interviewer accounts cannot be created through public registration");
  }

  const role = "candidate" as const;

  // Hash the password; never save the original password.
  const passwordHash = await bcrypt.hash(password, 12);

  // Parameterized SQL prevents user input from becoming SQL syntax.
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, passwordHash, role]
  );

  const user = result.rows[0];

  // Create an access token containing only necessary identity claims.
  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    getJwtSecret(),
    { expiresIn: "15m" }
  );

  return { user, token };
}


export async function loginUser(input: {
  email: string;
  password: string;
}) {
  // Normalize the email so uppercase/lowercase differences don't matter.
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  // Basic input validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new Error("Please provide a valid email address");
  }

  if (!password || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Email or password is incorrect");
  }

  // Find the account using its email.
  const result = await pool.query(
    `SELECT id, name, email, password_hash, role
     FROM users
     WHERE email = $1`,
    [email]
  );

  const user = result.rows[0];

  // Return the same error for an unknown email or wrong password.
  // This avoids revealing whether an account exists.
  if (!user) {
    return null;
  }

  // Compare the entered password with the stored bcrypt hash.
  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    return null;
  }

  // Create a fresh JWT after successful authentication.
  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    getJwtSecret(),
    { expiresIn: "15m" }
  );

  // Never send password_hash back to the client.
  return {
    user: {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  };
}

