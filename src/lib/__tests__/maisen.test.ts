import { describe, expect, it } from "vitest";
import type { Employee, Shift } from "../../types";
import { generateSchedule } from "../scheduler";
import { defaultWorkHoursForStore, resolveDay } from "../workHours";
import { holidayNames, holidaysOf } from "../holidays";
import { validateSchedule } from "../validation";
import { storeById, usesRolePlanning } from "../stores";

// Mai Sen (Bonn, NRW): Mo Ruhetag, Di–So mittags zu, Fr/Sa bis 23:00.
// Team in der Struktur des echten Stands (Nov 2026), Namen anonymisiert:
// Bếp = 2 Köche (warm / Sushi) + 1 Küchenhilfe, Bồi = Azubis + Aushilfen.
const azubi = (hours: number) => ({ inSchoolTerm: false, schoolDays: [], monthlyHoursOutOfTerm: hours });
const team: Employee[] = [
  { id: "k1", name: "Bếp nóng", employmentType: "VOLLZEIT", targetMinutes: 173 * 60, workRole: "KITCHEN", fixedDaysOff: ["monday", "wednesday"] },
  { id: "k2", name: "Sushi (Azubi)", employmentType: "AZUBI", targetMinutes: 169 * 60, workRole: "KITCHEN", fixedDaysOff: ["monday", "thursday"], azubi: azubi(169) },
  { id: "k3", name: "Phụ bếp", employmentType: "VOLLZEIT", targetMinutes: 169 * 60, workRole: "KITCHEN", fixedDaysOff: ["monday", "tuesday"] },
  { id: "s1", name: "Azubi Bồi 1", employmentType: "AZUBI", targetMinutes: 169 * 60, workRole: "SERVICE", fixedDaysOff: ["monday", "tuesday"], azubi: azubi(169) },
  { id: "s2", name: "Azubi Bồi 2", employmentType: "AZUBI", targetMinutes: 169 * 60, workRole: "SERVICE", fixedDaysOff: ["monday", "wednesday"], azubi: azubi(169) },
  { id: "s3", name: "Teilzeit Bồi", employmentType: "TEILZEIT", targetMinutes: 82 * 60, workRole: "SERVICE" },
  { id: "s4", name: "Minijob Bồi", employmentType: "TEILZEIT", targetMinutes: 43 * 60, workRole: "SERVICE" },
];

const year = 2026;
const month = 12;
const workHours = defaultWorkHoursForStore("maisen");
const holidays = holidaysOf(year, "NW");
const shifts: Shift[] = generateSchedule({
  year,
  month,
  storeId: "maisen",
  workHours,
  employees: team,
  holidayState: "NW",
});

describe("Mai Sen store setup", () => {
  it("is the only store, in Bonn, with NRW holidays and Bếp/Bồi planning", () => {
    const store = storeById("maisen");
    expect(store.id).toBe("maisen");
    expect(store.holidayState).toBe("NW");
    expect(usesRolePlanning("maisen")).toBe(true);
  });

  it("knows the NRW holidays (Fronleichnam, Allerheiligen – no Epiphany, no Reformation Day)", () => {
    const names = [...holidayNames(2026, "NW").values()];
    expect(names).toContain("Fronleichnam");
    expect(names).toContain("Allerheiligen");
    expect(names).not.toContain("Heilige Drei Könige");
    expect(names).not.toContain("Reformationstag");
    expect(holidayNames(2026, "NW").get("2026-06-04")).toBe("Fronleichnam");
  });

  it("is closed on Mondays and splits Tue–Sun into lunch and dinner", () => {
    expect(resolveDay(workHours, "2026-12-07", holidays).closed).toBe(true); // Montag
    const friday = resolveDay(workHours, "2026-12-11", holidays);
    expect(friday.closed).toBe(false);
    expect(friday.blocks.map((b) => [b.startMinutes / 60, b.endMinutes / 60])).toEqual([
      [10.5, 15],
      [16.5, 23],
    ]);
  });
});

describe("Mai Sen schedule (December 2026)", () => {
  it("never plans anyone on a Monday", () => {
    const mondays = shifts.filter((s) => new Date(`${s.date}T12:00:00`).getDay() === 1);
    expect(mondays).toEqual([]);
  });

  it("hits every monthly target exactly and passes validation", () => {
    for (const e of team) {
      const paid = shifts.filter((s) => s.employeeId === e.id).reduce((sum, s) => sum + s.paidMinutes, 0);
      expect(paid, e.name).toBe(e.targetMinutes);
    }
    expect(
      validateSchedule(team, shifts, { year, month, storeId: "maisen", workHours, holidayState: "NW" }).errors,
    ).toEqual([]);
  });

  it("plans the 1st and 2nd Christmas day (Fri/Sat holidays) inside the holiday window", () => {
    for (const date of ["2026-12-25", "2026-12-26"]) {
      const onDay = shifts.filter((s) => s.date === date);
      expect(onDay.length, date).toBeGreaterThan(0);
      for (const s of onDay) expect(s.endMinutes, date).toBeLessThanOrEqual(22 * 60);
    }
  });
});

describe("Mai Sen soft rules (few staff: keep them light)", () => {
  const hoursOn = (date: string) => shifts.filter((s) => s.date === date).reduce((a, s) => a + s.paidMinutes, 0);
  const openDates = [...new Set(shifts.map((s) => s.date))].filter((d) => !holidays.has(d));
  const dow = (d: string) => new Date(`${d}T12:00:00`).getDay();
  const avg = (ds: string[]) => ds.reduce((a, d) => a + hoursOn(d), 0) / ds.length;

  it("puts more hours on the busy days Thu/Fri/Sat than on Tue/Wed/Sun", () => {
    const busy = openDates.filter((d) => [4, 5, 6].includes(dow(d)));
    const normal = openDates.filter((d) => [2, 3, 0].includes(dow(d)));
    expect(avg(busy)).toBeGreaterThan(avg(normal));
  });

  it("has no Thienlong month-change rush: the 1st–3rd are not heavier than other Tuesdays/Wednesdays", async () => {
    const { isThienlongMonthRushDate, thienlongStaffingProfile } = await import("../thienlongDemand");
    expect(isThienlongMonthRushDate("2026-12-01", "maisen")).toBe(false);
    expect(thienlongStaffingProfile("saturday", false, "maisen").minStaff).toBe(0);
  });
});

describe("Mai Sen: two owners are always there and stand in as Bồi", () => {
  // Tháng Azubi đi học: chỉ 2 bếp + 1 bồi bán thời gian còn lại.
  const thin: Employee[] = [
    { id: "k1", name: "Bếp nóng", employmentType: "VOLLZEIT", targetMinutes: 173 * 60, workRole: "KITCHEN", fixedDaysOff: ["monday"] },
    { id: "k3", name: "Phụ bếp", employmentType: "VOLLZEIT", targetMinutes: 169 * 60, workRole: "KITCHEN", fixedDaysOff: ["monday"] },
    { id: "s3", name: "Teilzeit Bồi", employmentType: "TEILZEIT", targetMinutes: 82 * 60, workRole: "SERVICE" },
  ];
  const ctx = { year: 2026, month: 12, storeId: "maisen", workHours, holidayState: "NW" as const };
  const planned = generateSchedule({ ...ctx, employees: thin });
  const result = validateSchedule(thin, planned, ctx);
  const errors = result.errors.filter((e) => e.severity !== "warning");
  const warnings = result.errors.filter((e) => e.severity === "warning");

  it("does not report missing Bồi or a missing second opener as errors", () => {
    expect(errors.filter((e) => e.message.includes("Bồi"))).toEqual([]);
    expect(errors.filter((e) => e.message.includes("mở cửa"))).toEqual([]);
  });

  it("notes when the owners stand in as Bồi", () => {
    expect(warnings.some((e) => e.message.includes("chủ đứng Bồi"))).toBe(true);
  });

  it("still requires a cook at every open hour", () => {
    // Beide Köche an einem Freitag gestrichen → Bếp fehlt; das bleibt ein Fehler.
    const date = "2026-12-04";
    const noCook = planned.filter((s) => !(s.date === date && (s.employeeId === "k1" || s.employeeId === "k3")));
    const check = validateSchedule(thin, noCook, ctx).errors.filter((e) => e.severity !== "warning");
    expect(check.some((e) => e.date === date && e.message.includes("không có Bếp"))).toBe(true);
  });
});
