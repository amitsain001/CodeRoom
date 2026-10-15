import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// The information we expect inside our JWT payload.
export interface AuthPayload {
  sub: string;
  role: "candidate" | "interviewer";
}

// Extend Express Request so protected routes can access
// the authenticated user's ID and role.
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Read the Authorization header.
  const authHeader = req.headers.authorization;

  // Expected format: Bearer <token>
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
    return;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    res.status(500).json({
      success: false,
      message: "Authentication configuration error",
    });
    return;
  }

  try {
    // Verify signature and expiry before trusting the payload.
    const decoded = jwt.verify(token, secret);

    if (
      typeof decoded === "string" ||
      typeof decoded.sub !== "string" ||
      (decoded.role !== "candidate" &&
        decoded.role !== "interviewer")
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
      return;
    }

    // Make the authenticated identity available to the route.
    req.user = {
      sub: decoded.sub,
      role: decoded.role,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
}
