import { io } from "socket.io-client";

// Connect to our existing CodeRoom backend.
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// Create the socket without connecting immediately.
// We'll connect only after the user has logged in.
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket"],
});

// Connect with the current user's JWT.
export function connectSocket(token: string): void {
  socket.auth = { token };
  socket.connect();
}

// Disconnect when the user logs out.
export function disconnectSocket(): void {
  socket.disconnect();
}
