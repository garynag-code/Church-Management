// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
// The app runs at ZERO cost in two modes:
//
//   1) LOCAL mode (default) — all data lives in the browser (localStorage).
//      Great for trying the app and single-device use. No account needed.
//
//   2) SYNC mode — real cross-user sync + secure login via Supabase's FREE
//      tier. To enable it, create a free project at https://supabase.com,
//      then paste your Project URL and anon (public) key below. Nothing else
//      is required and there is no cost within the free tier.
//
// Leave these blank to stay in LOCAL mode.
// ---------------------------------------------------------------------------

export const SUPABASE_URL = "https://windrtkmygtaixtzkfjs.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpbmRydGtteWd0YWl4dHprZmpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTc0MTQsImV4cCI6MjEwMTAzMzQxNH0.GOMY1dIq4Wjz8_mP8tvT9jBbTLEg6GHzOKNswyoWUeM";

// App version — bump on each release.
export const APP_VERSION = "1.3.2";
export const APP_DATE = "2026-07-31";

// Public URL members open to use / install the app (used by the invite share).
export const APP_URL = "https://garynag-code.github.io/Church-Management/";

// Predefined Domain Cells. "church" is the primary domain (master database).
export const DOMAIN_CELLS = [
  { id: "church",    name: "Church",        primary: true },
  { id: "family",    name: "Family" },
  { id: "politics",  name: "Politics" },
  { id: "business",  name: "Business" },
  { id: "education", name: "Education" },
  { id: "arts",      name: "Arts & Media" }
];

export const ROLES = [
  { id: "administrator", name: "Administrator" },
  { id: "pastoral_core", name: "Pastoral Core" },
  { id: "senior_pastor", name: "Senior Pastor" },
  { id: "cell_leader",   name: "Domain Cell Leader" },
  { id: "member",        name: "Member" }
];

export function isSyncEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
