import { useRef, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";

export default function BackupPage() {
  const { t } = useLanguage();
  const [exportPassword, setExportPassword] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [importPassword, setImportPassword] = useState("");
  const [pendingImportData, setPendingImportData] = useState<Record<string, unknown> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const payload = await api.exportBackup(exportPassword);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `glucosphere-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportResult({ ok: true, message: t.backupExportSuccess });
    } catch (err) {
      setExportResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setExporting(false);
    }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setPendingImportData(data);
      if (!data.encrypted) {
        await runImport(data, "");
      }
    } catch (err) {
      setImportResult({ ok: false, message: t.backupInvalidFile(err instanceof Error ? err.message : String(err)) });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runImport = async (data: Record<string, unknown>, password: string) => {
    setImporting(true);
    setImportResult(null);
    try {
      await api.importBackup(data, password);
      setImportResult({ ok: true, message: t.backupImportSuccess });
      setPendingImportData(null);
      setImportPassword("");
    } catch (err) {
      setImportResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <SettingsScaffold title={t.backupTitle}>
      <div className="card">
        <h2>{t.backupExportSection}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.backupExportHint}</p>
        <div className="field">
          <label>{t.backupEncryptOptional}</label>
          <input type="password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} placeholder={t.backupEncryptPlaceholder} />
        </div>
        {exportResult && <div className={`test-result ${exportResult.ok ? "ok" : "error"}`}>{exportResult.message}</div>}
        <button className="btn primary" onClick={doExport} disabled={exporting}>
          {exporting ? t.backupExporting : t.backupExport}
        </button>
      </div>

      <div className="card">
        <h2>{t.backupImportSection}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.backupImportHint}</p>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={onFileSelected} />

        {Boolean(pendingImportData?.encrypted) && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>{t.backupEncryptedHint}</label>
            <input type="password" value={importPassword} onChange={(e) => setImportPassword(e.target.value)} />
            <div className="btn-row">
              <button className="btn primary" onClick={() => pendingImportData && runImport(pendingImportData, importPassword)} disabled={importing || !importPassword}>
                {importing ? t.backupDecrypting : t.backupDecryptImport}
              </button>
            </div>
          </div>
        )}

        {importResult && <div className={`test-result ${importResult.ok ? "ok" : "error"}`}>{importResult.message}</div>}
      </div>
    </SettingsScaffold>
  );
}
