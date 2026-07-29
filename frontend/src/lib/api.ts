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
    lastName?: string; birthDate?: string; diabetesSince?: string;
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
    request<{ success: boolean; message: string }>("/llm/test-connection", {
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
  listSessions: () => request<{ sessions: ChatSession[] }>("/chat/sessions"),
  createSession: (title: string) =>
    request<ChatSession>("/chat/sessions", { method: "POST", body: JSON.stringify({ title }) }),
  deleteSession: (id: string) => request<{ deleted: boolean }>(`/chat/sessions/${id}`, { method: "DELETE" }),
  renameSession: (id: string, title: string) =>
    request<ChatSession>(`/chat/sessions/${id}`, { method: "PUT", body: JSON.stringify({ title }) }),
  getMessages: (sessionId: string) => request<{ messages: ChatMessage[] }>(`/chat/sessions/${sessionId}/messages`),
  clearMessages: (sessionId: string) => request<{ cleared: boolean }>(`/chat/sessions/${sessionId}/messages`, { method: "DELETE" }),
  sendMessage: (sessionId: string, content: string, signal?: AbortSignal) =>
    request<{ userMessage: ChatMessage; assistantMessage: ChatMessage; toolActivity: { name: string; arguments: Record<string, unknown> }[] }>(`/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
      signal,
    }),
  exportBackup: (password: string) =>
    request<Record<string, unknown>>("/backup/export", { method: "POST", body: JSON.stringify({ password: password || null }) }),
  importBackup: (data: Record<string, unknown>, password: string) =>
    request<Settings>("/backup/import", { method: "POST", body: JSON.stringify({ data, password: password || null }) }),
  getDefaultSystemPrompt: () => request<{ defaultPrompt: string }>("/system-prompt/default"),
  getPerformanceLog: () => request<{ entries: LogEntry[] }>("/performance-log"),
  clearPerformanceLog: () => request<{ cleared: boolean }>("/performance-log", { method: "DELETE" }),
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
};
