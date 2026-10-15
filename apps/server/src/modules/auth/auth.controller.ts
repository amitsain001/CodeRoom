import { Request, Response } from "express";
import { registerUser, loginUser } from "./auth.service";

export async function register(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { name, email, password, role } = req.body ?? {};

    // Reject requests with missing or incorrectly typed fields.
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      (role !== undefined && typeof role !== "string")
    ) {
      res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
      return;
    }

    const result = await registerUser({
      name,
      email,
      password,
      role,
    });

    res.status(201).json({
      success: true,
      message: "Registration successful",
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registration failed";

    if (message.includes("duplicate key")) {
      res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
      return;
    }

    if (
      message.includes("required") ||
      message.includes("valid email") ||
      message.includes("Password") ||
      message.includes("characters") ||
      message.includes("Interviewer accounts")
    ) {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    console.error("Registration error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to register user",
    });
  }
}


// Handle POST /api/auth/login
export async function login(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { email, password } = req.body ?? {};

    // Check that both fields are strings.
    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    const result = await loginUser({ email, password });

    // Wrong email or password.
    if (!result) {
      res.status(401).json({
        success: false,
        message: "Email or password is incorrect",
      });
      return;
    }

    // Login successful.
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    // Log the internal error, but don't expose database details.
    console.error("Login error:", error);

    if (
      error instanceof Error &&
      error.message === "Please provide a valid email address"
    ) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Unable to log in right now",
    });
  }
}

// Add this function below your existing controller functions.
export function getMe(req: Request, res: Response): void {
  // The middleware adds req.user after validating the JWT.
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: "Authenticated user retrieved successfully",
    data: {
      id: req.user.sub,
      role: req.user.role,
    },
  });
}

