// ============================================================================
// Mai Sen: Abendspitze ernst nehmen (Chef, Nov 2026: „sao bồi 20–22h nhiều khi
// đông hơn 17–20h"). Nach dem Planen werden Abend-Stücke, die bis Ladenschluss
// laufen, früher gelegt – gleiche Dauer, gleiche Tage, gleiche Stunden –, bis
// 20:00–Schluss nicht mehr voller ist als 17:00–20:00. Pro Rolle bleibt immer
// mindestens eine Person bis zum Schluss (wenn vorher jemand da war).
// ============================================================================

import type { Shift, ShiftSegment, WorkRole } from "../types";
import type { ResolvedDay } from "./workHours";

const SLOT = 30;
const MIN_PIECE = 2 * 60;
const EVENING_SPLIT = 20 * 60; // „20–22h" vs „17–20h"

type RoleOf = (employeeId: string) => WorkRole | undefined;

const piecesOf = (s: Shift): ShiftSegment[] =>
  s.segments ? s.segments.map((g) => ({ ...g })) : [{ startMinutes: s.startMinutes, endMinutes: s.endMinutes }];

function setPieces(s: Shift, pieces: ShiftSegment[]): void {
  if (s.segments) s.segments = pieces;
  s.startMinutes = pieces[0].startMinutes;
  s.endMinutes = pieces[pieces.length - 1].endMinutes;
}

const covers = (pieces: ShiftSegment[], t: number) =>
  pieces.some((g) => g.startMinutes <= t && g.endMinutes >= t + SLOT);

/** Kopfzahl je Halbstunde für eine Rolle. */
function countAt(dayShifts: readonly Shift[], role: WorkRole, roleOf: RoleOf, t: number): number {
  return dayShifts.filter((s) => roleOf(s.employeeId) === role && covers(piecesOf(s), t)).length;
}

function slotsBetween(from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t + SLOT <= to; t += SLOT) out.push(t);
  return out;
}

/** Wie viel voller ist der späte Abend (20:00–Schluss) als der frühe (17:00–20:00)? */
function lateExcess(dayShifts: readonly Shift[], role: WorkRole, roleOf: RoleOf, evening: ShiftSegment): number {
  const early = slotsBetween(Math.max(evening.startMinutes + SLOT, 17 * 60), EVENING_SPLIT);
  const late = slotsBetween(EVENING_SPLIT, evening.endMinutes);
  if (early.length === 0 || late.length === 0) return 0;
  const mean = (ts: number[]) => ts.reduce((sum, t) => sum + countAt(dayShifts, role, roleOf, t), 0) / ts.length;
  return mean(late) - mean(early);
}

/** Kein Slot im Abendblock, der vorher besetzt war, darf leer werden. */
function keepsCoverage(
  before: readonly number[],
  dayShifts: readonly Shift[],
  role: WorkRole,
  roleOf: RoleOf,
  evening: ShiftSegment,
): boolean {
  return slotsBetween(evening.startMinutes, evening.endMinutes).every(
    (t, i) => before[i] === 0 || countAt(dayShifts, role, roleOf, t) > 0,
  );
}

/**
 * Verschiebt Abend-Stücke früher, bis der späte Abend nicht voller ist als der
 * frühe. Ändert nur Uhrzeiten, nie Dauer, Tag oder Person.
 */
export function taperLateEvening(
  shifts: Shift[],
  roleOf: RoleOf,
  dayOf: (isoDate: string) => ResolvedDay,
): void {
  const dates = [...new Set(shifts.map((s) => s.date))];
  for (const date of dates) {
    const day = dayOf(date);
    if (day.closed || day.blocks.length === 0) continue;
    const evening = day.blocks[day.blocks.length - 1];
    const lunch = day.blocks.length > 1 ? day.blocks[0] : null;
    const dayShifts = shifts.filter((s) => s.date === date);

    for (const role of ["KITCHEN", "SERVICE"] as const) {
      for (let guard = 0; guard < 40; guard++) {
        const excess = lateExcess(dayShifts, role, roleOf, evening);
        if (excess <= 0) break;
        const before = slotsBetween(evening.startMinutes, evening.endMinutes).map((t) =>
          countAt(dayShifts, role, roleOf, t),
        );

        // Kandidaten: Abend-Stücke dieser Rolle, die nach 20:00 enden – zuerst
        // die, die am spätesten beginnen (die lassen sich am leichtesten vorziehen).
        const candidates = dayShifts
          .filter((s) => roleOf(s.employeeId) === role)
          .map((s) => ({ s, pieces: piecesOf(s) }))
          .filter(({ pieces }) => {
            const lastPiece = pieces[pieces.length - 1];
            return lastPiece.startMinutes >= evening.startMinutes && lastPiece.endMinutes > EVENING_SPLIT;
          })
          .sort((a, b) => b.pieces[b.pieces.length - 1].startMinutes - a.pieces[a.pieces.length - 1].startMinutes);

        let moved = false;
        for (const { s, pieces } of candidates) {
          const last = pieces.length - 1;
          const attempts: ShiftSegment[][] = [];
          // (a) ganzes Abendstück 30 Min. früher (gleiche Länge).
          if (pieces[last].startMinutes - SLOT >= evening.startMinutes) {
            const next = pieces.map((g) => ({ ...g }));
            next[last] = { startMinutes: next[last].startMinutes - SLOT, endMinutes: next[last].endMinutes - SLOT };
            const prev = next[last - 1];
            if (!prev || next[last].startMinutes - prev.endMinutes >= 60) attempts.push(next);
          }
          // (b) Geteilter Dienst: 30 Min. vom Abendende an das Mittagsende geben.
          if (
            lunch &&
            pieces.length >= 2 &&
            pieces[0].endMinutes + SLOT <= lunch.endMinutes &&
            pieces[last].endMinutes - SLOT - pieces[last].startMinutes >= MIN_PIECE
          ) {
            const next = pieces.map((g) => ({ ...g }));
            next[0] = { ...next[0], endMinutes: next[0].endMinutes + SLOT };
            next[last] = { ...next[last], endMinutes: next[last].endMinutes - SLOT };
            attempts.push(next);
          }

          for (const next of attempts) {
            const old = piecesOf(s);
            setPieces(s, next);
            const ok =
              keepsCoverage(before, dayShifts, role, roleOf, evening) &&
              lateExcess(dayShifts, role, roleOf, evening) < excess - 1e-9;
            if (ok) {
              moved = true;
              break;
            }
            setPieces(s, old);
          }
          if (moved) break;
        }
        if (!moved) break;
      }
    }
  }
}
