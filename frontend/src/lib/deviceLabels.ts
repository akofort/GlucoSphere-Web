import type { Strings } from "./strings";

export const INSULIN_PUMPS = [
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

export const CGM_SYSTEMS = ["NONE", "DEXCOM_G6", "DEXCOM_G7", "LIBRE_2", "LIBRE_3", "MEDTRONIC_GUARDIAN", "EVERSENSE", "OTHER"];
const CGM_LABELS: Record<string, string> = {
  DEXCOM_G6: "Dexcom G6",
  DEXCOM_G7: "Dexcom G7",
  LIBRE_2: "FreeStyle Libre 2",
  LIBRE_3: "FreeStyle Libre 3",
  MEDTRONIC_GUARDIAN: "Medtronic Guardian",
  EVERSENSE: "Eversense",
};

export function pumpLabel(id: string, t: Pick<Strings, "profileDeviceNone" | "profileDeviceOther">): string {
  return id === "NONE" ? t.profileDeviceNone : id === "OTHER" ? t.profileDeviceOther : PUMP_LABELS[id] ?? id;
}

export function cgmLabel(id: string, t: Pick<Strings, "profileDeviceNone" | "profileDeviceOther">): string {
  return id === "NONE" ? t.profileDeviceNone : id === "OTHER" ? t.profileDeviceOther : CGM_LABELS[id] ?? id;
}

// AID-System (Automated Insulin Delivery) -- distinct from INSULIN_PUMPS above: this is "which
// closed-loop algorithm", not "which physical pump" (e.g. AndroidAPS/OpenAPS/Loop/Trio are DIY
// algorithms that can run on top of various separate pumps, not pumps themselves).
export const AID_SYSTEMS_COMMERCIAL = ["OMNIPOD_5", "YPSOPUMP_CAMAPS_FX", "CONTROL_IQ_TSLIM_X2", "MINIMED_780G", "OTHER_COMMERCIAL"];
export const AID_SYSTEMS_DIY = ["ANDROIDAPS", "OPENAPS", "LOOP_IOS", "TRIO", "OTHER_DIY"];
export const AID_SYSTEMS = ["NONE", ...AID_SYSTEMS_COMMERCIAL, ...AID_SYSTEMS_DIY];

const AID_LABELS: Record<string, string> = {
  OMNIPOD_5: "Omnipod 5",
  YPSOPUMP_CAMAPS_FX: "YpsoPump (camAPS FX)",
  CONTROL_IQ_TSLIM_X2: "Control-IQ (t:slim X2)",
  MINIMED_780G: "MiniMed 780G",
  ANDROIDAPS: "AndroidAPS",
  OPENAPS: "OpenAPS",
  LOOP_IOS: "Loop (iOS)",
  TRIO: "Trio",
};

export function aidLabel(id: string, t: Pick<Strings, "profileDeviceNone" | "profileDeviceOther">): string {
  if (id === "NONE") return t.profileDeviceNone;
  if (id === "OTHER_COMMERCIAL" || id === "OTHER_DIY") return t.profileDeviceOther;
  return AID_LABELS[id] ?? id;
}
