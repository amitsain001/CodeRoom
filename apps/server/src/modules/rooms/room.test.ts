import express from "express";
import request from "supertest";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  jest,
} from "@jest/globals";

import roomRoutes from "./room.routes";
import {
  createRoom as createRoomService,
  joinRoom as joinRoomService,
} from "./room.service";

jest.mock("./room.service", () => ({
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
}));

const app = express();

app.use(express.json());
app.use("/api/rooms", roomRoutes);

const mockedCreateRoom = jest.mocked(createRoomService);
const mockedJoinRoom = jest.mocked(joinRoomService);

const interviewerToken =
  "interviewer-test-token";

const candidateToken =
  "candidate-test-token";

const room = {
  id: "1",
  interviewer_id: "10",
  candidate_id: null,
  question_title: "Two Sum",
  question_description: "Find two numbers that add up to a target.",
  status: "waiting",
  created_at: new Date().toISOString(),
};

// Replace the JWT secret temporarily for each test.
const TEST_JWT_SECRET =
  "test-secret-with-at-least-32-characters-long";

function createToken(
  role: "interviewer" | "candidate",
  userId: string
): string {
  const jwt = require("jsonwebtoken");

  return jwt.sign(
    {
      sub: userId,
      role,
    },
    TEST_JWT_SECRET,
    {
      expiresIn: "5m",
    }
  );
}

describe("Room API", () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  describe("POST /api/rooms", () => {
    it("allows an interviewer to create a room", async () => {
      mockedCreateRoom.mockResolvedValue(
        room as Awaited<ReturnType<typeof createRoomService>>
      );

      const token = createToken("interviewer", "10");

      const response = await request(app)
        .post("/api/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
          questionTitle: "Two Sum",
          questionDescription: "Find two numbers.",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe("1");

      expect(mockedCreateRoom).toHaveBeenCalledWith(
        "10",
        "Two Sum",
        "Find two numbers."
      );
    });

    it("rejects room creation without authentication", async () => {
      const response = await request(app)
        .post("/api/rooms")
        .send({
          questionTitle: "Two Sum",
        });

      expect(response.status).toBe(401);
      expect(mockedCreateRoom).not.toHaveBeenCalled();
    });

    it("prevents candidates from creating rooms", async () => {
      const token = createToken("candidate", "20");

      const response = await request(app)
        .post("/api/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
          questionTitle: "Two Sum",
        });

      expect(response.status).toBe(403);
      expect(mockedCreateRoom).not.toHaveBeenCalled();
    });

    it("rejects an empty question title", async () => {
      const token = createToken("interviewer", "10");

      const response = await request(app)
        .post("/api/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
          questionTitle: "   ",
        });

      expect(response.status).toBe(400);
      expect(mockedCreateRoom).not.toHaveBeenCalled();
    });

    it("returns 500 when room creation fails", async () => {
      mockedCreateRoom.mockRejectedValue(
        new Error("Database error")
      );

      const token = createToken("interviewer", "10");

      const response = await request(app)
        .post("/api/rooms")
        .set("Authorization", `Bearer ${token}`)
        .send({
          questionTitle: "Two Sum",
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/rooms/:roomId/join", () => {
    it("allows a candidate to join an available room", async () => {
      mockedJoinRoom.mockResolvedValue({
        ...room,
        candidate_id: "20",
        status: "active",
      } as Awaited<ReturnType<typeof joinRoomService>>);

      const token = createToken("candidate", "20");

      const response = await request(app)
        .post("/api/rooms/1/join")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe("1");

      expect(mockedJoinRoom).toHaveBeenCalledWith(
        "1",
        "20"
      );
    });

    it("rejects room joining without authentication", async () => {
      const response = await request(app)
        .post("/api/rooms/1/join");

      expect(response.status).toBe(401);
      expect(mockedJoinRoom).not.toHaveBeenCalled();
    });

    it("prevents interviewers from joining as candidates", async () => {
      const token = createToken("interviewer", "10");

      const response = await request(app)
        .post("/api/rooms/1/join")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(mockedJoinRoom).not.toHaveBeenCalled();
    });

    it("rejects an invalid room ID", async () => {
      const token = createToken("candidate", "20");

      const response = await request(app)
        .post("/api/rooms/invalid/join")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(mockedJoinRoom).not.toHaveBeenCalled();
    });

    it("returns 409 when a room is unavailable", async () => {
      mockedJoinRoom.mockResolvedValue(null);

      const token = createToken("candidate", "20");

      const response = await request(app)
        .post("/api/rooms/1/join")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    it("returns 500 when joining fails", async () => {
      mockedJoinRoom.mockRejectedValue(
        new Error("Database error")
      );

      const token = createToken("candidate", "20");

      const response = await request(app)
        .post("/api/rooms/1/join")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});