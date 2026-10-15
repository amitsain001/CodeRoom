
import { useEffect, useState } from "react";
import {
  socket,
  connectSocket,
  disconnectSocket,
} from "./socket";
import RoomChat from "./RoomChat";
import CodeEditor from "./CodeEditor";

interface Participant {
  userId: string;
  role: "candidate" | "interviewer";
}

interface JoinResult {
  success: boolean;
  roomId?: string;
  message?: string;
  participants?: Participant[];
}

export default function SocketConnection({
  token,
}: {
  token: string;
}) {
  const [status, setStatus] = useState("Disconnected");
  const [roomId, setRoomId] = useState("1");
  const [joinedRoom, setJoinedRoom] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handleConnect = () => setStatus("Connected");

    const handleDisconnect = () => {
      setStatus("Disconnected");
      setJoinedRoom("");
      setParticipants([]);
    };

    const handleConnectError = (error: Error) => {
      setStatus("Connection failed");
      setMessage(error.message);
    };

    const handleUserJoined = (participant: Participant) => {
      setParticipants((current) => {
        if (current.some((p) => p.userId === participant.userId)) {
          return current;
        }
        return [...current, participant];
      });
    };

    const handleUserLeft = (participant: Participant) => {
      setParticipants((current) =>
        current.filter((p) => p.userId !== participant.userId)
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("room:user-joined", handleUserJoined);
    socket.on("room:user-left", handleUserLeft);

    connectSocket(token);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("room:user-joined", handleUserJoined);
      socket.off("room:user-left", handleUserLeft);

      // Leave the room before disconnecting this socket.
      if (joinedRoom) {
        socket.emit("room:leave", joinedRoom);
      }
      disconnectSocket();
    };
  }, [token]);

  function joinRoom() {
    const cleanRoomId = roomId.trim();

    if (!/^[1-9]\d*$/.test(cleanRoomId)) {
      setMessage("Enter a valid positive room ID.");
      return;
    }

    if (!socket.connected) {
      setMessage("Socket is not connected.");
      return;
    }

    setMessage("");

    socket.emit(
      "room:join",
      cleanRoomId,
      (result: JoinResult) => {
        if (!result.success) {
          setMessage(result.message || "Unable to join room.");
          return;
        }

        setJoinedRoom(cleanRoomId);
        setParticipants(result.participants ?? []);
        setMessage(`Successfully joined room ${cleanRoomId}.`);
      }
    );
  }

  function leaveRoom() {
    if (joinedRoom) {
      socket.emit("room:leave", joinedRoom);
    }

    setJoinedRoom("");
    setParticipants([]);
    setMessage("You left the room.");
  }

  return (
    <section>
      <h2>CodeRoom Live Session</h2>

      <p>
        <strong>Socket status:</strong> {status}
      </p>

      <label htmlFor="room-id">Interview room ID</label>
      <input
        id="room-id"
        value={roomId}
        onChange={(event) => setRoomId(event.target.value)}
        disabled={Boolean(joinedRoom)}
      />

      {!joinedRoom ? (
        <button
          type="button"
          onClick={joinRoom}
          disabled={status !== "Connected"}
        >
          Join Room
        </button>
      ) : (
        <button type="button" onClick={leaveRoom}>
          Leave Room
        </button>
      )}

      {message && <p role="status">{message}</p>}

      <h3>Participants in this session</h3>

      {participants.length === 0 ? (
        <p>No participants listed yet.</p>
      ) : (
        <ul>
          {participants.map((participant) => (
            <li key={participant.userId}>
              User {participant.userId} — {participant.role}
            </li>
          ))}
        </ul>
      )}

      {joinedRoom && <RoomChat roomId={joinedRoom} />}
      {joinedRoom && <CodeEditor roomId={joinedRoom} />}

    </section>
  );
}
