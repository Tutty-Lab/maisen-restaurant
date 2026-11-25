import { describe, expect, it } from "vitest";
import type { AzubiConfig, Employee } from "../../types";
import {
  azubiMonthMode,
  azubiMonthlyHoursForMonth,
  azubiTermMonths,
  isAzubiBlockedSchoolDate,
  withAutomaticAzubiTarget,
} from "../azubi";
import { generateSchedule } from "../scheduler";
import { defaultWorkHoursForStore } from "../workHours";

const base = (patch: Partial<AzubiConfig>): AzubiConfig => ({
  inSchoolTerm: true,
  schoolDays: [],
  monthlyHoursOutOfTerm: 169,
  ...patch,
});

describe("Đi học liền nhiều đợt (Blockunterricht)", () => {
  const cfg = base({
    schoolMode: "block",
    schoolBlocks: [
      { start: "2027-03-01", end: "2027-03-31" },
      { start: "2026-12-07", end: "2026-12-18" },
    ],
  });

  it("blocks every block, works in between", () => {
    expect(isAzubiBlockedSchoolDate(cfg, "2026-12-10")).toBe(true);
    expect(isAzubiBlockedSchoolDate(cfg, "2027-01-15")).toBe(false);
    expect(isAzubiBlockedSchoolDate(cfg, "2027-03-15")).toBe(true);
  });

  it("knows full, partial and work months", () => {
    expect(azubiTermMonths(cfg)).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 3 },
    ]);
    expect(azubiMonthMode(cfg, 2027, 3)).toBe("school");
    expect(azubiMonthMode(cfg, 2026, 12)).toBe("mixed");
    expect(azubiMonthMode(cfg, 2027, 1)).toBe("work");
    expect(azubiMonthlyHoursForMonth(cfg, 2027, 3)).toBe(0);
    expect(azubiMonthlyHoursForMonth(cfg, 2027, 1)).toBe(169);
  });

  it("still reads old single-range data", () => {
    const old = base({ schoolTermStart: "2027-03-01", schoolTermEnd: "2027-03-31" });
    expect(isAzubiBlockedSchoolDate(old, "2027-03-02")).toBe(true);
    expect(azubiMonthMode(old, 2027, 3)).toBe("school");
  });
});

describe("Vừa học vừa làm (feste Schultage pro Woche)", () => {
  const cfg = base({ schoolMode: "weekly", schoolWeekdays: ["tuesday", "wednesday"], monthlyHoursOutOfTerm: 101 });

  it("blocks only the school weekdays, every month is a work month", () => {
    expect(isAzubiBlockedSchoolDate(cfg, "2026-12-01")).toBe(true); // Di
    expect(isAzubiBlockedSchoolDate(cfg, "2026-12-02")).toBe(true); // Mi
    expect(isAzubiBlockedSchoolDate(cfg, "2026-12-03")).toBe(false); // Do
    expect(azubiMonthMode(cfg, 2026, 12)).toBe("work");
    expect(azubiMonthlyHoursForMonth(cfg, 2026, 12)).toBe(101);
  });

  it("respects the optional date range", () => {
    const ranged = { ...cfg, schoolWeeklyStart: "2026-12-08", schoolWeeklyEnd: "2026-12-20" };
    expect(isAzubiBlockedSchoolDate(ranged, "2026-12-01")).toBe(false);
    expect(isAzubiBlockedSchoolDate(ranged, "2026-12-08")).toBe(true);
    expect(isAzubiBlockedSchoolDate(ranged, "2026-12-22")).toBe(false);
  });

  it("the planner never puts a shift on a school day and still hits the hours", () => {
    const azubi: Employee = withAutomaticAzubiTarget(
      {
        id: "a", name: "Azubi", employmentType: "AZUBI", targetMinutes: 0, workRole: "SERVICE",
        fixedDaysOff: ["monday", "sunday"], azubi: cfg,
      },
      2026, 12,
    );
    const team: Employee[] = [
      azubi,
      { id: "k", name: "Koch", employmentType: "VOLLZEIT", targetMinutes: 173 * 60, workRole: "KITCHEN", fixedDaysOff: ["monday"] },
      { id: "s", name: "Bồi", employmentType: "TEILZEIT", targetMinutes: 82 * 60, workRole: "SERVICE" },
    ];
    const shifts = generateSchedule({
      year: 2026, month: 12, storeId: "maisen", workHours: defaultWorkHoursForStore("maisen"),
      employees: team, holidayState: "NW",
    });
    const mine = shifts.filter((s) => s.employeeId === "a");
    expect(mine.some((s) => isAzubiBlockedSchoolDate(cfg, s.date))).toBe(false);
    expect(mine.reduce((sum, s) => sum + s.paidMinutes, 0)).toBe(101 * 60);
  });
});

describe("Ví dụ của chủ: đi học 09.11.2026 – 02.03.2027, lịch làm theo tháng", () => {
  const cfg = base({ schoolMode: "block", schoolBlocks: [{ start: "2026-11-09", end: "2027-03-02" }] });

  it("knows each month: Nov part work, Dec–Feb school, Mar part work", () => {
    expect(azubiMonthMode(cfg, 2026, 11)).toBe("mixed");
    expect(azubiMonthMode(cfg, 2026, 12)).toBe("school");
    expect(azubiMonthMode(cfg, 2027, 2)).toBe("school");
    expect(azubiMonthMode(cfg, 2027, 3)).toBe("mixed");
  });

  it("November plan: shifts only 01.–08.11, none from 09.11 on", () => {
    const withNovHours = { ...cfg, monthlyHoursByMonth: { "2026-11": 40 } };
    const azubi = withAutomaticAzubiTarget(
      { id: "a", name: "Azubi", employmentType: "AZUBI", targetMinutes: 0, workRole: "SERVICE", fixedDaysOff: ["monday", "sunday"], azubi: withNovHours },
      2026, 11,
    );
    expect(azubi.targetMinutes).toBe(40 * 60);
    const team: Employee[] = [
      azubi,
      { id: "k", name: "Koch", employmentType: "VOLLZEIT", targetMinutes: 173 * 60, workRole: "KITCHEN", fixedDaysOff: ["monday"] },
      { id: "s", name: "Bồi", employmentType: "TEILZEIT", targetMinutes: 82 * 60, workRole: "SERVICE" },
    ];
    const shifts = generateSchedule({
      year: 2026, month: 11, storeId: "maisen", workHours: defaultWorkHoursForStore("maisen"),
      employees: team, holidayState: "NW",
    });
    const mine = shifts.filter((s) => s.employeeId === "a");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((s) => s.date <= "2026-11-08")).toBe(true);
    expect(mine.reduce((sum, s) => sum + s.paidMinutes, 0)).toBe(40 * 60);
  });
});
