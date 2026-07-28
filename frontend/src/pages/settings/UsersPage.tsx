import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type User } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";
import { useAuth } from "../../lib/AuthContext";

function UserRow({ u, onChanged }: { u: User; onChanged: () => void }) {
  const { t } = useLanguage();
  const { user: me } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isSelf = u.id === me?.id;

  const changeRole = async (role: string) => {
    setError(null);
    try {
      await api.adminUpdateUser(u.id, { role });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetPassword = async () => {
    if (newPassword.length < 8) return;
    setError(null);
    try {
      await api.adminUpdateUser(u.id, { newPassword });
      setNewPassword("");
      setResetting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async () => {
    if (isSelf) {
      setError(t.usersCannotDeleteSelf);
      return;
    }
    if (!window.confirm(t.usersDeleteConfirm)) return;
    await api.deleteUser(u.id);
    onChanged();
  };

  return (
    <div className="card">
      <div style={{ fontWeight: 600 }}>
        {u.username} {u.displayName ? `(${u.displayName})` : ""} {isSelf ? t.usersYouIndicator : ""}
      </div>
      <div className="field">
        <label>{t.usersRole}</label>
        <select value={u.role} onChange={(e) => changeRole(e.target.value)} disabled={isSelf}>
          <option value="ADMIN">{t.usersRoleAdmin}</option>
          <option value="MEMBER">{t.usersRoleMember}</option>
        </select>
      </div>

      {error && <div className="test-result error">{error}</div>}

      <div className="btn-row">
        {!resetting ? (
          <button className="btn" onClick={() => setResetting(true)}>
            {t.usersResetPassword}
          </button>
        ) : (
          <>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.usersNewPassword}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)" }}
            />
            <button className="btn primary" onClick={resetPassword} disabled={newPassword.length < 8}>
              {t.genericSave}
            </button>
          </>
        )}
        <button className="btn" onClick={remove}>
          {t.genericDelete}
        </button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.listUsers().then((r) => setUsers(r.users));
  };

  useEffect(load, []);

  const addUser = async () => {
    setCreating(true);
    setError(null);
    try {
      await api.createUser({ username, password, role, displayName });
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("MEMBER");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SettingsScaffold title={t.usersTitle}>
      <div className="card">
        <h2>{t.usersAddTitle}</h2>
        <div className="field">
          <label>{t.usersUsername}</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.usersUsernamePlaceholder} />
        </div>
        <div className="field">
          <label>{t.usersDisplayName}</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>{t.usersPassword}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>{t.usersRole}</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="MEMBER">{t.usersRoleMember}</option>
            <option value="ADMIN">{t.usersRoleAdmin}</option>
          </select>
        </div>
        {error && <div className="test-result error">{error}</div>}
        <button className="btn primary" onClick={addUser} disabled={creating || !username.trim() || password.length < 8}>
          {creating ? t.genericSaving : t.usersAdd}
        </button>
      </div>

      {users.map((u) => (
        <UserRow key={u.id} u={u} onChanged={load} />
      ))}
    </SettingsScaffold>
  );
}
