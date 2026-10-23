import { useState } from "react";
import type { SyntheticEvent } from "react";
import "./AuthScreen.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

type AuthUser = { id: string; name: string; email: string; role: "candidate" | "interviewer" };
type AuthResult = { success: boolean; message?: string; data?: { user: AuthUser; token: string } };

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: (token: string, user: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signupRole, setSignupRole] = useState<"candidate" | "interviewer">("candidate");

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (mode === "register" && signupRole === "interviewer") { setNotice("Interviewer accounts are provisioned by an administrator. Please sign in with an existing interviewer account or contact your administrator."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      const result = await response.json() as AuthResult;
      if (!response.ok || !result.success || !result.data?.token || !result.data.user) throw new Error(result.message || "Authentication failed.");
      onAuthenticated(result.data.token, result.data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect to CodeRoom. Check that the API server is running.");
    } finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand"><span className="auth-mark">&lt;/&gt;</span><div><strong>Code<span>Room</span></strong><small>DEVELOPER PLATFORM</small></div></div>
      <div className="auth-eyebrow"><span /> REAL-TIME COLLABORATIVE INTERVIEWS</div>
      <h1>{mode === "login" ? "Welcome back." : "Create your account."}</h1>
      <p className="auth-subtitle">{mode === "login" ? "Sign in to continue to your coding workspace." : "Create a candidate account to join coding interviews."}</p>
      <div className="auth-tabs"><button type="button" className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Sign in</button><button type="button" className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); setNotice(""); }}>Create account</button></div>
      {mode === "register" && <fieldset className="auth-role-fieldset">
        <legend>Choose your account role</legend>
        <div className="auth-role-options">
          <button type="button" className={`auth-role-card ${signupRole === "candidate" ? "active" : ""}`} onClick={() => { setSignupRole("candidate"); setNotice(""); }} aria-pressed={signupRole === "candidate"}>
            <span className="auth-role-icon">&lt;/&gt;</span><span className="auth-role-copy"><strong>Candidate</strong><small>Create an account and join interviews</small></span><span className="auth-role-check">{signupRole === "candidate" ? "✓" : ""}</span>
          </button>
          <button type="button" className={`auth-role-card ${signupRole === "interviewer" ? "active" : ""}`} onClick={() => { setSignupRole("interviewer"); setNotice(""); }} aria-pressed={signupRole === "interviewer"}>
            <span className="auth-role-icon">♙</span><span className="auth-role-copy"><strong>Interviewer</strong><small>Host interviews · administrator access</small></span><span className="auth-role-check">{signupRole === "interviewer" ? "✓" : ""}</span>
          </button>
        </div>
        {signupRole === "interviewer" && <p className="auth-role-help">Interviewer accounts cannot be created through public signup. Contact your administrator to get access.</p>}
      </fieldset>}
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <label>Full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={100} placeholder="Your name" /></label>}
        <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={255} placeholder="you@example.com" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} maxLength={72} placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in to CodeRoom  →" : signupRole === "candidate" ? "Create candidate account  →" : "Interviewer signup unavailable"}</button>
      </form>
      <p className="auth-footnote">Your role controls what you can access in CodeRoom. Interviewer accounts require administrator provisioning.</p>
      <div className="auth-footer"><span>● Secure API authentication</span><span>CodeRoom · v1.0</span></div>
    </section>
  </main>;
}
