import type { Shift, SurchargeConfig } from "../types";
import { parseIsoDate, weekdayKeyOf } from "./demand";

const AFTER_20 = 20 * 60;

export const DEFAULT_SURCHARGE_CONFIG: SurchargeConfig = {
  after20Percent: 0,
  sundayPercent: 0,
};

function validPercent(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function normalizeSurchargeConfig(
  config?: Partial<SurchargeConfig>,
): SurchargeConfig {
  return {
    after20Percent: validPercent(config?.after20Percent),
    sundayPercent: validPercent(config?.sundayPercent),
  };
}

/**
 * Paid Nacht minutes after 20:00 from Monday through Saturday. Sunday is
 * accounted for by the separate Sunday surcharge and must not be counted twice.
 * Normal shifts do not store the exact pause position, so the result is capped
 * by paid time; generated late shifts place their pause before this window.
 */
export function shiftMinutesAfter20(shift: Shift): number {
  if (weekdayKeyOf(parseIsoDate(shift.date)) === "sunday") return 0;

  const segments = shift.segments ?? [
    { startMinutes: shift.startMinutes, endMinutes: shift.endMinutes },
  ];
  const after20 = segments.reduce(
    (total, segment) =>
      total + Math.max(0, segment.endMinutes - Math.max(AFTER_20, segment.startMinutes)),
    0,
  );
  return Math.min(shift.paidMinutes, after20);
}

export type HourStats = { total: number; night: number; sunday: number };

/**
 * Summen (Minuten) einer Person über die angegebenen Tage – für die
 * „Stundenübersicht". Nacht = ab 20:00 an Mo–Sa; Sonntag = die ganze bezahlte
 * Zeit am Sonntag, NICHT zusätzlich als Nacht gezählt.
 */
export function hourStatsFor(
  shifts: readonly Shift[],
  employeeId: string,
  dates: readonly string[],
): HourStats {
  const inRange = new Set(dates);
  const stats: HourStats = { total: 0, night: 0, sunday: 0 };
  for (const shift of shifts) {
    if (shift.employeeId !== employeeId || !inRange.has(shift.date)) continue;
    stats.total += shift.paidMinutes;
    stats.night += shiftMinutesAfter20(shift);
    if (weekdayKeyOf(parseIsoDate(shift.date)) === "sunday") stats.sunday += shift.paidMinutes;
  }
  return stats;
}

export type ZuschlagTotals = {
  after20Minutes: number;
  sundayMinutes: number;
};

export function zuschlagTotals(shifts: readonly Shift[]): ZuschlagTotals {
  return shifts.reduce<ZuschlagTotals>(
    (totals, shift) => ({
      after20Minutes: totals.after20Minutes + shiftMinutesAfter20(shift),
      sundayMinutes:
        totals.sundayMinutes +
        (weekdayKeyOf(parseIsoDate(shift.date)) === "sunday" ? shift.paidMinutes : 0),
    }),
    { after20Minutes: 0, sundayMinutes: 0 },
  );
}

export type ZuschlagCalculation = ZuschlagTotals &
  SurchargeConfig & {
    after20BonusMinutes: number;
    sundayBonusMinutes: number;
    totalBonusMinutes: number;
  };

/**
 * Converts surcharge percentages into bonus-equivalent minutes. Sunday and
 * Nacht hours are mutually exclusive; each result is rounded to a full minute.
 */
export function calculateZuschlaege(
  shifts: readonly Shift[],
  config?: Partial<SurchargeConfig>,
): ZuschlagCalculation {
  const totals = zuschlagTotals(shifts);
  const normalized = normalizeSurchargeConfig(config);
  const after20BonusMinutes = Math.round(
    totals.after20Minutes * normalized.after20Percent / 100,
  );
  const sundayBonusMinutes = Math.round(
    totals.sundayMinutes * normalized.sundayPercent / 100,
  );

  return {
    ...totals,
    ...normalized,
    after20BonusMinutes,
    sundayBonusMinutes,
    totalBonusMinutes: after20BonusMinutes + sundayBonusMinutes,
  };
}
