import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, ShieldCheck, Loader2 } from "lucide-react";
import Workspace from "./Workspace";
import "./styles.css";
function App() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => setAuthenticated(r.ok))
      .catch(() =>
        setError("Could not reach the server. Check that it is running."),
      )
      .finally(() => setReady(true));
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const j = (await r.json()) as { error: string };
        throw new Error(j.error);
      }
      setPassword("");
      setAuthenticated(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <div className="login-screen">
        <Loader2 className="spin" />
      </div>
    );
  if (authenticated) return <Workspace userId="owner" />;
  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={login}>
        <a className="brand" href="/">
          <img src="/icon.svg" alt="" />
          <span>clearspace.</span>
        </a>
        <div className="eyebrow">A LITTLE ROOM FOR YOU</div>
        <h1>Welcome to your space.</h1>
        <p>
          Your tasks, passing thoughts, and possibilities.
          <br />
          All in one calm place.
        </p>
        <label className="field-label">
          Your app password
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Enter your password"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy || !password}>
          {busy ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <>
              Open my space <ArrowRight size={16} />
            </>
          )}
        </button>
        <span className="privacy-note">
          <ShieldCheck size={12} /> Private. Personal. Just for you.
        </span>
      </form>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
