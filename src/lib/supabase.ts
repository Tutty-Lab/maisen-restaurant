// ============================================================================
// Verbindung zur gemeinsamen Supabase-Datenbank. Alle Filialen liegen in
// derselben Tabelle store_data und werden über die store_id auseinander-
// gehalten (siehe stores.ts); umgeschaltet wird im Reiter „Cài đặt".
// ============================================================================

import { createClient } from "@supabase/supabase-js";

// Beide Schreibweisen akzeptieren: VITE_* (selbst gesetzt) und NEXT_PUBLIC_*
// (so legt die Vercel-Supabase-Integration die öffentlichen Schlüssel an).
const env = import.meta.env;

// Mai Sen: eigenes Supabase-Projekt (nicht die gemeinsame DB der anderen
// Filialen). URL und PUBLISHABLE Key sind öffentlich gedacht – sie stehen ohnehin
// im ausgelieferten JavaScript. So läuft ein Vercel-Deploy ohne Env-Variablen;
// gesetzte VITE_*/NEXT_PUBLIC_* gehen weiterhin vor. NIE den Secret-/
// service_role-Key hier eintragen.
const MAISEN_SUPABASE_URL = "https://ewzbjqyaixqilewtaufj.supabase.co";
const MAISEN_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9hOmY63YSjjTEpoSdiYQoA_mSB3qray";

const url: string | undefined =
  env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || MAISEN_SUPABASE_URL;
const anonKey: string | undefined =
  env.VITE_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  MAISEN_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

/** true = Zugangsdaten vorhanden. Fehlen sie, läuft die App nur lokal weiter. */
export const isRemoteConfigured = supabase !== null;
