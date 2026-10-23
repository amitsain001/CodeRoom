import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import {
  describe,
  it,
  expect,
  beforeEach,
  jest,
} from "@jest/globals";

import authRoutes from "./auth.routes";
import {
  registerUser,
  loginUser,
} from "./auth.service";

jest.mock("./auth.service", () => ({
  registerUser: jest.fn(),
  loginUser: jest.fn(),
}));

const app = express();

app.use(express.json());
app.use("/api/auth", authRoutes);

const mockedRegisterUser = jest.mocked(registerUser);
const mockedLoginUser = jest.mocked(loginUser);

describe("Authentication API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    it("registers a user successfully", async () => {
      mockedRegisterUser.mockResolvedValue({
        user: {
          id: "1",
          name: "Test User",
          email: "test@example.com",
          role: "candidate",
        },
        token: "test-token",
      } as Awaited<ReturnType<typeof registerUser>>);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "StrongPassword123!",
          role: "candidate",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        "Registration successful"
      );
      expect(response.body.data.token).toBe("test-token");

      expect(mockedRegisterUser).toHaveBeenCalledWith({
        name: "Test User",
        email: "test@example.com",
        password: "StrongPassword123!",
        role: "candidate",
      });
    });

    it("rejects registration when required fields are missing", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "test@example.com",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(mockedRegisterUser).not.toHaveBeenCalled();
    });

    it("rejects duplicate email addresses", async () => {
      mockedRegisterUser.mockRejectedValue(
        new Error("duplicate key value violates unique constraint")
      );

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test User",
          email: "test@example.com",
          password: "StrongPassword123!",
          role: "candidate",
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "An account with this email already exists"
      );
    });
  });

  describe("POST /api/auth/login", () => {
    it("logs in a user successfully", async () => {
      mockedLoginUser.mockResolvedValue({
        user: {
          id: "1",
          name: "Test User",
          email: "test@example.com",
          role: "candidate",
        },
        token: "test-token",
      } as Awaited<ReturnType<typeof loginUser>>);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "StrongPassword123!",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Login successful");
      expect(response.body.data.token).toBe("test-token");

      expect(mockedLoginUser).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "StrongPassword123!",
      });
    });

    it("rejects invalid credentials", async () => {
      mockedLoginUser.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "WrongPassword123!",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Email or password is incorrect"
      );
    });

    it("rejects login when credentials are missing", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(mockedLoginUser).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/auth/me", () => {
    it("rejects requests without an authentication token", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("returns the authenticated user for a valid token", async () => {
      const originalSecret = process.env.JWT_SECRET;

      process.env.JWT_SECRET =
        "test-secret-with-at-least-32-characters-long";

      try {
        const token = jwt.sign(
          {
            sub: "1",
            role: "candidate",
          },
          process.env.JWT_SECRET,
          {
            expiresIn: "5m",
          }
        );

        const response = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual({
          id: "1",
          role: "candidate",
        });
      } finally {
        if (originalSecret === undefined) {
          delete process.env.JWT_SECRET;
        } else {
          process.env.JWT_SECRET = originalSecret;
        }
      }
    });
  });
});