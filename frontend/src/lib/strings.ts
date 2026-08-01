// Bilingual UI strings (DE/EN), mirroring the Android app's Strings.kt approach but as a flat
// key-value map -- this app has far fewer distinct screens/strings, so one flat object (instead
// of Strings.kt's ~15 split interfaces) stays well under any bundler/runtime size concern.
export interface Strings {
  appTitle: string;
  loading: string;
  genericBack: string;
  genericSave: string;
  genericSaving: string;
  genericTest: string;
  genericTesting: string;
  genericCancel: string;
  genericDelete: string;
  genericEdit: string;
  genericClose: string;

  navOverview: string;
  navChat: string;
  navSettings: string;

  loginTitle: string;
  loginUsername: string;
  loginPassword: string;
  loginSubmit: string;
  loginSubmitting: string;

  overviewRefresh: string;
  overviewRefreshing: string;
  overviewNoDataSource: string;
  overviewSetUpNow: string;
  overviewNoDataInRange: (range: string) => string;
  overviewTimeInRange: (percent: string) => string;
  overviewLastValue: (value: string) => string;
  overviewMetricsTitle: (range: string) => string;
  overviewTir: string;
  overviewHypo: string;
  overviewSevereHypo: string;
  overviewHyper: string;
  overviewVariability: string;
  overviewAvgGlucose: string;
  overviewGmi: string;
  overviewIob: string;
  overviewCob: string;
  overviewLoopStatus: string;
  overviewSummaryTitle: string;
  overviewReadAloud: string;
  overviewSourcesLabel: string;
  overviewRangeLabel: string;
  overviewFiltersTitle: string;
  overviewChartTitle: string;
  overviewExcluded: string;
  overviewLastUpdated: (time: string) => string;
  overviewNarrativeFailed: string;
  overviewAnalysisTitle: string;
  overviewAnalyzedWith: (provider: string, model: string) => string;
  liveTileCaption: string;
  liveNoRealtimeSource: string;
  liveNoData: string;
  liveAsOf: (time: string, ageMinutes: number) => string;
  liveStale: string;
  liveOffline: string;
  /** Shown directly under overviewAnalyzedWith, in both Übersicht and Chat. */
  analyzedSources: (sources: string) => string;
  noticesSummary: (count: number) => string;
  chatFailed: string;
  chatAskThisQuestion: string;

  chatPlaceholder: string;
  chatSend: string;
  chatEmptyState: string;
  chatComposing: string;
  chatSourceChoiceAll: string;
  chatExportPdf: string;
  chatReadAloud: string;
  chatStopReading: string;
  overviewExportPdf: string;
  chatHistory: string;
  chatNewChat: string;
  chatRename: string;
  chatStop: string;
  chatDeleteHistory: string;
  chatDeleteHistoryTitle: string;
  chatDeleteHistoryText: string;
  chatDeleteHistoryConfirm: string;
  chatNoSessions: string;
  chatUntitled: string;

  settingsTitle: string;
  settingsProfile: string;
  settingsLlmConfig: string;
  settingsDataSources: string;
  settingsBackup: string;
  settingsBackupSubtitle: string;
  settingsLogging: string;
  settingsLoggingSubtitle: string;
  settingsPerformanceLog: string;
  settingsPerformanceLogSubtitle: string;
  settingsTokenUsage: string;
  settingsTokenUsageSubtitle: string;
  settingsUsageLog: string;
  settingsUsageLogSubtitle: string;
  settingsAccount: string;
  settingsAccountSubtitle: string;
  settingsUsers: string;
  settingsUsersSubtitle: string;
  settingsSystemPrompt: string;
  settingsSystemPromptSubtitle: string;
  settingsAbout: string;
  settingsAboutSubtitle: string;
  settingsTips: string;
  settingsTipsSubtitle: string;
  tipsPageTitle: string;
  tipsGeminiTitle: string;
  tipsGeminiSteps: string;
  tipsGeminiOpenLink: string;
  tipsMcpTitle: string;
  tipsMcpText: string;
  tipsOpenRepo: string;
  tipsNightscoutDesc: string;
  tipsGlookoDesc: string;
  tipsWithingsDesc: string;
  tipsFeelfitDesc: string;
  tipsGoogleHealthDesc: string;
  tipsStravaDesc: string;
  tipsAskTitle: string;
  tipsAskDesc: string;
  tipsAskQuestion: string;
  tipsAskButton: string;
  tipsModelTitle: string;
  tipsModelDesc: string;
  tipsOpenRouterDesc: string;
  tipsOpenRouterLink: string;
  tipsOllamaDesc: string;
  tipsOllamaLink: string;
  settingsLanguage: string;
  appearanceSectionTitle: string;
  colorThemeLabel: (theme: string) => string;
  settingsNoApiKey: string;
  settingsProviderActive: (provider: string) => string;
  settingsNightscoutConfigured: string;
  settingsNightscoutDisabled: string;
  settingsNoDataSource: string;

  settingsMcpServer: string;
  settingsMcpServerSubtitle: string;
  mcpServerPageTitle: string;
  mcpServerTokenSectionTitle: string;
  mcpServerTokenHint: string;
  mcpServerTokenNotGenerated: string;
  mcpServerGenerateToken: string;
  mcpServerRegenerateToken: string;
  mcpServerRegenerateWarning: string;
  mcpServerCopyToken: string;
  mcpServerEndpointLabel: string;
  mcpServerToolsSectionTitle: string;
  mcpServerToolsHint: string;
  mcpServerConfigSectionTitle: string;
  mcpServerConfigHint: string;
  mcpServerConfigClaudeDesktopTitle: string;
  mcpServerConfigOpenWebUiTitle: string;
  mcpServerConfigNoTokenHint: string;
  mcpServerHealthSectionTitle: string;
  mcpServerHealthHint: string;

  roleDiabetiker: string;
  roleFachpersonal: string;
  roleAngehoerige: string;
  roleDiabetikerDesc: string;
  roleFachpersonalDesc: string;
  roleAngehoerigeDesc: string;

  llmConfigTitle: string;
  llmConfigProviderSection: string;
  llmConfigApiKeyLabel: string;
  llmConfigApiKeyPlaceholder: string;
  llmConfigBaseUrlLabel: string;
  llmConfigBaseUrlHint: string;
  llmConfigBaseUrlReset: string;
  llmConfigModelLabel: string;
  llmConfigModelAuto: string;
  llmConfigModelCustom: string;
  llmConfigModelCustomLabel: string;
  llmConfigModelCustomPlaceholder: string;
  llmConfigModelCustomHint: string;
  llmConfigModelRequired: string;
  llmConfigModelVerified: (model: string) => string;
  llmConfigNotTested: string;
  llmConfigRefreshModels: string;
  llmConfigRefreshing: string;
  llmConfigRefreshHint: string;
  llmConfigModelsLive: (date: string) => string;
  llmConfigModelsBuiltin: string;
  llmConfigResetModels: string;
  llmConfigRefreshFailed: (detail: string) => string;

  dataSourcesTitle: string;
  dataSourcesNightscoutTitle: string;
  dataSourcesNightscoutHint: string;
  dataSourcesFeelfitTitle: string;
  dataSourcesFeelfitHint: string;
  dataSourcesFeelfitEmail: string;
  dataSourcesFeelfitPassword: string;
  dataSourcesGoogleHealthTitle: string;
  dataSourcesGoogleHealthHint: string;
  dataSourcesGoogleHealthClientId: string;
  dataSourcesGoogleHealthClientSecret: string;
  dataSourcesGoogleHealthLogin: string;
  dataSourcesGoogleHealthLoginAgain: string;
  dataSourcesGoogleHealthLoggedIn: string;
  dataSourcesGoogleHealthNotLoggedIn: string;
  dataSourcesWithingsTitle: string;
  dataSourcesWithingsHint: string;
  dataSourcesWithingsClientId: string;
  dataSourcesWithingsClientSecret: string;
  dataSourcesWithingsLogin: string;
  dataSourcesWithingsLoginAgain: string;
  dataSourcesWithingsLoggedIn: string;
  dataSourcesWithingsNotLoggedIn: string;
  dsGraphSourceLabel: string;
  dsGraphSourceHint: string;
  dsGraphSourceDelayedHint: string;
  dataSourcesDexcomTitle: string;
  dataSourcesDexcomHint: string;
  dataSourcesDexcomUsername: string;
  dataSourcesDexcomPassword: string;
  dataSourcesGlookoTitle: string;
  dataSourcesGlookoHint: string;
  dataSourcesGlookoUsername: string;
  dataSourcesGlookoPassword: string;
  dataSourcesDexcomRegion: string;
  dataSourcesDexcomRegionUs: string;
  dataSourcesDexcomRegionOus: string;
  dataSourcesLibreTitle: string;
  dataSourcesLibreHint: string;
  dataSourcesLibreEmail: string;
  dataSourcesLibrePassword: string;
  dataSourcesUrl: string;
  dataSourcesAuthType: string;
  dataSourcesAuthNone: string;
  dataSourcesAuthApiSecret: string;
  dataSourcesAuthBearer: string;
  dataSourcesToken: string;
  dataSourcesEnabled: string;
  dsDisplayNameLabel: string;
  dsDisplayNameHint: string;
  dataSourcesCategoryLabel: string;
  dataSourcesTestConnection: string;
  dataSourcesMcpTitle: (count: number) => string;
  dataSourcesMcpHint: string;
  dataSourcesAddServer: string;
  dataSourcesShowTools: string;
  dataSourcesHideTools: string;
  dataSourcesNoTools: string;
  dataSourcesExploring: string;
  dataSourcesActive: string;
  dataSourcesInactive: string;
  categoryGlucose: string;
  categoryActivity: string;
  categoryBodyMetrics: string;
  categoryOther: string;

  mcpEditorAddTitle: string;
  mcpEditorEditTitle: string;
  mcpEditorName: string;
  mcpEditorNamePlaceholder: string;
  mcpEditorUrl: string;
  mcpEditorTransport: string;
  mcpEditorCategory: string;
  mcpEditorIsRealtime: string;
  mcpEditorAuthType: string;
  mcpEditorToken: string;
  mcpEditorOAuthRedirectUriLabel: string;
  mcpEditorOAuthRedirectUriHint: string;
  genericCopy: string;
  genericCopied: string;
  mcpEditorWithingsPreset: string;
  mcpEditorWithingsPresetHint: string;
  mcpEditorOAuthClientId: string;
  mcpEditorOAuthClientSecret: string;
  mcpEditorOAuthAuthEndpoint: string;
  mcpEditorOAuthTokenEndpoint: string;
  mcpEditorOAuthScope: string;
  mcpEditorOAuthScopeOptional: string;
  mcpEditorOAuthTokenActionOptional: string;
  mcpEditorOAuthTokenActionHint: string;
  mcpEditorOAuthMissingFields: string;
  mcpEditorOAuthLogin: string;
  mcpEditorOAuthLoginAgain: string;
  mcpEditorOAuthLoggedIn: string;
  mcpEditorOAuthNotLoggedIn: string;
  authOAuth2: string;
  transportStreamable: string;
  transportSse: string;
  transportOpenapi: string;

  profileTitle: string;
  profileNameSection: string;
  profileFirstName: string;
  profileFirstNamePlaceholder: string;
  profileLastName: string;
  profileLastNamePlaceholder: string;
  profileBirthDateLabel: string;
  profileDiabetesSinceLabel: string;
  profileDiabetesSincePlaceholder: string;
  profileSaveName: string;
  profileGlucoseUnitLabel: string;
  profileInsulinPumpLabel: string;
  profileCgmSystemLabel: string;
  profileAidSystemLabel: string;
  profileAidCommercialGroup: string;
  profileAidDiyGroup: string;
  profileDeviceHint: string;
  profileDeviceNone: string;
  profileDeviceOther: string;
  profileRoleSection: string;
  profileRoleHint: string;
  profileLinkedMainUserLabel: string;
  profileLinkedMainUserNone: string;
  profileLinkedMainUserHint: string;
  profileReadOnlyHint: (patientName: string) => string;
  profileNotLinkedHint: string;

  reportPatientHeader: (fields: { name: string; birthDate: string; diabetesSince: string; cgm: string; aid: string; unit: string }) => string;

  accountTitle: string;
  accountLoggedInAs: (username: string) => string;
  accountLogout: string;
  accountChangePassword: string;
  accountCurrentPassword: string;
  accountNewPassword: string;
  accountNewPasswordRepeat: string;
  accountPasswordMismatch: string;
  accountPasswordChanged: string;

  backupTitle: string;
  backupExportSection: string;
  backupExportHint: string;
  backupEncryptOptional: string;
  backupEncryptPlaceholder: string;
  backupExport: string;
  backupExporting: string;
  backupExportSuccess: string;
  backupImportSection: string;
  backupImportHint: string;
  backupEncryptedHint: string;
  backupDecryptImport: string;
  backupDecrypting: string;
  backupImportSuccess: string;
  backupInvalidFile: (detail: string) => string;

  perfLogTitle: string;
  perfLogHint: string;
  perfLogCopy: string;
  perfLogClear: string;
  perfLogEmpty: string;
  perfLogTokens: (prompt: number, completion: number) => string;
  perfLogOk: string;

  loggingTitle: string;
  loggingHint: string;

  tokenUsageTitle: string;
  tokenUsageHint: string;
  tokenUsagePriceHint: string;
  tokenUsageEmpty: string;
  tokenUsageColModel: string;
  tokenUsageColCalls: string;
  tokenUsageColPrompt: string;
  tokenUsageColCompletion: string;
  tokenUsageColCost: string;
  tokenUsageTotal: string;
  tokenUsageCurrencyLabel: string;
  tokenUsageInputPrice: string;
  tokenUsageOutputPrice: string;
  tokenUsageEditPrices: string;
  tokenUsageNoPrice: string;
  tokenUsageSince: (date: string) => string;
  tokenUsageReset: string;
  tokenUsageResetConfirm: string;
  tokenUsageFetchPrices: string;
  tokenUsageFetching: string;
  tokenUsageFetchHint: string;
  tokenUsageOverwriteLabel: string;
  tokenUsageFetchResult: (updated: number, skipped: number, unmatched: number) => string;
  tokenUsageFetchUnmatched: (models: string) => string;

  usageLogTitle: string;
  usageLogHint: string;
  usageLogEmpty: string;
  usageLogNoMatch: string;
  usageLogFilterUser: string;
  usageLogFilterEvent: string;
  usageLogSearch: string;
  usageLogSearchPlaceholder: string;
  usageLogAll: string;
  usageLogClear: string;
  usageLogClearConfirm: string;
  usageLogAccessToggle: string;
  usageLogAccessHint: string;
  usageLogEventLabel: (event: string) => string;
  usageLogCount: (shown: number, total: number) => string;

  usersTitle: string;
  usersAddTitle: string;
  usersUsername: string;
  usersUsernamePlaceholder: string;
  usersPassword: string;
  usersDisplayName: string;
  usersRole: string;
  usersRoleAdmin: string;
  usersRoleMember: string;
  usersAdd: string;
  usersResetPassword: string;
  usersNewPassword: string;
  usersDeleteConfirm: string;
  usersCannotDeleteSelf: string;
  usersCannotDemoteSelf: string;
  usersYouIndicator: string;
  usersUserTypeLabel: string;

  spTitle: string;
  spBaseSection: string;
  spBaseHint: string;
  spUseDefault: string;
  spUseCustom: string;
  spDefaultLabel: string;
  spResetToDefault: string;
  spAdditionalSection: string;
  spAdditionalHint: string;
  spAdditionalPlaceholder: string;

  aboutVersion: string;
  aboutCopyright: string;
  aboutDisclaimerTitle: string;
  aboutDisclaimerText: string;
  aboutPrivacyTitle: string;
  aboutPrivacyText: string;
  aboutLicensesTitle: string;
  aboutLicensesHint: string;
  aboutRepo: string;
  aboutVersionLabel: string;
  aboutBuildLabel: string;
  aboutBuildDateLabel: string;
  aboutBuildUnknownHint: string;
}

const de: Strings = {
  appTitle: "GlucoSphere",
  loading: "Lädt …",
  genericBack: "Zurück",
  genericSave: "Speichern",
  genericSaving: "Speichert …",
  genericTest: "Testen",
  genericTesting: "Wird getestet …",
  genericCancel: "Abbrechen",
  genericDelete: "Entfernen",
  genericEdit: "Bearbeiten",
  genericClose: "Schließen",

  navOverview: "Übersicht",
  navChat: "Chat",
  navSettings: "Einstellungen",

  loginTitle: "GlucoSphere",
  loginUsername: "Benutzername",
  loginPassword: "Passwort",
  loginSubmit: "Anmelden",
  loginSubmitting: "Anmeldung …",

  overviewRefresh: "Aktualisieren",
  overviewRefreshing: "Aktualisiere -- das kann bei angebundenen Geräten/Apps bis zu einigen Minuten dauern …",
  overviewNoDataSource: "Keine Nightscout-Datenquelle konfiguriert.",
  overviewSetUpNow: "Jetzt einrichten →",
  overviewNoDataInRange: (range: string) => `Keine Blutzuckerwerte im Zeitraum "${range}" gefunden.`,
  overviewTimeInRange: (percent) => `Time in Range: ${percent}%`,
  overviewLastValue: (value) => `Letzter Wert: ${value}`,
  overviewMetricsTitle: (range) => `Metriken (${range})`,
  overviewTir: "Time in Range (70-180)",
  overviewHypo: "Hypoglykämien (<70)",
  overviewSevereHypo: "davon schwer (<54)",
  overviewHyper: "Hyperglykämien (>180)",
  overviewVariability: "Variabilität (%CV)",
  overviewAvgGlucose: "Ø Glukose",
  overviewGmi: "Geschätzter HbA1c (GMI)",
  overviewIob: "IOB (Insulin on Board)",
  overviewCob: "COB (Carbs on Board)",
  overviewLoopStatus: "Loop-Status",
  overviewSummaryTitle: "Zusammenfassung",
  overviewReadAloud: "Vorlesen",
  overviewSourcesLabel: "Datenquellen",
  overviewRangeLabel: "Zeitraum",
  overviewFiltersTitle: "Zeitraum & Datenquellen",
  overviewChartTitle: "Verlauf",
  overviewExcluded: "Für diese Ansicht deaktiviert -- oben wieder auswählen.",
  overviewLastUpdated: (time) => `Letzter Stand: ${time}`,
  overviewNarrativeFailed: "KI-Zusammenfassung nicht verfügbar (Anbieter-Fehler) -- Kennzahlen oben sind trotzdem aktuell.",
  overviewAnalysisTitle: "Auswertung",
  overviewAnalyzedWith: (provider, model) => `Ausgewertet mit: ${provider} · ${model}`,
  liveTileCaption: "Aktueller BZ-Wert (24h Verlauf)",
  liveNoRealtimeSource: "Keine Echtzeit-Quelle konfiguriert -- für den Live-Wert wird eine direkte Anbindung wie Nightscout benötigt (Einstellungen → Datenquellen).",
  liveNoData: "Keine aktuellen Messwerte von der Echtzeit-Quelle.",
  liveAsOf: (time, ageMinutes) => `Stand: ${time} Uhr (vor ${ageMinutes} Min.)`,
  liveStale: "veraltet",
  liveOffline: "Aktualisierung fehlgeschlagen",
  analyzedSources: (sources) => `Quelle(n): ${sources}`,
  noticesSummary: (count) => `⚠️ ${count} Hinweise zur Datenqualität`,
  chatFailed: "Fehlgeschlagen",
  chatAskThisQuestion: "Diese Frage stellen",

  chatPlaceholder: "Nachricht eingeben …",
  chatSend: "Senden",
  chatEmptyState: 'Frage stellen, z. B. "Wie ist mein Wert gerade?"',
  chatComposing: "✍️ Formuliere Antwort …",
  chatSourceChoiceAll: "Alle Quellen",
  chatExportPdf: "Als PDF",
  chatReadAloud: "Vorlesen",
  chatStopReading: "Stoppen",
  overviewExportPdf: "PDF exportieren",
  chatHistory: "Verlauf",
  chatNewChat: "+ Neuer Chat",
  chatRename: "Umbenennen",
  chatStop: "Stopp",
  chatDeleteHistory: "Chatverlauf löschen",
  chatDeleteHistoryTitle: "Chatverlauf löschen",
  chatDeleteHistoryText: "Möchtest du den gesamten Chatverlauf wirklich löschen?",
  chatDeleteHistoryConfirm: "Löschen",
  chatNoSessions: "Noch keine Chats.",
  chatUntitled: "Chat",

  settingsTitle: "Einstellungen",
  settingsProfile: "Patientenprofil",
  settingsLlmConfig: "LLM-Konfiguration",
  settingsDataSources: "Datenquellen",
  settingsBackup: "Backup & Konfiguration",
  settingsBackupSubtitle: "Einstellungen exportieren/importieren",
  settingsLogging: "Logging",
  settingsLoggingSubtitle: "Performance, Token & Kosten, Benutzung",
  settingsPerformanceLog: "Performance-Log",
  settingsPerformanceLogSubtitle: "Anfragen: Anbieter, Modell, Tokens, Dauer",
  settingsTokenUsage: "Token & Kosten",
  settingsTokenUsageSubtitle: "Verbrauch nach Modell/Anbieter, mit Kostenschätzung",
  settingsUsageLog: "Benutzung & Zugriffe",
  settingsUsageLogSubtitle: "Wer war wann angemeldet, welche Tools liefen",
  settingsAccount: "Konto",
  settingsAccountSubtitle: "Passwort ändern, abmelden",
  settingsUsers: "Benutzerverwaltung",
  settingsUsersSubtitle: "Konten für Familie, Diabetes-Team",
  settingsSystemPrompt: "System-Prompt",
  settingsSystemPromptSubtitle: "Anweisungen an die KI",
  settingsTips: "Tipps & Anleitungen",
  settingsTipsSubtitle: "Kostenloser API-Key, Datenquellen-Vorschläge",
  tipsPageTitle: "Tipps & Anleitungen",
  tipsGeminiTitle: "Kostenloser Gemini-API-Key (Google AI Studio)",
  tipsGeminiSteps:
    "1. Auf aistudio.google.com mit einem beliebigen Google-Konto anmelden.\n" +
    "2. Oben links auf \"Get API key\" klicken und einen neuen Key erstellen -- keine Kreditkarte nötig, dauert unter 5 Minuten.\n" +
    "3. Den Key kopieren und in GlucoSphere unter Einstellungen -> LLM-Konfiguration -> \"Google Gemini API\" einfügen, dann \"Testen\" -> \"Speichern\".\n" +
    "4. Der kostenlose Tarif reicht für den normalen Chat-/Übersicht-Gebrauch völlig aus; die genauen Limits (Anfragen pro Minute/Tag) stehen auf der gleichen Seite unter \"Rate limits\".",
  tipsGeminiOpenLink: "Google AI Studio öffnen",
  tipsMcpTitle: "MCP-Server für Datenquellen -- Vorschläge, keine offizielle Empfehlung",
  tipsMcpText:
    "Die folgenden Links sind Vorschläge aus einer Recherche, keine von GlucoSphere geprüften oder betriebenen Server -- MCP ist ein offener Standard, jeder MCP-Server, der zum jeweiligen Thema passende Tools bereitstellt, lässt sich unter Einstellungen -> Datenquellen genauso eintragen, unabhängig davon, ob er hier gelistet ist. Community-Projekte wechseln Pflegestatus/Autor häufig -- prüfe vor dem Verbinden immer selbst README und letzten Commit.\n\n" +
    "Ein MCP-Server läuft üblicherweise auf einem eigenen Rechner/Server (nicht auf diesem Gerät) und muss von hier aus per HTTPS erreichbar sein -- direkt im gleichen Netzwerk, über ein VPN (z. B. Tailscale/WireGuard), oder über einen Reverse Proxy mit eigenem TLS-Zertifikat. Bearer-Token/API-Keys sind Zugangsdaten wie ein Passwort -- niemals teilen.",
  tipsOpenRepo: "GitHub-Repository öffnen",
  tipsNightscoutDesc: "Blutzuckerwerte, Behandlungen, Profile und Statistiken direkt aus deiner Nightscout-Instanz.",
  tipsGlookoDesc: "Verbindet über Glooko synchronisierte Insulinpumpen-Daten (z. B. Omnipod 5) mit KI-Assistenten -- Zugangsdaten und Daten bleiben lokal auf dem eigenen Rechner.",
  tipsWithingsDesc: "Gewicht, Körperzusammensetzung, Schlaf, Aktivität via OAuth2 gegen die offizielle Withings-API. Mehrere unabhängige Community-Implementierungen -- README vor der Nutzung prüfen.",
  tipsFeelfitDesc: "Bereits nativ in GlucoSphere-Web eingebaut (Einstellungen -> Datenquellen) -- kein separater MCP-Server nötig, einfach Email/Passwort eintragen.",
  tipsGoogleHealthDesc: "Blutzucker- und weitere Gesundheitsdaten über Googles offizielle Health-API -- ebenfalls bereits nativ eingebaut (Einstellungen -> Datenquellen), erfordert eine eigene OAuth2-App in der Google Cloud Console. Alternativ (älterer Ansatz, Fitbit-Migration): folgende MCP-Server.",
  tipsStravaDesc: "Für reine Sport-/Trainingsdaten (Aktivitäten, Strecken, Segmente, Trainingsverlauf) als Ergänzung, falls Sport primär über Strava statt Google Health getrackt wird. Mehrere unabhängige Implementierungen -- README vor der Nutzung prüfen.",
  tipsAskTitle: "Nicht sicher, was du fragen kannst?",
  tipsAskDesc: "Der Chat kennt seine eigenen, gerade verfügbaren Werkzeuge am besten -- frag ihn einfach direkt.",
  tipsAskQuestion: "Was kann ich Dich sinnvollerweise fragen?",
  tipsAskButton: "Jetzt im Chat fragen",
  tipsModelTitle: "Modell-Empfehlung",
  tipsModelDesc: "DeepSeek v4 Flash lief in der Praxis am zuverlässigsten -- hat die verfügbaren Werkzeuge am sinnvollsten eingesetzt und dabei passende Antworten geliefert. Einstellbar unter Einstellungen -> LLM-Konfiguration.",
  tipsOpenRouterDesc:
    "Wer Modelle verschiedener Hersteller ausprobieren möchte, ohne sich überall einzeln zu registrieren, " +
    "sollte OpenRouter testen: ein API-Key, ein Guthaben, Zugriff auf Modelle von OpenAI, Anthropic, Google, " +
    "DeepSeek, Meta und vielen weiteren. In GlucoSphere unter Einstellungen -> LLM-Konfiguration den Anbieter " +
    "\"OpenAI API / OpenRouter\" wählen, als API-Basis-URL https://openrouter.ai/api/v1 eintragen und das " +
    "gewünschte Modell auswählen -- oder per \"Manuelle Eingabe\" die exakte Modell-ID von OpenRouter eintragen.",
  tipsOpenRouterLink: "OpenRouter öffnen",
  tipsOllamaDesc:
    "Über dieselbe OpenAI-API-Schnittstelle lassen sich auch lokale Modelle mit Ollama nutzen -- die Daten " +
    "bleiben dann vollständig auf dem eigenen Rechner/Server, ohne Cloud-Anbieter. Ollama installieren, ein " +
    "Modell laden (z. B. \"ollama pull llama3.1\"), dann in der LLM-Konfiguration den Anbieter \"OpenAI API / " +
    "OpenRouter\" wählen, als API-Basis-URL http://<host>:11434/v1 eintragen und die Modell-ID per \"Manuelle " +
    "Eingabe\" angeben. Hinweis: Kleinere lokale Modelle beherrschen Tool-Calling oft nur eingeschränkt -- " +
    "wenn Datenabfragen nicht zuverlässig funktionieren, liegt es meist daran.",
  tipsOllamaLink: "Ollama öffnen",
  settingsAbout: "Über GlucoSphere",
  settingsAboutSubtitle: "Version, Copyright, Haftungsausschluss",
  settingsLanguage: "Sprache",
  appearanceSectionTitle: "Erscheinungsbild",
  colorThemeLabel: (theme) =>
    (
      {
        MEDICAL_BLUE: "Medizinisches Blau",
        EMERALD_GREEN: "Emerald Green",
        SUNSET_ORANGE: "Sunset Orange",
        CYBER_PURPLE: "Cyber Purple",
        OCEAN_TEAL: "Ocean Teal",
        HIGH_CONTRAST_DARK: "High Contrast / AMOLED Dark",
      } as Record<string, string>
    )[theme] ?? theme,
  settingsNoApiKey: "Kein API-Key hinterlegt",
  settingsProviderActive: (provider) => `${provider} aktiv`,
  settingsNightscoutConfigured: "Nightscout konfiguriert",
  settingsNightscoutDisabled: "Nightscout konfiguriert, deaktiviert",
  settingsNoDataSource: "Keine Datenquelle konfiguriert",

  settingsMcpServer: "MCP Server & API",
  settingsMcpServerSubtitle: "Externe KI-Clients per Bearer-Token anbinden",
  mcpServerPageTitle: "MCP Server & API",
  mcpServerTokenSectionTitle: "Bearer-Token",
  mcpServerTokenHint: "Sichert den MCP-Endpunkt (/api/mcp) ab, über den externe Clients (z. B. Claude Desktop, Open WebUI) auf GlucoSphere-Daten zugreifen können. Ohne gültiges Token werden alle Anfragen an /api/mcp abgelehnt.",
  mcpServerTokenNotGenerated: "Noch kein Token generiert.",
  mcpServerGenerateToken: "Token generieren",
  mcpServerRegenerateToken: "Token neu generieren",
  mcpServerRegenerateWarning: "Ein neues Token macht das alte sofort ungültig -- bereits verbundene Clients müssen neu konfiguriert werden. Fortfahren?",
  mcpServerCopyToken: "Token kopieren",
  mcpServerEndpointLabel: "MCP-Endpunkt",
  mcpServerToolsSectionTitle: "Verfügbare Werkzeuge",
  mcpServerToolsHint: "Diese 9 Werkzeuge stehen jedem Client zur Verfügung, der sich mit dem Bearer-Token oben anmeldet -- unabhängig von den in \"Datenquellen\" konfigurierten Chat-Werkzeugen.",
  mcpServerConfigSectionTitle: "Client-Konfiguration",
  mcpServerConfigHint: "Fertige Konfiguration zum Einfügen in den jeweiligen MCP-Client.",
  mcpServerConfigClaudeDesktopTitle: "Claude Desktop (claude_desktop_config.json)",
  mcpServerConfigOpenWebUiTitle: "Open WebUI / generisches SSE",
  mcpServerConfigNoTokenHint: "Zuerst ein Token generieren, um eine fertige Konfiguration zu erhalten.",
  mcpServerHealthSectionTitle: "Verbundene Datenquellen",
  mcpServerHealthHint: "Health-Check der Datenquellen, die die obigen Werkzeuge tatsächlich abfragen -- grün = online, gelb = zuvor erreichbar, aktuell aber nicht, rot = nie erreichbar.",

  roleDiabetiker: "Diabetiker",
  roleFachpersonal: "Medizinisches Fachpersonal",
  roleAngehoerige: "Angehörige",
  roleDiabetikerDesc: "Persönlich, empathisch, praxisorientiert -- Alltagstipps, Blutzuckermanagement, KE/BE-Schätzungen.",
  roleFachpersonalDesc: "Fachlich-neutral, präzise -- TIR, %CV, AGP-Profile, Insulindosierung, Leitlinien-Konformität.",
  roleAngehoerigeDesc: "Einfühlsam, beruhigend, barrierefrei -- Notfall-Signale erkennen, klare Handlungsempfehlungen.",

  llmConfigTitle: "LLM-Konfiguration",
  llmConfigProviderSection: "KI-Anbieter",
  llmConfigApiKeyLabel: "API-Key",
  llmConfigApiKeyPlaceholder: "API-Key eingeben",
  llmConfigBaseUrlLabel: "API-Basis-URL",
  llmConfigBaseUrlHint: "Für einen kompatiblen Endpunkt statt des Standard-Anbieters -- z. B. OpenRouter (https://openrouter.ai/api/v1) oder ein lokales Ollama (http://localhost:11434/v1). Leer lassen für den Standard.",
  llmConfigBaseUrlReset: "Auf Standard zurücksetzen",
  llmConfigModelLabel: "Modell",
  llmConfigModelAuto: "Automatisch (empfohlen)",
  llmConfigModelCustom: "Manuelle Eingabe …",
  llmConfigModelCustomLabel: "Modell-ID",
  llmConfigModelCustomPlaceholder: "z. B. gemini-3.6-flash",
  llmConfigModelCustomHint:
    "Exakte Modell-ID des Anbieters eintragen (Groß-/Kleinschreibung beachten) -- z. B. für ein neues " +
    "Modell, das hier noch nicht gelistet ist, oder ein eigenes Modell über OpenRouter/Ollama. " +
    "Beim Testen wird das Modell wirklich aufgerufen und damit geprüft, ob es existiert und nutzbar ist.",
  llmConfigModelRequired: "Bitte eine Modell-ID eintragen.",
  llmConfigModelVerified: (model) => `Modell verifiziert: ${model}`,
  llmConfigNotTested: "Noch nicht getestet – zum Speichern erst testen.",
  llmConfigRefreshModels: "Modelle aktualisieren",
  llmConfigRefreshing: "Rufe Modelle ab …",
  llmConfigRefreshHint:
    "Holt die aktuell verfügbaren Modelle direkt beim Anbieter (mit dem hinterlegten API-Key) und übernimmt " +
    "die 4 relevantesten in die Auswahl -- so folgt die Liste neuen Modellen ohne neue GlucoSphere-Web-Version. " +
    "Die Auswahl ist eine Heuristik (Chat-Modelle, neueste Versionen, schnell + Flaggschiff); alles andere " +
    "bleibt über \"Manuelle Eingabe\" erreichbar.",
  llmConfigModelsLive: (date) => `Live abgerufen am ${date}`,
  llmConfigModelsBuiltin: "Mitgelieferte Auswahl (noch nicht aktualisiert)",
  llmConfigResetModels: "Auf mitgelieferte Liste zurücksetzen",
  llmConfigRefreshFailed: (detail) => `Abruf fehlgeschlagen: ${detail}`,

  dataSourcesTitle: "Datenquellen",
  dataSourcesNightscoutTitle: "Nightscout",
  dataSourcesNightscoutHint: "Direkter Zugriff ohne MCP-Server. Token/API-Secret sind optional (nur für private Instanzen nötig).",
  dataSourcesFeelfitTitle: "FeelFit",
  dataSourcesFeelfitHint: "Direkter Zugriff auf Körperzusammensetzungs-Messungen (Gewicht, Körperfett, Muskelmasse u. a.) ohne eigenen MCP-Server -- einfach die Zugangsdaten des FeelFit-Kontos eintragen.",
  dataSourcesFeelfitEmail: "FeelFit-Email",
  dataSourcesFeelfitPassword: "FeelFit-Passwort",
  dataSourcesGoogleHealthTitle: "Google Health",
  dataSourcesGoogleHealthHint: "Blutzucker-Messungen (z. B. von einem mit Google Health synchronisierten CGM/Messgerät) direkt über Googles offizielle Health-API. Erfordert eine selbst registrierte OAuth2-App in der Google Cloud Console mit der unten gezeigten Redirect-URI.",
  dataSourcesGoogleHealthClientId: "Google-Client-ID",
  dataSourcesGoogleHealthClientSecret: "Google-Client-Secret",
  dataSourcesGoogleHealthLogin: "Login mit Google",
  dataSourcesGoogleHealthLoginAgain: "Erneut anmelden",
  dataSourcesGoogleHealthLoggedIn: "Angemeldet",
  dataSourcesGoogleHealthNotLoggedIn: "Nicht angemeldet",
  dataSourcesWithingsTitle: "Withings",
  dataSourcesWithingsHint: "Gewicht, Körperfettanteil (letzte 3 Monate, inkl. Trendrichtung), sowie -- bei einer verbundenen Withings-Smartwatch -- tägliche Aktivität (Schritte, Kalorien, Puls), Schlaf-Zusammenfassungen und einzelne Trainingseinheiten, direkt über die offizielle Withings-REST-API. Erfordert eine selbst registrierte OAuth2-App im Withings Developer Portal mit der unten gezeigten Redirect-URI. Nach einem bereits bestehenden Login bitte einmalig erneut anmelden, damit die zusätzlichen Berechtigungen (Aktivität/Schlaf) mit übernommen werden.",
  dataSourcesWithingsClientId: "Withings-Client-ID",
  dataSourcesWithingsClientSecret: "Withings-Client-Secret",
  dataSourcesWithingsLogin: "Login mit Withings",
  dataSourcesWithingsLoginAgain: "Erneut anmelden",
  dataSourcesWithingsLoggedIn: "Angemeldet",
  dataSourcesWithingsNotLoggedIn: "Nicht angemeldet",
  dsGraphSourceLabel: "Quelle für den Übersichts-Graphen",
  dsGraphSourceHint: "Diese Quelle liefert den aktuellen Wert und die 24h-Kurve oben auf der Übersicht. Nur eine Quelle gleichzeitig; ohne Auswahl werden alle Echtzeit-Quellen kombiniert.",
  dsGraphSourceDelayedHint: "Diese Quelle liefert den aktuellen Wert und die 24h-Kurve oben auf der Übersicht. Achtung: Glooko ist zeitverzögert -- die Werte stammen aus der Pumpen-/App-Synchronisation und können Stunden alt sein. Der angezeigte Stand sagt jeweils, wie alt der Wert wirklich ist; abgerufen wird höchstens alle 5 Minuten.",
  dataSourcesDexcomTitle: "Dexcom",
  dataSourcesDexcomHint: "Direkter Zugriff auf aktuelle CGM-Werte über die Dexcom-Share-API (dieselbe Cloud-API wie die Dexcom-Follow-App) -- liefert nur die letzten bis zu 24 Stunden, keine ältere Historie. Zugangsdaten des Dexcom-Kontos eintragen (nicht das Follower-Konto).",
  dataSourcesDexcomUsername: "Dexcom-Benutzername",
  dataSourcesDexcomPassword: "Dexcom-Passwort",
  dataSourcesGlookoTitle: "Glooko",
  dataSourcesGlookoHint: "Allgemeine Insulinpumpen-Daten (Bolusgaben, tägliche Basal-/Bolus-Summen) über Glooko -- herstellerunabhängig, funktioniert unabhängig vom konkreten Pumpenmodell. Zugangsdaten des Glooko-Kontos eintragen.",
  dataSourcesGlookoUsername: "Glooko-Benutzername/E-Mail",
  dataSourcesGlookoPassword: "Glooko-Passwort",
  dataSourcesDexcomRegion: "Region",
  dataSourcesDexcomRegionUs: "USA",
  dataSourcesDexcomRegionOus: "Außerhalb der USA",
  dataSourcesLibreTitle: "LibreLinkUp",
  dataSourcesLibreHint: "Direkter Zugriff auf aktuelle CGM-Werte über LibreLinkUp -- liefert nur die letzten ca. 12 Stunden. Erfordert ein LibreLinkUp-Konto (nicht das LibreLink-Konto), das als Beobachter mit dem Libre-Konto verbunden ist.",
  dataSourcesLibreEmail: "LibreLinkUp-Email",
  dataSourcesLibrePassword: "LibreLinkUp-Passwort",
  dataSourcesUrl: "Nightscout-URL",
  dataSourcesAuthType: "Auth-Typ",
  dataSourcesAuthNone: "Keine",
  dataSourcesAuthApiSecret: "API-Secret-Header",
  dataSourcesAuthBearer: "Bearer Token",
  dataSourcesToken: "Token / Secret",
  dataSourcesEnabled: "Datenquelle aktiviert",
  dsDisplayNameLabel: "Anzeigename",
  dsDisplayNameHint: "Eigener Name für diese Quelle -- wird in Chat-Quellenangaben, im Dashboard und bei der Quellenauswahl verwendet.",
  dataSourcesCategoryLabel: "Kategorie",
  dataSourcesTestConnection: "Verbindung testen",
  dataSourcesMcpTitle: (count) => `MCP-Server (${count})`,
  dataSourcesMcpHint: "Aktive Server werden im Chat automatisch als Werkzeuge angeboten -- die KI ruft sie selbst auf, wenn eine Frage dazu passt. Unterstützt werden die aktuelle MCP-Spezifikation (Streamable HTTP), der ältere SSE-Transport und OpenAPI-Proxys wie mcpo.",
  dataSourcesAddServer: "+ MCP-Server hinzufügen",
  dataSourcesShowTools: "Tools anzeigen",
  dataSourcesHideTools: "Tools ausblenden",
  dataSourcesNoTools: "Keine Werkzeuge gefunden.",
  dataSourcesExploring: "Werkzeuge werden erkundet …",
  dataSourcesActive: "Aktiv",
  dataSourcesInactive: "Inaktiv",
  categoryGlucose: "Diabetes / Blutzucker",
  categoryActivity: "Sport / Bewegung / Schlaf",
  categoryBodyMetrics: "Körperzusammensetzung",
  categoryOther: "Sonstiges",

  mcpEditorAddTitle: "MCP-Server hinzufügen",
  mcpEditorEditTitle: "Server bearbeiten",
  mcpEditorName: "Name",
  mcpEditorNamePlaceholder: "z. B. Google Fit",
  mcpEditorUrl: "URL",
  mcpEditorTransport: "Transport",
  mcpEditorCategory: "Datenkategorie",
  mcpEditorIsRealtime: "Realtime-Quelle (z. B. Nightscout) -- wird bei der Übersicht anderen Quellen vorgezogen, die hinterherhinken können (z. B. Glooko).",
  mcpEditorAuthType: "Auth-Typ",
  mcpEditorToken: "Token / Secret",
  mcpEditorOAuthRedirectUriLabel: "Redirect-URI (bei Provider registrieren)",
  mcpEditorOAuthRedirectUriHint: "Diese exakte URL beim OAuth2-Anbieter (z. B. Withings-Entwicklerportal) als erlaubte Redirect-/Callback-URI hinterlegen -- erst danach Client-ID/Secret unten eintragen.",
  genericCopy: "Kopieren",
  genericCopied: "Kopiert!",
  mcpEditorWithingsPreset: "Withings-Vorlage einfügen",
  mcpEditorWithingsPresetHint: "Trägt die offiziellen Withings-Endpunkte ein (aus withings-sas/api-oauth2-python) -- nur noch Client-ID/Secret aus der eigenen, unter account.withings.com/partner/add_oauth2 registrierten App eintragen.",
  mcpEditorOAuthClientId: "Client-ID",
  mcpEditorOAuthClientSecret: "Client-Secret",
  mcpEditorOAuthAuthEndpoint: "Authorization-Endpoint",
  mcpEditorOAuthTokenEndpoint: "Token-Endpoint",
  mcpEditorOAuthScope: "Scope",
  mcpEditorOAuthScopeOptional: "Scope (optional)",
  mcpEditorOAuthTokenActionOptional: "Token-Action (optional)",
  mcpEditorOAuthTokenActionHint: "Nur für Anbieter nötig, deren Token-Endpoint einen zusätzlichen \"action\"-Parameter erwartet (z. B. Withings: \"requesttoken\") -- bei Standard-OAuth2 leer lassen.",
  mcpEditorOAuthMissingFields: "Client-ID, Authorization-Endpoint und Token-Endpoint müssen ausgefüllt sein, bevor die Anmeldung gestartet werden kann.",
  mcpEditorOAuthLogin: "Login mit Provider",
  mcpEditorOAuthLoginAgain: "Erneut anmelden",
  mcpEditorOAuthLoggedIn: "Angemeldet",
  mcpEditorOAuthNotLoggedIn: "Nicht angemeldet",
  authOAuth2: "OAuth2",
  transportStreamable: "Streamable HTTP (aktueller MCP-Standard)",
  transportSse: "SSE (älterer MCP-Standard)",
  transportOpenapi: "OpenAPI-Proxy (z. B. mcpo)",

  profileTitle: "Patientenprofil",
  profileNameSection: "Persönliche Daten",
  profileFirstName: "Vorname",
  profileFirstNamePlaceholder: "z. B. Andreas",
  profileLastName: "Nachname",
  profileLastNamePlaceholder: "z. B. Muster",
  profileBirthDateLabel: "Geburtsdatum",
  profileDiabetesSinceLabel: "Diabetes seit (Jahr)",
  profileDiabetesSincePlaceholder: "z. B. 2015",
  profileSaveName: "Speichern",
  profileGlucoseUnitLabel: "Blutzucker-Einheit",
  profileInsulinPumpLabel: "Insulinpumpe",
  profileCgmSystemLabel: "CGM-System",
  profileAidSystemLabel: "AID-System / Pumpe",
  profileAidCommercialGroup: "Kommerzielle Systeme",
  profileAidDiyGroup: "DIY-AID-Systeme",
  profileDeviceHint: "Wird in Chat-Antworten und Berichten berücksichtigt, statt auf veraltete allgemeine Annahmen zurückzugreifen.",
  profileDeviceNone: "Keine/keins",
  profileDeviceOther: "Andere/Sonstige",
  profileRoleSection: "Benutzertyp",
  profileRoleHint: "Bestimmt Tonalität und fachlichen Fokus der KI-Antworten im Chat und in der Übersicht.",
  profileLinkedMainUserLabel: "Verknüpfter Hauptnutzer",
  profileLinkedMainUserNone: "-- bitte auswählen --",
  profileLinkedMainUserHint: "Datenquellen, Pumpe und CGM dieses Hauptnutzers werden für den Chat verwendet -- deine Antworten beziehen sich dann in der dritten Person auf diese Person, nicht auf dich selbst.",
  profileReadOnlyHint: (patientName: string) =>
    `Dies sind die Stammdaten von ${patientName}. Sie werden von ${patientName} selbst (oder einem Administrator unter Benutzerverwaltung) gepflegt und können hier nur eingesehen werden.`,
  profileNotLinkedHint: "Es ist noch kein Hauptpatient verknüpft. Bitte einen Administrator, dies unter Benutzerverwaltung einzurichten.",

  reportPatientHeader: (f) => `Patient: ${f.name} | Geb.: ${f.birthDate} | Diabetes seit: ${f.diabetesSince} | Sensor: ${f.cgm} | AID-System: ${f.aid} | Einheit: ${f.unit}`,

  accountTitle: "Konto",
  accountLoggedInAs: (username) => `Angemeldet als ${username}`,
  accountLogout: "Abmelden",
  accountChangePassword: "Passwort ändern",
  accountCurrentPassword: "Aktuelles Passwort",
  accountNewPassword: "Neues Passwort (mind. 8 Zeichen)",
  accountNewPasswordRepeat: "Neues Passwort wiederholen",
  accountPasswordMismatch: "Die neuen Passwörter stimmen nicht überein.",
  accountPasswordChanged: "Passwort geändert.",

  backupTitle: "Backup & Konfiguration",
  backupExportSection: "Einstellungen exportieren",
  backupExportHint: "Exportiert API-Schlüssel, das gewählte LLM, den System-Prompt und die MCP-Server-Konfiguration als Datei. Der Chatverlauf ist NICHT enthalten.",
  backupEncryptOptional: "Mit Passwort verschlüsseln? (optional)",
  backupEncryptPlaceholder: "Leer lassen für unverschlüsselt",
  backupExport: "Exportieren",
  backupExporting: "Exportiere …",
  backupExportSuccess: "Backup heruntergeladen.",
  backupImportSection: "Einstellungen importieren",
  backupImportHint: "Überschreibt die oben genannten Einstellungen mit dem Inhalt der ausgewählten Backup-Datei.",
  backupEncryptedHint: "Diese Datei ist verschlüsselt -- Passwort eingeben",
  backupDecryptImport: "Entschlüsseln & importieren",
  backupDecrypting: "Entschlüssele …",
  backupImportSuccess: "Import erfolgreich -- die Einstellungen wurden aktualisiert.",
  backupInvalidFile: (detail) => `Ungültige Backup-Datei: ${detail}`,

  perfLogTitle: "Performance-Log",
  perfLogHint: "Protokolliert jede Cloud-LLM-Anfrage (Chat und Übersicht) mit Anbieter, Modell, Token-Verbrauch, Dauer und -- bei Fehlern -- der genauen Fehlermeldung. Die letzten 200 Einträge, neueste zuerst.",
  perfLogCopy: "Als Text kopieren",
  perfLogClear: "Log leeren",
  perfLogEmpty: "Noch keine Einträge.",
  perfLogTokens: (prompt, completion) => `${prompt}+${completion} Tokens`,
  perfLogOk: "OK",

  loggingTitle: "Logging",
  loggingHint: "Alle Protokolle an einer Stelle: technische Anfragedetails, Token-Verbrauch mit Kostenschätzung und die Benutzung der App.",

  tokenUsageTitle: "Token & Kosten",
  tokenUsageHint:
    "Summierter Token-Verbrauch je Anbieter und Modell, über alle Chat- und Übersicht-Anfragen hinweg. " +
    "Läuft unabhängig vom Performance-Log weiter (das nur die letzten 200 Anfragen behält) und wird nur " +
    "durch \"Verbrauch zurücksetzen\" geleert.",
  tokenUsagePriceHint:
    "Preise ändern sich je Anbieter, Tarif und Region -- deshalb sind sie nicht fest eingebaut. Trage je Modell " +
    "die Preise pro 1 Mio. Tokens ein (siehe Preisliste des Anbieters); ohne Preis werden nur die Tokens gezählt.",
  tokenUsageEmpty: "Noch kein Verbrauch erfasst.",
  tokenUsageColModel: "Anbieter / Modell",
  tokenUsageColCalls: "Anfragen",
  tokenUsageColPrompt: "Eingabe-Tokens",
  tokenUsageColCompletion: "Ausgabe-Tokens",
  tokenUsageColCost: "Kosten (geschätzt)",
  tokenUsageTotal: "Gesamt",
  tokenUsageCurrencyLabel: "Währung",
  tokenUsageInputPrice: "Eingabe pro 1 Mio. Tokens",
  tokenUsageOutputPrice: "Ausgabe pro 1 Mio. Tokens",
  tokenUsageEditPrices: "Preise",
  tokenUsageNoPrice: "kein Preis hinterlegt",
  tokenUsageSince: (date) => `erfasst seit ${date}`,
  tokenUsageReset: "Verbrauch zurücksetzen",
  tokenUsageResetConfirm: "Alle Token-Zähler wirklich zurücksetzen? Die hinterlegten Preise bleiben erhalten.",
  tokenUsageFetchPrices: "Preise abrufen",
  tokenUsageFetching: "Rufe Preise ab …",
  tokenUsageFetchHint:
    "Holt die Preise aus der öffentlichen Modell-Liste von OpenRouter (openrouter.ai/api/v1/models, ohne " +
    "API-Key) -- dort stehen auch die Preise der über OpenRouter angebotenen Modelle von Anthropic, OpenAI, " +
    "Google und DeepSeek. Die Anbieter-eigenen Endpunkte liefern KEINE Preise, nur Modell-IDs. Alle Werte in USD.",
  tokenUsageOverwriteLabel: "Auch bereits hinterlegte Preise überschreiben",
  tokenUsageFetchResult: (updated, skipped, unmatched) =>
    `${updated} Preis(e) übernommen, ${skipped} unverändert gelassen, ${unmatched} ohne Treffer.`,
  tokenUsageFetchUnmatched: (models) => `Kein Preis gefunden für: ${models}`,

  usageLogTitle: "Benutzung & Zugriffe",
  usageLogHint:
    "Protokolliert, wer sich wann an- und abgemeldet hat, welche Fragen gestellt, welche Werkzeuge (Tools) " +
    "ausgeführt und welche Übersichten erzeugt wurden. Die letzten 5000 Einträge, neueste zuerst.",
  usageLogEmpty: "Noch keine Einträge.",
  usageLogNoMatch: "Keine Einträge für diesen Filter.",
  usageLogFilterUser: "Benutzer",
  usageLogFilterEvent: "Ereignis",
  usageLogSearch: "Suche",
  usageLogSearchPlaceholder: "z. B. Tool-Name, Frage, Pfad …",
  usageLogAll: "Alle",
  usageLogClear: "Log leeren",
  usageLogClearConfirm: "Das gesamte Benutzungsprotokoll wirklich löschen?",
  usageLogAccessToggle: "API-Zugriffe protokollieren (Access-Log)",
  usageLogAccessHint:
    "Zusätzlich jede einzelne API-Anfrage mit Methode, Pfad, Status und Dauer aufzeichnen -- auch abgelehnte " +
    "(401/403). Erzeugt viele Einträge, daher standardmäßig aus.",
  usageLogEventLabel: (event) =>
    ({
      LOGIN: "Anmeldung",
      LOGIN_FAILED: "Fehlgeschlagene Anmeldung",
      LOGOUT: "Abmeldung",
      CHAT: "Frage",
      TOOL: "Tool-Aufruf",
      DASHBOARD: "Übersicht",
      ACCESS: "API-Zugriff",
    })[event] ?? event,
  usageLogCount: (shown, total) => `${shown} von ${total} Einträgen`,

  usersTitle: "Benutzerverwaltung",
  usersAddTitle: "Benutzer hinzufügen",
  usersUsername: "Benutzername",
  usersUsernamePlaceholder: "z. B. lisa",
  usersPassword: "Passwort (mind. 8 Zeichen)",
  usersDisplayName: "Name (für persönliche Ansprache)",
  usersRole: "Rolle",
  usersRoleAdmin: "Administrator (voller Zugriff)",
  usersRoleMember: "Mitglied (Chat & Übersicht, keine Einstellungen)",
  usersAdd: "Hinzufügen",
  usersResetPassword: "Passwort zurücksetzen",
  usersNewPassword: "Neues Passwort",
  usersDeleteConfirm: "Diesen Benutzer wirklich löschen? Der Chatverlauf geht verloren.",
  usersCannotDeleteSelf: "Du kannst dein eigenes Konto hier nicht löschen -- das geht nur unter Konto.",
  usersCannotDemoteSelf: "Du kannst dir nicht selbst die Admin-Rolle entziehen.",
  usersYouIndicator: "(du)",
  usersUserTypeLabel: "Benutzertyp",

  spTitle: "System-Prompt",
  spBaseSection: "Basis-Prompt",
  spBaseHint: "Definiert Rolle, Ton und Verhaltensregeln der KI. Wird bei jeder Chat- und Übersicht-Anfrage mitgeschickt.",
  spUseDefault: "Standard verwenden",
  spUseCustom: "Eigenen Prompt verwenden",
  spDefaultLabel: "Standard-Prompt (Referenz, nicht editierbar)",
  spResetToDefault: "Auf Standard zurücksetzen",
  spAdditionalSection: "Zusätzliche Instruktionen",
  spAdditionalHint: "Wird an den Basis-Prompt angehängt -- z. B. \"Antworte immer in Stichpunkten.\"",
  spAdditionalPlaceholder: "z. B. \"Erwähne bei jeder Antwort meinen Arzttermin am Freitag.\"",

  aboutVersion: "GlucoSphere-Web",
  aboutCopyright: "© 2026 GlucoSphere. Alle Rechte vorbehalten.",
  aboutDisclaimerTitle: "Medizinischer Haftungsausschluss",
  aboutDisclaimerText:
    "GlucoSphere ist kein medizinisches Gerät und ersetzt keine ärztliche Beratung oder Therapieentscheidung. " +
    "Alle angezeigten Werte, Analysen und KI-generierten Hinweise dienen ausschließlich der persönlichen " +
    "Information und Unterstützung im Alltag -- auch für Familienangehörige und Diabetes-Team-Mitglieder, " +
    "die als Mitglied-Konto Zugriff haben. KI-Modelle können halluzinieren und Werte oder Zusammenhänge " +
    "erfinden, die in den echten Quelldaten nicht existieren. Alle ausgegebenen Werte und Trends müssen " +
    "vor einer therapeutischen Maßnahme mit den Originaldaten der Quelldienste (z. B. Nightscout/Glooko) " +
    "abgeglichen und mit dem Diabetes-Team besprochen werden -- verlasse dich bei Therapieentscheidungen " +
    "(z. B. Insulindosierung) niemals allein auf diese App.",
  aboutPrivacyTitle: "Datenschutz-Hinweise",
  aboutPrivacyText:
    "GlucoSphere-Web speichert Einstellungen, Zugangsdaten und Chatverläufe ausschließlich lokal auf dem " +
    "selbst betriebenen Server (SQLite, Docker-Volume) -- es gibt keinen externen GlucoSphere-Server. " +
    "Bei Nutzung eines Cloud-KI-Anbieters (Google, Anthropic, OpenAI/OpenRouter, DeepSeek) werden Anfragen " +
    "inkl. ggf. abgerufener Gesundheitsdaten direkt an den jeweiligen Anbieter übermittelt -- es gelten " +
    "dessen eigene Datenschutzbestimmungen. Jedes Benutzerkonto hat einen eigenen, von anderen Konten " +
    "getrennten Chatverlauf; Administrator-Konten sehen weiterhin die gemeinsame Datenquellen-Konfiguration.",
  aboutLicensesTitle: "Verwendete Open-Source-Bibliotheken",
  aboutLicensesHint: "GlucoSphere-Web baut auf folgenden Open-Source-Projekten auf -- vielen Dank an deren Autoren.",
  aboutRepo: "Quellcode auf GitHub",
  aboutVersionLabel: "Version",
  aboutBuildLabel: "Build",
  aboutBuildDateLabel: "Build-Datum",
  aboutBuildUnknownHint:
    "Build-Kennung nicht gesetzt -- dieser Stand wurde ohne Build-Stempel gebaut (deploy.sh setzt ihn automatisch).",
};

const en: Strings = {
  appTitle: "GlucoSphere",
  loading: "Loading …",
  genericBack: "Back",
  genericSave: "Save",
  genericSaving: "Saving …",
  genericTest: "Test",
  genericTesting: "Testing …",
  genericCancel: "Cancel",
  genericDelete: "Remove",
  genericEdit: "Edit",
  genericClose: "Close",

  navOverview: "Overview",
  navChat: "Chat",
  navSettings: "Settings",

  loginTitle: "GlucoSphere",
  loginUsername: "Username",
  loginPassword: "Password",
  loginSubmit: "Log in",
  loginSubmitting: "Logging in …",

  overviewRefresh: "Refresh",
  overviewRefreshing: "Refreshing -- this can take up to a few minutes for connected devices/apps …",
  overviewNoDataSource: "No Nightscout data source configured.",
  overviewSetUpNow: "Set up now →",
  overviewNoDataInRange: (range) => `No glucose readings found for "${range}".`,
  overviewTimeInRange: (percent) => `Time in Range: ${percent}%`,
  overviewLastValue: (value) => `Latest reading: ${value}`,
  overviewMetricsTitle: (range) => `Metrics (${range})`,
  overviewTir: "Time in Range (70-180)",
  overviewHypo: "Hypoglycemia (<70)",
  overviewSevereHypo: "of which severe (<54)",
  overviewHyper: "Hyperglycemia (>180)",
  overviewVariability: "Variability (%CV)",
  overviewAvgGlucose: "Avg. glucose",
  overviewGmi: "Estimated HbA1c (GMI)",
  overviewIob: "IOB (Insulin on Board)",
  overviewCob: "COB (Carbs on Board)",
  overviewLoopStatus: "Loop status",
  overviewSummaryTitle: "Summary",
  overviewReadAloud: "Read aloud",
  overviewSourcesLabel: "Data sources",
  overviewRangeLabel: "Time range",
  overviewFiltersTitle: "Time range & data sources",
  overviewChartTitle: "Trend",
  overviewExcluded: "Disabled for this view -- select it again above.",
  overviewLastUpdated: (time) => `Last updated: ${time}`,
  overviewNarrativeFailed: "AI summary unavailable (provider error) -- the metrics above are still current.",
  overviewAnalysisTitle: "Analysis",
  overviewAnalyzedWith: (provider, model) => `Analyzed with: ${provider} · ${model}`,
  liveTileCaption: "Current glucose (24h trend)",
  liveNoRealtimeSource: "No realtime source configured -- the live value needs a direct connection such as Nightscout (Settings → Data sources).",
  liveNoData: "No current readings from the realtime source.",
  liveAsOf: (time, ageMinutes) => `As of ${time} (${ageMinutes} min ago)`,
  liveStale: "outdated",
  liveOffline: "refresh failed",
  analyzedSources: (sources) => `Source(s): ${sources}`,
  noticesSummary: (count) => `⚠️ ${count} data-quality notices`,
  chatFailed: "Failed",
  chatAskThisQuestion: "Ask this question",

  chatPlaceholder: "Type a message …",
  chatSend: "Send",
  chatEmptyState: 'Ask a question, e.g. "How is my level right now?"',
  chatComposing: "✍️ Composing answer …",
  chatSourceChoiceAll: "All sources",
  chatExportPdf: "As PDF",
  chatReadAloud: "Read aloud",
  chatStopReading: "Stop",
  overviewExportPdf: "Export PDF",
  chatHistory: "History",
  chatNewChat: "+ New chat",
  chatRename: "Rename",
  chatStop: "Stop",
  chatDeleteHistory: "Delete chat history",
  chatDeleteHistoryTitle: "Delete chat history",
  chatDeleteHistoryText: "Do you really want to delete the entire chat history?",
  chatDeleteHistoryConfirm: "Delete",
  chatNoSessions: "No chats yet.",
  chatUntitled: "Chat",

  settingsTitle: "Settings",
  settingsProfile: "Patient profile",
  settingsLlmConfig: "LLM configuration",
  settingsDataSources: "Data sources",
  settingsBackup: "Backup & configuration",
  settingsBackupSubtitle: "Export/import settings",
  settingsLogging: "Logging",
  settingsLoggingSubtitle: "Performance, tokens & costs, usage",
  settingsPerformanceLog: "Performance log",
  settingsPerformanceLogSubtitle: "Requests: provider, model, tokens, duration",
  settingsTokenUsage: "Tokens & costs",
  settingsTokenUsageSubtitle: "Usage per model/provider, with cost estimate",
  settingsUsageLog: "Usage & access",
  settingsUsageLogSubtitle: "Who was logged in when, which tools ran",
  settingsAccount: "Account",
  settingsAccountSubtitle: "Change password, log out",
  settingsUsers: "User management",
  settingsUsersSubtitle: "Accounts for family, diabetes care team",
  settingsSystemPrompt: "System prompt",
  settingsSystemPromptSubtitle: "Instructions for the AI",
  settingsTips: "Tips & guides",
  settingsTipsSubtitle: "Free API key, data source suggestions",
  tipsPageTitle: "Tips & guides",
  tipsGeminiTitle: "Free Gemini API key (Google AI Studio)",
  tipsGeminiSteps:
    "1. Sign in at aistudio.google.com with any Google account.\n" +
    "2. Click \"Get API key\" in the top left and create a new key -- no credit card needed, takes under 5 minutes.\n" +
    "3. Copy the key and paste it into GlucoSphere under Settings -> LLM configuration -> \"Google Gemini API\", then \"Test\" -> \"Save\".\n" +
    "4. The free tier is entirely sufficient for normal chat/overview use; the exact limits (requests per minute/day) are listed on the same page under \"Rate limits\".",
  tipsGeminiOpenLink: "Open Google AI Studio",
  tipsMcpTitle: "MCP servers for data sources -- suggestions, not an official recommendation",
  tipsMcpText:
    "The links below are suggestions from research, not servers checked or operated by GlucoSphere -- MCP is an open standard, and any MCP server that provides tools matching the relevant topic can be entered under Settings -> Data sources the same way, whether or not it's listed here. Community projects frequently change maintenance status/author -- always check a repo's own README and last commit before connecting.\n\n" +
    "An MCP server usually runs on its own computer/server (not on this device) and must be reachable from here over HTTPS -- directly on the same network, via a VPN (e.g. Tailscale/WireGuard), or via a reverse proxy with its own TLS certificate. Bearer tokens/API keys are credentials like a password -- never share them.",
  tipsOpenRepo: "Open GitHub repository",
  tipsNightscoutDesc: "Glucose values, treatments, profiles, and statistics directly from your Nightscout instance.",
  tipsGlookoDesc: "Connects Glooko-synced insulin pump data (e.g. Omnipod 5) to AI assistants -- credentials and data stay local on your own machine.",
  tipsWithingsDesc: "Weight, body composition, sleep, activity via OAuth2 against the official Withings API. Several independent community implementations -- check the README before use.",
  tipsFeelfitDesc: "Already natively built into GlucoSphere-Web (Settings -> Data sources) -- no separate MCP server needed, just enter your email/password.",
  tipsGoogleHealthDesc: "Blood glucose and other health data via Google's official Health API -- also already natively built in (Settings -> Data sources), requires your own OAuth2 app in the Google Cloud Console. Alternative (older approach, Fitbit migration): the MCP servers below.",
  tipsStravaDesc: "For pure sports/training data (activities, routes, segments, training history) as a complement if exercise is tracked primarily via Strava instead of Google Health. Several independent implementations -- check the README before use.",
  tipsAskTitle: "Not sure what to ask?",
  tipsAskDesc: "The chat knows its own currently available tools best -- just ask it directly.",
  tipsAskQuestion: "What can I usefully ask you?",
  tipsAskButton: "Ask now in chat",
  tipsModelTitle: "Model recommendation",
  tipsModelDesc: "DeepSeek v4 Flash has been the most reliable in practice -- it used the available tools most sensibly and delivered fitting answers. Configurable under Settings -> LLM configuration.",
  tipsOpenRouterDesc:
    "If you want to try models from several vendors without signing up for each one separately, give " +
    "OpenRouter a go: one API key, one balance, access to models from OpenAI, Anthropic, Google, DeepSeek, " +
    "Meta, and many more. In GlucoSphere, go to Settings -> LLM configuration, pick the provider " +
    "\"OpenAI API / OpenRouter\", set the API base URL to https://openrouter.ai/api/v1, and choose a model " +
    "-- or use \"Manual entry\" to type OpenRouter's exact model ID.",
  tipsOpenRouterLink: "Open OpenRouter",
  tipsOllamaDesc:
    "The same OpenAI API interface also lets you run local models with Ollama -- your data then stays " +
    "entirely on your own machine/server, with no cloud provider involved. Install Ollama, pull a model " +
    "(e.g. \"ollama pull llama3.1\"), then in the LLM configuration pick the provider \"OpenAI API / " +
    "OpenRouter\", set the API base URL to http://<host>:11434/v1, and enter the model ID via \"Manual " +
    "entry\". Note: smaller local models often support tool calling only partially -- that is usually the " +
    "reason if data queries don't work reliably.",
  tipsOllamaLink: "Open Ollama",
  settingsAbout: "About GlucoSphere",
  settingsAboutSubtitle: "Version, copyright, disclaimer",
  settingsLanguage: "Language",
  appearanceSectionTitle: "Appearance",
  colorThemeLabel: (theme) =>
    (
      {
        MEDICAL_BLUE: "Medical Blue",
        EMERALD_GREEN: "Emerald Green",
        SUNSET_ORANGE: "Sunset Orange",
        CYBER_PURPLE: "Cyber Purple",
        OCEAN_TEAL: "Ocean Teal",
        HIGH_CONTRAST_DARK: "High Contrast / AMOLED Dark",
      } as Record<string, string>
    )[theme] ?? theme,
  settingsNoApiKey: "No API key set",
  settingsProviderActive: (provider) => `${provider} active`,
  settingsNightscoutConfigured: "Nightscout configured",
  settingsNightscoutDisabled: "Nightscout configured, disabled",
  settingsNoDataSource: "No data source configured",

  settingsMcpServer: "MCP Server & API",
  settingsMcpServerSubtitle: "Connect external AI clients via bearer token",
  mcpServerPageTitle: "MCP Server & API",
  mcpServerTokenSectionTitle: "Bearer token",
  mcpServerTokenHint: "Secures the MCP endpoint (/api/mcp) that lets external clients (e.g. Claude Desktop, Open WebUI) access GlucoSphere data. Every request to /api/mcp is rejected without a valid token.",
  mcpServerTokenNotGenerated: "No token generated yet.",
  mcpServerGenerateToken: "Generate token",
  mcpServerRegenerateToken: "Regenerate token",
  mcpServerRegenerateWarning: "A new token immediately invalidates the old one -- already-connected clients will need to be reconfigured. Continue?",
  mcpServerCopyToken: "Copy token",
  mcpServerEndpointLabel: "MCP endpoint",
  mcpServerToolsSectionTitle: "Available tools",
  mcpServerToolsHint: "These 9 tools are available to any client that authenticates with the bearer token above -- independent of the chat tools configured under \"Data sources\".",
  mcpServerConfigSectionTitle: "Client configuration",
  mcpServerConfigHint: "Ready-to-paste configuration for the respective MCP client.",
  mcpServerConfigClaudeDesktopTitle: "Claude Desktop (claude_desktop_config.json)",
  mcpServerConfigOpenWebUiTitle: "Open WebUI / generic SSE",
  mcpServerConfigNoTokenHint: "Generate a token first to get a ready-to-use configuration.",
  mcpServerHealthSectionTitle: "Connected data sources",
  mcpServerHealthHint: "Health check for the data sources the tools above actually query -- green = online, yellow = reachable before but not now, red = never reachable.",

  roleDiabetiker: "Diabetic",
  roleFachpersonal: "Medical professional",
  roleAngehoerige: "Family member",
  roleDiabetikerDesc: "Personal, empathetic, practical -- everyday tips, blood glucose management, carb estimates.",
  roleFachpersonalDesc: "Clinically neutral, precise -- TIR, %CV, AGP profiles, insulin dosing, guideline compliance.",
  roleAngehoerigeDesc: "Empathetic, reassuring, accessible -- recognizing emergency signs, clear action guidance.",

  llmConfigTitle: "LLM configuration",
  llmConfigProviderSection: "AI provider",
  llmConfigApiKeyLabel: "API key",
  llmConfigApiKeyPlaceholder: "Enter API key",
  llmConfigBaseUrlLabel: "API base URL",
  llmConfigBaseUrlHint: "For a compatible endpoint instead of the default provider -- e.g. OpenRouter (https://openrouter.ai/api/v1) or a local Ollama (http://localhost:11434/v1). Leave blank for the default.",
  llmConfigBaseUrlReset: "Reset to default",
  llmConfigModelLabel: "Model",
  llmConfigModelAuto: "Automatic (recommended)",
  llmConfigModelCustom: "Manual entry …",
  llmConfigModelCustomLabel: "Model ID",
  llmConfigModelCustomPlaceholder: "e.g. gemini-3.6-flash",
  llmConfigModelCustomHint:
    "Enter the provider's exact model ID (case-sensitive) -- e.g. for a new model not listed here " +
    "yet, or your own model via OpenRouter/Ollama. Testing really calls the model, which verifies " +
    "that it exists and is usable.",
  llmConfigModelRequired: "Please enter a model ID.",
  llmConfigModelVerified: (model) => `Model verified: ${model}`,
  llmConfigNotTested: "Not tested yet -- test before saving.",
  llmConfigRefreshModels: "Refresh models",
  llmConfigRefreshing: "Fetching models …",
  llmConfigRefreshHint:
    "Fetches the currently available models straight from the provider (using the stored API key) and takes " +
    "the 4 most relevant ones into the picker -- so the list follows new releases without a new GlucoSphere-Web " +
    "version. The selection is a heuristic (chat models, newest versions, fast + flagship); anything else stays " +
    "reachable via \"Manual entry\".",
  llmConfigModelsLive: (date) => `Fetched live on ${date}`,
  llmConfigModelsBuiltin: "Built-in selection (not refreshed yet)",
  llmConfigResetModels: "Reset to built-in list",
  llmConfigRefreshFailed: (detail) => `Refresh failed: ${detail}`,

  dataSourcesTitle: "Data sources",
  dataSourcesNightscoutTitle: "Nightscout REST API",
  dataSourcesNightscoutHint: "Direct access without an MCP server. Token/API secret are optional (only needed for private instances).",
  dataSourcesFeelfitTitle: "FeelFit smart scale",
  dataSourcesFeelfitHint: "Direct access to body composition measurements (weight, body fat, muscle mass, and more) without a separate MCP server -- just enter your FeelFit account credentials.",
  dataSourcesFeelfitEmail: "FeelFit email",
  dataSourcesFeelfitPassword: "FeelFit password",
  dataSourcesGoogleHealthTitle: "Google Health",
  dataSourcesGoogleHealthHint: "Blood glucose readings (e.g. from a CGM/meter synced with Google Health) directly via Google's official Health API. Requires your own OAuth2 app registered in the Google Cloud Console, using the redirect URI shown below.",
  dataSourcesGoogleHealthClientId: "Google client ID",
  dataSourcesGoogleHealthClientSecret: "Google client secret",
  dataSourcesGoogleHealthLogin: "Log in with Google",
  dataSourcesGoogleHealthLoginAgain: "Log in again",
  dataSourcesGoogleHealthLoggedIn: "Logged in",
  dataSourcesGoogleHealthNotLoggedIn: "Not logged in",
  dataSourcesWithingsTitle: "Withings",
  dataSourcesWithingsHint: "Weight, body-fat percentage (last 3 months, incl. trend direction), and -- with a connected Withings smartwatch -- daily activity (steps, calories, heart rate), sleep summaries, and individual workouts, directly via the official Withings REST API. Requires your own OAuth2 app registered in the Withings Developer Portal, using the redirect URI shown below. If you already logged in before, please log in again once so the extra activity/sleep permissions get picked up.",
  dataSourcesWithingsClientId: "Withings client ID",
  dataSourcesWithingsClientSecret: "Withings client secret",
  dataSourcesWithingsLogin: "Log in with Withings",
  dataSourcesWithingsLoginAgain: "Log in again",
  dataSourcesWithingsLoggedIn: "Logged in",
  dataSourcesWithingsNotLoggedIn: "Not logged in",
  dsGraphSourceLabel: "Source for the overview graph",
  dsGraphSourceHint: "This source provides the current value and the 24h curve at the top of the Overview. Only one source at a time; with none selected, all realtime sources are combined.",
  dsGraphSourceDelayedHint: "This source provides the current value and the 24h curve at the top of the Overview. Note: Glooko is delayed -- its readings come from the pump/app sync and can be hours old. The displayed timestamp always states how old the value really is; it is fetched at most every 5 minutes.",
  dataSourcesDexcomTitle: "Dexcom",
  dataSourcesDexcomHint: "Direct access to current CGM readings via the Dexcom Share API (the same cloud API used by the Dexcom Follow app) -- only returns up to the last 24 hours, no older history. Enter the Dexcom account's own credentials (not a follower account).",
  dataSourcesDexcomUsername: "Dexcom username",
  dataSourcesDexcomPassword: "Dexcom password",
  dataSourcesGlookoTitle: "Glooko",
  dataSourcesGlookoHint: "General insulin pump data (bolus doses, daily basal/bolus totals) via Glooko -- vendor-agnostic, works regardless of the specific pump model. Enter the Glooko account's credentials.",
  dataSourcesGlookoUsername: "Glooko username/email",
  dataSourcesGlookoPassword: "Glooko password",
  dataSourcesDexcomRegion: "Region",
  dataSourcesDexcomRegionUs: "United States",
  dataSourcesDexcomRegionOus: "Outside the US",
  dataSourcesLibreTitle: "LibreLinkUp",
  dataSourcesLibreHint: "Direct access to current CGM readings via LibreLinkUp -- only returns roughly the last 12 hours. Requires a LibreLinkUp account (not the LibreLink account) connected as a follower to the Libre account.",
  dataSourcesLibreEmail: "LibreLinkUp email",
  dataSourcesLibrePassword: "LibreLinkUp password",
  dataSourcesUrl: "Nightscout URL",
  dataSourcesAuthType: "Auth type",
  dataSourcesAuthNone: "None",
  dataSourcesAuthApiSecret: "API secret header",
  dataSourcesAuthBearer: "Bearer token",
  dataSourcesToken: "Token / secret",
  dataSourcesEnabled: "Data source enabled",
  dsDisplayNameLabel: "Display name",
  dsDisplayNameHint: "Custom name for this source -- used in chat source citations, the dashboard, and source selection.",
  dataSourcesCategoryLabel: "Category",
  dataSourcesTestConnection: "Test connection",
  dataSourcesMcpTitle: (count) => `MCP servers (${count})`,
  dataSourcesMcpHint: "Enabled servers are automatically offered to the chat as tools -- the AI calls them itself when a question fits. Supports the current MCP spec (Streamable HTTP), the older SSE transport, and OpenAPI proxies like mcpo.",
  dataSourcesAddServer: "+ Add MCP server",
  dataSourcesShowTools: "Show tools",
  dataSourcesHideTools: "Hide tools",
  dataSourcesNoTools: "No tools found.",
  dataSourcesExploring: "Discovering tools …",
  dataSourcesActive: "Active",
  dataSourcesInactive: "Inactive",
  categoryGlucose: "Diabetes / glucose",
  categoryActivity: "Sport / activity / sleep",
  categoryBodyMetrics: "Body composition",
  categoryOther: "Other",

  mcpEditorAddTitle: "Add MCP server",
  mcpEditorEditTitle: "Edit server",
  mcpEditorName: "Name",
  mcpEditorNamePlaceholder: "e.g. Google Fit",
  mcpEditorUrl: "URL",
  mcpEditorTransport: "Transport",
  mcpEditorCategory: "Data category",
  mcpEditorIsRealtime: "Realtime source (e.g. Nightscout) -- preferred over other sources on the Overview that can lag behind (e.g. Glooko).",
  mcpEditorAuthType: "Auth type",
  mcpEditorToken: "Token / secret",
  mcpEditorOAuthRedirectUriLabel: "Redirect URI (register with the provider)",
  mcpEditorOAuthRedirectUriHint: "Register this exact URL with the OAuth2 provider (e.g. the Withings developer portal) as an allowed redirect/callback URI -- do this before entering the client ID/secret below.",
  genericCopy: "Copy",
  genericCopied: "Copied!",
  mcpEditorWithingsPreset: "Insert Withings preset",
  mcpEditorWithingsPresetHint: "Fills in the official Withings endpoints (from withings-sas/api-oauth2-python) -- just add the client ID/secret from your own app registered at account.withings.com/partner/add_oauth2.",
  mcpEditorOAuthClientId: "Client ID",
  mcpEditorOAuthClientSecret: "Client secret",
  mcpEditorOAuthAuthEndpoint: "Authorization endpoint",
  mcpEditorOAuthTokenEndpoint: "Token endpoint",
  mcpEditorOAuthScope: "Scope",
  mcpEditorOAuthScopeOptional: "Scope (optional)",
  mcpEditorOAuthTokenActionOptional: "Token action (optional)",
  mcpEditorOAuthTokenActionHint: "Only needed for providers whose token endpoint expects an extra \"action\" parameter (e.g. Withings: \"requesttoken\") -- leave blank for standard OAuth2.",
  mcpEditorOAuthMissingFields: "Client ID, authorization endpoint, and token endpoint must be filled in before login can start.",
  mcpEditorOAuthLogin: "Log in with provider",
  mcpEditorOAuthLoginAgain: "Log in again",
  mcpEditorOAuthLoggedIn: "Logged in",
  mcpEditorOAuthNotLoggedIn: "Not logged in",
  authOAuth2: "OAuth2",
  transportStreamable: "Streamable HTTP (current MCP standard)",
  transportSse: "SSE (older MCP standard)",
  transportOpenapi: "OpenAPI proxy (e.g. mcpo)",

  profileTitle: "Patient profile",
  profileNameSection: "Personal details",
  profileFirstName: "First name",
  profileFirstNamePlaceholder: "e.g. Andrew",
  profileLastName: "Last name",
  profileLastNamePlaceholder: "e.g. Sample",
  profileBirthDateLabel: "Date of birth",
  profileDiabetesSinceLabel: "Diabetic since (year)",
  profileDiabetesSincePlaceholder: "e.g. 2015",
  profileSaveName: "Save",
  profileGlucoseUnitLabel: "Glucose unit",
  profileInsulinPumpLabel: "Insulin pump",
  profileCgmSystemLabel: "CGM system",
  profileAidSystemLabel: "AID system / pump",
  profileAidCommercialGroup: "Commercial systems",
  profileAidDiyGroup: "DIY AID systems",
  profileDeviceHint: "Taken into account in chat replies and reports, instead of falling back on outdated general assumptions.",
  profileDeviceNone: "None",
  profileDeviceOther: "Other",
  profileRoleSection: "User type",
  profileRoleHint: "Determines the tone and focus of AI answers in Chat and the Overview.",
  profileLinkedMainUserLabel: "Linked main user",
  profileLinkedMainUserNone: "-- please select --",
  profileLinkedMainUserHint: "This main user's data sources, pump, and CGM are used for the chat -- replies will refer to that person in the third person, not to you.",
  profileReadOnlyHint: (patientName: string) =>
    `This is ${patientName}'s clinical profile. It is maintained by ${patientName} themselves (or an administrator under User management) and can only be viewed here.`,
  profileNotLinkedHint: "No main patient is linked yet. Ask an administrator to set this up under User management.",

  reportPatientHeader: (f) => `Patient: ${f.name} | DOB: ${f.birthDate} | Diabetic since: ${f.diabetesSince} | Sensor: ${f.cgm} | AID system: ${f.aid} | Unit: ${f.unit}`,

  accountTitle: "Account",
  accountLoggedInAs: (username) => `Logged in as ${username}`,
  accountLogout: "Log out",
  accountChangePassword: "Change password",
  accountCurrentPassword: "Current password",
  accountNewPassword: "New password (min. 8 characters)",
  accountNewPasswordRepeat: "Repeat new password",
  accountPasswordMismatch: "The new passwords don't match.",
  accountPasswordChanged: "Password changed.",

  backupTitle: "Backup & configuration",
  backupExportSection: "Export settings",
  backupExportHint: "Exports API keys, the selected LLM, the system prompt, and the MCP server configuration as a file. Chat history is NOT included.",
  backupEncryptOptional: "Encrypt with a password? (optional)",
  backupEncryptPlaceholder: "Leave blank for unencrypted",
  backupExport: "Export",
  backupExporting: "Exporting …",
  backupExportSuccess: "Backup downloaded.",
  backupImportSection: "Import settings",
  backupImportHint: "Overwrites the settings above with the content of the selected backup file.",
  backupEncryptedHint: "This file is encrypted -- enter the password",
  backupDecryptImport: "Decrypt & import",
  backupDecrypting: "Decrypting …",
  backupImportSuccess: "Import successful -- settings have been updated.",
  backupInvalidFile: (detail) => `Invalid backup file: ${detail}`,

  perfLogTitle: "Performance log",
  perfLogHint: "Logs every cloud LLM request (Chat and Overview) with provider, model, token usage, duration, and -- on failure -- the exact error message. The last 200 entries, newest first.",
  perfLogCopy: "Copy as text",
  perfLogClear: "Clear log",
  perfLogEmpty: "No entries yet.",
  perfLogTokens: (prompt, completion) => `${prompt}+${completion} tokens`,
  perfLogOk: "OK",

  loggingTitle: "Logging",
  loggingHint: "All logs in one place: technical request details, token usage with a cost estimate, and how the app is being used.",

  tokenUsageTitle: "Tokens & costs",
  tokenUsageHint:
    "Cumulative token usage per provider and model, across all Chat and Overview requests. Runs independently " +
    "of the performance log (which only keeps the last 200 requests) and is only emptied by \"Reset usage\".",
  tokenUsagePriceHint:
    "Prices vary by provider, plan and region -- which is why none are hard-coded here. Enter each model's price " +
    "per 1M tokens (see your provider's price list); without a price only the tokens are counted.",
  tokenUsageEmpty: "No usage recorded yet.",
  tokenUsageColModel: "Provider / model",
  tokenUsageColCalls: "Requests",
  tokenUsageColPrompt: "Input tokens",
  tokenUsageColCompletion: "Output tokens",
  tokenUsageColCost: "Cost (estimated)",
  tokenUsageTotal: "Total",
  tokenUsageCurrencyLabel: "Currency",
  tokenUsageInputPrice: "Input per 1M tokens",
  tokenUsageOutputPrice: "Output per 1M tokens",
  tokenUsageEditPrices: "Prices",
  tokenUsageNoPrice: "no price set",
  tokenUsageSince: (date) => `recorded since ${date}`,
  tokenUsageReset: "Reset usage",
  tokenUsageResetConfirm: "Really reset all token counters? The configured prices are kept.",
  tokenUsageFetchPrices: "Fetch prices",
  tokenUsageFetching: "Fetching prices …",
  tokenUsageFetchHint:
    "Pulls prices from OpenRouter's public model list (openrouter.ai/api/v1/models, no API key needed) -- it " +
    "also carries the prices of the Anthropic, OpenAI, Google and DeepSeek models offered through OpenRouter. " +
    "The providers' own endpoints serve NO prices, only model IDs. All values in USD.",
  tokenUsageOverwriteLabel: "Also overwrite prices that are already set",
  tokenUsageFetchResult: (updated, skipped, unmatched) =>
    `${updated} price(s) applied, ${skipped} left unchanged, ${unmatched} without a match.`,
  tokenUsageFetchUnmatched: (models) => `No price found for: ${models}`,

  usageLogTitle: "Usage & access",
  usageLogHint:
    "Records who logged in and out when, which questions were asked, which tools (tool calls) ran and which " +
    "overviews were generated. The last 5000 entries, newest first.",
  usageLogEmpty: "No entries yet.",
  usageLogNoMatch: "No entries match this filter.",
  usageLogFilterUser: "User",
  usageLogFilterEvent: "Event",
  usageLogSearch: "Search",
  usageLogSearchPlaceholder: "e.g. tool name, question, path …",
  usageLogAll: "All",
  usageLogClear: "Clear log",
  usageLogClearConfirm: "Really delete the entire usage log?",
  usageLogAccessToggle: "Log API access (access log)",
  usageLogAccessHint:
    "Additionally record every single API request with method, path, status and duration -- including rejected " +
    "ones (401/403). Produces a lot of entries, so it is off by default.",
  usageLogEventLabel: (event) =>
    ({
      LOGIN: "Login",
      LOGIN_FAILED: "Failed login",
      LOGOUT: "Logout",
      CHAT: "Question",
      TOOL: "Tool call",
      DASHBOARD: "Overview",
      ACCESS: "API access",
    })[event] ?? event,
  usageLogCount: (shown, total) => `${shown} of ${total} entries`,

  usersTitle: "User management",
  usersAddTitle: "Add user",
  usersUsername: "Username",
  usersUsernamePlaceholder: "e.g. lisa",
  usersPassword: "Password (min. 8 characters)",
  usersDisplayName: "Name (for personal address)",
  usersRole: "Role",
  usersRoleAdmin: "Administrator (full access)",
  usersRoleMember: "Member (Chat & Overview, no settings)",
  usersAdd: "Add",
  usersResetPassword: "Reset password",
  usersNewPassword: "New password",
  usersDeleteConfirm: "Really delete this user? Their chat history will be lost.",
  usersCannotDeleteSelf: "You can't delete your own account here -- use Account instead.",
  usersCannotDemoteSelf: "You can't remove your own admin role.",
  usersYouIndicator: "(you)",
  usersUserTypeLabel: "User type",

  spTitle: "System Prompt",
  spBaseSection: "Base prompt",
  spBaseHint: "Defines the AI's role, tone, and behavior rules. Sent with every Chat and Overview request.",
  spUseDefault: "Use default",
  spUseCustom: "Use custom prompt",
  spDefaultLabel: "Default prompt (reference, not editable)",
  spResetToDefault: "Reset to default",
  spAdditionalSection: "Additional instructions",
  spAdditionalHint: "Appended to the base prompt -- e.g. \"Always answer in bullet points.\"",
  spAdditionalPlaceholder: "e.g. \"Mention my doctor's appointment on Friday in every answer.\"",

  aboutVersion: "GlucoSphere-Web",
  aboutCopyright: "© 2026 GlucoSphere. All rights reserved.",
  aboutDisclaimerTitle: "Medical disclaimer",
  aboutDisclaimerText:
    "GlucoSphere is not a medical device and does not replace medical advice or treatment decisions. " +
    "All displayed values, analyses, and AI-generated notes are for personal information and everyday " +
    "support only -- including for family members and diabetes-care-team members with a Member account. " +
    "AI models can hallucinate and invent values or relationships that don't exist in the real source " +
    "data. Every value and trend shown here must be cross-checked against the original data from the " +
    "source services (e.g. Nightscout/Glooko) and discussed with your diabetes team before any " +
    "therapeutic action -- never rely solely on this app for treatment decisions (e.g. insulin dosing).",
  aboutPrivacyTitle: "Privacy notice",
  aboutPrivacyText:
    "GlucoSphere-Web stores settings, credentials, and chat history exclusively on the self-hosted server " +
    "(SQLite, Docker volume) -- there is no external GlucoSphere server. When using a cloud AI provider " +
    "(Google, Anthropic, OpenAI/OpenRouter, DeepSeek), requests -- including any retrieved health data -- " +
    "are sent directly to that provider and subject to its own privacy policy. Each user account has its " +
    "own chat history, separate from other accounts; Administrator accounts still see the shared data " +
    "source configuration.",
  aboutLicensesTitle: "Open-source libraries used",
  aboutLicensesHint: "GlucoSphere-Web is built on the following open-source projects -- thanks to their authors.",
  aboutRepo: "Source code on GitHub",
  aboutVersionLabel: "Version",
  aboutBuildLabel: "Build",
  aboutBuildDateLabel: "Build date",
  aboutBuildUnknownHint:
    "Build id not set -- this build was made without a build stamp (deploy.sh sets it automatically).",
};

export const STRINGS: Record<"DE" | "EN", Strings> = { DE: de, EN: en };
