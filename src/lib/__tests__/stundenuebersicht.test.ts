import { describe, expect, it } from "vitest";
import type { Employee, Schedule, Shift } from "../../types";
import { hourStatsFor } from "../zuschlaege";
import { buildStundenzettelPdf } from "../pdf";

const shift = (id: string, employeeId: string, date: string, start: number, end: number, paid: number, pause = 0): Shift => ({
  id, employeeId, date, startMinutes: start, endMinutes: end, pauseMinutes: pause, paidMinutes: paid,
  shiftType: "CUSTOM", generated: true,
});

// Okt 2026: 05.10. = Montag, 11.10. = Sonntag.
const shifts: Shift[] = [
  shift("a", "e1", "2026-10-05", 16 * 60 + 30, 22 * 60, 5.5 * 60), // Mo: 2 h ab 20 Uhr
  shift("b", "e1", "2026-10-11", 16 * 60 + 30, 22 * 60, 5.5 * 60), // So: nur Sonntag
  shift("c", "e1", "2026-10-06", 11 * 60, 19 * 60 + 30, 7.5 * 60, 60), // Di: keine Nacht
  shift("d", "e2", "2026-10-05", 20 * 60, 22 * 60, 2 * 60), // andere Person
];

describe("hourStatsFor – Stundenübersicht", () => {
  const dates = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

  it("Nacht ab 20:00; Sonntag zählt nur als Sonntag, nicht zusätzlich als Nacht", () => {
    expect(hourStatsFor(shifts, "e1", dates)).toEqual({
      total: (5.5 + 5.5 + 7.5) * 60,
      night: 2 * 60,
      sunday: 5.5 * 60,
    });
  });

  it("zählt nur die angegebenen Tage", () => {
    expect(hourStatsFor(shifts, "e1", ["2026-10-11"])).toEqual({ total: 330, night: 0, sunday: 330 });
  });
});

describe("Stundenzettel-PDF", () => {
  it("beginnt mit der Stundenübersicht, danach eine Seite je Mitarbeiter", async () => {
    const employees: Employee[] = [
      { id: "e1", name: "Anna", employmentType: "VOLLZEIT", targetMinutes: 0 },
      { id: "e2", name: "Binh", employmentType: "AZUBI", targetMinutes: 0 },
    ];
    const schedule = {
      companyName: "Thien Long Restaurant", address: "Olgastraße 5", year: 2026, month: 10,
      shifts, employees, dateOverrides: [],
    } as unknown as Schedule;
    const doc = await buildStundenzettelPdf(schedule, employees);
    expect(doc.getNumberOfPages()).toBe(3);
  });
});
