import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { socket } from "./socket";

interface CodeUpdate {
  roomId: string;
  code: string;
  updatedBy: string;
}

interface CodeLoad {
  roomId: string;
  code: string;
}

interface CodeEditorProps {
  roomId: string;
}

const starterCode = `function twoSum(nums, target) {
  // Write your solution here

  return [];
}`;

export default function CodeEditor({ roomId }: CodeEditorProps) {
  const [code, setCode] = useState(starterCode);
  const lastRemoteCode = useRef<string | null>(null);

  useEffect(() => {
    // Restore the latest saved code when the server sends it.
    const handleCodeLoad = (data: CodeLoad) => {
      if (data.roomId !== roomId) return;

      lastRemoteCode.current = data.code;
      setCode(data.code);
    };

    // Apply code changes made by another participant.
    const handleCodeUpdate = (update: CodeUpdate) => {
      if (update.roomId !== roomId) return;

      lastRemoteCode.current = update.code;
      setCode(update.code);
    };

    socket.on("code:load", handleCodeLoad);
    socket.on("code:update", handleCodeUpdate);

    // Ask the server for the saved code after connecting to a room.
    if (socket.connected) {
      socket.emit("code:request", { roomId });
    }

    return () => {
      socket.off("code:load", handleCodeLoad);
      socket.off("code:update", handleCodeUpdate);
    };
  }, [roomId]);

  function handleEditorChange(value: string | undefined) {
    const nextCode = value ?? "";

    setCode(nextCode);

    // Do not rebroadcast code that came from another participant or the server.
    if (nextCode === lastRemoteCode.current) {
      lastRemoteCode.current = null;
      return;
    }

    if (socket.connected) {
      socket.emit("code:change", {
        roomId,
        code: nextCode,
      });
    }
  }

  return (
    <section style={{ marginTop: 24, textAlign: "left" }}>
      <h2>Collaborative Code Editor</h2>
      <p>Language: JavaScript</p>

      <Editor
        height="420px"
        language="javascript"
        theme="vs-dark"
        value={code}
        onChange={handleEditorChange}
        options={{
          minimap: { enabled: false },
          fontSize: 15,
          automaticLayout: true,
          scrollBeyondLastLine: false,
        }}
      />
    </section>
  );
}