import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type DiabetikerAccount, type User } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";
import { useAuth } from "../../lib/AuthContext";

const INSULIN_PUMPS = [
  "NONE", "MEDTRONIC_780G", "OMNIPOD_5", "OMNIPOD_DASH", "TANDEM_TSLIM_X2", "YPSOPUMP", "BETA_BIONICS_ILET", "OTHER",
];
const PUMP_LABELS: Record<string, string> = {
  MEDTRONIC_780G: "Medtronic MiniMed 780G",
  OMNIPOD_5: "Omnipod 5",
  OMNIPOD_DASH: "Omnipod DASH",
  TANDEM_TSLIM_X2: "Tandem t:slim X2 (Control-IQ)",
  YPSOPUMP: "Ypsomed mylife YpsoPump",
  BETA_BIONICS_ILET: "Beta Bionics iLet",
};

const CGM_SYSTEMS = ["NONE", "DEXCOM_G6", "DEXCOM_G7", "LIBRE_2", "LIBRE_3", "MEDTRONIC_GUARDIAN", "EVERSENSE", "OTHER"];
const CGM_LABELS: Record<string, string> = {
  DEXCOM_G6: "Dexcom G6",
  DEXCOM_G7: "Dexcom G7",
  LIBRE_2: "FreeStyle Libre 2",
  LIBRE_3: "FreeStyle Libre 3",
  MEDTRONIC_GUARDIAN: "Medtronic Guardian",
  EVERSENSE: "Eversense",
};

const LINKABLE_ROLES: User["userRole"][] = ["FACHPERSONAL", "ANGEHOERIGE"];

export default function ProfilePage() {
  const { t } = useLanguage();
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [glucoseUnit, setGlucoseUnit] = useState<User["glucoseUnit"]>(user?.glucoseUnit ?? "MG_DL");
  const [insulinPump, setInsulinPump] = useState(user?.insulinPump ?? "NONE");
  const [cgmSystem, setCgmSystem] = useState(user?.cgmSystem ?? "NONE");
  const [linkedMainUserId, setLinkedMainUserId] = useState(user?.linkedMainUserId ?? "");
  const [diabetikerAccounts, setDiabetikerAccounts] = useState<DiabetikerAccount[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getDiabetikerAccounts().then((r) => setDiabetikerAccounts(r.accounts));
  }, []);

  const roles: { id: User["userRole"]; label: string; desc: string }[] = [
    { id: "DIABETIKER", label: t.roleDiabetiker, desc: t.roleDiabetikerDesc },
    { id: "FACHPERSONAL", label: t.roleFachpersonal, desc: t.roleFachpersonalDesc },
    { id: "ANGEHOERIGE", label: t.roleAngehoerige, desc: t.roleAngehoerigeDesc },
  ];

  if (!user) return <SettingsScaffold title={t.profileTitle}>{t.loading}</SettingsScaffold>;

  const saveRole = async (role: User["userRole"]) => {
    await api.updateOwnProfile({
      displayName: user.displayName, userRole: role, appLanguage: user.appLanguage,
      glucoseUnit: user.glucoseUnit, insulinPump: user.insulinPump, cgmSystem: user.cgmSystem,
      linkedMainUserId: user.linkedMainUserId,
    });
    await refresh();
  };

  const saveName = async () => {
    setSaving(true);
    try {
      await api.updateOwnProfile({
        displayName, userRole: user.userRole, appLanguage: user.appLanguage,
        glucoseUnit, insulinPump, cgmSystem, linkedMainUserId,
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const saveLinkedMainUser = async (id: string) => {
    setLinkedMainUserId(id);
    await api.updateOwnProfile({
      displayName: user.displayName, userRole: user.userRole, appLanguage: user.appLanguage,
      glucoseUnit: user.glucoseUnit, insulinPump: user.insulinPump, cgmSystem: user.cgmSystem,
      linkedMainUserId: id,
    });
    await refresh();
  };

  const pumpLabel = (id: string) => (id === "NONE" ? t.profileDeviceNone : id === "OTHER" ? t.profileDeviceOther : PUMP_LABELS[id]);
  const cgmLabel = (id: string) => (id === "NONE" ? t.profileDeviceNone : id === "OTHER" ? t.profileDeviceOther : CGM_LABELS[id]);

  return (
    <SettingsScaffold title={t.profileTitle}>
      <div className="card">
        <h2>{t.profileNameSection}</h2>
        <div className="field">
          <label>{t.profileFirstName}</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t.profileFirstNamePlaceholder} />
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
              <option key={id} value={id}>{pumpLabel(id)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t.profileCgmSystemLabel}</label>
          <select value={cgmSystem} onChange={(e) => setCgmSystem(e.target.value)}>
            {CGM_SYSTEMS.map((id) => (
              <option key={id} value={id}>{cgmLabel(id)}</option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.profileDeviceHint}</p>
        <button className="btn primary" onClick={saveName} disabled={saving}>
          {saving ? t.genericSaving : t.profileSaveName}
        </button>
      </div>

      <div className="card">
        <h2>{t.profileRoleSection}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.profileRoleHint}</p>
        {roles.map((r) => (
          <label key={r.id} className="radio-row" style={{ cursor: "pointer" }}>
            <input type="radio" checked={user.userRole === r.id} onChange={() => saveRole(r.id)} />
            <div>
              <div className="label">{r.label}</div>
              <div className="desc">{r.desc}</div>
            </div>
          </label>
        ))}

        {LINKABLE_ROLES.includes(user.userRole) && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>{t.profileLinkedMainUserLabel}</label>
            <select value={linkedMainUserId} onChange={(e) => saveLinkedMainUser(e.target.value)}>
              <option value="">{t.profileLinkedMainUserNone}</option>
              {diabetikerAccounts.filter((a) => a.id !== user.id).map((a) => (
                <option key={a.id} value={a.id}>{a.displayName}</option>
              ))}
            </select>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.profileLinkedMainUserHint}</p>
          </div>
        )}
      </div>
    </SettingsScaffold>
  );
}
