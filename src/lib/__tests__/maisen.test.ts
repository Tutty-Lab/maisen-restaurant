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

  it("a missing cook is covered by the owners too (note, not an error)", () => {
    // Beide Köche an einem Freitag gestrichen → Bếp fehlt; die Chefs springen ein.
    const date = "2026-12-04";
    const noCook = planned.filter((s) => !(s.date === date && (s.employeeId === "k1" || s.employeeId === "k3")));
    const all = validateSchedule(thin, noCook, ctx).errors;
    expect(all.filter((e) => e.severity !== "warning" && e.message.includes("Bếp"))).toEqual([]);
    expect(all.some((e) => e.date === date && e.severity === "warning" && e.message.includes("chủ đứng Bếp"))).toBe(true);
  });
});

describe("Mai Sen evening peak: 20:00–close is not busier than 17:00–20:00", () => {
  const roleOf = (id: string) => team.find((e) => e.id === id)!.workRole!;
  const count = (date: string, role: string, t: number) =>
    shifts.filter(
      (s) => s.date === date && roleOf(s.employeeId) === role &&
        (s.segments ?? [s]).some((g) => g.startMinutes <= t && g.endMinutes >= t + 30),
    ).length;
  const mean = (date: string, role: string, from: number, to: number) => {
    const ts: number[] = [];
    for (let t = from; t + 30 <= to; t += 30) ts.push(t);
    return ts.reduce((a, t) => a + count(date, role, t), 0) / ts.length;
  };

  it("keeps late evening at most as busy as early evening on (almost) every day", () => {
    const dates = [...new Set(shifts.map((s) => s.date))];
    for (const role of ["KITCHEN", "SERVICE"]) {
      const worse = dates.filter((d) => {
        const blocks = resolveDay(workHours, d, holidays).blocks;
        const close = blocks[blocks.length - 1].endMinutes;
        return mean(d, role, 20 * 60, close) > mean(d, role, 17 * 60, 20 * 60) + 1e-9;
      });
      // Ausnahme nur, wenn die letzte Person ohnehin bis Schluss bleiben muss.
      expect(worse.length, `${role}: ${worse.join(", ")}`).toBeLessThanOrEqual(2);
    }
  });
});

describe("Mai Sen: fixed days off are optional – the planner picks rest days itself", () => {
  const free: Employee[] = team.map(({ fixedDaysOff: _drop, ...e }) => e as Employee);
  const planned = generateSchedule({ year, month, storeId: "maisen", workHours, employees: free, holidayState: "NW" });

  it("does not block planning when nobody chose fixed days off", async () => {
    const { checkScheduleReadiness } = await import("../readiness");
    const { fixedDaysOffRequired } = await import("../stores");
    const r = checkScheduleReadiness(free, {
      requireWorkRole: true,
      requireFixedDaysOff: fixedDaysOffRequired("maisen"),
      storeId: "maisen",
      year,
      month,
    });
    expect(r.issues.filter((i) => i.includes("ngày nghỉ cố định"))).toEqual([]);
  });

  it("still hits every target, never works Monday or more than 6 days in a row", () => {
    for (const e of free) {
      const mine = planned.filter((s) => s.employeeId === e.id);
      expect(mine.reduce((a, s) => a + s.paidMinutes, 0), e.name).toBe(e.targetMinutes);
      expect(mine.some((s) => new Date(`${s.date}T12:00:00`).getDay() === 1), e.name).toBe(false);
    }
    const errors = validateSchedule(free, planned, { year, month, storeId: "maisen", workHours, holidayState: "NW" })
      .errors.filter((x) => x.severity !== "warning");
    expect(errors).toEqual([]);
  });

  it("keeps a chosen day off (e.g. Azubi Mo + Di for school)", () => {
    const withDays = free.map((e) => (e.id === "s1" ? { ...e, fixedDaysOff: ["monday", "tuesday"] as Employee["fixedDaysOff"] } : e));
    const p = generateSchedule({ year, month, storeId: "maisen", workHours, employees: withDays, holidayState: "NW" });
    expect(p.filter((s) => s.employeeId === "s1").some((s) => new Date(`${s.date}T12:00:00`).getDay() === 2)).toBe(false);
  });
});

describe("Mai Sen: everyone gets at least 1 day off every calendar week", () => {
  // Mai 2027: Pfingstmontag 17.05. ist ein offener Feiertags-Montag → 7 offene Tage in der Woche.
  const may = generateSchedule({ year: 2027, month: 5, storeId: "maisen", workHours, employees: team, holidayState: "NW" });
  const monday = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toDateString();
  };

  it("never plans 7 days in one week, even with an open holiday Monday", () => {
    expect(may.some((s) => s.date === "2027-05-17")).toBe(true);
    for (const e of team) {
      const perWeek = new Map<string, number>();
      for (const s of may.filter((x) => x.employeeId === e.id)) perWeek.set(monday(s.date), (perWeek.get(monday(s.date)) ?? 0) + 1);
      for (const [week, days] of perWeek) expect(days, `${e.name} ${week}`).toBeLessThanOrEqual(6);
    }
  });
});
