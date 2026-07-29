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
  overviewSummaryTitle: string;
  overviewReadAloud: string;
  overviewSourcesLabel: string;
  overviewExcluded: string;
  overviewLastUpdated: (time: string) => string;
  overviewNarrativeFailed: string;
  chatFailed: string;

  chatPlaceholder: string;
  chatSend: string;
  chatEmptyState: string;
  chatComposing: string;
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
  settingsPerformanceLog: string;
  settingsPerformanceLogSubtitle: string;
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
  settingsLanguage: string;
  settingsNoApiKey: string;
  settingsProviderActive: (provider: string) => string;
  settingsNightscoutConfigured: string;
  settingsNightscoutDisabled: string;
  settingsNoDataSource: string;

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
  llmConfigNotTested: string;

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
  profileSaveName: string;
  profileGlucoseUnitLabel: string;
  profileInsulinPumpLabel: string;
  profileCgmSystemLabel: string;
  profileDeviceHint: string;
  profileDeviceNone: string;
  profileDeviceOther: string;
  profileRoleSection: string;
  profileRoleHint: string;

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
  aboutBuildLabel: string;
  aboutBuildDateLabel: string;
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
  overviewSummaryTitle: "Zusammenfassung",
  overviewReadAloud: "Vorlesen",
  overviewSourcesLabel: "Datenquellen",
  overviewExcluded: "Für diese Ansicht deaktiviert -- oben wieder auswählen.",
  overviewLastUpdated: (time) => `Letzter Stand: ${time}`,
  overviewNarrativeFailed: "KI-Zusammenfassung nicht verfügbar (Anbieter-Fehler) -- Kennzahlen oben sind trotzdem aktuell.",
  chatFailed: "Fehlgeschlagen",

  chatPlaceholder: "Nachricht eingeben …",
  chatSend: "Senden",
  chatEmptyState: 'Frage stellen, z. B. "Wie ist mein Wert gerade?"',
  chatComposing: "✍️ Formuliere Antwort …",
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
  settingsProfile: "Profil / Benutzer",
  settingsLlmConfig: "LLM-Konfiguration",
  settingsDataSources: "Datenquellen",
  settingsBackup: "Backup & Konfiguration",
  settingsBackupSubtitle: "Einstellungen exportieren/importieren",
  settingsPerformanceLog: "Performance-Log",
  settingsPerformanceLogSubtitle: "Anfragen: Anbieter, Modell, Tokens, Dauer",
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
  settingsAbout: "Über GlucoSphere",
  settingsAboutSubtitle: "Version, Copyright, Haftungsausschluss",
  settingsLanguage: "Sprache",
  settingsNoApiKey: "Kein API-Key hinterlegt",
  settingsProviderActive: (provider) => `${provider} aktiv`,
  settingsNightscoutConfigured: "Nightscout konfiguriert",
  settingsNightscoutDisabled: "Nightscout konfiguriert, deaktiviert",
  settingsNoDataSource: "Keine Datenquelle konfiguriert",

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
  llmConfigNotTested: "Noch nicht getestet – zum Speichern erst testen.",

  dataSourcesTitle: "Datenquellen",
  dataSourcesNightscoutTitle: "Nightscout REST-API",
  dataSourcesNightscoutHint: "Direkter Zugriff ohne MCP-Server. Token/API-Secret sind optional (nur für private Instanzen nötig).",
  dataSourcesFeelfitTitle: "FeelFit-Körperwaage",
  dataSourcesFeelfitHint: "Direkter Zugriff auf Körperzusammensetzungs-Messungen (Gewicht, Körperfett, Muskelmasse u. a.) ohne eigenen MCP-Server -- einfach die Zugangsdaten des FeelFit-Kontos eintragen.",
  dataSourcesFeelfitEmail: "FeelFit-Email",
  dataSourcesFeelfitPassword: "FeelFit-Passwort",
  dataSourcesGoogleHealthTitle: "Google Health API",
  dataSourcesGoogleHealthHint: "Blutzucker-Messungen (z. B. von einem mit Google Health synchronisierten CGM/Messgerät) direkt über Googles offizielle Health-API. Erfordert eine selbst registrierte OAuth2-App in der Google Cloud Console mit der unten gezeigten Redirect-URI.",
  dataSourcesGoogleHealthClientId: "Google-Client-ID",
  dataSourcesGoogleHealthClientSecret: "Google-Client-Secret",
  dataSourcesGoogleHealthLogin: "Login mit Google",
  dataSourcesGoogleHealthLoginAgain: "Erneut anmelden",
  dataSourcesGoogleHealthLoggedIn: "Angemeldet",
  dataSourcesGoogleHealthNotLoggedIn: "Nicht angemeldet",
  dataSourcesDexcomTitle: "Dexcom Share",
  dataSourcesDexcomHint: "Direkter Zugriff auf aktuelle CGM-Werte über die Dexcom-Share-API (dieselbe Cloud-API wie die Dexcom-Follow-App) -- liefert nur die letzten bis zu 24 Stunden, keine ältere Historie. Zugangsdaten des Dexcom-Kontos eintragen (nicht das Follower-Konto).",
  dataSourcesDexcomUsername: "Dexcom-Benutzername",
  dataSourcesDexcomPassword: "Dexcom-Passwort",
  dataSourcesGlookoTitle: "Insulinpumpe (Glooko)",
  dataSourcesGlookoHint: "Allgemeine Insulinpumpen-Daten (Bolusgaben, tägliche Basal-/Bolus-Summen) über Glooko -- herstellerunabhängig, funktioniert unabhängig vom konkreten Pumpenmodell. Zugangsdaten des Glooko-Kontos eintragen.",
  dataSourcesGlookoUsername: "Glooko-Benutzername/E-Mail",
  dataSourcesGlookoPassword: "Glooko-Passwort",
  dataSourcesDexcomRegion: "Region",
  dataSourcesDexcomRegionUs: "USA",
  dataSourcesDexcomRegionOus: "Außerhalb der USA",
  dataSourcesLibreTitle: "LibreLinkUp (FreeStyle Libre)",
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

  profileTitle: "Profil / Benutzer",
  profileNameSection: "Dein Name",
  profileFirstName: "Vorname",
  profileFirstNamePlaceholder: "z. B. Andreas",
  profileSaveName: "Namen speichern",
  profileGlucoseUnitLabel: "Blutzucker-Einheit",
  profileInsulinPumpLabel: "Insulinpumpe",
  profileCgmSystemLabel: "CGM-System",
  profileDeviceHint: "Wird in Chat-Antworten und Berichten berücksichtigt, statt auf veraltete allgemeine Annahmen zurückzugreifen.",
  profileDeviceNone: "Keine/keins",
  profileDeviceOther: "Andere/Sonstige",
  profileRoleSection: "Benutzertyp",
  profileRoleHint: "Bestimmt Tonalität und fachlichen Fokus der KI-Antworten im Chat und in der Übersicht.",

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
    "GlucoSphere ist kein Medizinprodukt und ersetzt keine ärztliche Diagnose, Beratung oder Behandlung. " +
    "Alle angezeigten Werte, Analysen und KI-generierten Hinweise dienen ausschließlich der persönlichen " +
    "Information und Unterstützung im Alltag -- auch für Familienangehörige und Diabetes-Team-Mitglieder, " +
    "die als Mitglied-Konto Zugriff haben. Verlasse dich bei Therapieentscheidungen (z. B. Insulindosierung) " +
    "niemals allein auf diese App -- sprich Auffälligkeiten und Warnwerte immer mit dem behandelnden " +
    "Diabetologen bzw. Diabetesberater ab.",
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
  aboutBuildLabel: "Build",
  aboutBuildDateLabel: "Build-Datum",
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
  overviewSummaryTitle: "Summary",
  overviewReadAloud: "Read aloud",
  overviewSourcesLabel: "Data sources",
  overviewExcluded: "Disabled for this view -- select it again above.",
  overviewLastUpdated: (time) => `Last updated: ${time}`,
  overviewNarrativeFailed: "AI summary unavailable (provider error) -- the metrics above are still current.",
  chatFailed: "Failed",

  chatPlaceholder: "Type a message …",
  chatSend: "Send",
  chatEmptyState: 'Ask a question, e.g. "How is my level right now?"',
  chatComposing: "✍️ Composing answer …",
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
  settingsProfile: "Profile / User",
  settingsLlmConfig: "LLM configuration",
  settingsDataSources: "Data sources",
  settingsBackup: "Backup & configuration",
  settingsBackupSubtitle: "Export/import settings",
  settingsPerformanceLog: "Performance log",
  settingsPerformanceLogSubtitle: "Requests: provider, model, tokens, duration",
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
  settingsAbout: "About GlucoSphere",
  settingsAboutSubtitle: "Version, copyright, disclaimer",
  settingsLanguage: "Language",
  settingsNoApiKey: "No API key set",
  settingsProviderActive: (provider) => `${provider} active`,
  settingsNightscoutConfigured: "Nightscout configured",
  settingsNightscoutDisabled: "Nightscout configured, disabled",
  settingsNoDataSource: "No data source configured",

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
  llmConfigNotTested: "Not tested yet -- test before saving.",

  dataSourcesTitle: "Data sources",
  dataSourcesNightscoutTitle: "Nightscout REST API",
  dataSourcesNightscoutHint: "Direct access without an MCP server. Token/API secret are optional (only needed for private instances).",
  dataSourcesFeelfitTitle: "FeelFit smart scale",
  dataSourcesFeelfitHint: "Direct access to body composition measurements (weight, body fat, muscle mass, and more) without a separate MCP server -- just enter your FeelFit account credentials.",
  dataSourcesFeelfitEmail: "FeelFit email",
  dataSourcesFeelfitPassword: "FeelFit password",
  dataSourcesGoogleHealthTitle: "Google Health API",
  dataSourcesGoogleHealthHint: "Blood glucose readings (e.g. from a CGM/meter synced with Google Health) directly via Google's official Health API. Requires your own OAuth2 app registered in the Google Cloud Console, using the redirect URI shown below.",
  dataSourcesGoogleHealthClientId: "Google client ID",
  dataSourcesGoogleHealthClientSecret: "Google client secret",
  dataSourcesGoogleHealthLogin: "Log in with Google",
  dataSourcesGoogleHealthLoginAgain: "Log in again",
  dataSourcesGoogleHealthLoggedIn: "Logged in",
  dataSourcesGoogleHealthNotLoggedIn: "Not logged in",
  dataSourcesDexcomTitle: "Dexcom Share",
  dataSourcesDexcomHint: "Direct access to current CGM readings via the Dexcom Share API (the same cloud API used by the Dexcom Follow app) -- only returns up to the last 24 hours, no older history. Enter the Dexcom account's own credentials (not a follower account).",
  dataSourcesDexcomUsername: "Dexcom username",
  dataSourcesDexcomPassword: "Dexcom password",
  dataSourcesGlookoTitle: "Insulin pump (Glooko)",
  dataSourcesGlookoHint: "General insulin pump data (bolus doses, daily basal/bolus totals) via Glooko -- vendor-agnostic, works regardless of the specific pump model. Enter the Glooko account's credentials.",
  dataSourcesGlookoUsername: "Glooko username/email",
  dataSourcesGlookoPassword: "Glooko password",
  dataSourcesDexcomRegion: "Region",
  dataSourcesDexcomRegionUs: "United States",
  dataSourcesDexcomRegionOus: "Outside the US",
  dataSourcesLibreTitle: "LibreLinkUp (FreeStyle Libre)",
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

  profileTitle: "Profile / User",
  profileNameSection: "Your name",
  profileFirstName: "First name",
  profileFirstNamePlaceholder: "e.g. Andrew",
  profileSaveName: "Save name",
  profileGlucoseUnitLabel: "Glucose unit",
  profileInsulinPumpLabel: "Insulin pump",
  profileCgmSystemLabel: "CGM system",
  profileDeviceHint: "Taken into account in chat replies and reports, instead of falling back on outdated general assumptions.",
  profileDeviceNone: "None",
  profileDeviceOther: "Other",
  profileRoleSection: "User type",
  profileRoleHint: "Determines the tone and focus of AI answers in Chat and the Overview.",

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
    "GlucoSphere is not a medical device and does not replace medical diagnosis, advice, or treatment. " +
    "All displayed values, analyses, and AI-generated notes are for personal information and everyday " +
    "support only -- including for family members and diabetes-care-team members with a Member account. " +
    "Never rely solely on this app for treatment decisions (e.g. insulin dosing) -- always discuss unusual " +
    "readings or warning values with the treating diabetes team.",
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
  aboutBuildLabel: "Build",
  aboutBuildDateLabel: "Build date",
};

export const STRINGS: Record<"DE" | "EN", Strings> = { DE: de, EN: en };
