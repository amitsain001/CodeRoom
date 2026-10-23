import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { socket } from "./socket";
import "./CodeEditor.css";

// =============================================
// Collaborative editing types
// =============================================

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
  token: string;
  userRole: "candidate" | "interviewer";
}

// =============================================
// Programming language types
// =============================================

interface ProgrammingLanguage {
  id: number;
  name: string;
  editorLanguage: string;
}

// =============================================
// Judge0 execution types
// =============================================

interface ExecutionResult {
  token: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  status: {
    id: number;
    description: string;
  };
}

interface ExecutionResponse {
  success: boolean;
  result?: ExecutionResult;
  message?: string;
}

// =============================================
// Test case types
// =============================================

interface TestCase {
  id: number;
  input: string;
  expectedOutput: string;
}

type TestStatus = "passed" | "failed" | "error";

interface TestCaseResult {
  testCaseId: number;
  actualOutput: string;
  status: TestStatus;
  message?: string;
}

// =============================================
// Supported Judge0 languages
// =============================================

const LANGUAGES: ProgrammingLanguage[] = [
  {
    id: 102,
    name: "JavaScript (Node.js 22)",
    editorLanguage: "javascript",
  },
  {
    id: 100,
    name: "Python 3.12",
    editorLanguage: "python",
  },
  {
    id: 105,
    name: "C++ (GCC 14)",
    editorLanguage: "cpp",
  },
  {
    id: 91,
    name: "Java (JDK 17)",
    editorLanguage: "java",
  },
  {
    id: 107,
    name: "Go 1.23",
    editorLanguage: "go",
  },
  {
    id: 101,
    name: "TypeScript 5.6",
    editorLanguage: "typescript",
  },
];

// =============================================
// Starter code for each language
// =============================================

const starterCodeByLanguage: Record<string, string> = {
  javascript: `const input = require("fs").readFileSync(0, "utf8").trim();

const nums = input.split(/\\s+/).map(Number);

console.log(nums.reduce((a, b) => a + b, 0));`,

  python: `# Read numbers from standard input.
numbers = list(map(int, input().split()))

print(sum(numbers))`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    int a, b, c;
    cin >> a >> b >> c;

    cout << a + b + c << endl;

    return 0;
}`,

  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        int a = scanner.nextInt();
        int b = scanner.nextInt();
        int c = scanner.nextInt();

        System.out.println(a + b + c);

        scanner.close();
    }
}`,

  go: `package main

import "fmt"

func main() {
    var a, b, c int
    fmt.Scan(&a, &b, &c)
    fmt.Println(a + b + c)
}`,

  typescript: `import * as fs from "fs";

const input = fs.readFileSync(0, "utf8").trim();

const nums = input.split(/\\s+/).map(Number);

console.log(nums.reduce((a, b) => a + b, 0));`,
};

const DEFAULT_LANGUAGE_ID = 102;

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

function getCurrentAuthToken(fallbackToken: string): string {
  // A prop can become stale after a sign-in in another tab or a re-auth flow.
  // Prefer the current saved token, falling back to the supplied prop.
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("coderoom_token") || fallbackToken || "";
  }
  return fallbackToken || "";
}

function notifyAuthExpired(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("coderoom_token");
  window.localStorage.removeItem("coderoom_user");
  window.dispatchEvent(new CustomEvent("coderoom:auth-expired"));
}

async function readApiJson<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    notifyAuthExpired();
    throw new Error("Your session has expired. Please sign in again.");
  }
  return response.json() as Promise<T>;
}

// =============================================
// Main CodeEditor component
// =============================================

export default function CodeEditor({ roomId, token, userRole }: CodeEditorProps) {
  const [code, setCode] = useState(
    starterCodeByLanguage.javascript,
  );

  // Resizable editor/output split. The percentage is stored as a fraction
  // of CSS grid tracks so long code can be given more horizontal space.
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [editorPanePercent, setEditorPanePercent] = useState(56);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditorMaximized, setIsEditorMaximized] = useState(false);
  const [isNarrowLayout, setIsNarrowLayout] = useState(
    typeof window !== "undefined" && window.innerWidth < 760,
  );

  useEffect(() => {
    const updateLayout = () => setIsNarrowLayout(window.innerWidth < 760);
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  function handleSplitPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isNarrowLayout) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }

  function handleSplitPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isResizing || !workspaceRef.current || isNarrowLayout) return;
    const bounds = workspaceRef.current.getBoundingClientRect();
    if (!bounds.width) return;
    const percent = ((event.clientX - bounds.left) / bounds.width) * 100;
    setEditorPanePercent(Math.max(30, Math.min(75, percent)));
  }

  function handleSplitPointerUp() {
    setIsResizing(false);
  }

  function handleSplitKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -3 : 3;
    setEditorPanePercent((current) => Math.max(30, Math.min(75, current + delta)));
  }

  const [languageId, setLanguageId] = useState(
    DEFAULT_LANGUAGE_ID,
  );

  // Input for the individual Run Code feature.
  const [stdin, setStdin] = useState("10 20 30");

  const [isRunning, setIsRunning] = useState(false);
  const [execution, setExecution] =
    useState<ExecutionResult | null>(null);
  const [executionError, setExecutionError] = useState("");

  // Initial test cases are examples for a program that sums numbers.
  const [testCases, setTestCases] = useState<TestCase[]>([
    {
      id: 1,
      input: "10 20 30",
      expectedOutput: "60",
    },
    {
      id: 2,
      input: "1 2 3",
      expectedOutput: "6",
    },
    {
      id: 3,
      input: "5 5",
      expectedOutput: "10",
    },
  ]);

  const [testResults, setTestResults] = useState<
    TestCaseResult[]
  >([]);

  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testRunnerError, setTestRunnerError] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [aiReport, setAiReport] = useState<any>(null);

  // Collaborative editor state.
  const lastRemoteCode = useRef<string | null>(null);

  // Request IDs prevent stale single-run responses from replacing newer results.
  const executionRequestId = useRef(0);

  // Incremented to invalidate test runs when the code or language changes.
  const testRunId = useRef(0);

  const selectedLanguage =
    LANGUAGES.find((language) => language.id === languageId) ??
    LANGUAGES[0];

  // =============================================
  // Phase 2: Collaborative code synchronization
  // =============================================

  useEffect(() => {
    const handleCodeLoad = (data: CodeLoad) => {
      if (data.roomId !== roomId) return;

      lastRemoteCode.current = data.code;
      setCode(data.code);
    };

    const handleCodeUpdate = (update: CodeUpdate) => {
      if (update.roomId !== roomId) return;

      lastRemoteCode.current = update.code;
      setCode(update.code);
    };

    socket.on("code:load", handleCodeLoad);
    socket.on("code:update", handleCodeUpdate);

    if (socket.connected) {
      socket.emit("code:request", { roomId });
    }

    return () => {
      socket.off("code:load", handleCodeLoad);
      socket.off("code:update", handleCodeUpdate);
    };
  }, [roomId]);

  // =============================================
  // Invalidate old results when code changes
  // =============================================

  function invalidateResults() {
    executionRequestId.current += 1;
    testRunId.current += 1;

    setIsRunning(false);
    setIsRunningTests(false);

    setExecution(null);
    setExecutionError("");

    setTestResults([]);
    setTestRunnerError("");
  }

  // =============================================
  // Handle editor changes
  // =============================================

  function handleEditorChange(value: string | undefined) {
    const nextCode = value ?? "";

    setCode(nextCode);

    if (nextCode === lastRemoteCode.current) {
      lastRemoteCode.current = null;
      return;
    }

    invalidateResults();

    if (socket.connected) {
      socket.emit("code:change", {
        roomId,
        code: nextCode,
      });
    }
  }

  // =============================================
  // Handle programming language changes
  // =============================================

  function handleLanguageChange(nextLanguageId: number) {
    const nextLanguage = LANGUAGES.find(
      (language) => language.id === nextLanguageId,
    );

    if (!nextLanguage) return;

    invalidateResults();

    setLanguageId(nextLanguageId);

    const nextCode =
      starterCodeByLanguage[nextLanguage.editorLanguage] ?? "";

    setCode(nextCode);

    if (socket.connected) {
      socket.emit("code:change", {
        roomId,
        code: nextCode,
      });
    }
  }

  // =============================================
  // Shared helper: execute code through the backend
  // =============================================

  async function executeSource(
    sourceCode: string,
    selectedLanguageId: number,
    input: string,
  ): Promise<ExecutionResult> {
    const currentToken = getCurrentAuthToken(token);
    if (!currentToken) {
      throw new Error("Your session is missing. Please sign in again.");
    }

    const response = await fetch(
      `${API_BASE_URL}/api/execution/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          sourceCode,
          languageId: selectedLanguageId,
          stdin: input,
        }),
      },
    );

    const data = await readApiJson<ExecutionResponse>(response);

    if (!response.ok || !data.success || !data.result) {
      throw new Error(
        data.message ??
          `Execution request failed (${response.status}).`,
      );
    }

    return data.result;
  }

  async function handleGenerateFeedback() {
    if (userRole !== "candidate") {
      setFeedbackError("Only the candidate can submit a solution for AI feedback.");
      return;
    }
    const currentToken = getCurrentAuthToken(token);
    if (!currentToken) {
      setFeedbackError("Your session is missing. Please sign in again.");
      return;
    }
    setFeedbackLoading(true);
    setFeedbackError("");
    setAiReport(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/rooms/${encodeURIComponent(roomId)}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          submittedCode: code,
          languageId,
          language: selectedLanguage.name,
          durationSeconds: 0,
        }),
      });
      const payload = await readApiJson<any>(response);
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || `AI feedback request failed (${response.status}).`);
      }
      setAiReport(payload.data.feedback ? payload.data : payload.data.data ?? payload.data);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : "Unable to generate AI feedback.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  // =============================================
  // Run Code: execute once with custom stdin
  // =============================================

  async function handleRunCode() {
    if (isRunning || isRunningTests) return;

    const requestId = ++executionRequestId.current;

    setIsRunning(true);
    setExecution(null);
    setExecutionError("");

    try {
      const result = await executeSource(code, languageId, stdin);

      if (requestId !== executionRequestId.current) return;

      setExecution(result);
    } catch (error) {
      if (requestId !== executionRequestId.current) return;

      setExecutionError(
        error instanceof Error
          ? error.message
          : "An unexpected execution error occurred.",
      );
    } finally {
      if (requestId === executionRequestId.current) {
        setIsRunning(false);
      }
    }
  }

  // =============================================
  // Test-case management
  // =============================================

  function addTestCase() {
    const nextId =
      Math.max(0, ...testCases.map((testCase) => testCase.id)) + 1;

    setTestCases((previous) => [
      ...previous,
      {
        id: nextId,
        input: "",
        expectedOutput: "",
      },
    ]);

    setTestResults([]);
    setTestRunnerError("");
  }

  function updateTestCase(
    id: number,
    field: "input" | "expectedOutput",
    value: string,
  ) {
    setTestCases((previous) =>
      previous.map((testCase) =>
        testCase.id === id
          ? { ...testCase, [field]: value }
          : testCase,
      ),
    );

    setTestResults([]);
    setTestRunnerError("");
  }

  function removeTestCase(id: number) {
    setTestCases((previous) =>
      previous.filter((testCase) => testCase.id !== id),
    );

    setTestResults([]);
    setTestRunnerError("");
  }

  // Ignore leading/trailing whitespace and normalize Windows newlines.
  // Internal whitespace is intentionally preserved.
  function normalizeOutput(value: string) {
    return value.replace(/\r\n/g, "\n").trim();
  }

  // =============================================
  // Run all test cases
  // =============================================

  async function handleRunAllTests() {
    if (isRunning || isRunningTests) return;

    if (testCases.length === 0) {
      setTestRunnerError("Add at least one test case before running.");
      return;
    }

    const currentRunId = ++testRunId.current;

    // Snapshot inputs so edits cannot change the current run midway.
    const casesToRun = testCases.map((testCase) => ({ ...testCase }));
    const sourceSnapshot = code;
    const languageSnapshot = languageId;

    setIsRunningTests(true);
    setTestResults([]);
    setTestRunnerError("");
    setExecution(null);
    setExecutionError("");

    const results: TestCaseResult[] = [];

    try {
      // Sequential execution avoids flooding the execution provider.
      for (const testCase of casesToRun) {
        if (currentRunId !== testRunId.current) return;

        try {
          const result = await executeSource(
            sourceSnapshot,
            languageSnapshot,
            testCase.input,
          );

          if (currentRunId !== testRunId.current) return;

          // Judge0 status 3 means Accepted.
          const executedSuccessfully = result.status.id === 3;

          // On failure, expose compiler/runtime diagnostics instead of
          // comparing an error message against the expected output.
          const actualOutput =
            result.stdout ??
            result.stderr ??
            result.compile_output ??
            result.message ??
            "";

          if (!executedSuccessfully) {
            results.push({
              testCaseId: testCase.id,
              actualOutput,
              status: "error",
              message: result.status.description,
            });
          } else {
            const passed =
              normalizeOutput(result.stdout ?? "") ===
              normalizeOutput(testCase.expectedOutput);

            results.push({
              testCaseId: testCase.id,
              actualOutput: result.stdout ?? "",
              status: passed ? "passed" : "failed",
            });
          }
        } catch (error) {
          if (currentRunId !== testRunId.current) return;

          results.push({
            testCaseId: testCase.id,
            actualOutput: "",
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unexpected execution error.",
          });
        }

        // Render results progressively after each test finishes.
        setTestResults([...results]);
      }
    } finally {
      if (currentRunId === testRunId.current) {
        setIsRunningTests(false);
      }
    }
  }

  // =============================================
  // Single-run output helpers
  // =============================================

  const output =
    execution?.stdout ||
    execution?.stderr ||
    execution?.compile_output ||
    execution?.message ||
    "";

  const successfulExecution = execution?.status.id === 3;

  const hasExecutionError = Boolean(
    execution?.stderr || execution?.compile_output,
  );

  const passedCount = testResults.filter(
    (result) => result.status === "passed",
  ).length;

  const failedCount = testResults.filter(
    (result) => result.status === "failed",
  ).length;

  const errorCount = testResults.filter(
    (result) => result.status === "error",
  ).length;

  // =============================================
  // Render
  // =============================================

  return (
    <section
      className={`cr-code-editor${isEditorMaximized ? " cr-code-editor-maximized" : ""}`}
      style={{
        marginTop: isEditorMaximized ? 0 : 24,
        textAlign: "left",
        background: "#111827",
        color: "#f9fafb",
        borderRadius: isEditorMaximized ? 0 : 12,
        overflow: "hidden",
        border: "1px solid #374151",
        ...(isEditorMaximized ? {
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          width: "100vw",
          height: "100dvh",
          maxWidth: "none",
          display: "flex",
          flexDirection: "column" as const,
        } : {}),
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          background: "#334155",
          borderBottom: "1px solid #475569",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>
            CodeRoom Editor
          </h2>

          <p
            style={{
              margin: "8px 0 0",
              color: "#dbeafe",
              fontSize: 15,
            }}
          >
            Collaborative coding workspace
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label htmlFor="language-select" style={{ fontWeight: 700 }}>
            Language:
          </label>

          <select
            id="language-select"
            value={languageId}
            onChange={(event) =>
              handleLanguageChange(Number(event.target.value))
            }
            disabled={isRunning || isRunningTests}
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#1e293b",
              color: "#f9fafb",
              border: "1px solid #64748b",
              fontSize: 15,
            }}
          >
            {LANGUAGES.map((language) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRunCode}
            disabled={isRunning || isRunningTests}
            style={{
              padding: "14px 22px",
              borderRadius: 8,
              border: "none",
              background:
                isRunning || isRunningTests ? "#64748b" : "#10b981",
              color: "#ffffff",
              fontWeight: 700,
              cursor:
                isRunning || isRunningTests
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isRunning ? "⏳ Running..." : "▶ Run Code"}
          </button>
        </div>
      </div>

      <div
        ref={workspaceRef}
        className={`cr-workspace-grid${isResizing ? " is-resizing" : ""}`}
        style={{
          display: "grid",
          gridTemplateColumns: isNarrowLayout
            ? "minmax(0, 1fr)"
            : `minmax(0, ${editorPanePercent}fr) 10px minmax(0, ${100 - editorPanePercent}fr)`,
          alignItems: "stretch",
          minWidth: 0,
          width: "100%",
          flex: isEditorMaximized ? "1 1 auto" : undefined,
          minHeight: isEditorMaximized ? 0 : undefined,
          overflow: isEditorMaximized ? "hidden" : undefined,
          cursor: isResizing ? "col-resize" : undefined,
        }}
      >
        <div className="cr-editor-pane" style={{ minWidth: 0, width: "100%" }}>
          <div className="cr-pane-title" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><span className="cr-pane-dot" /> Solution editor</span>
            <button
              type="button"
              onClick={() => setIsEditorMaximized((current) => !current)}
              aria-label={isEditorMaximized ? "Restore split workspace" : "Maximize code editor"}
              title={isEditorMaximized ? "Restore split workspace" : "Maximize code editor"}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 30, padding: 0, flex: "0 0 auto",
                border: "1px solid #475569", borderRadius: 6,
                background: "#1e293b", color: "#e2e8f0", cursor: "pointer",
                fontSize: 18, lineHeight: 1,
              }}
            >{isEditorMaximized ? "❐" : "⛶"}</button>
          </div>
          <div className="cr-monaco-shell" style={isEditorMaximized ? { height: "calc(100dvh - 250px)", minHeight: 260, flex: "1 1 auto" } : undefined}>
      {/* Monaco editor */}
      <Editor
        height="100%"
        language={selectedLanguage.editorLanguage}
        theme="vs-dark"
        value={code}
        onChange={handleEditorChange}
        options={{
          minimap: { enabled: false },
          fontSize: 16,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          padding: { top: 16 },
          wordWrap: "on",
        }}
      />

          </div>
      {/* Custom stdin for Run Code */}
      <div className="cr-input-panel"
        style={{
          padding: 24,
          borderTop: "1px solid #374151",
          background: "#1e293b",
        }}
      >
        <label
          htmlFor="program-input"
          style={{
            display: "block",
            marginBottom: 12,
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Custom Input (stdin)
        </label>

        <textarea
          id="program-input"
          value={stdin}
          onChange={(event) => setStdin(event.target.value)}
          placeholder="Enter input for your program..."
          rows={4}
          style={{
            boxSizing: "border-box",
            width: "100%",
            padding: 16,
            resize: "vertical",
            background: "#020617",
            color: "#f9fafb",
            border: "1px solid #475569",
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 15,
          }}
        />
      </div>

        </div>

        {!isNarrowLayout && (
          <div
            className="cr-workspace-divider"
            role="separator"
            aria-label="Resize editor and output panels"
            aria-orientation="vertical"
            aria-valuemin={30}
            aria-valuemax={75}
            aria-valuenow={Math.round(editorPanePercent)}
            tabIndex={0}
            onPointerDown={handleSplitPointerDown}
            onPointerMove={handleSplitPointerMove}
            onPointerUp={handleSplitPointerUp}
            onPointerCancel={handleSplitPointerUp}
            onKeyDown={handleSplitKeyDown}
            style={{
              width: 10,
              minWidth: 10,
              cursor: "col-resize",
              touchAction: "none",
              background: isResizing ? "#818cf8" : "#263449",
              borderLeft: "1px solid #374151",
              borderRight: "1px solid #374151",
              position: "relative",
              zIndex: 2,
              alignSelf: "stretch",
              outlineOffset: -2,
            }}
            title="Drag to resize panels (or use arrow keys)"
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 3,
                top: "50%",
                transform: "translateY(-50%)",
                width: 2,
                height: 36,
                borderLeft: "1px solid #cbd5e1",
                borderRight: "1px solid #cbd5e1",
                pointerEvents: "none",
              }}
            />
          </div>
        )}

        <div
          className="cr-results-pane"
          style={{
            minWidth: 0,
            width: "100%",
            // On phones, keep the output/test-case panel independently scrollable.
            // Inline styles intentionally override the mobile CSS that sets
            // overflow: visible, which was causing the lower test-case fields
            // to be clipped by the editor card.
            ...(isNarrowLayout
              ? {
                  height: isEditorMaximized ? "42dvh" : "70dvh",
                  maxHeight: isEditorMaximized ? "42dvh" : "70dvh",
                  minHeight: 240,
                  overflowY: "auto" as const,
                  overflowX: "hidden" as const,
                  overscrollBehaviorY: "contain" as const,
                  WebkitOverflowScrolling: "touch" as const,
                  touchAction: "pan-y" as const,
                }
              : {
                  overflowY: "auto" as const,
                  overflowX: "hidden" as const,
                }),
          }}
        >
      {/* Single execution output */}
      <div className="cr-result-section"
        style={{
          padding: 24,
          background: "#020617",
          borderTop: "1px solid #374151",
          minHeight: 120,
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: 20 }}>Output</h3>

        {isRunning && (
          <p role="status" style={{ color: "#fbbf24" }}>
            ⏳ Executing your code...
          </p>
        )}

        {executionError && (
          <pre
            role="alert"
            style={{
              padding: 16,
              borderRadius: 8,
              background: "#1e293b",
              color: "#fca5a5",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {executionError}
          </pre>
        )}

        {execution && (
          <>
            <p
              style={{
                color: successfulExecution ? "#34d399" : "#fbbf24",
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              Status: {execution.status.description}
            </p>

            <pre
              style={{
                padding: 16,
                background: "#1e293b",
                borderRadius: 8,
                color: hasExecutionError ? "#fca5a5" : "#e5e7eb",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontFamily: "monospace",
                fontSize: 15,
                overflowX: "auto",
              }}
            >
              {output || "(no output)"}
            </pre>

            <p style={{ color: "#9ca3af", fontSize: 13 }}>
              Execution time: {execution.time ?? "N/A"} s
              {" · "}
              Memory: {execution.memory ?? "N/A"} KB
            </p>
          </>
        )}

        {!isRunning && !execution && !executionError && (
          <p style={{ color: "#9ca3af" }}>
            Run your code to see execution results here.
          </p>
        )}
      </div>

      {/* =======================================
          Phase 3, Step 3: Test-case runner
          ======================================= */}

      <div className="cr-test-section"
        style={{
          padding: 24,
          background: "#111827",
          borderTop: "2px solid #374151",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 22 }}>
              🧪 Test Cases
            </h3>

            <p style={{ color: "#9ca3af", marginBottom: 0 }}>
              Check your code against multiple inputs.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={addTestCase}
              disabled={isRunning || isRunningTests}
              style={{
                padding: "10px 14px",
                background: "#374151",
                color: "#ffffff",
                border: "1px solid #4b5563",
                borderRadius: 7,
                cursor: "pointer",
              }}
            >
              + Add Test Case
            </button>

            <button
              type="button"
              onClick={handleRunAllTests}
              disabled={isRunning || isRunningTests}
              style={{
                padding: "10px 14px",
                background:
                  isRunningTests ? "#4b5563" : "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 7,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {isRunningTests ? "⏳ Running Tests..." : "▶ Run All Tests"}
            </button>
          </div>
        </div>

        {testRunnerError && (
          <p role="alert" style={{ color: "#fca5a5" }}>
            {testRunnerError}
          </p>
        )}

        {testCases.map((testCase, index) => {
          const result = testResults.find(
            (item) => item.testCaseId === testCase.id,
          );

          const statusColor =
            result?.status === "passed"
              ? "#34d399"
              : result?.status === "failed"
                ? "#f87171"
                : "#fbbf24";

          return (
            <div
              key={testCase.id}
              style={{
                padding: 18,
                marginBottom: 16,
                borderRadius: 10,
                border: "1px solid #374151",
                background: "#030712",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  minWidth: 0,
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <strong style={{ fontSize: 17, minWidth: 0, overflowWrap: "anywhere", flex: "1 1 90px" }}>
                  Test Case {index + 1}
                </strong>

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 10, minWidth: 0, maxWidth: "100%" }}>
                  {result && (
                    <strong style={{ color: statusColor }}>
                      {result.status === "passed"
                        ? "✓ PASSED"
                        : result.status === "failed"
                          ? "✗ FAILED"
                          : "⚠ ERROR"}
                    </strong>
                  )}

                  <button
                    type="button"
                    onClick={() => removeTestCase(testCase.id)}
                    disabled={isRunning || isRunningTests}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#f87171",
                      cursor: "pointer",
                      padding: "4px 0",
                      whiteSpace: "nowrap",
                      flex: "0 0 auto",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <label
                htmlFor={`test-input-${testCase.id}`}
                style={{ display: "block", marginBottom: 7 }}
              >
                Input (stdin)
              </label>

              <textarea
                id={`test-input-${testCase.id}`}
                value={testCase.input}
                onChange={(event) =>
                  updateTestCase(
                    testCase.id,
                    "input",
                    event.target.value,
                  )
                }
                disabled={isRunning || isRunningTests}
                rows={2}
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  padding: 12,
                  marginBottom: 14,
                  background: "#111827",
                  color: "#f9fafb",
                  border: "1px solid #374151",
                  borderRadius: 6,
                  fontFamily: "monospace",
                }}
              />

              <label
                htmlFor={`expected-output-${testCase.id}`}
                style={{ display: "block", marginBottom: 7 }}
              >
                Expected Output
              </label>

              <textarea
                id={`expected-output-${testCase.id}`}
                value={testCase.expectedOutput}
                onChange={(event) =>
                  updateTestCase(
                    testCase.id,
                    "expectedOutput",
                    event.target.value,
                  )
                }
                disabled={isRunning || isRunningTests}
                rows={2}
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  padding: 12,
                  background: "#111827",
                  color: "#f9fafb",
                  border: "1px solid #374151",
                  borderRadius: 6,
                  fontFamily: "monospace",
                }}
              />

              {result && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ marginBottom: 6, color: "#9ca3af" }}>
                    Actual Output
                  </p>

                  <pre
                    style={{
                      padding: 12,
                      margin: 0,
                      background: "#1f2937",
                      borderRadius: 6,
                      color: "#e5e7eb",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      fontFamily: "monospace",
                    }}
                  >
                    {result.actualOutput || "(no output)"}
                  </pre>

                  {result.message && (
                    <p style={{ color: "#fbbf24" }}>
                      {result.message}
                    </p>
                  )}

                  {result.status === "failed" && (
                    <p style={{ color: "#f87171" }}>
                      Expected: {testCase.expectedOutput || "(empty)"}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {testCases.length === 0 && (
          <p style={{ color: "#9ca3af" }}>
            No test cases yet. Click Add Test Case to create one.
          </p>
        )}

        {testResults.length > 0 && (
          <div
            role="status"
            style={{
              padding: 18,
              borderRadius: 8,
              background: "#1f2937",
              border: "1px solid #374151",
            }}
          >
            <h4 style={{ marginTop: 0 }}>Test Summary</h4>

            <p>
              <span style={{ color: "#34d399" }}>
                Passed: {passedCount}
              </span>
              {" · "}
              <span style={{ color: "#f87171" }}>
                Failed: {failedCount}
              </span>
              {" · "}
              <span style={{ color: "#fbbf24" }}>
                Errors: {errorCount}
              </span>
            </p>

            <strong>
              Results: {passedCount} / {testCases.length} test cases passed
            </strong>

            {testResults.length < testCases.length && isRunningTests && (
              <p style={{ color: "#9ca3af" }}>
                {testResults.length} of {testCases.length} tests completed...
              </p>
            )}
          </div>
        )}
      </div>

      <div className="cr-feedback-section" style={{ padding: 24, borderTop: "2px solid #374151", background: "#0b1220", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 22 }}>AI interview feedback</h3>
            <p style={{ margin: 0, color: "#9ca3af" }}>Submit your current solution to generate a report for this room.</p>
          </div>
          <button type="button" onClick={handleGenerateFeedback} disabled={feedbackLoading || userRole !== "candidate"} style={{ padding: "11px 16px", border: 0, borderRadius: 8, color: "white", background: feedbackLoading ? "#4b5563" : "#4f46e5", fontWeight: 700, cursor: feedbackLoading || userRole !== "candidate" ? "not-allowed" : "pointer" }}>
            {feedbackLoading ? "Generating feedback…" : "Submit for AI Feedback"}
          </button>
        </div>
        {userRole !== "candidate" && <p style={{ color: "#9ca3af" }}>AI feedback submission is available to the candidate assigned to this room.</p>}
        {feedbackError && <p role="alert" style={{ color: "#fca5a5", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{feedbackError}</p>}
        {aiReport && <div style={{ marginTop: 18, maxHeight: 420, overflowY: "auto", overflowWrap: "anywhere", padding: 18, borderRadius: 10, background: "#111827", border: "1px solid #374151" }}>
          <h4 style={{ marginTop: 0 }}>Interview report · Score {aiReport.score ?? aiReport.feedback?.correctnessScore ?? "—"}</h4>
          <p style={{ whiteSpace: "pre-wrap" }}>{aiReport.feedback?.summary ?? "Feedback generated successfully."}</p>
          {Array.isArray(aiReport.feedback?.strengths) && <><strong>Strengths</strong><ul>{aiReport.feedback.strengths.map((item: string, i: number) => <li key={`s-${i}`}>{item}</li>)}</ul></>}
          {Array.isArray(aiReport.feedback?.improvements) && <><strong>Areas to improve</strong><ul>{aiReport.feedback.improvements.map((item: string, i: number) => <li key={`i-${i}`}>{item}</li>)}</ul></>}
          <p><strong>Time complexity:</strong> {aiReport.feedback?.timeComplexity ?? "—"}</p>
          <p><strong>Space complexity:</strong> {aiReport.feedback?.spaceComplexity ?? "—"}</p>
        </div>}
      </div>
        </div>
      </div>
    </section>
  );
}