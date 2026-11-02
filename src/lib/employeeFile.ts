// ============================================================================
// Nhân viên als Datei sichern / wieder einlesen („Xuất / Nhập file").
// Anlass: Nhân viên wurden versehentlich gelöscht und waren nirgends gesichert.
// ============================================================================

import type { Employee, EmploymentType } from "../types";

const KIND = "thienlong-employees";
const TYPES: EmploymentType[] = ["VOLLZEIT", "TEILZEIT", "AZUBI"];

/** Inhalt der Sicherungsdatei (JSON, gut lesbar eingerückt). */
export function employeesToFile(employees: readonly Employee[], exportedAt = new Date()): string {
  return JSON.stringify(
    { kind: KIND, version: 1, exportedAt: exportedAt.toISOString(), employees },
    null,
    2,
  );
}

/**
 * Liest eine Sicherung. Akzeptiert die eigene Datei, eine reine Liste und
 * einen kompletten App-Stand ({ schedule: { employees } }). Wirft mit einer
 * konkreten Begründung, wenn etwas nicht passt.
 */
export function parseEmployeesFile(text: string): Employee[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("File không phải JSON hợp lệ (chọn đúng file đã xuất từ app).");
  }
  const list = Array.isArray(data)
    ? data
    : (data as { employees?: unknown })?.employees ??
      (data as { schedule?: { employees?: unknown } })?.schedule?.employees;
  if (!Array.isArray(list)) throw new Error("Trong file không có danh sách nhân viên.");
  if (list.length === 0) throw new Error("Danh sách nhân viên trong file đang trống.");
  return list.map((raw, i) => {
    const e = raw as Partial<Employee>;
    const where = `Dòng ${i + 1}${typeof e?.name === "string" ? ` (${e.name})` : ""}`;
    if (typeof e?.id !== "string" || e.id === "") throw new Error(`${where}: thiếu mã nhân viên (id).`);
    if (typeof e.name !== "string" || e.name.trim() === "") throw new Error(`${where}: thiếu tên.`);
    if (!TYPES.includes(e.employmentType as EmploymentType)) {
      throw new Error(`${where}: hình thức "${String(e.employmentType)}" không hợp lệ.`);
    }
    if (typeof e.targetMinutes !== "number" || !Number.isFinite(e.targetMinutes)) {
      throw new Error(`${where}: thiếu giờ/tháng.`);
    }
    return e as Employee;
  });
}

/** Nhập: „add" behält die bisherigen und hängt nur fehlende Personen (nach id) an. */
export function mergeEmployees(
  current: readonly Employee[],
  incoming: readonly Employee[],
  mode: "add" | "replace",
): Employee[] {
  if (mode === "replace") return [...incoming];
  const known = new Set(current.map((e) => e.id));
  return [...current, ...incoming.filter((e) => !known.has(e.id))];
}
