import { describe, expect, it } from "vitest";
import { exactHoursFromPay, hoursFromPay, minimumWage } from "../pay";

describe("Giờ theo lương (Monatslohn ÷ Stundenlohn)", () => {
  it("rounds DOWN so hours × wage never exceed the monthly pay", () => {
    expect(hoursFromPay(1150, 13.9)).toBe(82); // 82,7 h
    expect(82 * 13.9).toBeLessThanOrEqual(1150);
    expect(hoursFromPay(600, 13.9)).toBe(43); // Minijob
    expect(hoursFromPay(2500, 14.6)).toBe(171); // Vollzeit 2027
  });

  it("keeps exact multiples despite floating point", () => {
    expect(hoursFromPay(2780, 13.9)).toBe(200);
    expect(hoursFromPay(13.9 * 169, 13.9)).toBe(169);
  });

  it("returns 0 for missing input", () => {
    expect(hoursFromPay(0, 13.9)).toBe(0);
    expect(hoursFromPay(1150, 0)).toBe(0);
    expect(exactHoursFromPay(1150, 13.9)).toBeCloseTo(82.73, 2);
  });

  it("knows the minimum wage per year", () => {
    expect(minimumWage(2026)).toBe(13.9);
    expect(minimumWage(2027)).toBe(14.6);
  });
});
