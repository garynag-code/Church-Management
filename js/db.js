// ---------------------------------------------------------------------------
// DATA LAYER
// ---------------------------------------------------------------------------
// Exposes one simple API used by the whole app:
//
//   db.list(collection)                -> array
//   db.get(collection, id)             -> object | null
//   db.insert(collection, obj)         -> object (with id)
//   db.update(collection, id, patch)   -> object
//   db.remove(collection, id)          -> void
//
// It transparently uses either localStorage (LOCAL mode) or Supabase's free
// tier (SYNC mode) depending on config.js. The app code never changes.
// ---------------------------------------------------------------------------

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSyncEnabled } from "./config.js";

const COLLECTIONS = [
  "users", "cellLeaders", "announcements", "connectGroups",
  "meetings", "feedback", "prayerRequests", "testimonies",
  "notifications", "duties", "events", "resources", "settings", "visits",
  "roster", "preaching", "groupDuties"
];

function uid() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// --- LOCAL (localStorage) implementation ------------------------------------
const local = {
  key(c) { return "church.v1." + c; },
  list(c) {
    try { return JSON.parse(localStorage.getItem(this.key(c))) || []; }
    catch { return []; }
  },
  save(c, rows) { localStorage.setItem(this.key(c), JSON.stringify(rows)); },
  get(c, id) { return this.list(c).find(r => r.id === id) || null; },
  insert(c, obj) {
    const rows = this.list(c);
    const row = { id: obj.id || uid(), createdAt: obj.createdAt || Date.now(), ...obj };
    rows.push(row);
    this.save(c, rows);
    return row;
  },
  update(c, id, patch) {
    const rows = this.list(c);
    const i = rows.findIndex(r => r.id === id);
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...patch };
    this.save(c, rows);
    return rows[i];
  },
  remove(c, id) {
    this.save(c, this.list(c).filter(r => r.id !== id));
  }
};

// --- SYNC (Supabase) implementation -----------------------------------------
// Loaded lazily so LOCAL mode ships zero external dependencies.
let sb = null;
async function supabase() {
  if (sb) return sb;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return sb;
}

const remote = {
  async list(c) {
    const s = await supabase();
    const { data, error } = await s.from(c).select("*").order("createdAt", { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async get(c, id) {
    const s = await supabase();
    const { data } = await s.from(c).select("*").eq("id", id).maybeSingle();
    return data || null;
  },
  async insert(c, obj) {
    const s = await supabase();
    const row = { id: obj.id || uid(), createdAt: obj.createdAt || Date.now(), ...obj };
    const { data, error } = await s.from(c).insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async update(c, id, patch) {
    const s = await supabase();
    const { data, error } = await s.from(c).update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(c, id) {
    const s = await supabase();
    await s.from(c).delete().eq("id", id);
  }
};

// --- Unified async facade ---------------------------------------------------
const impl = isSyncEnabled() ? remote : local;

export const db = {
  mode: isSyncEnabled() ? "sync" : "local",
  collections: COLLECTIONS,
  uid,
  async list(c)               { return await impl.list(c); },
  async get(c, id)            { return await impl.get(c, id); },
  async insert(c, obj)        { return await impl.insert(c, obj); },
  async update(c, id, patch)  { return await impl.update(c, id, patch); },
  async remove(c, id)         { return await impl.remove(c, id); }
};
