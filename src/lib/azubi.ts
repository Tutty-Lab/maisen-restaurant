// ============================================================================
// Azubi-Sollzeit und Migration alter Wochenstunden-Einstellungen.
// In der Schulzeit setzt der Chef das Soll je Monat; ausserhalb gilt ein
// allgemeines Monatssoll. Alte Schultage bleiben nur fuer die Migration.
// ============================================================================

import {
  AZUBI_MONTHLY_WARNING_HOURS,
  type AzubiConfig,
  type Employee,
  type WeekdayName,
} from "../types";

/** Standard aus der bisherigen Vorgabe 38,5 h/Woche mal vier Wochen. */
export const DEFAULT_AZUBI_MONTHLY_HOURS_OUT_OF_TERM = 38.5 * 4;

export const DEFAULT_AZUBI_CONFIG: AzubiConfig = {
  inSchoolTerm: true,
  schoolDays: [],
  monthlyHoursOutOfTerm: DEFAULT_AZUBI_MONTHLY_HOURS_OUT_OF_TERM,
};

export type AzubiMonthMode = "school" | "mixed" | "work";
export type AzubiTimesheetMode = "off" | "work" | "mixed";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function normalizeIsoDate(value: string | undefined): string | undefined {
  return value && ISO_DATE_PATTERN.test(value) ? value : undefined;
}

function normalizeHours(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round((value ?? fallback) * 2) / 2);
}

function normalizeMonthlyHoursByMonth(
  values: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!values) return undefined;

  const normalized = Object.entries(values)
    .filter(([key, value]) => MONTH_KEY_PATTERN.test(key) && Number.isFinite(value))
    .map(([key, value]) => [key, normalizeHours(value, 0)] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
}

function monthlyHoursMapsEqual(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
): boolean {
  const leftEntries = Object.entries(normalizeMonthlyHoursByMonth(left) ?? {});
  const rightEntries = Object.entries(normalizeMonthlyHoursByMonth(right) ?? {});
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([key, value], index) =>
        rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value,
    )
  );
}

function monthlyHoursFrom(source: AzubiConfig): number {
  if (Number.isFinite(source.monthlyHoursOutOfTerm)) {
    return normalizeHours(
      source.monthlyHoursOutOfTerm,
      DEFAULT_AZUBI_MONTHLY_HOURS_OUT_OF_TERM,
    );
  }
  if (Number.isFinite(source.weeklyHoursOutOfTerm)) {
    return normalizeHours(
      (source.weeklyHoursOutOfTerm ?? 38.5) * 4,
      DEFAULT_AZUBI_MONTHLY_HOURS_OUT_OF_TERM,
    );
  }
  return DEFAULT_AZUBI_MONTHLY_HOURS_OUT_OF_TERM;
}

type DateRange = { start: string; end: string };

function normalizeRange(start: string | undefined, end: string | undefined): DateRange | null {
  const s = normalizeIsoDate(start);
  const e = normalizeIsoDate(end);
  if (!s && !e) return null;
  const a = s ?? e!;
  const b = e ?? s!;
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** Blöcke bereinigt + sortiert; Altdaten (ein Von/Bis) werden zum ersten Block. */
function normalizeBlocks(source: AzubiConfig): DateRange[] {
  const raw = source.schoolBlocks ?? [];
  const blocks = (raw.length > 0 ? raw : [{ start: source.schoolTermStart ?? "", end: source.schoolTermEnd ?? "" }])
    .map((b) => normalizeRange(b.start, b.end))
    .filter((b): b is DateRange => b !== null)
    .sort((x, y) => x.start.localeCompare(y.start));
  return blocks;
}

function normalizedAzubiConfig(cfg: AzubiConfig | undefined): AzubiConfig {
  const source = cfg ?? DEFAULT_AZUBI_CONFIG;
  const schoolMode = source.schoolMode === "weekly" ? "weekly" : "block";
  const blocks = normalizeBlocks(source);
  // Altfelder spiegeln den Gesamtzeitraum aller Blöcke (für ältere Leser).
  const schoolTermStart = blocks[0]?.start;
  const schoolTermEnd = blocks[blocks.length - 1]?.end;
  const schoolWeekdays = [...new Set(source.schoolWeekdays ?? [])];
  const weekly = normalizeRange(source.schoolWeeklyStart, source.schoolWeeklyEnd);
  const monthlyHoursByMonth = normalizeMonthlyHoursByMonth(source.monthlyHoursByMonth);
  const workMonthHoursByMonth = normalizeMonthlyHoursByMonth(source.workMonthHoursByMonth);

  return {
    inSchoolTerm: source.inSchoolTerm,
    ...(source.schoolMode && { schoolMode }),
    ...(schoolTermStart && { schoolTermStart }),
    ...(schoolTermEnd && { schoolTermEnd }),
    ...(blocks.length > 0 && { schoolBlocks: blocks }),
    ...(schoolWeekdays.length > 0 && { schoolWeekdays }),
    ...(weekly && { schoolWeeklyStart: weekly.start, schoolWeeklyEnd: weekly.end }),
    schoolDays: [...(source.schoolDays ?? [])],
    monthlyHoursOutOfTerm: monthlyHoursFrom(source),
    ...(Number.isFinite(source.workWeeklyHours) &&
      (source.workWeeklyHours ?? 0) > 0 && { workWeeklyHours: normalizeHours(source.workWeeklyHours, 0) }),
    ...(monthlyHoursByMonth && { monthlyHoursByMonth }),
    ...(workMonthHoursByMonth && { workMonthHoursByMonth }),
  };
}

/** Neue Kopie, damit UI-Aenderungen nie die gemeinsame Vorgabe mutieren. */
export function defaultAzubiConfig(): AzubiConfig {
  return normalizedAzubiConfig(DEFAULT_AZUBI_CONFIG);
}

export function azubiConfigOf(cfg: AzubiConfig | undefined): AzubiConfig {
  return normalizedAzubiConfig(cfg);
}

/** Vom Chef gesetztes Monatssoll ausserhalb der Schulzeit. */
export function azubiMonthlyHoursOutOfTerm(cfg: AzubiConfig | undefined): number {
  return azubiConfigOf(cfg).monthlyHoursOutOfTerm ?? DEFAULT_AZUBI_MONTHLY_HOURS_OUT_OF_TERM;
}

/** Blockunterricht-Zeiträume (leer im Modus „weekly" oder ohne Schule). */
export function azubiSchoolBlocks(cfg: AzubiConfig | undefined): DateRange[] {
  const normalized = azubiConfigOf(cfg);
  if (!normalized.inSchoolTerm || normalized.schoolMode === "weekly") return [];
  return normalized.schoolBlocks ?? [];
}

/** Gesamtzeitraum aller Blöcke; null ohne konkrete Daten (Altdaten = ganzer Monat). */
export function azubiSchoolTermRange(
  cfg: AzubiConfig | undefined,
): { start: string; end: string } | null {
  const blocks = azubiSchoolBlocks(cfg);
  if (blocks.length === 0) return null;
  return { start: blocks[0].start, end: blocks[blocks.length - 1].end };
}

/** true = das Datum liegt in einem Blockunterricht-Zeitraum. */
export function isAzubiSchoolTermDate(
  cfg: AzubiConfig | undefined,
  isoDate: string,
): boolean {
  const normalized = azubiConfigOf(cfg);
  if (!normalized.inSchoolTerm || normalized.schoolMode === "weekly") return false;
  const blocks = azubiSchoolBlocks(normalized);
  // Altdaten ohne Datum: wie früher der ganze Monat (Soll von Hand).
  if (blocks.length === 0) return true;
  return blocks.some((b) => isoDate >= b.start && isoDate <= b.end);
}

const WEEKDAY_BY_JS_DAY = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

/** Teilzeitunterricht: fester Schultag an diesem Datum? */
export function isAzubiWeeklySchoolDate(
  cfg: AzubiConfig | undefined,
  isoDate: string,
): boolean {
  const normalized = azubiConfigOf(cfg);
  if (!normalized.inSchoolTerm || normalized.schoolMode !== "weekly") return false;
  const days = normalized.schoolWeekdays ?? [];
  if (days.length === 0) return false;
  if (normalized.schoolWeeklyStart && isoDate < normalized.schoolWeeklyStart) return false;
  if (normalized.schoolWeeklyEnd && isoDate > normalized.schoolWeeklyEnd) return false;
  const [y, m, d] = isoDate.split("-").map(Number);
  return days.includes(WEEKDAY_BY_JS_DAY[new Date(y, m - 1, d).getDay()]);
}

/**
 * true = der Azubi ist an diesem Tag in der Berufsschule und wird NICHT
 * eingeplant: in einem Block (mit konkretem Datum) oder an einem festen
 * Schultag. Altdaten ohne Datum blockieren keine Tage.
 */
export function isAzubiBlockedSchoolDate(
  cfg: AzubiConfig | undefined,
  isoDate: string,
): boolean {
  if (isAzubiWeeklySchoolDate(cfg, isoDate)) return true;
  return azubiSchoolBlocks(cfg).some((b) => isoDate >= b.start && isoDate <= b.end);
}

/** @deprecated Schultage blockieren keine Arbeitstage mehr. */
export function isAzubiSchoolDate(
  _cfg: AzubiConfig | undefined,
  _isoDate: string,
): boolean {
  return false;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function azubiSchoolTermDaysInMonth(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
): number {
  const totalDays = new Date(year, month, 0).getDate();
  let termDays = 0;
  for (let day = 1; day <= totalDays; day += 1) {
    if (isAzubiSchoolTermDate(cfg, isoDate(year, month, day))) termDays += 1;
  }
  return termDays;
}

/** @deprecated Name aus der ersten Zeitraum-Version. */
export const azubiSchoolDaysInMonth = azubiSchoolTermDaysInMonth;

export function azubiMonthMode(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
): AzubiMonthMode {
  const totalDays = new Date(year, month, 0).getDate();
  const termDays = azubiSchoolTermDaysInMonth(cfg, year, month);
  if (termDays === 0) return "work";
  if (termDays === totalDays) return "school";
  return "mixed";
}

/** Alle Monate, die (ganz oder teilweise) in einem Schulblock liegen. */
export function azubiTermMonths(cfg: AzubiConfig | undefined): { year: number; month: number }[] {
  const seen = new Set<string>();
  const result: { year: number; month: number }[] = [];
  for (const block of azubiSchoolBlocks(cfg)) {
    let year = Number(block.start.slice(0, 4));
    let month = Number(block.start.slice(5, 7));
    const endYear = Number(block.end.slice(0, 4));
    const endMonth = Number(block.end.slice(5, 7));
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const key = `${year}-${month}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ year, month });
      }
      month += 1;
      if (month === 13) {
        month = 1;
        year += 1;
      }
    }
  }
  return result.sort((a, b) => a.year - b.year || a.month - b.month);
}

/** Stabiler Schluessel fuer eine monatsspezifische Azubi-Vorgabe. */
export function azubiMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Manuell gesetzte Stunden eines Monats im Schulzeitraum. */
export function azubiMonthlyHoursOverride(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
): number | undefined {
  return azubiConfigOf(cfg).monthlyHoursByMonth?.[azubiMonthKey(year, month)];
}

/**
 * Arbeitstage je Woche eines Azubis: 7 Tage – 2 Ruhetage – Schultage
 * („Vừa học vừa làm"). 1. Lehrjahr mit 2 Schultagen → 3, 2. Lehrjahr mit
 * 1 Schultag → 4, ohne feste Schultage → 5.
 */
export function azubiWorkDaysPerWeek(cfg: AzubiConfig | undefined): number {
  const normalized = azubiConfigOf(cfg);
  const school =
    normalized.inSchoolTerm && normalized.schoolMode === "weekly" ? (normalized.schoolWeekdays ?? []).length : 0;
  return Math.max(1, 5 - school);
}

function isoOfDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Wochen (Mo–So), die den Monat berühren, mit verfügbaren Tagen im Monat und in
 * der ganzen Woche (verfügbar = Laden offen und kein fester Schultag).
 */
export type EmploymentPeriod = { startDate?: string; endDate?: string };

export function azubiWeekShares(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
  closedWeekdays: readonly WeekdayName[] = [],
  period: EmploymentPeriod = {},
): { monday: string; inMonth: number; full: number }[] {
  const normalized = azubiConfigOf(cfg);
  const openNoSchool = (d: Date) => {
    const weekday = WEEKDAY_BY_JS_DAY[d.getDay()];
    if (closedWeekdays.includes(weekday)) return false;
    return !isAzubiWeeklySchoolDate(normalized, isoOfDate(d));
  };
  // Vor Eintritt / nach Austritt zählt ein Tag nicht als Arbeitstag im Monat.
  const employed = (d: Date) => {
    const iso = isoOfDate(d);
    if (period.startDate && iso < period.startDate) return false;
    if (period.endDate && iso > period.endDate) return false;
    return true;
  };
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  const weeks: { monday: string; inMonth: number; full: number }[] = [];
  while (cursor <= last) {
    let full = 0;
    let inMonth = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      if (!openNoSchool(d)) continue;
      full += 1;
      if (d >= first && d <= last && employed(d)) inMonth += 1;
    }
    weeks.push({ monday: isoOfDate(cursor), inMonth, full });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

/**
 * Monatsstunden aus „Giờ làm / tuần": jede Woche zählt anteilig – verfügbare
 * Tage im Monat ÷ verfügbare Tage der ganzen Woche. Volle Wochen bekommen genau
 * die Wochenstunden. Je Woche auf halbe Stunden gerundet (wie die Wochendecken
 * im Planer), damit Monat und Wochen exakt zusammenpassen.
 */
export function azubiMonthHoursFromWeekly(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
  closedWeekdays: readonly WeekdayName[] = [],
  period: EmploymentPeriod = {},
): number {
  const weekly = azubiConfigOf(cfg).workWeeklyHours ?? 0;
  if (weekly <= 0) return 0;
  return azubiWeekShares(cfg, year, month, closedWeekdays, period).reduce(
    (sum, w) => sum + (w.full > 0 ? Math.round(((weekly * w.inMonth) / w.full) * 2) / 2 : 0),
    0,
  );
}

/** Arbeitsmonats-Soll (ohne Schulzeit): Monatswert, sonst aus Wochenstunden, sonst allgemein. */
function azubiWorkMonthHours(
  cfg: AzubiConfig,
  year: number,
  month: number,
  closedWeekdays: readonly WeekdayName[] = [],
  period: EmploymentPeriod = {},
): number {
  const override = cfg.workMonthHoursByMonth?.[azubiMonthKey(year, month)];
  if (override !== undefined) return override;
  if ((cfg.workWeeklyHours ?? 0) > 0) return azubiMonthHoursFromWeekly(cfg, year, month, closedWeekdays, period);
  return azubiMonthlyHoursOutOfTerm(cfg);
}

/**
 * Wirksames Monatssoll (Wunsch Chef, Sept 2026: in der Schulzeit wird NIE
 * gearbeitet, und die App rechnet Azubi-Stunden NICHT selbst hoch/runter):
 * - Monat ganz im Schulzeitraum: 0 h
 * - Monat teils Schule, teils Arbeit: Eingabe des Chefs für yyyy-MM (sonst 0 h –
 *   die Bereitschaftsprüfung verlangt dann eine Eingabe)
 * - Arbeitsmonat: Eingabe für yyyy-MM, sonst allgemeines Monatssoll
 */
export function azubiMonthlyHoursForMonth(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
  closedWeekdays: readonly WeekdayName[] = [],
  period: EmploymentPeriod = {},
): number {
  const normalized = azubiConfigOf(cfg);
  const mode = azubiMonthMode(normalized, year, month);
  if (mode === "school") {
    // Mit Zeitraum: Schule den ganzen Monat => 0 h. Altdaten ohne Datum: Eingabe.
    return azubiSchoolTermRange(normalized)
      ? 0
      : normalized.monthlyHoursByMonth?.[azubiMonthKey(year, month)] ?? 0;
  }
  if (mode === "mixed") {
    return normalized.monthlyHoursByMonth?.[azubiMonthKey(year, month)] ?? 0;
  }
  return azubiWorkMonthHours(normalized, year, month, closedWeekdays, period);
}

/** Status shown on the printed/exported timesheet for the selected month. */
export function azubiTimesheetMode(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
): AzubiTimesheetMode {
  if (azubiMonthlyHoursForMonth(cfg, year, month) === 0) return "off";
  return azubiMonthMode(cfg, year, month) === "work" ? "work" : "mixed";
}

/** Mehr als 174 h werden nur markiert, nie gekappt oder deaktiviert. */
export function azubiMonthlyHoursNeedWarning(
  cfg: AzubiConfig | undefined,
  year?: number,
  month?: number,
): boolean {
  const hours =
    year !== undefined && month !== undefined
      ? azubiMonthlyHoursForMonth(cfg, year, month)
      : azubiMonthlyHoursOutOfTerm(cfg);
  return hours > AZUBI_MONTHLY_WARNING_HOURS;
}

/** Monatssoll in Minuten, ohne automatische anteilige Berechnung. */
export function azubiMonthlyMinutes(
  cfg: AzubiConfig | undefined,
  year: number,
  month: number,
  closedWeekdays: readonly WeekdayName[] = [],
  period: EmploymentPeriod = {},
): number {
  return Math.round(azubiMonthlyHoursForMonth(cfg, year, month, closedWeekdays, period) * 60);
}

/** Soll eines Mitarbeiters - bei Azubis aus der Konfiguration, sonst eingetragen. */
export function effectiveTargetMinutes(
  employee: Employee,
  year: number,
  month: number,
): number {
  if (employee.employmentType !== "AZUBI") return employee.targetMinutes;
  return withAutomaticAzubiTarget(employee, year, month).targetMinutes;
}

/** Migriert Azubi-Altdaten und synchronisiert das wirksame Monatssoll. */
export function withAutomaticAzubiTarget(
  employee: Employee,
  year: number,
  month: number,
  closedWeekdays: readonly WeekdayName[] = [],
): Employee {
  if (employee.employmentType !== "AZUBI") return employee;

  const azubi = azubiConfigOf(employee.azubi);
  // Keine automatische Kürzung (Ein-/Austritt, Schulbeginn): der Chef trägt
  // das Soll für solche Monate selbst ein.
  // „Giờ / tuần": nur Tage zwischen Eintritt und Austritt zählen.
  const targetMinutes = azubiMonthlyMinutes(azubi, year, month, closedWeekdays, {
    startDate: employee.startDate,
    endDate: employee.endDate,
  });
  const oldConfig = employee.azubi;
  const configChanged =
    !oldConfig ||
    oldConfig.schoolTermStart !== azubi.schoolTermStart ||
    oldConfig.schoolTermEnd !== azubi.schoolTermEnd ||
    JSON.stringify(oldConfig.schoolBlocks ?? null) !== JSON.stringify(azubi.schoolBlocks ?? null) ||
    oldConfig.schoolMode !== azubi.schoolMode ||
    JSON.stringify(oldConfig.schoolWeekdays ?? null) !== JSON.stringify(azubi.schoolWeekdays ?? null) ||
    oldConfig.schoolWeeklyStart !== azubi.schoolWeeklyStart ||
    oldConfig.schoolWeeklyEnd !== azubi.schoolWeeklyEnd ||
    oldConfig.monthlyHoursOutOfTerm !== azubi.monthlyHoursOutOfTerm ||
    oldConfig.workWeeklyHours !== azubi.workWeeklyHours ||
    !monthlyHoursMapsEqual(oldConfig.monthlyHoursByMonth, azubi.monthlyHoursByMonth) ||
    !monthlyHoursMapsEqual(oldConfig.workMonthHoursByMonth, azubi.workMonthHoursByMonth) ||
    oldConfig.weeklyHoursInTerm !== undefined ||
    oldConfig.weeklyHoursOutOfTerm !== undefined;
  if (!configChanged && employee.targetMinutes === targetMinutes) return employee;

  return { ...employee, azubi, targetMinutes };
}
