import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode, FormEvent } from "react";
import SocketConnection from "./SocketConnection";
import AuthScreen from "./AuthScreen";
import "./App.css";

// ======================================================
// Types
// ======================================================

type AppView = "dashboard" | "room" | "history" | "settings";

type AuthUser = { id: string; name: string; email: string; role: "candidate" | "interviewer" };
type ApiResult<T> = { success: boolean; message?: string; data?: T };
type RoomRecord = { id: string | number; question_title: string; question_description?: string | null; status: string };

interface InterviewFeedback {
  summary?: string;
  correctnessScore?: number;
  readabilityScore?: number;
  efficiencyScore?: number;
  strengths?: string[];
  improvements?: string[];
  timeComplexity?: string;
  spaceComplexity?: string;
}

interface QuestionSnapshot {
  title?: string;
  description?: string;
}

interface InterviewSession {
  id: string | number;
  room_id?: string | number;
  submitted_code?: string | null;
  score?: number | null;
  feedback?: InterviewFeedback | null;
  duration_seconds?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  language_id?: number | null;
  ai_model?: string | null;
  question_snapshot?: string | QuestionSnapshot | null;
}

interface HistoryResponse {
  success: boolean;
  message?: string;
  count?: number;
  data?: InterviewSession[];
}

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  accent: "indigo" | "green" | "blue" | "orange";
}

// ======================================================
// Configuration
// ======================================================

// Vite uses the VITE_ prefix for client-side environment
// variables. The fallback keeps local development simple.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const LANGUAGE_NAMES: Record<number, string> = {
  45: "Assembly",
  46: "Bash",
  47: "Basic",
  49: "C",
  50: "C",
  51: "C#",
  52: "C++",
  53: "C++",
  54: "C++",
  60: "Go",
  62: "Java",
  63: "JavaScript",
  68: "PHP",
  71: "Python",
  72: "Ruby",
  73: "Rust",
  74: "TypeScript",
  91: "Java",
  100: "Python",
  101: "TypeScript",
  102: "JavaScript",
  105: "C++",
  107: "Go",
};

// ======================================================
// Helpers
// ======================================================

function getQuestionSnapshot(
  snapshot: InterviewSession["question_snapshot"],
): QuestionSnapshot {
  if (!snapshot) {
    return {};
  }

  if (typeof snapshot === "object") {
    return snapshot;
  }

  try {
    const parsed: unknown = JSON.parse(snapshot);

    if (parsed && typeof parsed === "object") {
      return parsed as QuestionSnapshot;
    }
  } catch {
    // Older records may not contain valid JSON.
  }

  return {};
}

function getQuestionTitle(session: InterviewSession): string {
  return (
    getQuestionSnapshot(session.question_snapshot).title ||
    `Interview Session #${session.id}`
  );
}

function getQuestionDescription(
  session: InterviewSession,
): string {
  return getQuestionSnapshot(
    session.question_snapshot,
  ).description || "";
}

function getLanguageName(
  languageId?: number | null,
): string {
  if (!languageId) {
    return "Unknown language";
  }

  return LANGUAGE_NAMES[languageId] || `Language ${languageId}`;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRelativeDate(value?: string | null): string {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  const seconds = Math.floor(
    (Date.now() - date.getTime()) / 1000,
  );

  if (seconds < 0) {
    return formatDate(value);
  }

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return formatDate(value);
}

function formatDuration(
  duration?: number | null,
): string {
  if (duration == null || !Number.isFinite(duration)) {
    return "—";
  }

  const safeDuration = Math.max(0, Math.floor(duration));
  const minutes = Math.floor(safeDuration / 60);
  const seconds = safeDuration % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function getScoreLabel(score?: number | null): string {
  if (score == null || !Number.isFinite(score)) {
    return "Not scored";
  }

  if (score >= 85) {
    return "Excellent";
  }

  if (score >= 70) {
    return "Good";
  }

  if (score >= 50) {
    return "Developing";
  }

  return "Needs improvement";
}

function getScoreClass(score?: number | null): string {
  if (score == null || !Number.isFinite(score)) {
    return "neutral";
  }

  if (score >= 85) {
    return "good";
  }

  if (score >= 60) {
    return "medium";
  }

  return "low";
}

function getFeedback(
  session: InterviewSession,
): InterviewFeedback {
  return session.feedback || {};
}

function getValidScore(value?: number | null): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return null;
  }

  return value;
}

// ======================================================
// Icons
// Inline SVG keeps the project free of icon dependencies.
// ======================================================

function Icon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );

    case "code":
      return (
        <svg {...common}>
          <path d="m8 8-4 4 4 4" />
          <path d="m16 8 4 4-4 4" />
          <path d="m14 5-4 14" />
        </svg>
      );

    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" />
        </svg>
      );

    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );

    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );

    case "sparkles":
      return (
        <svg {...common}>
          <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
          <path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" />
        </svg>
      );

    case "activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l3-8 4 16 3-8h4" />
        </svg>
      );

    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M5.6 9A7 7 0 0 1 18 6l2 6" />
          <path d="M18.4 15A7 7 0 0 1 6 18l-2-6" />
        </svg>
      );

    case "terminal":
      return (
        <svg {...common}>
          <path d="m4 17 6-5-6-5" />
          <path d="M12 19h8" />
        </svg>
      );

    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );

    case "menu":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );

    case "close":
      return (
        <svg {...common}>
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      );

    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );

    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6" />
          <path d="m20 4-9 9" />
          <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
        </svg>
      );

    default:
      return null;
  }
}

// ======================================================
// Reusable components
// ======================================================

function StatCard({
  label,
  value,
  detail,
  icon,
  accent,
}: StatCardProps) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon ${accent}`}>{icon}</span>
      </div>

      <div className="stat-value">{value}</div>

      <div className="stat-detail">{detail}</div>
    </article>
  );
}

function ScoreBadge({
  score,
}: {
  score?: number | null;
}) {
  const validScore = getValidScore(score);

  if (validScore === null) {
    return <span className="score-badge neutral">Not scored</span>;
  }

  return (
    <span className={`score-badge ${getScoreClass(validScore)}`}>
      {validScore}/100
    </span>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name="code" size={26} />
      </div>

      <h3>{title}</h3>
      <p>{description}</p>

      {action}
    </div>
  );
}

// ======================================================
// Main application
// ======================================================

function App() {
  const [token, setToken] = useState("");
  const [activeToken, setActiveToken] = useState(() => window.localStorage.getItem("coderoom_token") || "");
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try { const raw = window.localStorage.getItem("coderoom_user"); return raw ? JSON.parse(raw) as AuthUser : null; } catch { return null; }
  });
  const [authChecking, setAuthChecking] = useState(Boolean(window.localStorage.getItem("coderoom_token")));
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState(() => window.localStorage.getItem("coderoom_room_id") || "");
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomMessage, setRoomMessage] = useState("");
  const [roomError, setRoomError] = useState("");
  const [activeView, setActiveView] =
    useState<AppView>("dashboard");

  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [selectedSession, setSelectedSession] =
    useState<InterviewSession | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Authenticated child components dispatch this event when the API confirms
  // that a JWT is no longer valid. Keep the app and Socket.IO props in sync.
  useEffect(() => {
    const handleAuthExpired = () => {
      window.localStorage.removeItem("coderoom_token");
      window.localStorage.removeItem("coderoom_user");
      setActiveToken("");
      setAuthUser(null);
      setSessions([]);
      setSelectedSession(null);
      setHistoryError("Your session expired. Please sign in again.");
      setAuthChecking(false);
    };

    window.addEventListener("coderoom:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("coderoom:auth-expired", handleAuthExpired);
  }, []);

  // --------------------------------------------------
  // Load history from the existing authenticated API.
  // --------------------------------------------------

  const loadHistory = useCallback(async () => {
    if (!activeToken) {
      setSessions([]);
      setHistoryError("");
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/history`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
      });

      const result = (await response.json()) as HistoryResponse;

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("coderoom:auth-expired"));
          throw new Error("Your session has expired. Please sign in again.");
        }

        if (response.status === 403) {
          throw new Error(
            "Your account is not authorized to view this history.",
          );
        }

        throw new Error(
          result.message || "Unable to load interview history.",
        );
      }

      setSessions(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while loading history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [activeToken]);

  useEffect(() => {
    let cancelled = false;
    async function validateSavedSession() {
      // Read the latest saved value rather than relying on the first render's
      // state snapshot. This also handles a token changed in another tab.
      const savedToken = window.localStorage.getItem("coderoom_token") || "";
      if (!savedToken) {
        if (!cancelled) {
          setActiveToken("");
          setAuthUser(null);
          setAuthChecking(false);
        }
        return;
      }
      setActiveToken(savedToken);
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${savedToken}`, Accept: "application/json" },
        });
        const result = await response.json() as ApiResult<{ id: string; name?: string; email?: string; role: "candidate" | "interviewer" }>;
        if (!response.ok || !result.success || !result.data) {
          throw new Error("Saved session is invalid or expired");
        }
        if (!cancelled) {
          let savedUser: Partial<AuthUser> = {};
          try {
            savedUser = JSON.parse(window.localStorage.getItem("coderoom_user") || "{}") as Partial<AuthUser>;
          } catch {
            savedUser = {};
          }
          const restoredUser: AuthUser = {
            id: String(result.data.id),
            name: result.data.name || savedUser.name || "CodeRoom user",
            email: result.data.email || savedUser.email || "",
            role: result.data.role,
          };
          setAuthUser(restoredUser);
          window.localStorage.setItem("coderoom_user", JSON.stringify(restoredUser));
        }
      } catch {
        if (!cancelled) {
          window.localStorage.removeItem("coderoom_token");
          window.localStorage.removeItem("coderoom_user");
          setActiveToken("");
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    }
    void validateSavedSession();
    return () => { cancelled = true; };
  // Run once when the app starts; the saved token is intentionally read inside.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep authentication state in sync when another tab signs in or out.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "coderoom_token") {
        const nextToken = event.newValue || "";
        setActiveToken(nextToken);
        if (!nextToken) setAuthUser(null);
      }
      if (event.key === "coderoom_user" && event.newValue) {
        try { setAuthUser(JSON.parse(event.newValue) as AuthUser); } catch { /* Ignore malformed cross-tab data. */ }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (activeToken) {
      void loadHistory();
    } else {
      setSessions([]);
      setSelectedSession(null);
    }
  }, [activeToken, loadHistory]);

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------

  useEffect(() => {
    if (selectedRoomId) window.localStorage.setItem("coderoom_room_id", selectedRoomId);
    else window.localStorage.removeItem("coderoom_room_id");
  }, [selectedRoomId]);

  function navigate(view: AppView) {
    setActiveView(view);
    setSidebarOpen(false);
    setSelectedSession(null);
  }

  function onAuthenticated(newToken: string, user: AuthUser) {
    window.localStorage.setItem("coderoom_token", newToken);
    window.localStorage.setItem("coderoom_user", JSON.stringify(user));
    setActiveToken(newToken); setAuthUser(user); setToken(""); setAuthChecking(false); setActiveView("dashboard");
  }

  function disconnectFromCodeRoom() {
    window.localStorage.removeItem("coderoom_token");
    window.localStorage.removeItem("coderoom_user");
    setActiveToken(""); setAuthUser(null); setToken(""); setSessions([]); setSelectedSession(null); setHistoryError(""); setSelectedRoomId(""); window.localStorage.removeItem("coderoom_room_id"); setRoomMessage(""); setRoomError(""); setActiveView("dashboard");
  }

  async function createInterviewRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setRoomBusy(true); setRoomError(""); setRoomMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${activeToken}`, Accept: "application/json" }, body: JSON.stringify({ questionTitle: roomTitle.trim(), questionDescription: roomDescription.trim() }) });
      const result = await response.json() as ApiResult<RoomRecord>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || "Unable to create room.");
      const id = String(result.data.id); setRoomIdInput(id); setRoomTitle(""); setRoomDescription(""); setRoomMessage(`Room #${id} created. Share this ID with your candidate. The session becomes active when the candidate joins.`);
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Unable to create room."); }
    finally { setRoomBusy(false); }
  }

  async function joinInterviewRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const cleanId = roomIdInput.trim(); setRoomBusy(true); setRoomError(""); setRoomMessage("");
    if (!/^[1-9]\d*$/.test(cleanId)) { setRoomBusy(false); setRoomError("Enter a valid positive room ID."); return; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(cleanId)}/join`, { method: "POST", headers: { Authorization: `Bearer ${activeToken}`, Accept: "application/json" } });
      const result = await response.json() as ApiResult<RoomRecord>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || "Unable to join this room. Check the ID and make sure it is waiting for a candidate.");
      setSelectedRoomId(cleanId); setRoomMessage(`Room #${cleanId} joined. Connect to the live session below.`);
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Unable to join room."); }
    finally { setRoomBusy(false); }
  }

  // --------------------------------------------------
  // Dashboard metrics
  // --------------------------------------------------

  const completedSessions = sessions.filter(
    (session) => session.feedback != null,
  );

  const scoredSessions = completedSessions.filter(
    (session) => getValidScore(session.score) !== null,
  );

  const averageScore = useMemo(() => {
    if (scoredSessions.length === 0) {
      return null;
    }

    const total = scoredSessions.reduce(
      (sum, session) => sum + (session.score ?? 0),
      0,
    );

    return Math.round(total / scoredSessions.length);
  }, [scoredSessions]);

  const highestScore = useMemo(() => {
    if (scoredSessions.length === 0) {
      return null;
    }

    return Math.max(
      ...scoredSessions.map((session) => session.score ?? 0),
    );
  }, [scoredSessions]);

  const totalDuration = completedSessions.reduce(
    (sum, session) => sum + (session.duration_seconds ?? 0),
    0,
  );

  const filteredSessions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return sessions.filter((session) => {
      const matchesSearch =
        !query ||
        getQuestionTitle(session).toLowerCase().includes(query) ||
        getLanguageName(session.language_id).toLowerCase().includes(query) ||
        String(session.room_id ?? "").includes(query);

      const score = getValidScore(session.score);

      const matchesScore =
        scoreFilter === "all" ||
        (scoreFilter === "excellent" && score !== null && score >= 85) ||
        (scoreFilter === "good" && score !== null && score >= 70 && score < 85) ||
        (scoreFilter === "improve" && score !== null && score < 70) ||
        (scoreFilter === "unscored" && score === null);

      return matchesSearch && matchesScore;
    });
  }, [sessions, searchTerm, scoreFilter]);

  const recentSessions = [...sessions]
    .sort((a, b) => {
      const dateA = new Date(
        a.completed_at || a.created_at || 0,
      ).getTime();

      const dateB = new Date(
        b.completed_at || b.created_at || 0,
      ).getTime();

      return dateB - dateA;
    })
    .slice(0, 5);

  // --------------------------------------------------
  // Shared history table
  // --------------------------------------------------

  function renderHistoryTable(
    rows: InterviewSession[],
    compact = false,
  ) {
    if (rows.length === 0) {
      return (
        <EmptyState
          title={
            sessions.length === 0
              ? "No interviews yet"
              : "No matching interviews"
          }
          description={
            sessions.length === 0
              ? "Your completed coding interviews and AI feedback will appear here."
              : "Try changing your search term or score filter."
          }
          action={
            sessions.length === 0 ? (
              <button
                className="button button-primary"
                onClick={() => navigate("room")}
                type="button"
              >
                Open live room
                <Icon name="arrow" size={16} />
              </button>
            ) : undefined
          }
        />
      );
    }

    return (
      <div className="table-scroll">
        <table className="session-table">
          <thead>
            <tr>
              <th>Problem</th>
              <th>Language</th>
              <th>Score</th>
              <th>Duration</th>
              <th>Date</th>
              <th aria-label="Actions" />
            </tr>
          </thead>

          <tbody>
            {rows.map((session) => {
              const date =
                session.completed_at ||
                session.created_at ||
                session.started_at;

              return (
                <tr key={session.id}>
                  <td>
                    <button
                      className="problem-cell"
                      type="button"
                      onClick={() => setSelectedSession(session)}
                    >
                      <span className="problem-icon">
                        <Icon name="code" size={17} />
                      </span>

                      <span className="problem-copy">
                        <span className="problem-title">
                          {getQuestionTitle(session)}
                        </span>

                        <span className="problem-subtitle">
                          Room #{session.room_id ?? "—"}
                        </span>
                      </span>
                    </button>
                  </td>

                  <td>
                    <span className="language-pill">
                      <span className="language-dot" />
                      {getLanguageName(session.language_id)}
                    </span>
                  </td>

                  <td>
                    <ScoreBadge score={session.score} />
                  </td>

                  <td className="muted-cell">
                    {formatDuration(session.duration_seconds)}
                  </td>

                  <td className="muted-cell">
                    {compact
                      ? formatRelativeDate(date)
                      : formatDate(date)}
                  </td>

                  <td>
                    <button
                      className="icon-button row-action"
                      type="button"
                      aria-label={`View ${getQuestionTitle(session)}`}
                      onClick={() => setSelectedSession(session)}
                    >
                      <Icon name="arrow" size={17} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ==================================================
  // Render
  // ==================================================

  if (authChecking) return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="auth-mark">&lt;/&gt;</span><div><strong>Code<span>Room</span></strong><small>DEVELOPER PLATFORM</small></div></div><p className="auth-subtitle">Restoring your secure session…</p></section></main>;
  if (!activeToken || !authUser) return <AuthScreen onAuthenticated={onAuthenticated} />;

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="mobile-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ==============================================
          Sidebar
      ============================================== */}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button
          className="brand"
          type="button"
          onClick={() => navigate("dashboard")}
        >
          <span className="brand-mark">
            <Icon name="terminal" size={23} />
          </span>

          <span className="brand-name">
            Code<span>Room</span>
            <small>DEVELOPER PLATFORM</small>
          </span>
        </button>

        <div className="sidebar-workspace">
          <span className="workspace-avatar">CR</span>

          <span className="workspace-copy">
            <strong>CodeRoom Workspace</strong>
            <small>Personal workspace</small>
          </span>

          <span className="workspace-status" />
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <button
            type="button"
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => navigate("dashboard")}
          >
            <Icon name="grid" />
            <span>Dashboard</span>
            {activeView === "dashboard" && (
              <span className="nav-active-indicator" />
            )}
          </button>

          <button
            type="button"
            className={`nav-item ${activeView === "room" ? "active" : ""}`}
            onClick={() => navigate("room")}
          >
            <Icon name="code" />
            <span>Live Room</span>
            <span className="nav-beta">LIVE</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeView === "history" ? "active" : ""}`}
            onClick={() => navigate("history")}
          >
            <Icon name="history" />
            <span>Interview History</span>
          </button>

          <div className="sidebar-section-label sidebar-section-spaced">
            PREFERENCES
          </div>

          <button
            type="button"
            className={`nav-item ${activeView === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Icon name="settings" />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help-card">
            <div className="help-icon">
              <Icon name="sparkles" size={19} />
            </div>

            <strong>Keep improving</strong>

            <p>
              Review your AI feedback and make every interview count.
            </p>

            <button
              type="button"
              onClick={() => navigate("history")}
            >
              Review feedback
              <Icon name="arrow" size={15} />
            </button>
          </div>

          <div className="sidebar-footer">
            <span className="footer-status" />

            <span>All systems operational</span>

            <span className="footer-version">v1.0</span>
          </div>
        </div>
      </aside>

      {/* ==============================================
          Main application
      ============================================== */}

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button mobile-menu-button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" size={21} />
            </button>

            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>
                {activeView === "dashboard" && "Dashboard"}
                {activeView === "room" && "Live Room"}
                {activeView === "history" && "Interview History"}
                {activeView === "settings" && "Settings"}
              </strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="system-status">
              <span className="footer-status" />
              <span>API workspace</span>
            </div>

            <div className="topbar-divider" />

            {activeToken ? (
              <div className="account-menu">
                <span className="account-avatar">
                  <Icon name="code" size={19} />
                </span>

                <div className="account-copy">
                  <strong>{authUser?.name || "Connected"}</strong>
                  <small>{authUser?.role || "Authenticated"}</small>
                </div>

                <button
                  className="button button-secondary disconnect-button"
                  type="button"
                  onClick={disconnectFromCodeRoom}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                className="button button-primary topbar-connect"
                type="button"
                onClick={() => navigate("settings")}
              >
                Connect account
                <Icon name="arrow" size={16} />
              </button>
            )}
          </div>
        </header>

        <main className="page-content">
          {/* ==========================================
              DASHBOARD
          ========================================== */}

          {activeView === "dashboard" && (
            <>
              <section className="welcome-section">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    YOUR DEVELOPER WORKSPACE
                  </div>

                  <h1>
                    Good to see you<span className="heading-period">.</span>
                  </h1>

                  <p>
                    Track your interview progress, review AI insights,
                    and sharpen your problem-solving skills.
                  </p>
                </div>

                <div className="welcome-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void loadHistory()}
                    disabled={!activeToken || historyLoading}
                  >
                    <Icon
                      name="refresh"
                      size={16}
                    />
                    Refresh
                  </button>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => navigate("room")}
                  >
                    <Icon name="code" size={17} />
                    Open live room
                  </button>
                </div>
              </section>

              {!activeToken && (
                <section className="connection-banner">
                  <div className="connection-banner-icon">
                    <Icon name="shield" size={23} />
                  </div>

                  <div className="connection-banner-copy">
                    <strong>Connect your account to get started</strong>

                    <p>
                      Authenticate with your CodeRoom API to load your
                      interview history and personal performance metrics.
                    </p>
                  </div>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => navigate("settings")}
                  >
                    Connect now
                    <Icon name="arrow" size={16} />
                  </button>
                </section>
              )}

              {historyError && (
                <div className="error-banner" role="alert">
                  <span>{historyError}</span>

                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                  >
                    Retry
                  </button>
                </div>
              )}

              <section className="stats-grid">
                <StatCard
                  label="Total interviews"
                  value={
                    historyLoading && sessions.length === 0
                      ? "..."
                      : String(completedSessions.length)
                  }
                  detail="Saved interview reports"
                  accent="indigo"
                  icon={<Icon name="code" size={20} />}
                />

                <StatCard
                  label="Average score"
                  value={
                    averageScore === null
                      ? "—"
                      : `${averageScore}%`
                  }
                  detail={
                    averageScore === null
                      ? "No scored sessions yet"
                      : getScoreLabel(averageScore)
                  }
                  accent="green"
                  icon={<Icon name="activity" size={20} />}
                />

                <StatCard
                  label="Best score"
                  value={
                    highestScore === null
                      ? "—"
                      : `${highestScore}%`
                  }
                  detail={
                    highestScore === null
                      ? "Your top result"
                      : "Highest recorded result"
                  }
                  accent="blue"
                  icon={<Icon name="check" size={20} />}
                />

                <StatCard
                  label="Practice time"
                  value={
                    totalDuration === 0
                      ? "0m"
                      : totalDuration >= 3600
                        ? `${(totalDuration / 3600).toFixed(1)}h`
                        : `${Math.round(totalDuration / 60)}m`
                  }
                  detail="Across completed sessions"
                  accent="orange"
                  icon={<Icon name="clock" size={20} />}
                />
              </section>

              <section className="dashboard-grid">
                <div className="panel recent-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Recent interviews</h2>
                      <p>Your latest coding sessions and results.</p>
                    </div>

                    <button
                      className="text-button"
                      type="button"
                      onClick={() => navigate("history")}
                    >
                      View all
                      <Icon name="arrow" size={15} />
                    </button>
                  </div>

                  {historyLoading && sessions.length === 0 ? (
                    <div className="loading-state">
                      <span className="spinner" />
                      Loading your interview history...
                    </div>
                  ) : (
                    renderHistoryTable(recentSessions, true)
                  )}
                </div>

                <div className="panel insights-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Performance snapshot</h2>
                      <p>A quick look at your progress.</p>
                    </div>

                    <span className="panel-header-icon">
                      <Icon name="sparkles" size={19} />
                    </span>
                  </div>

                  {scoredSessions.length === 0 ? (
                    <div className="snapshot-empty">
                      <div className="snapshot-empty-icon">
                        <Icon name="activity" size={22} />
                      </div>

                      <strong>Your insights start here</strong>

                      <p>
                        Complete an interview to see your score
                        distribution and performance indicators.
                      </p>
                    </div>
                  ) : (
                    <div className="snapshot-content">
                      <div className="snapshot-score">
                        <div>
                          <span className="snapshot-label">
                            Average overall score
                          </span>

                          <div className="snapshot-number">
                            {averageScore}%
                          </div>
                        </div>

                        <span
                          className={`score-badge ${getScoreClass(averageScore)}`}
                        >
                          {getScoreLabel(averageScore)}
                        </span>
                      </div>

                      <div className="score-meter">
                        <div
                          className="score-meter-fill"
                          style={{
                            width: `${averageScore ?? 0}%`,
                          }}
                        />
                      </div>

                      <div className="snapshot-divider" />

                      <div className="snapshot-metric">
                        <span>Excellent results</span>
                        <strong>
                          {
                            scoredSessions.filter(
                              (session) => (session.score ?? 0) >= 85,
                            ).length
                          }
                        </strong>
                      </div>

                      <div className="snapshot-metric">
                        <span>Sessions reviewed</span>
                        <strong>{scoredSessions.length}</strong>
                      </div>

                      <div className="snapshot-metric">
                        <span>Highest score</span>
                        <strong>{highestScore}%</strong>
                      </div>

                      <button
                        className="button button-secondary snapshot-button"
                        type="button"
                        onClick={() => navigate("history")}
                      >
                        Explore all results
                        <Icon name="arrow" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="bottom-grid">
                <div className="panel quickstart-panel">
                  <div className="quickstart-heading">
                    <div className="quickstart-icon">
                      <Icon name="terminal" size={21} />
                    </div>

                    <div>
                      <h2>Ready to practice?</h2>
                      <p>
                        Jump into a collaborative coding session.
                      </p>
                    </div>
                  </div>

                  <div className="quickstart-steps">
                    <div className="quickstart-step">
                      <span className="step-number">01</span>
                      <span>Connect your account</span>
                    </div>

                    <div className="quickstart-step">
                      <span className="step-number">02</span>
                      <span>Join your interview room</span>
                    </div>

                    <div className="quickstart-step">
                      <span className="step-number">03</span>
                      <span>Submit code for AI feedback</span>
                    </div>
                  </div>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => navigate("room")}
                  >
                    Go to live room
                    <Icon name="arrow" size={16} />
                  </button>
                </div>

                <div className="panel platform-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Platform status</h2>
                      <p>Frontend workspace overview.</p>
                    </div>
                  </div>

                  <div className="platform-row">
                    <span className="platform-row-icon">
                      <Icon name="code" size={17} />
                    </span>

                    <span className="platform-row-copy">
                      <strong>Collaborative editor</strong>
                      <small>Socket.IO integration</small>
                    </span>

                    <span className="platform-tag">Integrated</span>
                  </div>

                  <div className="platform-row">
                    <span className="platform-row-icon">
                      <Icon name="sparkles" size={17} />
                    </span>

                    <span className="platform-row-copy">
                      <strong>AI code feedback</strong>
                      <small>Gemini-generated reports</small>
                    </span>

                    <span className="platform-tag">Integrated</span>
                  </div>

                  <div className="platform-row">
                    <span className="platform-row-icon">
                      <Icon name="history" size={17} />
                    </span>

                    <span className="platform-row-copy">
                      <strong>Interview history</strong>
                      <small>PostgreSQL-backed records</small>
                    </span>

                    <span className="platform-tag">Integrated</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ==========================================
              LIVE ROOM
          ========================================== */}

          {activeView === "room" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    COLLABORATION
                  </div>

                  <h1>Live room</h1>

                  <p>
                    Connect to a collaborative coding session with
                    real-time updates.
                  </p>
                </div>

                <span className="live-status-badge">
                  <span className="footer-status" />
                  Real-time workspace
                </span>
              </section>

              <section className="panel room-intro">
                <div className="room-intro-icon"><Icon name="terminal" size={24} /></div>
                <div><h2>Your coding workspace</h2><p>Interviewers can create a room; candidates can enter the exact room ID they received.</p></div>
              </section>

              {authUser?.role === "interviewer" && (
                <section className="panel room-connection-panel">
                  <div className="panel-header"><div><h2>Create an interview room</h2><p>Create a waiting room and share its ID with your candidate.</p></div><span className="panel-header-icon"><Icon name="code" size={19} /></span></div>
                  <form className="settings-form" onSubmit={createInterviewRoom}>
                    <label className="form-label" htmlFor="room-title">Question title</label>
                    <input id="room-title" className="room-form-input" value={roomTitle} onChange={e => setRoomTitle(e.target.value)} required maxLength={255} placeholder="e.g. Two Sum" />
                    <label className="form-label" htmlFor="room-description">Question description <span className="muted-cell">(optional)</span></label>
                    <textarea id="room-description" className="token-textarea" rows={3} value={roomDescription} onChange={e => setRoomDescription(e.target.value)} placeholder="Add the prompt and any constraints…" />
                    <button className="button button-primary" type="submit" disabled={roomBusy}>{roomBusy ? "Creating…" : "Create Room"}<Icon name="arrow" size={16} /></button>
                  </form>
                </section>
              )}

              {authUser?.role === "candidate" && (
                <section className="panel room-connection-panel">
                  <div className="panel-header"><div><h2>Join an interview room</h2><p>Enter the room ID shared by your interviewer. You will join that exact room.</p></div><span className="panel-header-icon"><Icon name="arrow" size={19} /></span></div>
                  <form className="settings-form room-join-form" onSubmit={joinInterviewRoom}>
                    <label className="form-label" htmlFor="join-room-id">Interview room ID</label>
                    <input id="join-room-id" className="room-form-input" inputMode="numeric" pattern="[1-9][0-9]*" value={roomIdInput} onChange={e => setRoomIdInput(e.target.value)} required placeholder="Enter room ID, e.g. 12" />
                    <button className="button button-primary" type="submit" disabled={roomBusy}>{roomBusy ? "Joining…" : "Join Room"}<Icon name="arrow" size={16} /></button>
                  </form>
                </section>
              )}

              {roomError && <div className="error-banner" role="alert">{roomError}</div>}
              {roomMessage && <div className="connection-banner"><div className="connection-banner-copy"><strong>{roomMessage}</strong></div>{selectedRoomId && <button className="button button-secondary" type="button" onClick={() => { void navigator.clipboard?.writeText(selectedRoomId); }}>Copy ID #{selectedRoomId}</button>}</div>}

              {authUser?.role === "interviewer" && (
                <section className="panel room-connection-panel">
                  <div className="panel-header"><div><h2>Join your live workspace</h2><p>After the candidate joins, connect to the active room using its ID.</p></div></div>
                  <form className="settings-form room-join-form" onSubmit={(event) => { event.preventDefault(); const clean = roomIdInput.trim(); if (!/^[1-9]\d*$/.test(clean)) { setRoomError("Enter a valid positive room ID."); return; } setSelectedRoomId(clean); setRoomError(""); setRoomMessage(`Selected room #${clean}.`); }}>
                    <label className="form-label" htmlFor="interviewer-room-id">Room ID</label><input id="interviewer-room-id" className="room-form-input" value={roomIdInput} onChange={e => setRoomIdInput(e.target.value)} required placeholder="Enter a room ID you created" />
                    <button className="button button-secondary" type="submit">Open room workspace</button>
                  </form>
                </section>
              )}



              <div className="security-note">
                <Icon name="shield" size={18} />

                <p>
                  <strong>Security note:</strong> Your access token is managed automatically for this browser session. Sign out on shared devices.
                </p>
              </div>
            </>
          )}

          {/* ==========================================
              INTERVIEW HISTORY
          ========================================== */}

          {activeView === "history" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    YOUR ACTIVITY
                  </div>

                  <h1>Interview history</h1>

                  <p>
                    Review previous sessions, explore your results,
                    and revisit AI-generated feedback.
                  </p>
                </div>

                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void loadHistory()}
                  disabled={!activeToken || historyLoading}
                >
                  <Icon name="refresh" size={16} />
                  Refresh history
                </button>
              </section>

              {historyError && (
                <div className="error-banner" role="alert">
                  <span>{historyError}</span>

                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!activeToken ? (
                <section className="panel">
                  <EmptyState
                    title="Authentication required"
                    description="Connect your CodeRoom account to access your private interview reports."
                    action={
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => navigate("settings")}
                      >
                        Connect account
                        <Icon name="arrow" size={16} />
                      </button>
                    }
                  />
                </section>
              ) : (
                <>
                  <section className="history-summary-grid">
                    <div className="history-summary-card">
                      <span>Completed interviews</span>
                      <strong>{completedSessions.length}</strong>
                    </div>

                    <div className="history-summary-card">
                      <span>Average score</span>
                      <strong>
                        {averageScore === null ? "—" : `${averageScore}%`}
                      </strong>
                    </div>

                    <div className="history-summary-card">
                      <span>Highest score</span>
                      <strong>
                        {highestScore === null ? "—" : `${highestScore}%`}
                      </strong>
                    </div>
                  </section>

                  <section className="panel history-panel">
                    <div className="panel-header history-panel-header">
                      <div>
                        <h2>All sessions</h2>

                        <p>
                          {historyLoading
                            ? "Loading sessions..."
                            : `${filteredSessions.length} session${filteredSessions.length === 1 ? "" : "s"} found`}
                        </p>
                      </div>
                    </div>

                    <div className="history-toolbar">
                      <label className="search-field">
                        <Icon name="search" size={18} />

                        <input
                          type="search"
                          placeholder="Search problems or languages..."
                          value={searchTerm}
                          onChange={(event) =>
                            setSearchTerm(event.target.value)
                          }
                        />
                      </label>

                      <select
                        className="filter-select"
                        value={scoreFilter}
                        onChange={(event) =>
                          setScoreFilter(event.target.value)
                        }
                        aria-label="Filter by score"
                      >
                        <option value="all">All scores</option>
                        <option value="excellent">85–100 · Excellent</option>
                        <option value="good">70–84 · Good</option>
                        <option value="improve">Below 70</option>
                        <option value="unscored">Not scored</option>
                      </select>
                    </div>

                    {historyLoading && sessions.length === 0 ? (
                      <div className="loading-state">
                        <span className="spinner" />
                        Loading your interview history...
                      </div>
                    ) : (
                      renderHistoryTable(filteredSessions)
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {/* ==========================================
              SETTINGS
          ========================================== */}

          {activeView === "settings" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    CONFIGURATION
                  </div>

                  <h1>Settings</h1>

                  <p>
                    Manage your local API connection and workspace
                    preferences.
                  </p>
                </div>
              </section>

              <section className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h2>API connection</h2>

                    <p>
                      Authenticate against your CodeRoom backend.
                    </p>
                  </div>

                  <span className="panel-header-icon">
                    <Icon name="shield" size={19} />
                  </span>
                </div>

                <div className="settings-api-row">
                  <div>
                    <span className="settings-label">API base URL</span>
                    <code>{API_BASE_URL}</code>
                  </div>

                  <span className="settings-readonly">CONFIGURED</span>
                </div>

                <div className="settings-api-row">
                  <div>
                    <span className="settings-label">Authentication status</span>

                    <strong>
                      {activeToken ? "Connected" : "Not connected"}
                    </strong>
                  </div>

                  <span
                    className={`connection-indicator ${activeToken ? "connected" : ""}`}
                  >
                    <span className="footer-status" />
                    {activeToken ? "Connected" : "Disconnected"}
                  </span>
                </div>

                <div className="settings-form">
                  <div className="settings-form-footer"><p>Signed in as <strong>{authUser?.name}</strong> ({authUser?.email || authUser?.role}). Authentication is handled automatically; no manual JWT paste is required.</p><button className="button button-secondary" type="button" onClick={disconnectFromCodeRoom}>Sign out</button></div>
                </div>
              </section>

              <section className="panel settings-panel">
                <div className="panel-header">
                  <div>
                    <h2>Workspace information</h2>

                    <p>
                      Technologies powering your development environment.
                    </p>
                  </div>
                </div>

                <div className="technology-grid">
                  <div className="technology-item">
                    <span>REACT</span>
                    <strong>Frontend</strong>
                    <small>Component-based UI</small>
                  </div>

                  <div className="technology-item">
                    <span>TYPESCRIPT</span>
                    <strong>Type safety</strong>
                    <small>Typed application logic</small>
                  </div>

                  <div className="technology-item">
                    <span>SOCKET.IO</span>
                    <strong>Collaboration</strong>
                    <small>Real-time communication</small>
                  </div>

                  <div className="technology-item">
                    <span>GEMINI</span>
                    <strong>AI feedback</strong>
                    <small>Code analysis reports</small>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ==========================================
              REPORT DETAILS
          ========================================== */}

          {selectedSession && (
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedSession(null);
                }
              }}
            >
              <section
                className="report-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="report-modal-title"
              >
                <div className="report-modal-header">
                  <div>
                    <div className="eyebrow">
                      <span className="eyebrow-line" />
                      AI INTERVIEW REPORT
                    </div>

                    <h2 id="report-modal-title">
                      {getQuestionTitle(selectedSession)}
                    </h2>

                    <p>
                      Session #{selectedSession.id} ·{" "}
                      {formatDate(
                        selectedSession.completed_at ||
                          selectedSession.created_at,
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close report"
                    onClick={() => setSelectedSession(null)}
                  >
                    <Icon name="close" size={21} />
                  </button>
                </div>

                <div className="report-modal-body">
                  <div className="report-summary-grid">
                    <div className="report-summary-card">
                      <span>Overall score</span>

                      <strong>
                        {getValidScore(selectedSession.score) === null
                          ? "—"
                          : `${selectedSession.score}%`}
                      </strong>

                      <small>
                        {getScoreLabel(selectedSession.score)}
                      </small>
                    </div>

                    <div className="report-summary-card">
                      <span>Language</span>

                      <strong className="report-language">
                        {getLanguageName(selectedSession.language_id)}
                      </strong>

                      <small>Submitted solution</small>
                    </div>

                    <div className="report-summary-card">
                      <span>Duration</span>

                      <strong>
                        {formatDuration(
                          selectedSession.duration_seconds,
                        )}
                      </strong>

                      <small>Interview session</small>
                    </div>
                  </div>

                  {getQuestionDescription(selectedSession) && (
                    <div className="report-section">
                      <h3>Problem statement</h3>

                      <p className="report-description">
                        {getQuestionDescription(selectedSession)}
                      </p>
                    </div>
                  )}

                  <div className="report-section">
                    <h3>AI assessment</h3>

                    <p className="report-summary">
                      {getFeedback(selectedSession).summary ||
                        "No summary is available for this report."}
                    </p>

                    <div className="feedback-scores">
                      {(
                        [
                          {
                            label: "Correctness",
                            value: getFeedback(selectedSession)
                              .correctnessScore,
                          },
                          {
                            label: "Readability",
                            value: getFeedback(selectedSession)
                              .readabilityScore,
                          },
                          {
                            label: "Efficiency",
                            value: getFeedback(selectedSession)
                              .efficiencyScore,
                          },
                        ] as const
                      ).map((item) => (
                        <div
                          className="feedback-score-row"
                          key={item.label}
                        >
                          <div className="feedback-score-heading">
                            <span>{item.label}</span>

                            <strong>
                              {getValidScore(item.value) === null
                                ? "—"
                                : `${item.value}/100`}
                            </strong>
                          </div>

                          <div className="score-meter">
                            <div
                              className="score-meter-fill"
                              style={{
                                width: `${getValidScore(item.value) ?? 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="report-two-column">
                    <div className="report-section">
                      <h3>
                        <span className="report-heading-icon positive">
                          <Icon name="check" size={16} />
                        </span>
                        Strengths
                      </h3>

                      {getFeedback(selectedSession).strengths?.length ? (
                        <ul className="feedback-list strengths-list">
                          {getFeedback(selectedSession).strengths?.map(
                            (item, index) => (
                              <li key={`${index}-${item}`}>{item}</li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="muted-paragraph">
                          No strengths were provided.
                        </p>
                      )}
                    </div>

                    <div className="report-section">
                      <h3>
                        <span className="report-heading-icon improve">
                          <Icon name="activity" size={16} />
                        </span>
                        Improvements
                      </h3>

                      {getFeedback(selectedSession).improvements?.length ? (
                        <ul className="feedback-list improvements-list">
                          {getFeedback(selectedSession).improvements?.map(
                            (item, index) => (
                              <li key={`${index}-${item}`}>{item}</li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="muted-paragraph">
                          No improvement suggestions were provided.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="report-two-column">
                    <div className="complexity-card">
                      <span>Time complexity</span>

                      <strong>
                        {getFeedback(selectedSession).timeComplexity ||
                          "Not provided"}
                      </strong>
                    </div>

                    <div className="complexity-card">
                      <span>Space complexity</span>

                      <strong>
                        {getFeedback(selectedSession).spaceComplexity ||
                          "Not provided"}
                      </strong>
                    </div>
                  </div>

                  <div className="report-metadata">
                    <span>
                      AI model: {selectedSession.ai_model || "Not recorded"}
                    </span>

                    <span>
                      Room: #{selectedSession.room_id ?? "—"}
                    </span>
                  </div>

                  {selectedSession.submitted_code && (
                    <div className="report-section">
                      <h3>Submitted code</h3>

                      <pre className="code-preview">
                        <code>{selectedSession.submitted_code}</code>
                      </pre>
                    </div>
                  )}

                  <div className="report-disclaimer">
                    <Icon name="shield" size={17} />

                    <p>
                      AI feedback is an advisory assessment, not a
                      guarantee of correctness. Review the code and
                      validate its behavior with appropriate test cases.
                    </p>
                  </div>
                </div>

                <div className="report-modal-footer">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setSelectedSession(null)}
                  >
                    Close report
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeToken && authUser && selectedRoomId && (
            <section className="panel room-connection-panel" style={{ display: activeView === "room" ? "block" : "none" }} aria-hidden={activeView !== "room"}>
              <div className="panel-header"><div><h2>Live collaboration</h2><p>Room #{selectedRoomId} · authenticated Socket.IO session</p></div><span className="panel-header-icon"><Icon name="shield" size={19} /></span></div>
              <div className="socket-component-wrapper"><div className="socket-component-heading"><span className="footer-status" /><strong>Socket.IO session</strong></div><SocketConnection token={activeToken} initialRoomId={selectedRoomId} userRole={authUser.role} /></div>
            </section>
          )}

          <footer className="page-footer">
            <span>
              <span className="footer-brand-dot" />
              CodeRoom
            </span>

            <span>Built for better technical interviews.</span>

            <span>Developer Workspace · v1.0</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;