import { describe, expect, it } from "vitest";
import type { AzubiConfig, Employee } from "../../types";
import { azubiMonthHoursFromWeekly, azubiWorkDaysPerWeek, withAutomaticAzubiTarget } from "../azubi";
import { generateSchedule } from "../scheduler";
import { closedWeekdaysOf, defaultWorkHoursForStore } from "../workHours";
import { validateSchedule } from "../validation";

const workHours = defaultWorkHoursForStore("maisen");
const closed = closedWeekdaysOf(workHours); // ["monday"]
const cfg = (patch: Partial<AzubiConfig>): AzubiConfig => ({ inSchoolTerm: false, schoolDays: [], ...patch });

const weekKey = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

describe("Azubi: giờ làm theo tuần, luôn nghỉ 2 ngày", () => {
  it("work days = 5 minus school days", () => {
    expect(azubiWorkDaysPerWeek(cfg({}))).toBe(5);
    expect(azubiWorkDaysPerWeek(cfg({ inSchoolTerm: true, schoolMode: "weekly", schoolWeekdays: ["tuesday", "wednesday"] }))).toBe(3);
    expect(azubiWorkDaysPerWeek(cfg({ inSchoolTerm: true, schoolMode: "weekly", schoolWeekdays: ["tuesday"] }))).toBe(4);
  });

  it("derives month hours from weekly hours, edge weeks by available days", () => {
    expect(closed).toEqual(["monday"]);
    const year1 = cfg({ inSchoolTerm: true, schoolMode: "weekly", schoolWeekdays: ["tuesday", "wednesday"], workWeeklyHours: 24 });
    // Dez 2026: Woche 30.11.–06.12. liegt (ohne Mo) ganz im Dezember → 24 h;
    // 3 volle Wochen → 72 h; 28.12.–03.01.: nur Do 31.12. verfügbar von Do–So (4) → 6 h.
    expect(azubiMonthHoursFromWeekly(year1, 2026, 12, closed)).toBe(24 + 72 + 6);
  });

  const team = (): Employee[] => [
    withAutomaticAzubiTarget(
      {
        id: "a1", name: "Azubi năm 1", employmentType: "AZUBI", targetMinutes: 0, workRole: "SERVICE",
        azubi: cfg({ inSchoolTerm: true, schoolMode: "weekly", schoolWeekdays: ["tuesday", "wednesday"], workWeeklyHours: 24 }),
      },
      2026, 12, closed,
    ),
    withAutomaticAzubiTarget(
      {
        id: "a2", name: "Azubi năm 2", employmentType: "AZUBI", targetMinutes: 0, workRole: "SERVICE",
        azubi: cfg({ inSchoolTerm: true, schoolMode: "weekly", schoolWeekdays: ["thursday"], workWeeklyHours: 32 }),
      },
      2026, 12, closed,
    ),
    { id: "k1", name: "Koch 1", employmentType: "VOLLZEIT", targetMinutes: 173 * 60, workRole: "KITCHEN" },
    { id: "k2", name: "Koch 2", employmentType: "VOLLZEIT", targetMinutes: 169 * 60, workRole: "KITCHEN" },
    { id: "s", name: "Bồi", employmentType: "TEILZEIT", targetMinutes: 82 * 60, workRole: "SERVICE" },
  ];

  it("plans at most 3 / 4 work days and the weekly hours in each full week", () => {
    const employees = team();
    const shifts = generateSchedule({ year: 2026, month: 12, storeId: "maisen", workHours, employees, holidayState: "NW" });
    for (const [id, days, weekly] of [["a1", 3, 24], ["a2", 4, 32]] as const) {
      const e = employees.find((x) => x.id === id)!;
      const mine = shifts.filter((s) => s.employeeId === id);
      expect(mine.reduce((a, s) => a + s.paidMinutes, 0), id).toBe(e.targetMinutes);
      const byWeek = new Map<string, { days: number; minutes: number }>();
      for (const s of mine) {
        const k = weekKey(s.date);
        const cur = byWeek.get(k) ?? { days: 0, minutes: 0 };
        byWeek.set(k, { days: cur.days + 1, minutes: cur.minutes + s.paidMinutes });
      }
      for (const [k, v] of byWeek) {
        expect(v.days, `${id} ${k}`).toBeLessThanOrEqual(days);
        expect(v.minutes, `${id} ${k}`).toBeLessThanOrEqual(weekly * 60);
      }
      // volle Wochen (7.–13., 14.–20., 21.–27.12.) bekommen genau die Wochenstunden
      for (const k of ["2026-12-07", "2026-12-14", "2026-12-21"]) {
        expect(byWeek.get(k)?.minutes, `${id} ${k}`).toBe(weekly * 60);
      }
    }
    const errors = validateSchedule(employees, shifts, { year: 2026, month: 12, storeId: "maisen", workHours, holidayState: "NW" })
      .errors.filter((x) => x.severity !== "warning");
    expect(errors).toEqual([]);
  });
});
