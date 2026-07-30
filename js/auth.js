// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------
// LOCAL mode: passwords are salted + SHA-256 hashed via the browser's built-in
//   Web Crypto API (no plaintext is ever stored). Good for demo / single owner.
// SYNC mode : real email/password auth handled by Supabase (bcrypt server-side,
//   email verification, password reset) — all on the free tier.
//
// Bootstrap rule: the FIRST account created becomes the Administrator so the
// app is usable immediately. Everyone after is a Member until an Admin changes
// their role.
// ---------------------------------------------------------------------------

import { db } from "./db.js";
import { isSyncEnabled } from "./config.js";

const SESSION_KEY = "church.v1.session";

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

export const auth = {
  current: null,

  async init() {
    const id = localStorage.getItem(SESSION_KEY);
    if (id) this.current = await db.get("users", id);
    return this.current;
  },

  async register(form) {
    if (!validEmail(form.email)) throw new Error("Please enter a valid email address.");
    if (!form.password || form.password.length < 8)
      throw new Error("Password must be at least 8 characters.");

    const users = await db.list("users");
    if (users.some(u => (u.email || "").toLowerCase() === form.email.toLowerCase()))
      throw new Error("An account with that email already exists.");

    const isFirst = users.length === 0;
    const salt = randomSalt();
    const record = {
      email: form.email.trim(),
      passwordHash: isSyncEnabled() ? undefined : await hash(form.password, salt),
      salt: isSyncEnabled() ? undefined : salt,
      role: isFirst ? "administrator" : "member",
      // Registration details
      name: form.name || "",
      surname: form.surname || "",
      age: form.age || "",
      gender: form.gender || "",
      school: form.school || "",
      cellNumber: form.cellNumber || "",
      homeAddress: form.homeAddress || "",
      familyGroup: form.familyGroup || "",
      occupation: form.occupation || "",
      company: form.company || "",
      domainCell: form.domainCell || "church",
      consent: Boolean(form.consent)
    };

    const user = await db.insert("users", record);
    localStorage.setItem(SESSION_KEY, user.id);
    this.current = user;
    return user;
  },

  async login(email, password) {
    const users = await db.list("users");
    const user = users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("No account found for that email.");
    const attempt = await hash(password, user.salt || "");
    if (attempt !== user.passwordHash) throw new Error("Incorrect password.");
    localStorage.setItem(SESSION_KEY, user.id);
    this.current = user;
    return user;
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
    this.current = null;
  },

  async refresh() {
    if (this.current) this.current = await db.get("users", this.current.id);
    return this.current;
  },

  // --- Role helpers ---------------------------------------------------------
  is(...roles) { return this.current && roles.includes(this.current.role); },
  isAdmin()    { return this.is("administrator"); },
  canConfigure(){ return this.is("administrator", "pastoral_core", "senior_pastor"); },
  canPublishGlobal() { return this.is("administrator", "pastoral_core", "senior_pastor"); },
  canLeadCell() { return this.is("administrator", "pastoral_core", "senior_pastor", "cell_leader"); }
};
