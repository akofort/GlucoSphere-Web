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
