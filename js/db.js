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
  "roster", "preaching", "groupDuties", "resourceCategories"
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

// All records live in one generic table `records`
//   (id text pk, collection text, created_at int8, data jsonb)
// so any collection works without per-table columns. See SETUP-SUPABASE.md.
const TABLE = "records";
const flat = r => r ? ({ ...r.data, id: r.id, createdAt: r.created_at }) : null;

const remote = {
  async list(c) {
    const s = await supabase();
    const { data, error } = await s.from(TABLE).select("id,created_at,data")
      .eq("collection", c).order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(flat);
  },
  async get(c, id) {
    const s = await supabase();
    const { data } = await s.from(TABLE).select("id,created_at,data")
      .eq("collection", c).eq("id", id).maybeSingle();
    return flat(data);
  },
  async insert(c, obj) {
    const s = await supabase();
    const id = obj.id || uid();
    const createdAt = obj.createdAt || Date.now();
    const row = { ...obj, id, createdAt };
    const { error } = await s.from(TABLE).insert({ id, collection: c, created_at: createdAt, data: row });
    if (error) throw error;
    return row;
  },
  async update(c, id, patch) {
    const s = await supabase();
    const cur = await this.get(c, id);
    const merged = { ...(cur || {}), ...patch, id, createdAt: cur ? cur.createdAt : Date.now() };
    const { error } = await s.from(TABLE).update({ data: merged }).eq("collection", c).eq("id", id);
    if (error) throw error;
    return merged;
  },
  async remove(c, id) {
    const s = await supabase();
    await s.from(TABLE).delete().eq("collection", c).eq("id", id);
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
