
import { useState } from "react";
import SocketConnection from "./SocketConnection";
import "./App.css";

function App() {
  const [token, setToken] = useState("");
  const [activeToken, setActiveToken] = useState("");

  function connectToCodeRoom() {
    const cleanToken = token.trim();

    if (!cleanToken) {
      alert("Please paste a JWT token first.");
      return;
    }

    setActiveToken(cleanToken);
  }

  function disconnectFromCodeRoom() {
    setActiveToken("");
  }

  return (
    <main className="coderoom">
      <header className="coderoom-header">
        <h1>CodeRoom</h1>
        <p>Real-time collaborative coding interviews</p>
      </header>

      <section className="connection-card">
        <h2>Socket.IO Connection</h2>
        <p>
          Sign in through the existing login API, then paste its
          access token below to test the real-time connection.
        </p>

        <label htmlFor="jwt-token">JWT access token</label>
        <textarea
          id="jwt-token"
          rows={4}
          placeholder="Paste your fresh JWT token here"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        {!activeToken ? (
          <button type="button" onClick={connectToCodeRoom}>
            Connect to CodeRoom
          </button>
        ) : (
          <button
            type="button"
            onClick={disconnectFromCodeRoom}
          >
            Disconnect
          </button>
        )}

        {activeToken && (
          <SocketConnection token={activeToken} />
        )}
      </section>
    </main>
  );
}

export default App;
