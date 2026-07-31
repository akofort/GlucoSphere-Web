import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type TokenUsageEntry } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";
import { providerLabel } from "../../lib/providerLabels";

function formatDate(ms: number, locale: string): string {
  return new Date(ms).toLocaleDateString(locale, { dateStyle: "medium" });
}

/** Cumulative token counters per provider/model plus an optional cost estimate. Prices are entered
 * per model here rather than shipped as a table: provider price lists change constantly and differ
 * by plan/region, so a hard-coded rate would quietly produce wrong numbers. */
export default function TokenUsagePage() {
  const { t, language } = useLanguage();
  const locale = language === "DE" ? "de-DE" : "en-US";
  const [entries, setEntries] = useState<TokenUsageEntry[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [currencyDraft, setCurrencyDraft] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [fetching, setFetching] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; message: string; unmatched?: string[] } | null>(null);

  const rowKey = (e: TokenUsageEntry) => `${e.provider}|${e.model}`;

  const load = async () => {
    setLoading(true);
    const result = await api.getTokenUsage();
    setEntries(result.entries);
    setCurrency(result.currency);
    setCurrencyDraft(result.currency);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const startEditing = (e: TokenUsageEntry) => {
    setEditing(rowKey(e));
    setInputPrice(e.inputPricePerMillion ? String(e.inputPricePerMillion) : "");
    setOutputPrice(e.outputPricePerMillion ? String(e.outputPricePerMillion) : "");
  };

  const savePrice = async (e: TokenUsageEntry) => {
    await api.setTokenPrice({
      provider: e.provider,
      model: e.model,
      inputPricePerMillion: Number(inputPrice.replace(",", ".")) || 0,
      outputPricePerMillion: Number(outputPrice.replace(",", ".")) || 0,
    });
    setEditing(null);
    await load();
  };

  const saveCurrency = async () => {
    const value = currencyDraft.trim() || "USD";
    await api.updateSettings({ tokenPriceCurrency: value });
    setCurrency(value);
    setCurrencyDraft(value);
  };

  const fetchPrices = async () => {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await api.fetchTokenPrices(overwriteExisting);
      setFetchResult({
        ok: true,
        message: t.tokenUsageFetchResult(res.updated.length, res.skipped.length, res.unmatched.length),
        unmatched: res.unmatched,
      });
      await load();
    } catch (err) {
      setFetchResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setFetching(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(t.tokenUsageResetConfirm)) return;
    await api.resetTokenUsage();
    await load();
  };

  const totals = entries.reduce(
    (acc, e) => ({
      calls: acc.calls + e.calls,
      prompt: acc.prompt + e.promptTokens,
      completion: acc.completion + e.completionTokens,
      cost: acc.cost + (e.estimatedCost ?? 0),
      // "Partial" whenever at least one model contributed tokens without a price -- the total is
      // then a lower bound, not the real bill, and must not be shown as if it were exact.
      partial: acc.partial || (e.estimatedCost === null && e.promptTokens + e.completionTokens > 0),
    }),
    { calls: 0, prompt: 0, completion: 0, cost: 0, partial: false },
  );

  const formatTokens = (n: number) => n.toLocaleString(locale);
  const formatCost = (value: number) => `${value.toFixed(2)} ${currency}`;

  return (
    <SettingsScaffold title={t.tokenUsageTitle} back="/settings/logging">
      <div className="card">
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.tokenUsageHint}</p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.tokenUsagePriceHint}</p>
        <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4 }}>
          {t.tokenUsageCurrencyLabel}
        </label>
        <div className="btn-row">
          <input
            value={currencyDraft}
            onChange={(ev) => setCurrencyDraft(ev.target.value)}
            style={{ maxWidth: 120 }}
          />
          <button className="btn" onClick={saveCurrency} disabled={currencyDraft.trim() === currency}>
            {t.genericSave}
          </button>
          <button className="btn" onClick={reset} disabled={entries.length === 0}>
            {t.tokenUsageReset}
          </button>
        </div>
      </div>

      {/* Preise automatisch beziehen -- Quelle ist OpenRouter, siehe model_discovery.py. */}
      <div className="card">
        <h2 style={{ fontSize: "1rem" }}>{t.tokenUsageFetchPrices}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.tokenUsageFetchHint}</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={(ev) => setOverwriteExisting(ev.target.checked)}
          />
          <span>{t.tokenUsageOverwriteLabel}</span>
        </label>
        <div className="btn-row">
          <button className="btn primary" onClick={fetchPrices} disabled={fetching || entries.length === 0}>
            {fetching ? t.tokenUsageFetching : t.tokenUsageFetchPrices}
          </button>
        </div>
        {fetchResult && (
          <div className={`test-result ${fetchResult.ok ? "ok" : "error"}`}>
            {fetchResult.message}
            {fetchResult.unmatched && fetchResult.unmatched.length > 0 && (
              <div style={{ fontSize: "0.8rem", marginTop: 4, opacity: 0.85 }}>
                {t.tokenUsageFetchUnmatched(fetchResult.unmatched.join(", "))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading && <div className="empty-state">{t.loading}</div>}
      {!loading && entries.length === 0 && <div className="empty-state">{t.tokenUsageEmpty}</div>}

      {!loading && entries.length > 0 && (
        <>
          <div className="card">
            <table className="metrics-table">
              <tbody>
                <tr>
                  <td>{t.tokenUsageColCalls}</td>
                  <td>{formatTokens(totals.calls)}</td>
                </tr>
                <tr>
                  <td>{t.tokenUsageColPrompt}</td>
                  <td>{formatTokens(totals.prompt)}</td>
                </tr>
                <tr>
                  <td>{t.tokenUsageColCompletion}</td>
                  <td>{formatTokens(totals.completion)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>{t.tokenUsageTotal}</strong> · {t.tokenUsageColCost}
                  </td>
                  <td>
                    <strong>
                      {totals.partial && totals.cost === 0 ? "--" : `${totals.partial ? "≥ " : ""}${formatCost(totals.cost)}`}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {entries.map((e) => (
            <div className="card" key={rowKey(e)} style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ fontWeight: 600 }}>
                {providerLabel(e.provider)} · {e.model}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {t.tokenUsageSince(formatDate(e.firstUsedAt, locale))}
              </div>
              <table className="metrics-table">
                <tbody>
                  <tr>
                    <td>{t.tokenUsageColCalls}</td>
                    <td>{formatTokens(e.calls)}</td>
                  </tr>
                  <tr>
                    <td>{t.tokenUsageColPrompt}</td>
                    <td>{formatTokens(e.promptTokens)}</td>
                  </tr>
                  <tr>
                    <td>{t.tokenUsageColCompletion}</td>
                    <td>{formatTokens(e.completionTokens)}</td>
                  </tr>
                  <tr>
                    <td>{t.tokenUsageColCost}</td>
                    <td>{e.estimatedCost === null ? t.tokenUsageNoPrice : formatCost(e.estimatedCost)}</td>
                  </tr>
                </tbody>
              </table>

              {editing === rowKey(e) ? (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {t.tokenUsageInputPrice} ({currency})
                  </label>
                  <input inputMode="decimal" value={inputPrice} onChange={(ev) => setInputPrice(ev.target.value)} />
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 6 }}>
                    {t.tokenUsageOutputPrice} ({currency})
                  </label>
                  <input inputMode="decimal" value={outputPrice} onChange={(ev) => setOutputPrice(ev.target.value)} />
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn primary" onClick={() => savePrice(e)}>
                      {t.genericSave}
                    </button>
                    <button className="btn" onClick={() => setEditing(null)}>
                      {t.genericCancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn" style={{ marginTop: 8 }} onClick={() => startEditing(e)}>
                  {t.tokenUsageEditPrices}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </SettingsScaffold>
  );
}
