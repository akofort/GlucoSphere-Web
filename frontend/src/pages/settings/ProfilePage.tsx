import { useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type User } from "../../lib/api";
import { CGM_SYSTEMS, INSULIN_PUMPS, cgmLabel, pumpLabel } from "../../lib/deviceLabels";
import { useLanguage } from "../../lib/LanguageContext";
import { useAuth } from "../../lib/AuthContext";

/** Pure clinical stammdata of the Hauptpatient -- Benutzertyp (Typ 1/2/3) and the linked-patient
 * assignment are managed in Benutzerverwaltung by an admin now (see UsersPage.tsx), not here. */
export default function ProfilePage() {
  const { t } = useLanguage();
  const { user, patientProfile, refresh } = useAuth();

  if (!user) return <SettingsScaffold title={t.profileTitle}>{t.loading}</SettingsScaffold>;

  if (user.userRole !== "DIABETIKER") {
    return (
      <SettingsScaffold title={t.profileTitle}>
        {!user.linkedMainUserId || !patientProfile ? (
          <div className="empty-state">{t.profileNotLinkedHint}</div>
        ) : (
          <ReadOnlyProfile />
        )}
      </SettingsScaffold>
    );
  }

  return (
    <SettingsScaffold title={t.profileTitle}>
      <EditableProfile />
    </SettingsScaffold>
  );
}

function ReadOnlyProfile() {
  const { t } = useLanguage();
  const { patientProfile } = useAuth();
  if (!patientProfile) return null;
  const fullName = [patientProfile.firstName, patientProfile.lastName].filter(Boolean).join(" ");

  return (
    <div className="card">
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.profileReadOnlyHint(fullName)}</p>
      <div className="field">
        <label>{t.profileFirstName}</label>
        <div>{patientProfile.firstName || "--"}</div>
      </div>
      <div className="field">
        <label>{t.profileLastName}</label>
        <div>{patientProfile.lastName || "--"}</div>
      </div>
      <div className="field">
        <label>{t.profileBirthDateLabel}</label>
        <div>{patientProfile.birthDate || "--"}</div>
      </div>
      <div className="field">
        <label>{t.profileDiabetesSinceLabel}</label>
        <div>{patientProfile.diabetesSince || "--"}</div>
      </div>
      <div className="field">
        <label>{t.profileGlucoseUnitLabel}</label>
        <div>{patientProfile.glucoseUnit === "MMOL_L" ? "mmol/L" : "mg/dL"}</div>
      </div>
      <div className="field">
        <label>{t.profileInsulinPumpLabel}</label>
        <div>{pumpLabel(patientProfile.insulinPump, t)}</div>
      </div>
      <div className="field">
        <label>{t.profileCgmSystemLabel}</label>
        <div>{cgmLabel(patientProfile.cgmSystem, t)}</div>
      </div>
    </div>
  );
}

function EditableProfile() {
  const { t } = useLanguage();
  const { user, patientProfile, refresh } = useAuth();
  const u = user!;
  const [firstName, setFirstName] = useState(u.displayName ?? "");
  const [lastName, setLastName] = useState(patientProfile?.lastName ?? u.lastName ?? "");
  const [birthDate, setBirthDate] = useState(patientProfile?.birthDate ?? u.birthDate ?? "");
  const [diabetesSince, setDiabetesSince] = useState(patientProfile?.diabetesSince ?? u.diabetesSince ?? "");
  const [glucoseUnit, setGlucoseUnit] = useState<User["glucoseUnit"]>(u.glucoseUnit ?? "MG_DL");
  const [insulinPump, setInsulinPump] = useState(u.insulinPump ?? "NONE");
  const [cgmSystem, setCgmSystem] = useState(u.cgmSystem ?? "NONE");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateOwnProfile({
        displayName: firstName, userRole: u.userRole, appLanguage: u.appLanguage,
        glucoseUnit, insulinPump, cgmSystem, linkedMainUserId: u.linkedMainUserId,
        lastName, birthDate, diabetesSince,
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="field">
        <label>{t.profileFirstName}</label>
        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t.profileFirstNamePlaceholder} />
      </div>
      <div className="field">
        <label>{t.profileLastName}</label>
        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t.profileLastNamePlaceholder} />
      </div>
      <div className="field">
        <label>{t.profileBirthDateLabel}</label>
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </div>
      <div className="field">
        <label>{t.profileDiabetesSinceLabel}</label>
        <input
          type="number" min="1900" max="2100" value={diabetesSince}
          onChange={(e) => setDiabetesSince(e.target.value)} placeholder={t.profileDiabetesSincePlaceholder}
        />
      </div>
      <div className="field">
        <label>{t.profileGlucoseUnitLabel}</label>
        <select value={glucoseUnit} onChange={(e) => setGlucoseUnit(e.target.value as User["glucoseUnit"])}>
          <option value="MG_DL">mg/dL</option>
          <option value="MMOL_L">mmol/L</option>
        </select>
      </div>
      <div className="field">
        <label>{t.profileInsulinPumpLabel}</label>
        <select value={insulinPump} onChange={(e) => setInsulinPump(e.target.value)}>
          {INSULIN_PUMPS.map((id) => (
            <option key={id} value={id}>{pumpLabel(id, t)}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t.profileCgmSystemLabel}</label>
        <select value={cgmSystem} onChange={(e) => setCgmSystem(e.target.value)}>
          {CGM_SYSTEMS.map((id) => (
            <option key={id} value={id}>{cgmLabel(id, t)}</option>
          ))}
        </select>
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.profileDeviceHint}</p>
      <button className="btn primary" onClick={save} disabled={saving}>
        {saving ? t.genericSaving : t.profileSaveName}
      </button>
    </div>
  );
}
