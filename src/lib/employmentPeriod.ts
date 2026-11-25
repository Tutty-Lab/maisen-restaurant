// ============================================================================
// Ein- und Austrittsdatum (Ngày vào làm / Ngày nghỉ việc).
//
// Außerhalb des Zeitraums wird niemand eingeplant. Arbeitet jemand nur einen
// Teil des Monats, wird das Monatssoll anteilig nach Kalendertagen gekürzt
// (auf volle Stunden gerundet). Das eingetragene Voll-Monatssoll bleibt in
// `baseTargetMinutes` erhalten, damit es im nächsten vollen Monat wieder gilt.
// ============================================================================

import type { Employee } from "../types";

/** true, wenn der Mitarbeiter an diesem Tag (yyyy-MM-dd) beschäftigt ist. */
export function isEmployeeActiveOn(employee: Employee, isoDate: string): boolean {
  if (employee.startDate && isoDate < employee.startDate) return false;
  if (employee.endDate && isoDate > employee.endDate) return false;
  return true;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const monthKeyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** true = Ein- oder Austritt fällt in diesen Monat (nicht ganz, nicht gar nicht beschäftigt). */
export function isPartialEmploymentMonth(employee: Employee, year: number, month: number): boolean {
  const active = activeDaysInMonth(employee, year, month);
  return active > 0 && active < daysInMonth(year, month);
}

/** Vom Chef eingetragene Stunden für einen Ein-/Austrittsmonat (oder undefined). */
export function periodMonthHoursOf(employee: Employee, year: number, month: number): number | undefined {
  const value = employee.periodMonthHours?.[monthKeyOf(year, month)];
  return Number.isFinite(value) ? value : undefined;
}

/** Teilmonat ohne eingetragene Stunden – muss vor dem Planen ausgefüllt werden. */
export function needsPeriodMonthHours(employee: Employee, year: number, month: number): boolean {
  return (
    employee.employmentType !== "AZUBI" &&
    isPartialEmploymentMonth(employee, year, month) &&
    periodMonthHoursOf(employee, year, month) === undefined
  );
}

/** Beschäftigte Kalendertage im Monat. */
export function activeDaysInMonth(employee: Employee, year: number, month: number): number {
  const total = daysInMonth(year, month);
  if (!employee.startDate && !employee.endDate) return total;
  let count = 0;
  for (let day = 1; day <= total; day++) {
    if (isEmployeeActiveOn(employee, isoOf(year, month, day))) count += 1;
  }
  return count;
}

/** Kürzt ein Monatssoll anteilig nach beschäftigten Kalendertagen (volle Stunden). */
export function prorateForEmploymentPeriod(
  minutes: number,
  employee: Employee,
  year: number,
  month: number,
): number {
  const total = daysInMonth(year, month);
  const active = activeDaysInMonth(employee, year, month);
  if (active >= total) return minutes;
  return Math.round((minutes * active) / total / 60) * 60;
}

/**
 * Setzt das wirksame Monatssoll für Vollzeit/Teilzeit (Azubis: siehe
 * withAutomaticAzubiTarget). Gibt dasselbe Objekt zurück, wenn sich nichts ändert.
 */
export function withEmploymentPeriodTarget(
  employee: Employee,
  year: number,
  month: number,
): Employee {
  if (employee.employmentType === "AZUBI") {
    return employee.baseTargetMinutes === undefined
      ? employee
      : { ...employee, baseTargetMinutes: undefined };
  }
  const base = employee.baseTargetMinutes ?? employee.targetMinutes;
  // Eingetragene Stunden für den Ein-/Austrittsmonat gehen vor (kein Kürzen).
  const entered = isPartialEmploymentMonth(employee, year, month)
    ? periodMonthHoursOf(employee, year, month)
    : undefined;
  const target =
    entered !== undefined
      ? Math.max(0, Math.round(entered)) * 60
      : prorateForEmploymentPeriod(base, employee, year, month);
  const baseField = target === base ? undefined : base;
  if (employee.targetMinutes === target && employee.baseTargetMinutes === baseField) {
    return employee;
  }
  return { ...employee, targetMinutes: target, baseTargetMinutes: baseField };
}

/** Voll-Monatssoll, wie im Formular eingetragen. */
export function fullMonthTargetMinutes(employee: Employee): number {
  return employee.baseTargetMinutes ?? employee.targetMinutes;
}

/** Kurztext für Listen, z. B. „vào 16/09/2026 · nghỉ 30/11/2026". */
export function employmentPeriodLabel(employee: Employee): string {
  const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const parts: string[] = [];
  if (employee.startDate) parts.push(`vào ${fmt(employee.startDate)}`);
  if (employee.endDate) parts.push(`nghỉ việc ${fmt(employee.endDate)}`);
  return parts.join(" · ");
}

/** Grund, warum an diesem Tag keine Schicht möglich ist (oder null). */
export function inactiveReason(employee: Employee, isoDate: string): string | null {
  if (employee.startDate && isoDate < employee.startDate) return "Chưa vào làm";
  if (employee.endDate && isoDate > employee.endDate) return "Đã nghỉ việc";
  return null;
}
