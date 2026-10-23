import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { io as createClient, Socket as ClientSocket } from "socket.io-client";
import jwt from "jsonwebtoken";

import { initializeSocket } from "./socket";
import { pool } from "./database";
import { redis } from "./redis";

jest.mock("./database", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("./redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const JWT_SECRET =
  "test-secret-for-coderoom-socket-tests-at-least-32-characters";

const interviewer = {
  sub: "101",
  role: "interviewer" as const,
};

const candidate = {
  sub: "202",
  role: "candidate" as const,
};

describe("CodeRoom Socket.IO events", () => {
  let httpServer: HttpServer;
  let socketServer: ReturnType<typeof initializeSocket>;
  let serverUrl: string;
  let clients: ClientSocket[];

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

    httpServer = createServer();
    socketServer = initializeSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    clients = [];

    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{ id: "1" }],
    });

    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue("OK");
  });

  afterEach(() => {
    for (const client of clients) {
      client.removeAllListeners();
      client.disconnect();
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      socketServer.close(() => resolve());
    });

    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  function connectClient(
    user: typeof interviewer | typeof candidate,
    tokenOverride?: string
  ): ClientSocket {
    const token =
      tokenOverride ??
      jwt.sign(user, JWT_SECRET, { expiresIn: "5m" });

    const client = createClient(serverUrl, {
      auth: { token },
      forceNew: true,
      reconnection: false,
      timeout: 3000,
    });

    clients.push(client);
    return client;
  }

  function waitForConnection(client: ClientSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Socket connection timed out"));
      }, 4000);

      client.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once("connect_error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  function expectConnectionRejected(
    client: ClientSocket
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Expected socket authentication to fail"));
      }, 4000);

      client.once("connect_error", (error) => {
        clearTimeout(timeout);
        expect(error.message).toMatch(/authentication|token/i);
        resolve();
      });

      client.once("connect", () => {
        clearTimeout(timeout);
        reject(new Error("Socket should not have connected"));
      });
    });
  }

  function emitWithAck<T>(
    client: ClientSocket,
    event: string,
    ...args: unknown[]
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Acknowledgement timed out for ${event}`));
      }, 4000);

      client.emit(event, ...args, (result: T) => {
        clearTimeout(timeout);
        resolve(result);
      });
    });
  }

  function waitForEvent<T>(
    client: ClientSocket,
    event: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${event}`));
      }, 4000);

      client.once(event, (payload: T) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });
  }

  async function joinRoom(client: ClientSocket, roomId = "1") {
    return emitWithAck<{
      success: boolean;
      message?: string;
      roomId?: string;
      participants?: Array<{ userId: string; role: string }>;
    }>(client, "room:join", roomId);
  }

  it("rejects a connection without a JWT", async () => {
    const client = createClient(serverUrl, {
      auth: {},
      forceNew: true,
      reconnection: false,
    });

    clients.push(client);

    await expectConnectionRejected(client);
  });

  it("rejects an invalid JWT", async () => {
    const client = connectClient(candidate, "invalid-token");

    await expectConnectionRejected(client);
  });

  it("allows an authenticated user to connect", async () => {
    const client = connectClient(interviewer);

    await waitForConnection(client);

    expect(client.connected).toBe(true);
  });

  it("allows an authorized participant to join an active room", async () => {
    const client = connectClient(interviewer);

    await waitForConnection(client);

    const result = await joinRoom(client);

    expect(result.success).toBe(true);
    expect(result.roomId).toBe("1");
    expect(result.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: interviewer.sub,
          role: interviewer.role,
        }),
      ])
    );

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'active'"),
      ["1", interviewer.sub]
    );
  });

  it("rejects a user who is not assigned to the room", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [],
    });

    const client = connectClient(candidate);

    await waitForConnection(client);

    const result = await joinRoom(client);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/access denied/i);
  });

  it("rejects an invalid room ID", async () => {
    const client = connectClient(interviewer);

    await waitForConnection(client);

    const result = await joinRoom(client, "invalid");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalid room/i);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("restores previously saved code when joining a room", async () => {
    (redis.get as jest.Mock).mockResolvedValueOnce(
      "console.log('restored code');"
    );

    const client = connectClient(interviewer);

    await waitForConnection(client);

    const codeLoaded = waitForEvent<{
      roomId: string;
      code: string;
    }>(client, "code:load");

    const result = await joinRoom(client);

    expect(result.success).toBe(true);
    expect(await codeLoaded).toEqual({
      roomId: "1",
      code: "console.log('restored code');",
    });

    expect(redis.get).toHaveBeenCalledWith("room:1:code");
  });

  it("saves code to Redis and broadcasts changes to other room participants", async () => {
    const first = connectClient(interviewer);
    const second = connectClient(candidate);

    await Promise.all([
      waitForConnection(first),
      waitForConnection(second),
    ]);

    expect((await joinRoom(first)).success).toBe(true);
    expect((await joinRoom(second)).success).toBe(true);

    const receivedCode = waitForEvent<{
      roomId: string;
      code: string;
      updatedBy: string;
    }>(second, "code:update");

    first.emit("code:change", {
      roomId: "1",
      code: "const answer = 42;",
    });

    await expect(
      receivedCode
    ).resolves.toEqual({
      roomId: "1",
      code: "const answer = 42;",
      updatedBy: interviewer.sub,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "room:1:code",
      "const answer = 42;"
    );
  });

  it("does not broadcast code changes from a user who has not joined the room", async () => {
    const client = connectClient(interviewer);

    await waitForConnection(client);

    client.emit("code:change", {
      roomId: "1",
      code: "unauthorized code",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(redis.set).not.toHaveBeenCalled();
  });

  it("delivers chat messages to participants in the same room", async () => {
    const first = connectClient(interviewer);
    const second = connectClient(candidate);

    await Promise.all([
      waitForConnection(first),
      waitForConnection(second),
    ]);

    expect((await joinRoom(first)).success).toBe(true);
    expect((await joinRoom(second)).success).toBe(true);

    const receivedMessage = waitForEvent<{
      roomId: string;
      userId: string;
      role: string;
      message: string;
      sentAt: string;
    }>(second, "chat:message");

    const acknowledgement = await emitWithAck<{
      success: boolean;
      message?: string;
    }>(first, "chat:send", {
      roomId: "1",
      message: "Hello candidate!",
    });

    expect(acknowledgement.success).toBe(true);

    const message = await receivedMessage;

    expect(message).toEqual(
      expect.objectContaining({
        roomId: "1",
        userId: interviewer.sub,
        role: interviewer.role,
        message: "Hello candidate!",
      })
    );

    expect(Number.isNaN(Date.parse(message.sentAt))).toBe(false);
  });

  it("rejects chat messages from users who have not joined the room", async () => {
    const client = connectClient(interviewer);

    await waitForConnection(client);

    const result = await emitWithAck<{
      success: boolean;
      message?: string;
    }>(client, "chat:send", {
      roomId: "1",
      message: "Hello!",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/join the room/i);
  });

  it("rejects empty chat messages", async () => {
    const client = connectClient(interviewer);

    await waitForConnection(client);
    expect((await joinRoom(client)).success).toBe(true);

    const result = await emitWithAck<{
      success: boolean;
      message?: string;
    }>(client, "chat:send", {
      roomId: "1",
      message: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/characters/i);
  });

  it("allows a participant to request saved code after joining", async () => {
    (redis.get as jest.Mock).mockResolvedValue("let count = 10;");

    const client = connectClient(interviewer);

    await waitForConnection(client);
    expect((await joinRoom(client)).success).toBe(true);

    const codeLoaded = waitForEvent<{
      roomId: string;
      code: string;
    }>(client, "code:load");

    const result = await emitWithAck<{
      success: boolean;
    }>(client, "code:request", {
      roomId: "1",
    });

    expect(result.success).toBe(true);

    expect(await codeLoaded).toEqual({
      roomId: "1",
      code: "let count = 10;",
    });
  });

  it("allows a participant to leave the room", async () => {
    const first = connectClient(interviewer);
    const second = connectClient(candidate);

    await Promise.all([
      waitForConnection(first),
      waitForConnection(second),
    ]);

    expect((await joinRoom(first)).success).toBe(true);
    expect((await joinRoom(second)).success).toBe(true);

    const userLeft = waitForEvent<{
      userId: string;
      role: string;
    }>(second, "room:user-left");

    first.emit("room:leave", "1");

    await expect(userLeft).resolves.toEqual({
      userId: interviewer.sub,
      role: interviewer.role,
    });

    const result = await emitWithAck<{
      success: boolean;
      message?: string;
    }>(first, "chat:send", {
      roomId: "1",
      message: "This should fail",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/join the room/i);
  });
});