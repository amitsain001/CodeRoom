import { useEffect, useState } from "react";
import {
  socket,
  connectSocket,
  disconnectSocket,
} from "./socket";
import RoomChat from "./RoomChat";
import CodeEditor from "./CodeEditor";
import "./SocketConnection.css";

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

interface SocketConnectionProps {
  token: string;
  initialRoomId?: string;
  userRole?: "candidate" | "interviewer";
}

export default function SocketConnection({
  token,
  initialRoomId = "",
  userRole = "candidate",
}: SocketConnectionProps) {
  const [status, setStatus] = useState("Disconnected");
  const [roomId, setRoomId] = useState(initialRoomId);
  const [joinedRoom, setJoinedRoom] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialRoomId) {
      setRoomId(initialRoomId);
    }
  }, [initialRoomId]);

  useEffect(() => {
    const handleConnect = () => {
      setStatus("Connected");
    };

    const handleDisconnect = () => {
      setStatus("Disconnected");
      setJoinedRoom("");
      setParticipants([]);
    };

    const handleConnectError = (error: Error) => {
      setStatus("Connection failed");
      setMessage(error.message || "Unable to connect to the server.");
    };

    const handleUserJoined = (participant: Participant) => {
      setParticipants((current) => {
        const alreadyExists = current.some(
          (item) => item.userId === participant.userId
        );

        if (alreadyExists) {
          return current;
        }

        return [...current, participant];
      });
    };

    const handleUserLeft = (participant: Participant) => {
      setParticipants((current) =>
        current.filter(
          (item) => item.userId !== participant.userId
        )
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

      if (joinedRoom) {
        socket.emit("room:leave", joinedRoom);
      }

      disconnectSocket();
    };
    // The socket connection is managed for the current authentication token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function joinRoom() {
    const cleanRoomId = roomId.trim();

    if (!/^[1-9]\d*$/.test(cleanRoomId)) {
      setMessage("Enter a valid positive room ID.");
      return;
    }

    if (!socket.connected) {
      setMessage("The server connection is not ready. Please try again.");
      return;
    }

    setMessage("");

    socket.emit(
      "room:join",
      cleanRoomId,
      (result: JoinResult) => {
        if (!result?.success) {
          setMessage(
            result?.message || "Unable to join this room. Check the room ID and your access."
          );
          return;
        }

        setRoomId(cleanRoomId);
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
    <section className="live-session">
      {/* Page heading and connection status */}
      <header className="live-session-hero">
        <div className="live-session-title-row">
          <span className="live-session-mark" aria-hidden="true">
            {"</>"}
          </span>

          <div>
            <p className="live-session-kicker">
              CODEROOM WORKSPACE
            </p>

            <h2>Live interview room</h2>

            <p className="live-session-subtitle">
              Collaborate on code, discuss solutions, and interview in real time.
            </p>
          </div>
        </div>

        <span
          className={`live-connection-pill ${
            status === "Connected" ? "is-connected" : ""
          }`}
          role="status"
          aria-live="polite"
        >
          <i />
          {status}
        </span>
      </header>

      {/* Room access and participants */}
      <div className="live-session-grid">
        <section className="live-session-card live-room-access-card">
          <div className="live-card-heading">
            <span className="live-card-icon" aria-hidden="true">
              ⌘
            </span>

            <div>
              <h3>Room access</h3>
              <p>
                Enter the room ID shared by your interview partner.
              </p>
            </div>
          </div>

          <form
            className="live-room-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (!joinedRoom) {
                joinRoom();
              }
            }}
          >
            <label htmlFor="room-id">
              Interview room ID
            </label>

            <div className="live-room-input-row">
              <input
                id="room-id"
                name="roomId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Enter room ID"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                disabled={Boolean(joinedRoom)}
                aria-describedby="room-access-note"
              />

              {!joinedRoom ? (
                <button
                  className="live-button live-button-primary"
                  type="submit"
                  disabled={status !== "Connected"}
                >
                  Join room
                </button>
              ) : (
                <button
                  className="live-button live-button-danger"
                  type="button"
                  onClick={leaveRoom}
                >
                  Leave room
                </button>
              )}
            </div>
          </form>

          {message && (
            <p
              className={`live-room-message ${
                message.toLowerCase().includes("success")
                  ? "success"
                  : ""
              }`}
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          )}

          <div
            className="live-room-note"
            id="room-access-note"
          >
            <span aria-hidden="true">🔒</span>
            <span>
              Only authorized room participants can access the session.
            </span>
          </div>
        </section>

        <section className="live-session-card live-participants-card">
          <div className="live-card-heading">
            <span className="live-card-icon" aria-hidden="true">
              ♙
            </span>

            <div>
              <h3>Participants</h3>
              <p>
                {participants.length}{" "}
                {participants.length === 1
                  ? "participant"
                  : "participants"}{" "}
                in this room
              </p>
            </div>
          </div>

          {participants.length === 0 ? (
            <div className="live-empty-participants">
              <span aria-hidden="true">◎</span>
              <strong>No participants yet</strong>
              <small>
                Join the room to see who's here.
              </small>
            </div>
          ) : (
            <ul className="live-participant-list">
              {participants.map((participant) => (
                <li key={participant.userId}>
                  <span className="live-avatar">
                    {participant.role === "interviewer"
                      ? "I"
                      : "C"}
                  </span>

                  <span className="live-participant-info">
                    <strong>
                      {participant.role === "interviewer"
                        ? "Interviewer"
                        : "Candidate"}
                    </strong>

                    <small>
                      User ID {participant.userId}
                    </small>
                  </span>

                  <span className="live-participant-status">
                    <i />
                    Online
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Collaborative tools are shown after successfully joining */}
      {joinedRoom ? (
        <div className="live-room-tools">
          <div className="live-room-tools-heading">
            <div>
              <p className="live-session-kicker">
                COLLABORATIVE SESSION
              </p>

              <h3>Room #{joinedRoom}</h3>

              <p className="live-session-subtitle">
                Your shared interview workspace is ready.
              </p>
            </div>

            <span className="live-connection-pill is-connected">
              <i />
              Room joined
            </span>
          </div>

          <div className="live-room-chat-wrap">
            <RoomChat roomId={joinedRoom} />
          </div>

          <div className="live-room-editor-wrap">
            <CodeEditor
              roomId={joinedRoom}
              token={token}
              userRole={userRole}
            />
          </div>
        </div>
      ) : (
        <div className="live-room-empty-state">
          <span className="live-empty-icon" aria-hidden="true">
            {"</>"}
          </span>

          <h3>Your coding workspace is ready</h3>

          <p>
            Join an interview room to access the shared editor,
            room chat, and code execution tools.
          </p>
        </div>
      )}
    </section>
  );
}