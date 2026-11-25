// ============================================================================
// Die Filialen, die dieses Repo bedient. Umschalten passiert im Reiter
// „Cài đặt"; jede Filiale hat ihre eigene Zeile in der gemeinsamen Supabase-
// Tabelle (Schlüssel = id) und ihr eigenes Bundesland für die Feiertage.
// ============================================================================

import type { HolidayState } from "./holidays";

export type StoreConfig = {
  /** Schlüssel der Zeile in store_data – nach dem Anlegen NICHT mehr ändern. */
  id: string;
  name: string;
  address: string;
  /** Bundesland für die gesetzlichen Feiertage. */
  holidayState: HolidayState;
};

export const STORES: StoreConfig[] = [
  {
    id: "maisen",
    name: "Mai Sen (DVB Gastro GmbH)",
    address: "Beethovenallee 9, 53173 Bonn-Bad Godesberg",
    holidayState: "NW", // Bonn liegt in Nordrhein-Westfalen
  },
];

/**
 * Filialen mit fester Bếp/Bồi-Planung (Rollen, Mindestbesetzung, Stoßzeiten).
 * Mai Sen wurde aus dem Thienlong-Repo abgespalten und übernimmt dessen
 * Regeln; "thienlong" bleibt nur, damit die mitgebrachten Tests weiterlaufen.
 */
export function usesRolePlanning(storeId: string | undefined): boolean {
  return storeId === "maisen" || storeId === "thienlong";
}

/**
 * Mai Sen: zwei Chefs sind immer im Laden (Chef, Nov 2026). Sie springen in
 * Küche und Service ein und schließen auf – fehlende Bếp/Bồi sind daher kein
 * Fehler, sondern nur ein Hinweis „chủ đứng Bếp/Bồi"; die 2-Leute-
 * Öffnungsregel entfällt.
 */
export function ownersCoverService(storeId: string | undefined): boolean {
  return storeId === "maisen";
}

/**
 * Müssen Vollzeit (1) / Azubi (2) feste Ruhetage gewählt haben, bevor geplant
 * wird? Mai Sen: nein (Chef, Nov 2026) – ohne Auswahl legt der Planer die
 * freien Tage selbst; gewählte Tage (z. B. Mo = Ruhetag des Ladens) gelten.
 */
export function fixedDaysOffRequired(storeId: string | undefined): boolean {
  return usesRolePlanning(storeId) && storeId !== "maisen";
}

/**
 * Darf jemand für einen Monat Bếp ↔ Bồi tauschen („Làm được cả Bếp và Bồi",
 * „Tìm cách xếp khác")? Mai Sen: nein – die Küche ist fest besetzt, bei
 * Engpässen kommen Teilzeit-Bồi dazu (Chef, Nov 2026).
 */
export function allowsRoleSwitch(storeId: string | undefined): boolean {
  return usesRolePlanning(storeId) && storeId !== "maisen";
}

export const DEFAULT_STORE_ID = STORES[0].id;

/** Merkt sich die zuletzt gewählte Filiale auf diesem Gerät. */
const STORE_KEY = "stundenzettel-app:store";

export function loadStoreId(): string {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && STORES.some((s) => s.id === saved)) return saved;
  } catch {
    /* ignorieren */
  }
  return DEFAULT_STORE_ID;
}

export function saveStoreId(id: string): void {
  try {
    localStorage.setItem(STORE_KEY, id);
  } catch {
    /* ignorieren */
  }
}

export function storeById(id: string): StoreConfig {
  return STORES.find((s) => s.id === id) ?? STORES[0];
}
