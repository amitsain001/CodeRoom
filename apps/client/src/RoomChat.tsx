import { useEffect, useState } from "react";
import { socket } from "./socket";

interface ChatMessage {
  roomId: string;
  userId: string;
  role: "candidate" | "interviewer";
  message: string;
  sentAt: string;
}

interface RoomChatProps {
  roomId: string;
}

export default function RoomChat({ roomId }: RoomChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const handleMessage = (message: ChatMessage) => {
      if (message.roomId !== roomId) return;

      setMessages((current) => [...current, message]);
    };

    socket.on("chat:message", handleMessage);

    return () => {
      socket.off("chat:message", handleMessage);
    };
  }, [roomId]);

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = text.trim();

    if (!message || message.length > 1000) {
      setError("Enter a message of 1–1000 characters.");
      return;
    }

    if (!socket.connected) {
      setError("Socket is disconnected.");
      return;
    }

    socket.emit(
      "chat:send",
      { roomId, message },
      (result: { success: boolean; message?: string }) => {
        if (!result.success) {
          setError(result.message ?? "Unable to send message.");
          return;
        }

        setError("");
        setText("");
      }
    );
  }

  return (
    <section>
      <h2>Room Chat</h2>

      <div
        aria-live="polite"
        style={{
          minHeight: 180,
          maxHeight: 300,
          overflowY: "auto",
          padding: 12,
          border: "1px solid #374151",
          borderRadius: 8,
        }}
      >
        {messages.map((message, index) => (
          <p key={`${message.sentAt}-${message.userId}-${index}`}>
            <strong>
              {message.role} (User {message.userId}):
            </strong>{" "}
            {message.message}
            <small>
              {" "}
              {new Date(message.sentAt).toLocaleTimeString()}
            </small>
          </p>
        ))}

        {messages.length === 0 && <p>No messages yet.</p>}
      </div>

      <form onSubmit={sendMessage}>
        <label htmlFor="chat-message">Message</label>
        <input
          id="chat-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          placeholder="Type a message..."
        />

        <button type="submit" disabled={!socket.connected}>
          Send
        </button>
      </form>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
