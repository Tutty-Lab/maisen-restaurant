// ============================================================================
// Giờ/tháng „theo lương": Monatssoll aus Monatslohn ÷ Stundenlohn.
// Abgerundet auf volle Stunden, damit Stunden × Stundenlohn den Monatslohn nie
// übersteigt (sonst wäre die Person unter dem vereinbarten Stundenlohn bezahlt).
// ============================================================================

/** Lohnangaben einer Person (nur gesetzt, wenn „Theo lương" gewählt ist). */
export type PayConfig = {
  /** Monatslohn brutto in Euro. */
  monthlyGross: number;
  /** Stundenlohn brutto in Euro. */
  hourlyWage: number;
};

/** Gesetzlicher Mindestlohn (MiLoG) je Kalenderjahr in Euro/Stunde. */
export function minimumWage(year: number): number {
  if (year >= 2027) return 14.6;
  if (year >= 2026) return 13.9;
  return 12.82;
}

/** Volle Monatsstunden aus Lohn; 0, wenn die Angaben unvollständig sind. */
export function hoursFromPay(monthlyGross: number, hourlyWage: number): number {
  if (!(monthlyGross > 0) || !(hourlyWage > 0)) return 0;
  // Kleiner Zuschlag gegen Rundungsfehler (z.B. 2.780,00 / 13,90 = 199,999…).
  return Math.floor(monthlyGross / hourlyWage + 1e-9);
}

/** Ungerundete Stunden – nur zur Anzeige („82,7 h → 82 h"). */
export function exactHoursFromPay(monthlyGross: number, hourlyWage: number): number {
  if (!(monthlyGross > 0) || !(hourlyWage > 0)) return 0;
  return monthlyGross / hourlyWage;
}

const euro = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatEuro(value: number): string {
  return `${euro.format(value)} €`;
}
