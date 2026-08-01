// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------
// SYNC mode : real accounts via Supabase Auth (server-side bcrypt, sessions,
//   optional email verification + password reset). The signed-in user's token
//   is what the database's Row Level Security uses to protect data.
// LOCAL mode: salted SHA-256 in the browser (no backend) — for demo/offline.
//
// Bootstrap rule: the FIRST account created becomes the Administrator.
// ---------------------------------------------------------------------------

import { db, getSupabase } from "./db.js";
import { isSyncEnabled } from "./config.js";

const SESSION_KEY = "church.v1.session";
const PENDING_KEY = "church.v1.pendingProfile";

async function hash(password, salt) {
  const data = new TextEncoder().encode(salt + ":" + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// Build the profile fields (no password) from a registration form.
function profileFields(form) {
  return {
    email: (form.email || "").trim(),
    name: form.name || "", surname: form.surname || "", age: form.age || "",
    gender: form.gender || "", school: form.school || "", cellNumber: form.cellNumber || "",
    homeAddress: form.homeAddress || "", familyGroup: form.familyGroup || "",
    occupation: form.occupation || "", company: form.company || "",
    domainCell: form.domainCell || "church", consent: Boolean(form.consent)
  };
}

export const auth = {
  current: null,

  // -------------------------------------------------------------------------
  async init() {
    if (isSyncEnabled()) {
      const sb = await getSupabase();
      const { data } = await sb.auth.getSession();
      if (data.session) this.current = await this._linkProfile(data.session.user, {});
      return this.current;
    }
    const id = localStorage.getItem(SESSION_KEY);
    if (id) this.current = await db.get("users", id);
    return this.current;
  },

  // -------------------------------------------------------------------------
  async register(form) {
    if (!validEmail(form.email)) throw new Error("Please enter a valid email address.");
    if (!form.password || form.password.length < 8)
      throw new Error("Password must be at least 8 characters.");

    if (isSyncEnabled()) {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signUp({ email: form.email.trim(), password: form.password });
      if (error) throw new Error(error.message);
      if (!data.session) {
        // Email confirmation is ON — keep the details for after they confirm + sign in.
        localStorage.setItem(PENDING_KEY, JSON.stringify(profileFields(form)));
        throw new Error("Almost there — check your email to confirm your account, then sign in.");
      }
      this.current = await this._linkProfile(data.session.user, profileFields(form));
      return this.current;
    }

    // LOCAL mode
    const users = await db.list("users");
    if (users.some(u => (u.email || "").toLowerCase() === form.email.toLowerCase()))
      throw new Error("An account with that email already exists.");
    const salt = randomSalt();
    const user = await db.insert("users", {
      ...profileFields(form),
      passwordHash: await hash(form.password, salt), salt,
      role: users.length === 0 ? "administrator" : "member"
    });
    localStorage.setItem(SESSION_KEY, user.id);
    this.current = user;
    return user;
  },

  // -------------------------------------------------------------------------
  async login(email, password) {
    if (isSyncEnabled()) {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
      let pending = {};
      try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"); } catch { pending = {}; }
      this.current = await this._linkProfile(data.user, pending);
      localStorage.removeItem(PENDING_KEY);
      return this.current;
    }

    // LOCAL mode
    const users = await db.list("users");
    const user = users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("No account found for that email.");
    const attempt = await hash(password, user.salt || "");
    if (attempt !== user.passwordHash) throw new Error("Incorrect password.");
    localStorage.setItem(SESSION_KEY, user.id);
    this.current = user;
    return user;
  },

  // Link a Supabase-authenticated user to their profile BY EMAIL, so existing
  // profiles (and all the data that references them) are preserved. Only creates
  // a new profile when none exists for that email.
  async _linkProfile(authUser, extra) {
    const email = (authUser.email || extra.email || "").toLowerCase();
    const users = await db.list("users");
    let profile = users.find(x => (x.email || "").toLowerCase() === email);
    if (!profile) {
      const isFirst = users.length === 0;
      profile = await db.insert("users", {
        email: authUser.email || extra.email || "",
        role: isFirst ? "administrator" : "member",
        ...extra
      });
    }
    return profile;
  },

  // -------------------------------------------------------------------------
  async logout() {
    if (isSyncEnabled()) { const sb = await getSupabase(); try { await sb.auth.signOut(); } catch { /* ignore */ } }
    localStorage.removeItem(SESSION_KEY);
    this.current = null;
  },

  async refresh() {
    if (this.current) this.current = await db.get("users", this.current.id);
    return this.current;
  },

  // Send a password-reset email (sync mode only).
  async resetPassword(email) {
    if (!isSyncEnabled()) throw new Error("Password reset is available in synced mode.");
    const sb = await getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail((email || "").trim());
    if (error) throw new Error(error.message);
  },

  // --- Role helpers ---------------------------------------------------------
  // Every role maps to a capability tier. Built-ins are fixed; custom roles
  // created by an admin register their tier in `roleTiers` (set from settings
  // by the app). Tiers, most to least powerful: admin > leadership > leader > member.
  roleTiers: {},   // { customRoleId: "leadership" | "leader" | "member" }
  tierOf(role) {
    const builtin = {
      administrator: "admin",
      pastoral_core: "leadership", senior_pastor: "leadership",
      cell_leader: "leader", group_leader: "leader",
      member: "member"
    };
    return builtin[role] || this.roleTiers[role] || "member";
  },
  is(...roles) { return this.current && roles.includes(this.current.role); },
  isAdmin()    { return !!this.current && this.tierOf(this.current.role) === "admin"; },
  canConfigure(){ return !!this.current && ["admin", "leadership"].includes(this.tierOf(this.current.role)); },
  canPublishGlobal() { return this.canConfigure(); },
  canLeadCell() { return !!this.current && ["admin", "leadership", "leader"].includes(this.tierOf(this.current.role)); }
};
