import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { STRINGS } from "../lib/strings";

// No LanguageContext here -- it depends on an authenticated /api/settings call, which doesn't
// exist yet pre-login. Falls back to the browser's own language instead.
const t = STRINGS[navigator.language.toLowerCase().startsWith("de") ? "DE" : "EN"];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  // Deliberately empty: prefilling "admin" only ever helped the very first login on a fresh
  // install, and afterwards it silently suggested the wrong account to every other user.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      // Always land on the Übersicht (dashboard) after a successful login, regardless of which
      // URL the browser happened to be on before (e.g. a stale deep link into /settings/...).
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
      <form className="card" style={{ width: "min(360px, 90vw)" }} onSubmit={submit}>
        <h2 style={{ textAlign: "center" }}>{t.loginTitle}</h2>
        <div className="field">
          <label>{t.loginUsername}</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>{t.loginPassword}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="test-result error">{error}</div>}
        <button type="submit" className="btn primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? t.loginSubmitting : t.loginSubmit}
        </button>
      </form>
    </div>
  );
}
