export type ColorTheme = "MEDICAL_BLUE" | "EMERALD_GREEN" | "SUNSET_ORANGE" | "CYBER_PURPLE" | "OCEAN_TEAL" | "HIGH_CONTRAST_DARK";

export interface User {
  id: string;
  username: string;
  role: "ADMIN" | "MEMBER";
  displayName: string;
  userRole: "DIABETIKER" | "FACHPERSONAL" | "ANGEHOERIGE";
  appLanguage: "DE" | "EN";
  glucoseUnit: "MG_DL" | "MMOL_L";
  insulinPump: string;
  cgmSystem: string;
  linkedMainUserId: string;
  lastName: string;
  birthDate: string;
  diabetesSince: string;
  colorTheme: ColorTheme;
  /** AID system (automated insulin delivery) -- distinct from insulinPump (which physical pump)
   * since a DIY system (AndroidAPS/OpenAPS/Loop/Trio) is a separate algorithm layered on top of a
   * pump, not the pump itself. See lib/deviceLabels.ts's AID_SYSTEMS. */
  aidSystem: string;
  createdAt: number;
}

export interface DiabetikerAccount {
  id: string;
  displayName: string;
}

/** Clinical stammdata of the Hauptpatient -- resolved server-side (see GET /api/patient-profile):
 * for a DIABETIKER account this is their own record, for FACHPERSONAL/ANGEHOERIGE it's the linked
 * patient's record. `isEditable` is true only for the patient's own account. */
export interface PatientProfile {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  diabetesSince: string;
  glucoseUnit: "MG_DL" | "MMOL_L";
  insulinPump: string;
  cgmSystem: string;
  aidSystem: string;
  isEditable: boolean;
}

export interface Settings {
  systemPrompt: string | null;
  additionalInstructions: string;
  llmProviderType: "GEMINI" | "CLAUDE" | "OPENAI" | "DEEPSEEK";
  geminiApiKey: string;
  geminiModel: string;
  claudeApiKey: string;
  claudeBaseUrl: string;
  claudeModel: string;
  openAiApiKey: string;
  openAiBaseUrl: string;
  openAiModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  nightscoutApiUrl: string;
  nightscoutApiSecret: string;
  nightscoutApiAuthMethod: "NONE" | "BEARER_TOKEN" | "API_SECRET_HEADER";
  nightscoutApiEnabled: boolean;
  feelfitEmail: string;
  feelfitPassword: string;
  feelfitEnabled: boolean;
  googleHealthClientId: string;
  googleHealthClientSecret: string;
  googleHealthEnabled: boolean;
  googleHealthRefreshToken: string;
  withingsClientId: string;
  withingsClientSecret: string;
  withingsEnabled: boolean;
  withingsRefreshToken: string;
  dexcomUsername: string;
  dexcomPassword: string;
  dexcomRegion: "US" | "OUS";
  dexcomEnabled: boolean;
  libreEmail: string;
  librePassword: string;
  libreRegion: string;
  libreEnabled: boolean;
  glookoUsername: string;
  glookoPassword: string;
  glookoEnabled: boolean;
  nightscoutCategory: string;
  dexcomCategory: string;
  libreCategory: string;
  feelfitCategory: string;
  googleHealthCategory: string;
  glookoCategory: string;
  withingsCategory: string;
  /** User-editable "Anzeigename" per native source (Einstellungen -> Datenquellen) -- defaults to
   * the plain manufacturer name, drives chat source citations/disambiguation and the dashboard's
   * combined-sources note. */
  nightscoutDisplayName: string;
  dexcomDisplayName: string;
  libreDisplayName: string;
  feelfitDisplayName: string;
  googleHealthDisplayName: string;
  glookoDisplayName: string;
  withingsDisplayName: string;
  /** Bearer token securing GlucoSphere-Web's own MCP server endpoint (/api/mcp, see Settings ->
   * MCP Server & API) -- empty means not yet generated. */
  mcpServerToken: string;
  /** Einstellungen -> Logging -> Benutzung & Zugriffe: whether every /api/ request is recorded on
   * top of the always-on login/chat/tool events. */
  accessLogEnabled: boolean;
  /** Which source feeds the Übersicht's live tile (current value + 24h curve). Empty = combine
   * every realtime source. Only LLM-free REST sources are offerable, see DataSourcesPage. */
  overviewGraphSourceId: string;
  /** Display-only currency label for the token cost table (prices themselves live server-side,
   * keyed by "{PROVIDER}|{model}" -- see GET/PUT /api/token-usage). */
  tokenPriceCurrency: string;
}

export interface SourceHealth {
  status: "GREEN" | "YELLOW" | "RED";
  message: string;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: "STREAMABLE_HTTP" | "SSE" | "OPENAPI";
  authMethod: "NONE" | "BEARER_TOKEN" | "API_SECRET_HEADER" | "OAUTH2";
  token: string;
  category: string;
  enabled: boolean;
  autoRunTools: boolean;
  isRealtime: boolean;
  createdAt: number;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthAuthEndpoint: string;
  oauthTokenEndpoint: string;
  oauthScope: string;
  oauthRedirectUri: string;
  oauthTokenAction: string;
  oauthLoggedIn: boolean;
  oauthExpiresAt: number;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelOption {
  id: string;
  label: string;
  priceTier: string;
}

export interface ProviderInfo {
  type: string;
  label: string;
  models: ModelOption[];
  /** "live" = fetched from the provider's own API (see POST /api/providers/{type}/refresh),
   * "builtin" = the catalog shipped with this version. */
  source?: "live" | "builtin";
  fetchedAt?: number | null;
}

export interface DashboardMetrics {
  tirPercent: number;
  hypoPercent: number;
  severeHypoPercent: number;
  hyperPercent: number;
  cvPercent: number;
  avgGlucose: number;
  estimatedHbA1cPercent: number;
}

export interface DashboardTrend {
  tirDelta: number;
  hypoDelta: number;
  avgGlucoseDelta: number;
}

export interface DashboardSeriesPoint {
  t: number;
  v: number;
}

export interface DashboardSource {
  id: string;
  name: string;
  category: string;
  computesMetrics: boolean;
  isRealtime: boolean;
}

export interface DashboardDataGap {
  sourceName: string;
  startMillis: number;
  endMillis: number;
  warningText: string;
}

export interface Dashboard {
  configured: boolean;
  excluded?: boolean;
  hasData?: boolean;
  rangeHours?: number;
  rangeLabel?: string;
  status?: "RED" | "YELLOW" | "GREEN";
  statusReason?: string;
  metrics?: DashboardMetrics;
  trend?: DashboardTrend | null;
  series?: DashboardSeriesPoint[];
  latestValueMgDl?: number;
  latestTrendArrow?: string;
  latestTimestampMillis?: number;
  generatedAtMillis?: number;
  generationDurationMs?: number;
  narrativeFailed?: boolean;
  combinedSourcesNote?: string | null;
  summaryText?: string | null;
  tips?: string[];
  /** Item 6's dashboard transparency -- which LLM provider/model actually generated summaryText/
   * tips above, only set when the narrative was generated successfully. */
  narrativeProvider?: string | null;
  narrativeModel?: string | null;
  /** IOB (Insulin on Board, IE) -- null when no Nightscout Loop/AndroidAPS devicestatus is
   * reporting, not an error. */
  iobUnits?: number | null;
  /** COB (Carbs on Board, g) -- same null-means-not-reporting convention as iobUnits. */
  cobGrams?: number | null;
  loopStatus?: string | null;
  dataGaps?: DashboardDataGap[];
  /** Which data sources these metrics were computed from -- shown as "Quelle(n): ..." under the
   * "Ausgewertet mit: ..." attribution. */
  sourceNames?: string[];
}

/** The Übersicht's live tile (GET /api/live-status) -- current value, trend and the 24h curve from
 * the realtime REST sources only. No metrics, no LLM narrative: this is polled every 30s. */
export interface LiveStatus {
  configured: boolean;
  hasData?: boolean;
  sourceNames?: string[];
  latestValueMgDl?: number;
  latestTrendArrow?: string;
  latestDirection?: string;
  latestTimestampMillis?: number;
  generatedAtMillis?: number;
  series?: DashboardSeriesPoint[];
  rangeHours?: number;
  /** True when the tile is fed by a deliberately chosen delayed source (Glooko) -- readings are
   * then expected to be hours old, so the UI waits much longer before flagging them stale. */
  delayed?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

export interface ChatMessage {
  id: number;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  durationMs?: number | null;
  success?: boolean | null;
  provider?: string | null;
  model?: string | null;
  /** Data-quality warnings (missing-data gaps) lifted out of this turn's tool results and shown
   * under the answer -- see components/NoticeList.tsx. Persisted, so they survive a reload. */
  notices?: string[] | null;
  /** Display names of the data sources this answer actually queried -- shown as "Quelle(n): ..."
   * under the "Ausgewertet mit: ..." line. Empty when the model answered without any tool call. */
  sources?: string[] | null;
}

/** One candidate data source in a chat "welche Quelle?" disambiguation (see
 * ChatPage.tsx's pendingSourceChoice) -- `isRestApi` drives the blue (direct/native integration)
 * vs. violet (MCP server) button color, mirroring the Android app's REST/MCP badge colors. */
export interface SourceOption {
  id: string;
  name: string;
  isRestApi: boolean;
}

export interface LogEntry {
  id: number;
  provider: string;
  model: string;
  purpose: string;
  promptTokens: number | null;
  completionTokens: number | null;
  toolCalls: number;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  detail: string | null;
  createdAt: number;
}

/** One provider+model's cumulative token counters (Logging -> Token & Kosten). Prices are entered
 * by the admin, so `estimatedCost` is null -- shown as "--", not "0" -- until one is set. */
export interface TokenUsageEntry {
  provider: string;
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  firstUsedAt: number;
  lastUsedAt: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  estimatedCost: number | null;
}

export type UsageEvent = "LOGIN" | "LOGIN_FAILED" | "LOGOUT" | "CHAT" | "TOOL" | "DASHBOARD" | "ACCESS";

export interface UsageLogEntry {
  id: number;
  createdAt: number;
  userId: string;
  username: string;
  event: UsageEvent;
  detail: string;
  method: string;
  path: string;
  status: number | null;
  durationMs: number | null;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (resp.status === 401 && path !== "/auth/login") {
    onUnauthorized?.();
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ success: boolean }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<User | { username: null }>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateOwnProfile: (body: {
    displayName: string; userRole: string; appLanguage: string;
    glucoseUnit?: string; insulinPump?: string; cgmSystem?: string; linkedMainUserId?: string;
    lastName?: string; birthDate?: string; diabetesSince?: string; colorTheme?: string; aidSystem?: string;
  }) => request<User>("/users/me", { method: "PUT", body: JSON.stringify(body) }),
  getPatientProfile: () => request<PatientProfile>("/patient-profile"),
  getDiabetikerAccounts: () => request<{ accounts: DiabetikerAccount[] }>("/users/diabetiker-accounts"),
  listUsers: () => request<{ users: User[] }>("/users"),
  createUser: (body: { username: string; password: string; role: string; displayName: string }) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateUser: (
    id: string,
    body: { role?: string; username?: string; newPassword?: string; userRole?: string; linkedMainUserId?: string },
  ) => request<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<{ deleted: boolean }>(`/users/${id}`, { method: "DELETE" }),
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),
  listProviders: () => request<{ providers: ProviderInfo[] }>("/providers"),
  testLlmConnection: (body: { providerType: string; apiKey: string; baseUrl?: string; model?: string }) =>
    request<{
      success: boolean;
      message: string;
      /** The concretely resolved model that was actually called -- with "auto", the one auto
       * picked. Shown so a verified model is unambiguous. */
      model: string;
      /** False for a manually entered model id that isn't in the built-in catalog (still valid --
       * it was just verified by really calling it). */
      modelIsKnown: boolean;
    }>("/llm/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testNightscout: (body: { url: string; authMethod: string; token: string }) =>
    request<{ success: boolean; message: string }>("/nightscout/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testFeelfit: (body: { email: string; password: string }) =>
    request<{ success: boolean; message: string }>("/feelfit/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testGoogleHealth: () =>
    request<{ success: boolean; message: string }>("/google-health/test-connection", { method: "POST" }),
  testWithings: () =>
    request<{ success: boolean; message: string }>("/withings/test-connection", { method: "POST" }),
  withingsOAuthAuthorize: (redirectUri: string) =>
    request<{ authorizeUrl: string }>("/withings/oauth/authorize", {
      method: "POST",
      body: JSON.stringify({ redirectUri }),
    }),
  testDexcom: (body: { username: string; password: string; region: string }) =>
    request<{ success: boolean; message: string }>("/dexcom/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testLibreLinkUp: (body: { email: string; password: string; region: string }) =>
    request<{ success: boolean; message: string }>("/librelinkup/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testGlooko: (body: { username: string; password: string }) =>
    request<{ success: boolean; message: string }>("/glooko/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getDataSourcesHealth: () => request<{ sources: Record<string, SourceHealth> }>("/data-sources/health"),
  googleHealthOAuthAuthorize: (redirectUri: string) =>
    request<{ authorizeUrl: string }>("/google-health/oauth/authorize", {
      method: "POST",
      body: JSON.stringify({ redirectUri }),
    }),
  getDashboard: (rangeHours: number, sourceIds?: string[]) =>
    request<Dashboard>(`/dashboard?rangeHours=${rangeHours}${sourceIds ? `&sources=${sourceIds.join(",")}` : ""}`),
  getDashboardSources: () => request<{ sources: DashboardSource[] }>("/dashboard-sources"),
  getLiveStatus: (includeSeries: boolean, rangeHours = 24) =>
    request<LiveStatus>(`/live-status?includeSeries=${includeSeries ? "true" : "false"}&rangeHours=${rangeHours}`),
  listSessions: () => request<{ sessions: ChatSession[] }>("/chat/sessions"),
  createSession: (title: string) =>
    request<ChatSession>("/chat/sessions", { method: "POST", body: JSON.stringify({ title }) }),
  deleteSession: (id: string) => request<{ deleted: boolean }>(`/chat/sessions/${id}`, { method: "DELETE" }),
  renameSession: (id: string, title: string) =>
    request<ChatSession>(`/chat/sessions/${id}`, { method: "PUT", body: JSON.stringify({ title }) }),
  getMessages: (sessionId: string) => request<{ messages: ChatMessage[] }>(`/chat/sessions/${sessionId}/messages`),
  clearMessages: (sessionId: string) => request<{ cleared: boolean }>(`/chat/sessions/${sessionId}/messages`, { method: "DELETE" }),
  sendMessage: (sessionId: string, content: string, signal?: AbortSignal, selectedSourceIds?: string[]) =>
    request<{
      userMessage: ChatMessage | null;
      assistantMessage?: ChatMessage;
      toolActivity?: { name: string; arguments: Record<string, unknown> }[];
      /** "Interaktive Rückfrage": present instead of assistantMessage/toolActivity whenever 2+
       * same-category sources could equally answer this and no explicit choice was made yet --
       * see ChatPage.tsx's pendingSourceChoice/pickSource. */
      sourceChoiceRequired?: boolean;
      question?: string;
      options?: SourceOption[];
    }>(`/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, selectedSourceIds: selectedSourceIds ?? null }),
      signal,
    }),
  exportBackup: (password: string) =>
    request<Record<string, unknown>>("/backup/export", { method: "POST", body: JSON.stringify({ password: password || null }) }),
  importBackup: (data: Record<string, unknown>, password: string) =>
    request<Settings>("/backup/import", { method: "POST", body: JSON.stringify({ data, password: password || null }) }),
  getDefaultSystemPrompt: () => request<{ defaultPrompt: string }>("/system-prompt/default"),
  getPerformanceLog: () => request<{ entries: LogEntry[] }>("/performance-log"),
  clearPerformanceLog: () => request<{ cleared: boolean }>("/performance-log", { method: "DELETE" }),
  getTokenUsage: () => request<{ entries: TokenUsageEntry[]; currency: string }>("/token-usage"),
  setTokenPrice: (body: { provider: string; model: string; inputPricePerMillion: number; outputPricePerMillion: number }) =>
    request<{ saved: boolean }>("/token-usage/price", { method: "PUT", body: JSON.stringify(body) }),
  resetTokenUsage: () => request<{ cleared: boolean }>("/token-usage", { method: "DELETE" }),
  fetchTokenPrices: (overwrite: boolean) =>
    request<{ updated: string[]; unmatched: string[]; skipped: string[]; currency: string; source: string }>(
      `/token-usage/fetch-prices?overwrite=${overwrite ? "true" : "false"}`,
      { method: "POST" },
    ),
  refreshProviderModels: (providerType: string, body?: { apiKey?: string; baseUrl?: string }) =>
    request<{ provider: string; models: ModelOption[]; fetchedAt: number }>(`/providers/${providerType}/refresh`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  resetProviderModels: (providerType: string) =>
    request<{ reset: boolean }>(`/providers/${providerType}/refresh`, { method: "DELETE" }),
  getUsageLog: (limit = 500) =>
    request<{ entries: UsageLogEntry[]; accessLogEnabled: boolean }>(`/usage-log?limit=${limit}`),
  clearUsageLog: () => request<{ cleared: boolean }>("/usage-log", { method: "DELETE" }),
  listMcpServers: () => request<{ servers: McpServer[] }>("/mcp-servers"),
  saveMcpServer: (server: Partial<McpServer>) =>
    request<McpServer>("/mcp-servers", { method: "POST", body: JSON.stringify(server) }),
  deleteMcpServer: (id: string) => request<{ deleted: boolean }>(`/mcp-servers/${id}`, { method: "DELETE" }),
  testMcpServer: (body: { url: string; transport: string; authMethod: string; token: string; serverId?: string }) =>
    request<{ success: boolean; message: string }>("/mcp-servers/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getMcpServerTools: (id: string) => request<{ tools: McpTool[] }>(`/mcp-servers/${id}/tools`),
  mcpOAuthAuthorize: (id: string, redirectUri: string) =>
    request<{ authorizeUrl: string }>(`/mcp-servers/${id}/oauth/authorize`, {
      method: "POST",
      body: JSON.stringify({ redirectUri }),
    }),
  regenerateMcpServerToken: () => request<{ token: string }>("/mcp-server/regenerate-token", { method: "POST" }),
};
