import { useState, type FormEvent } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../lib/LanguageContext";

export default function AccountPage() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    if (newPassword !== newPasswordRepeat) {
      setResult({ ok: false, message: t.accountPasswordMismatch });
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setResult({ ok: true, message: t.accountPasswordChanged });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordRepeat("");
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsScaffold title={t.accountTitle}>
      <div className="card">
        <h2>{t.accountLoggedInAs(user?.username ?? "")}</h2>
        <button className="btn" onClick={() => logout()}>
          {t.accountLogout}
        </button>
      </div>
      <div className="card">
        <h2>{t.accountChangePassword}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>{t.accountCurrentPassword}</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>{t.accountNewPassword}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>{t.accountNewPasswordRepeat}</label>
            <input type="password" value={newPasswordRepeat} onChange={(e) => setNewPasswordRepeat(e.target.value)} />
          </div>
          {result && <div className={`test-result ${result.ok ? "ok" : "error"}`}>{result.message}</div>}
          <button type="submit" className="btn primary" disabled={saving || !currentPassword || !newPassword}>
            {saving ? t.genericSaving : t.accountChangePassword}
          </button>
        </form>
      </div>
    </SettingsScaffold>
  );
}
