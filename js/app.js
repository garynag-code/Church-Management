// ---------------------------------------------------------------------------
// APP — UI, routing and all feature logic
// ---------------------------------------------------------------------------
import { db } from "./db.js";
import { auth } from "./auth.js";
import { DOMAIN_CELLS, ROLES, isSyncEnabled, APP_VERSION, APP_DATE, APP_URL } from "./config.js";
import { notify, initNotifications } from "./notifications.js";

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = ts => new Date(ts).toLocaleString();
const roleName = id => (ROLES.find(r => r.id === id) || {}).name || id;
const cellName = id => (DOMAIN_CELLS.find(c => c.id === id) || {}).name || id;
const memberName = x => `${x.name || ""} ${x.surname || ""}`.trim() || (x.email || "Member");
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const evTs = d => new Date(d + "T00:00:00").getTime();
const dayFmt = d => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const todayStr = () => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const safeUrl = u => { const s = String(u || "").trim(); return /^https?:\/\//i.test(s) ? s : ""; };
async function getSettings() { const s = await db.list("settings"); return s[0] || {}; }
async function saveSettings(patch) { const s = await db.list("settings"); return s[0] ? db.update("settings", s[0].id, patch) : db.insert("settings", patch); }
const RES_KINDS = { listening: "Recommended listening", reading: "Recommended reading", kids: "EGC Kingdom Image (Kids)", youth: "EGC Youth Ministry" };
// Build a CSV (Excel-friendly, UTF-8 BOM) and trigger a download in the browser.
function downloadCsv(filename, columns, rows) {
  const cell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [columns.map(c => cell(c.label)).join(",")];
  rows.forEach(r => lines.push(columns.map(c => cell(c.get(r))).join(",")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
const MEMBER_COLUMNS = [
  { label: "Name", get: x => x.name }, { label: "Surname", get: x => x.surname },
  { label: "Role", get: x => roleName(x.role) }, { label: "Domain cell", get: x => cellName(x.domainCell) },
  { label: "Email", get: x => x.email }, { label: "Cell number", get: x => x.cellNumber },
  { label: "Family group", get: x => x.familyGroup }, { label: "Occupation", get: x => x.occupation },
  { label: "Company", get: x => x.company }, { label: "Age", get: x => x.age },
  { label: "Gender", get: x => x.gender }, { label: "School", get: x => x.school },
  { label: "Home address", get: x => x.homeAddress }
];
// Resource targeting: any domain cell, a ministry (kids/youth), or the whole church.
const resTargetOptions = () => [...DOMAIN_CELLS.map(c => ({ id: c.id, name: c.name })), { id: "kids", name: "EGC Kingdom Image (Kids)" }, { id: "youth", name: "EGC Youth Ministry" }];
const resTargetName = id => (resTargetOptions().find(x => x.id === id) || {}).name || id;
const resTarget = r => r.target || (r.kind === "kids" || r.kind === "youth" ? r.kind : "church");
const resScope = r => r.scope || "global";
const resCategory = r => r.category || (r.kind && r.kind !== "kids" && r.kind !== "youth" ? r.kind : "");
// Full resource line: title link + optional topic + global/local classification.
const resLinkFull = r => {
  const url = safeUrl(r.url), cat = resCategory(r);
  return `<div class="item">
    <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}
      ${cat ? `<span class="pill local">${esc(cat)}</span>` : ""}
      <span class="pill ${resScope(r) === "global" ? "global" : "local"}">${resScope(r) === "global" ? "Global" : "Local"}</span></h3>
    ${r.note ? `<div class="meta">${esc(r.note)}</div>` : ""}
  </div>`;
};
const resLink = r => { const url = safeUrl(r.url); return `<div class="item"><h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}</h3>${r.note ? `<div class="meta">${esc(r.note)}</div>` : ""}</div>`; };
const DUTIES = { communion: "Communion", prayer: "Prayer", ushering: "Ushering" };
const monthLabel = ym => { if (!ym) return ""; const [y, m] = ym.split("-"); return `${MONTHS[(+m) - 1] || ""} ${y}`; };
const thisMonth = () => todayStr().slice(0, 7);
// Shared renderer for the serving roster, grouped by month.
function rosterMonthsHtml(roster, groups, withRemove) {
  const gName = id => (groups.find(g => g.id === id) || {}).name || "";
  const byM = {};
  roster.forEach(r => { (byM[r.month] ||= []).push(r); });
  const months = Object.keys(byM).sort();
  if (!months.length) return `<div class="empty">No roster set yet.</div>`;
  return months.map(mo => {
    const items = byM[mo];
    const grp = gName(items[0].groupId);
    const byDuty = {};
    items.forEach(r => { (byDuty[r.duty] ||= []).push(r); });
    return `<div class="item">
      <h3>${monthLabel(mo)}${grp ? ` <span class="pill local">${esc(grp)} on ministry</span>` : ""}</h3>
      ${Object.keys(DUTIES).map(d => (byDuty[d] && byDuty[d].length) ? `<div class="meta"><b>${DUTIES[d]}:</b> ${byDuty[d].map(r => esc(r.memberName) + (withRemove ? ` <a href="#" data-delroster="${r.id}" title="remove" style="color:var(--danger);text-decoration:none">✕</a>` : "")).join(", ")}</div>` : "").join("")}
    </div>`;
  }).join("");
}
// Church-level roles see the full member database and every cell/group.
const seeAllMembers = () => auth.canConfigure(); // admin + pastoral core + senior pastors
// Who may edit/remove a post (announcement or event): its author, any
// church-level leader, or the cell leader of a local post's cell.
function canManagePost(p) {
  const u = auth.current;
  if (auth.canConfigure()) return true;
  if (p.authorId === u.id) return true;
  if (u.role === "cell_leader" && p.scope === "local" && p.cellId === u.domainCell) return true;
  return false;
}

let view = "home";
let deferredInstall = null; // captured beforeinstallprompt event (Android/Chrome)
let editAnn = null;   // announcement id being edited in the Admin hub
let editEvent = null; // event id being edited in the Admin hub

// ---------------------------------------------------------------------------
// AUTH SCREEN
// ---------------------------------------------------------------------------
function authScreen() {
  const cellOpts = DOMAIN_CELLS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("#root").innerHTML = `
    <div class="auth-wrap">
      <div class="auth-hero">
        <img src="./icons/logo.jpg" alt="Ecclesia Glocal Church" style="width:280px;max-width:82%;height:auto">
        <h1 style="font-size:18px;margin:8px 0 2px">Family Connect</h1>
        <small class="hint">${isSyncEnabled() ? "Synced across your church" : "Running free · local mode"}</small>
        <div class="hint" style="margin-top:4px">v${esc(APP_VERSION)} · ${esc(APP_DATE)}</div>
      </div>
      <div class="tabs">
        <button id="tab-login" class="active">Sign in</button>
        <button id="tab-reg">Register</button>
      </div>

      <form id="login-form" class="card">
        <label>Email</label><input name="email" type="email" autocomplete="email" required>
        <label>Password</label><input name="password" type="password" autocomplete="current-password" required>
        <div class="error hidden" id="login-err"></div>
        <div style="height:12px"></div>
        <button class="btn" type="submit">Sign in</button>
        ${isSyncEnabled() ? `<div style="text-align:center;margin-top:10px"><a href="#" id="forgot-link" class="hint">Forgot password?</a></div>` : ""}
      </form>

      <form id="reg-form" class="card hidden">
        <div class="notice">The first account created becomes the <b>Administrator</b>.</div>
        <div class="grid2">
          <div><label>Name</label><input name="name" required></div>
          <div><label>Surname</label><input name="surname" required></div>
          <div><label>Age</label><input name="age" type="number" min="0" max="120"></div>
          <div><label>Gender</label>
            <select name="gender"><option value="">—</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select>
          </div>
          <div><label>School (if applicable)</label><input name="school"></div>
          <div><label>Cell number</label><input name="cellNumber" type="tel"></div>
          <div><label>Email</label><input name="email" type="email" required></div>
          <div><label>Password (min 8)</label><input name="password" type="password" minlength="8" required></div>
          <div><label>Family group name</label><input name="familyGroup"></div>
          <div><label>Occupation</label><input name="occupation"></div>
          <div><label>Company</label><input name="company"></div>
          <div><label>Domain Cell</label><select name="domainCell">${cellOpts}</select></div>
        </div>
        <label>Home address</label><textarea name="homeAddress" rows="2"></textarea>
        <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px">
          <input type="checkbox" name="consent" style="width:auto;margin-top:3px" required>
          <span class="hint">I consent to my details being stored for church administration (POPIA/GDPR).</span>
        </label>
        <div class="error hidden" id="reg-err"></div>
        <div style="height:12px"></div>
        <button class="btn gold" type="submit">Create account</button>
      </form>
    </div>`;

  $("#tab-login").onclick = () => { $("#login-form").classList.remove("hidden"); $("#reg-form").classList.add("hidden"); $("#tab-login").classList.add("active"); $("#tab-reg").classList.remove("active"); };
  $("#tab-reg").onclick = () => { $("#reg-form").classList.remove("hidden"); $("#login-form").classList.add("hidden"); $("#tab-reg").classList.add("active"); $("#tab-login").classList.remove("active"); };

  $("#login-form").onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await auth.login(f.email, f.password); boot(); }
    catch (err) { const el = $("#login-err"); el.textContent = err.message; el.classList.remove("hidden"); }
  };
  const forgot = $("#forgot-link");
  if (forgot) forgot.onclick = async e => {
    e.preventDefault();
    const email = ($("#login-form [name=email]").value || "").trim();
    const el = $("#login-err");
    if (!email) { el.textContent = "Enter your email above first, then tap Forgot password."; el.classList.remove("hidden"); return; }
    try { await auth.resetPassword(email); el.textContent = "If that email has an account, a reset link is on its way."; el.classList.remove("hidden"); }
    catch (err) { el.textContent = err.message; el.classList.remove("hidden"); }
  };
  $("#reg-form").onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await auth.register(f);
      await notify("Welcome!", "Your account is ready.");
      boot();
    } catch (err) { const el = $("#reg-err"); el.textContent = err.message; el.classList.remove("hidden"); }
  };
}

// ---------------------------------------------------------------------------
// SHELL
// ---------------------------------------------------------------------------
function shell(inner) {
  const u = auth.current;
  const navItems = [
    ["home", "🏠", "Home"], ["upcoming", "📅", "Upcoming"], ["cells", "🌐", "Cells"],
    ["groups", "📍", "Groups"], ["prayer", "🙏", "Prayer"], ["testimonies", "✨", "My Testimony"],
    ["resources", "📚", "Resources"], ["kids", "🧒", "EGC Kids"], ["youth", "🔥", "EGC Youth"],
    ...(auth.canLeadCell() ? [["admin", "🛠️", "Admin"]] : []),
    ["more", "⚙️", "More"]
  ];
  $("#root").innerHTML = `
    <div class="topbar">
      <img class="logo" src="./icons/icon.svg" alt="">
      <div><h1>EGC Family Connect</h1><div style="font-size:10px;opacity:.85">v${esc(APP_VERSION)} · ${esc(APP_DATE)}</div></div>
      <div class="who">${esc(u.name)} ${esc(u.surname)}<br><span class="badge">${esc(roleName(u.role))}</span></div>
    </div>
    <div class="app"><div class="view" id="view">${inner}</div></div>
    <nav class="nav">
      ${navItems.map(([id, ico, label]) =>
        `<button data-nav="${id}" class="${view === id ? "active" : ""}"><span class="ico">${ico}</span>${label}</button>`).join("")}
    </nav>`;
  document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => { view = b.dataset.nav; render(); });
}

// ---------------------------------------------------------------------------
// VIEWS
// ---------------------------------------------------------------------------
async function homeView() {
  const u = auth.current;
  const all = await db.list("announcements");
  const events = await db.list("events");

  // Announcements relevant to this user; important pinned first, then newest.
  const feed = all.filter(a => a.scope === "global" || a.cellId === u.domainCell)
    .sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || b.createdAt - a.createdAt);
  const important = feed.filter(a => a.important).slice(0, 3);

  // This week: events in the next 7 days relevant to this user.
  const today = todayStr();
  const weekEnd = (() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const week = events
    .filter(e => (e.scope === "global" || e.cellId === u.domainCell) && e.date >= today && e.date <= weekEnd)
    .sort((a, b) => evTs(a) - evTs(b));

  return `
    <div class="card">
      <h2>Welcome, ${esc(u.name)} 👋</h2>
      <p class="sub">${esc(cellName(u.domainCell))} · ${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
    </div>

    ${important.length ? `
    <div class="card" style="border-left:4px solid var(--gold)">
      <h2>📌 Important</h2>
      ${important.map(a => `
        <div class="item">
          <h3>${esc(a.title)}</h3>
          <div class="meta">${esc(a.authorName)} · ${fmt(a.createdAt)}</div>
          <p>${esc(a.body)}</p>
        </div>`).join("")}
    </div>` : ""}

    <div class="card">
      <h2>This week</h2>
      ${week.length ? week.map(e => `
        <div class="item">
          <h3>${esc(e.title)} <span class="pill ${e.scope}">${e.scope === "global" ? "Church-wide" : esc(cellName(e.cellId))}</span></h3>
          <div class="meta">📅 ${dayFmt(e.date)}${e.note ? " · " + esc(e.note) : ""}</div>
        </div>`).join("") : `<div class="empty">Nothing scheduled this week.</div>`}
    </div>

    <div class="card">
      <h2>Announcements</h2>
      ${feed.length ? feed.map(a => `
        <div class="item">
          <h3>${a.important ? "📌 " : ""}${esc(a.title)} <span class="pill ${a.scope}">${a.scope === "global" ? "Church-wide" : esc(cellName(a.cellId))}</span></h3>
          <div class="meta">${esc(a.authorName)} · ${fmt(a.createdAt)}</div>
          <p>${esc(a.body)}</p>
        </div>`).join("") : `<div class="empty">No announcements yet.</div>`}
    </div>`;
}

async function upcomingView() {
  const u = auth.current;
  const seeAll = seeAllMembers(); // admins/pastoral/senior see the whole church
  const all = await db.list("events");
  const events = (seeAll ? all : all.filter(e => e.scope === "global" || e.cellId === u.domainCell))
    .sort((a, b) => evTs(a) - evTs(b));
  const today = todayStr();
  const upcoming = events.filter(e => e.date >= today);
  const past = events.filter(e => e.date < today).reverse(); // most recent first
  const roster = (await db.list("roster")).filter(r => r.month >= thisMonth());
  const groups = await db.list("connectGroups");

  const row = e => `
    <div class="item">
      <h3>${esc(e.title)} <span class="pill ${e.scope}">${e.scope === "global" ? "Church-wide" : esc(cellName(e.cellId))}</span></h3>
      <div class="meta">📅 ${dayFmt(e.date)}${e.note ? " · " + esc(e.note) : ""}</div>
    </div>`;

  return `
    <div class="card">
      <h2>🗓️ Serving roster</h2>
      <p class="sub">Communion, Prayer and Ushering duties by month.</p>
      ${rosterMonthsHtml(roster, groups, false)}
    </div>
    <div class="card">
      <h2>Upcoming Events 📅</h2>
      <p class="sub">All ${seeAll ? "church" : "church &amp; cell"} activities, earliest first.</p>
      ${upcoming.length ? upcoming.map(row).join("") : `<div class="empty">Nothing scheduled yet.</div>`}
    </div>
    ${past.length ? `
    <div class="card">
      <h2 style="opacity:.7">Past events</h2>
      ${past.slice(0, 20).map(e => `
        <div class="item" style="opacity:.6">
          <h3>${esc(e.title)} <span class="pill ${e.scope}">${e.scope === "global" ? "Church-wide" : esc(cellName(e.cellId))}</span></h3>
          <div class="meta">${dayFmt(e.date)}${e.note ? " · " + esc(e.note) : ""}</div>
        </div>`).join("")}
    </div>` : ""}`;
}

async function cellsView() {
  const u = auth.current;
  const users = await db.list("users");
  const leaders = await db.list("cellLeaders");
  const seeAll = seeAllMembers();
  return `
    <div class="card">
      <h2>Domain Cells</h2>
      <p class="sub">The <b>Church</b> is the primary domain with the master member database. Join any cell below. Leaders are drawn from the member database, and see only the members of their cell.</p>
    </div>
    ${DOMAIN_CELLS.map(c => {
      const members = users.filter(x => x.domainCell === c.id);
      const cLeaders = leaders.filter(l => l.cellId === c.id);
      const mine = u.domainCell === c.id;
      const iLeadThis = cLeaders.some(l => l.userId === u.id) || (u.role === "cell_leader" && u.domainCell === c.id);
      const canViewMembers = seeAll || iLeadThis || u.domainCell === c.id; // members see their own cell's contacts
      const leaderIds = new Set(cLeaders.map(l => l.userId));
      return `
      <div class="card">
        <h2>${esc(c.name)} ${c.primary ? `<span class="pill global">Primary</span>` : ""}</h2>
        <p class="sub">${members.length} member(s)${cLeaders.length ? " · Leaders: " + cLeaders.map(l => esc(l.name)).join(", ") : " · No leaders yet"}</p>
        <div class="row">
          ${mine ? `<button class="btn ghost sm" disabled>✓ Your cell</button>`
                 : `<button class="btn sm" data-join="${c.id}">Join ${esc(c.name)}</button>`}
        </div>
        ${canViewMembers ? `
          <div style="margin-top:12px" class="meta"><b>Contacts in ${esc(c.name)}</b></div>
          ${members.length ? members.map(m => `
            <div class="item">
              <h3>${esc(memberName(m))} ${leaderIds.has(m.id) ? `<span class="pill role">Leader</span>` : ""}</h3>
              <div class="meta">${esc(m.email || "")}${m.cellNumber ? " · " + esc(m.cellNumber) : ""}</div>
            </div>`).join("") : `<div class="empty">No members in this cell yet.</div>`}
        ` : ""}
      </div>`;
    }).join("")}`;
}

async function groupsView() {
  const u = auth.current;
  const groups = (await db.list("connectGroups")).sort((a, b) => b.createdAt - a.createdAt);
  const users = await db.list("users");
  const visits = (await db.list("visits")).filter(x => x.status !== "done");
  const allDuties = await db.list("groupDuties");
  const prayers = await db.list("prayerRequests");
  const testis = await db.list("testimonies");

  const dutyRow = (d, leader) => `
    <div class="item">
      <h3>${esc(d.task)} ${d.done ? `<span class="pill role">Done</span>` : ""}</h3>
      <div class="meta">${esc(d.memberName)}${d.date ? " · " + dayFmt(d.date) : ""}</div>
      <div class="row" style="margin-top:6px">
        <button class="btn ghost sm" data-dutytoggle="${d.id}">${d.done ? "Mark not done" : "Mark done"}</button>
        ${leader ? `<button class="btn ghost sm" data-dutydel="${d.id}">Remove</button>` : ""}
      </div>
    </div>`;

  return `
    <div class="card">
      <h2>Connect Groups</h2>
      <p class="sub">Geographical groups that meet monthly. You see the contacts of groups you belong to or lead.</p>
    </div>
    ${groups.length ? groups.map(g => {
      const isLeader = g.leaderId === u.id || auth.canConfigure();
      const memberIds = g.members || [];
      const gMembers = users.filter(x => memberIds.includes(x.id));
      const canViewGroup = isLeader || memberIds.includes(u.id);
      const gVisits = visits.filter(x => (x.groupIds || []).includes(g.id));
      const gDuties = allDuties.filter(d => d.groupId === g.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const myDuties = gDuties.filter(d => d.memberId === u.id);
      const memberOpts = gMembers.map(m => `<option value="${m.id}">${esc(memberName(m))}</option>`).join("");
      const inGroup = memberIds.includes(u.id);
      return `
      <div class="card">
        <h2>${esc(g.name)} <span class="pill local">📍 ${esc(g.area)}</span></h2>
        <p class="sub">Leader: ${esc(g.leaderName)} · ${memberIds.length} member(s)</p>
        <div class="row">
          ${g.leaderId === u.id ? `<button class="btn ghost sm" disabled>✓ You lead this group</button>`
            : inGroup ? `<button class="btn ghost sm" data-groupleave="${g.id}">Leave group</button>`
            : `<button class="btn sm" data-groupjoin="${g.id}">Join ${esc(g.name)}</button>`}
        </div>
        ${isLeader && gVisits.length ? `
          <div class="meta" style="margin-top:6px"><b>🙋 Visit requests</b></div>
          ${gVisits.map(x => `
            <div class="item">
              <h3>${esc(x.requesterName)}</h3>
              <div class="meta">${esc(x.contact || "")}${x.note ? " · " + esc(x.note) : ""} · ${fmt(x.createdAt)}</div>
              <button class="btn ghost sm" data-visitdone="${x.id}" style="margin-top:6px">Mark done</button>
            </div>`).join("")}` : ""}
        ${isLeader ? `
          <div class="meta" style="margin-top:10px"><b>🗓️ Assign a weekly duty</b></div>
          <form class="duty-assign-form" data-group="${g.id}">
            <div class="row">
              <div><label>Member</label><select name="memberId" required><option value="">Select…</option>${memberOpts}</select></div>
              <div><label>Week (date)</label><input name="date" type="date" required></div>
            </div>
            <label>Duty / task</label><input name="task" placeholder="e.g. Lead worship, bring refreshments" required>
            <div style="height:8px"></div>
            <button class="btn sm" type="submit">Assign duty</button>
          </form>
          ${gDuties.length ? `<div class="meta" style="margin-top:8px"><b>This group's duties</b></div>${gDuties.map(d => dutyRow(d, true)).join("")}` : ""}
          <div class="meta" style="margin-top:10px"><b>📊 Engagement report</b></div>
          ${gMembers.length ? gMembers.map(m => {
            const md = gDuties.filter(x => x.memberId === m.id);
            const done = md.filter(x => x.done).length;
            return `<div class="item">
              <h3>${esc(memberName(m))}</h3>
              <div class="meta">Duties ${done}/${md.length} done · 🙏 ${prayers.filter(x => x.authorId === m.id).length} prayer(s) · ✨ ${testis.filter(x => x.authorId === m.id).length} testimony(ies)</div>
            </div>`;
          }).join("") : `<div class="empty">No members yet.</div>`}
        ` : ""}
        ${(!isLeader && memberIds.includes(u.id) && myDuties.length) ? `
          <div class="meta" style="margin-top:6px"><b>🗓️ My duties</b></div>
          ${myDuties.map(d => dutyRow(d, false)).join("")}` : ""}
        ${canViewGroup ? `
          <div style="margin-top:10px" class="meta"><b>Contacts in this group</b></div>
          ${gMembers.length ? gMembers.map(m => `
            <div class="item">
              <h3>${esc(memberName(m))}</h3>
              <div class="meta">${esc(m.email || "")}${m.cellNumber ? " · " + esc(m.cellNumber) : ""}</div>
            </div>`).join("") : `<div class="empty">No members added yet.</div>`}
        ` : `<div class="meta" style="margin-top:6px">Join this group to see its contacts.</div>`}
      </div>`;
    }).join("") : `<div class="empty">No connect groups yet.</div>`}`;
}

async function prayerView() {
  const u = auth.current;
  const reqs = (await db.list("prayerRequests"))
    .filter(r => !r.isPrivate || r.authorId === u.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  return `
    <div class="card">
      <h2>Prayer Tools</h2>
      <p class="sub">A moment to focus. Breathe, read, and pray.</p>
      <div class="item"><p>“Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.” — Philippians 4:6</p></div>
      <button class="btn ghost sm" id="prayer-timer">Start 3-minute prayer timer</button>
      <div id="timer-out" class="meta" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <h2>🙋 Request a visit</h2>
      <p class="sub">Ask for a pastoral visit — it goes to your Connect Group leader and the church admins.</p>
      <form id="visit-form">
        <textarea name="note" rows="2" placeholder="Anything we should know? (optional)"></textarea>
        <div style="height:8px"></div>
        <button class="btn gold" type="submit">Request a visit</button>
      </form>
    </div>
    <div class="card">
      <h2>New prayer request</h2>
      <form id="prayer-form">
        <textarea name="text" rows="2" placeholder="What can we pray for?" required></textarea>
        <label style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <input type="checkbox" name="isPrivate" style="width:auto"> <span class="hint">Keep private (only visible to me)</span>
        </label>
        <div style="height:10px"></div>
        <button class="btn" type="submit">Share request</button>
      </form>
    </div>
    <div class="card">
      <h2>Prayer wall</h2>
      ${reqs.length ? reqs.map(r => `
        <div class="item">
          <p>${esc(r.text)} ${r.answered ? `<span class="pill role">Answered 🙌</span>` : ""} ${r.isPrivate ? `<span class="pill local">Private</span>` : ""}</p>
          <div class="meta">${esc(r.authorName)} · ${fmt(r.createdAt)} · 🙏 ${r.prayedCount || 0} prayed</div>
          <div class="row" style="margin-top:6px">
            <button class="btn ghost sm" data-pray="${r.id}">I prayed</button>
            ${r.authorId === u.id && !r.answered ? `<button class="btn gold sm" data-answered="${r.id}">Mark answered</button>` : ""}
          </div>
        </div>`).join("") : `<div class="empty">No prayer requests yet.</div>`}
    </div>`;
}

async function testimoniesView() {
  const u = auth.current;
  const all = await db.list("testimonies");
  const visible = all.filter(t => t.approved || t.authorId === u.id || auth.canConfigure())
    .sort((a, b) => b.createdAt - a.createdAt);
  return `
    <div class="card">
      <h2>Share a testimony</h2>
      <p class="sub">Testimonies are reviewed by leaders before appearing publicly.</p>
      <form id="testi-form">
        <textarea name="text" rows="3" placeholder="Share what God has done…" required></textarea>
        <div style="height:10px"></div>
        <button class="btn gold" type="submit">Submit for review</button>
      </form>
    </div>
    <div class="card">
      <h2>Testimonies</h2>
      ${visible.length ? visible.map(t => `
        <div class="item">
          <p>${esc(t.text)} ${!t.approved ? `<span class="pill local">Pending review</span>` : ""}</p>
          <div class="meta">${esc(t.authorName)} · ${fmt(t.createdAt)}</div>
        </div>`).join("") : `<div class="empty">No testimonies yet.</div>`}
    </div>`;
}

async function moreView() {
  const u = auth.current;
  const notifs = (await db.list("notifications")).filter(n => n.userId === u.id || n.userId === "all")
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  return `
    <div class="card">
      <h2>📲 Invite your church</h2>
      <p class="sub">Share the app so members can join Ecclesia Glocal Church Family Connect.</p>
      <div class="row">
        <button class="btn gold sm" id="share-whatsapp">Share on WhatsApp</button>
        <button class="btn ghost sm" id="share-native">Share…</button>
        <button class="btn ghost sm" id="copy-link">Copy link</button>
      </div>
      <div class="meta" id="share-status" style="margin-top:8px">${esc(APP_URL)}</div>
    </div>

    <div class="card">
      <h2>Notifications & Reminders</h2>
      <p class="sub">Reminders for meetings, feedback and duties.</p>
      <button class="btn ghost sm" id="enable-push">Enable device notifications</button>
      <div style="margin-top:8px">
        ${notifs.length ? notifs.map(n => `<div class="item"><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><div class="meta">${fmt(n.createdAt)}</div></div>`).join("") : `<div class="empty">No notifications.</div>`}
      </div>
    </div>

    <div class="card">
      <h2>My profile</h2>
      <p class="sub">Your record in the member database — edit and save.</p>
      <form id="profile-form">
        <div class="grid2">
          <div><label>Name</label><input name="name" value="${esc(u.name || "")}" required></div>
          <div><label>Surname</label><input name="surname" value="${esc(u.surname || "")}" required></div>
          <div><label>Age</label><input name="age" type="number" min="0" max="120" value="${esc(u.age || "")}"></div>
          <div><label>Gender</label><select name="gender">${["", "Female", "Male", "Other", "Prefer not to say"].map(g => `<option value="${g}" ${(u.gender || "") === g ? "selected" : ""}>${g || "—"}</option>`).join("")}</select></div>
          <div><label>School</label><input name="school" value="${esc(u.school || "")}"></div>
          <div><label>Cell number</label><input name="cellNumber" type="tel" value="${esc(u.cellNumber || "")}"></div>
          <div><label>Email</label><input name="email" type="email" value="${esc(u.email || "")}"></div>
          <div><label>Family group</label><input name="familyGroup" value="${esc(u.familyGroup || "")}"></div>
          <div><label>Occupation</label><input name="occupation" value="${esc(u.occupation || "")}"></div>
          <div><label>Company</label><input name="company" value="${esc(u.company || "")}"></div>
          <div><label>Domain Cell</label><select name="domainCell">${DOMAIN_CELLS.map(c => `<option value="${c.id}" ${u.domainCell === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
        </div>
        <label>Home address</label><textarea name="homeAddress" rows="2">${esc(u.homeAddress || "")}</textarea>
        <div class="error hidden" id="profile-err"></div>
        <div style="height:10px"></div>
        <button class="btn" type="submit">Save profile</button>
      </form>
    </div>

    <div class="card">
      <h2>📲 Add to Home Screen</h2>
      <p class="sub">Install the app for a full-screen, native feel and quick access.</p>
      <button class="btn gold sm" id="install-app">Add to Home Screen</button>
      <div class="meta" id="install-status" style="margin:6px 0 4px"></div>
      <div class="item">
        <h3>iPhone / iPad (Safari)</h3>
        <div class="meta">Tap <b>Share</b> (the box with an ↑) → scroll down → <b>Add to Home Screen</b> → <b>Add</b>.</div>
      </div>
      <div class="item">
        <h3>Android (Chrome)</h3>
        <div class="meta">Tap the <b>⋮</b> menu (top-right) → <b>Add to Home screen</b> (or <b>Install app</b>) → <b>Add</b>.</div>
      </div>
      <div class="item">
        <h3>Samsung Internet</h3>
        <div class="meta">Tap the <b>≡</b> menu → <b>Add page to</b> → <b>Home screen</b>.</div>
      </div>
      <div class="meta">Then open it from the new icon on your home screen — it runs full-screen like a normal app.</div>
    </div>

    <div class="card">
      <h2>About & data</h2>
      <p class="sub">Mode: <b>${db.mode === "sync" ? "Synced (Supabase free tier)" : "Local (this device)"}</b></p>
      <div class="meta">Ecclesia Glocal Church Family Connect · v${esc(APP_VERSION)} · ${esc(APP_DATE)}</div>
      <div style="height:10px"></div>
      <button class="btn danger sm" id="logout">Sign out</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// RESOURCES + MINISTRY tabs (display)
// ---------------------------------------------------------------------------
async function resourcesView() {
  const u = auth.current;
  const res = await db.list("resources");
  const s = await getSettings();
  const yt = safeUrl(s.youtubeUrl), fb = safeUrl(s.facebookUrl), sermon = safeUrl(s.sermonUrl);

  // Non-ministry resources visible to this viewer:
  //  - global (whole church) or church-targeted: everyone
  //  - local to a domain: only members of that domain (admins/leadership see all)
  const visible = res.filter(r => {
    const t = resTarget(r);
    if (t === "kids" || t === "youth") return false;
    if (seeAllMembers()) return true;
    if (resScope(r) === "global" || t === "church") return true;
    return t === u.domainCell;
  });
  const byT = {};
  visible.forEach(r => { (byT[resTarget(r)] ||= []).push(r); });
  const order = DOMAIN_CELLS.map(c => c.id).filter(id => (byT[id] || []).length);

  return `
    <div class="card">
      <h2>Resources 📚</h2>
      <p class="sub">Ecclesia Glocal media, sermons and recommendations for the church and your domain.</p>
      <div class="row">
        ${yt ? `<a class="btn sm" href="${esc(yt)}" target="_blank" rel="noopener">▶ YouTube channel</a>` : ""}
        ${fb ? `<a class="btn ghost sm" href="${esc(fb)}" target="_blank" rel="noopener">Facebook page</a>` : ""}
      </div>
      ${sermon ? `<div class="item" style="margin-top:8px"><h3>🎬 Latest sermon</h3><a href="${esc(sermon)}" target="_blank" rel="noopener">${esc(s.sermonTitle || "Watch the latest sermon")}</a></div>` : ""}
      ${!yt && !fb && !sermon ? `<div class="empty">Links will appear here once an admin adds them.</div>` : ""}
    </div>
    ${order.length ? order.map(t => `
      <div class="card">
        <h2>${esc(cellName(t))}${t === "church" ? " (church-wide)" : ""}</h2>
        ${byT[t].sort((a, b) => b.createdAt - a.createdAt).map(resLinkFull).join("")}
      </div>`).join("")
      : `<div class="card"><div class="empty">No resources for you yet.</div></div>`}`;
}

async function kidsView() {
  const res = (await db.list("resources")).filter(r => resTarget(r) === "kids").sort((a, b) => b.createdAt - a.createdAt);
  return `
    <div class="card">
      <h2>EGC Kingdom Image 🧒</h2>
      <p class="sub">Kids ministry — faith-filled resources for our children.</p>
    </div>
    <div class="card">
      <h2>Resources</h2>
      ${res.length ? res.map(resLinkFull).join("") : `<div class="empty">Resources coming soon.</div>`}
    </div>`;
}

async function youthView() {
  const res = (await db.list("resources")).filter(r => resTarget(r) === "youth").sort((a, b) => b.createdAt - a.createdAt);
  return `
    <div class="card">
      <h2>EGC Youth Ministry 🔥</h2>
      <p class="sub">Resources, teaching and links for our youth.</p>
    </div>
    <div class="card">
      <h2>Resources</h2>
      ${res.length ? res.map(resLinkFull).join("") : `<div class="empty">Resources coming soon.</div>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// ADMIN — the single hub for creating / managing everything
// ---------------------------------------------------------------------------
async function adminView() {
  const u = auth.current;
  const users = await db.list("users");
  const groups = (await db.list("connectGroups")).sort((a, b) => b.createdAt - a.createdAt);
  const meetings = await db.list("meetings");
  const leaders = await db.list("cellLeaders");
  const pending = (await db.list("testimonies")).filter(t => !t.approved).sort((a, b) => b.createdAt - a.createdAt);
  const resources = (await db.list("resources")).sort((a, b) => b.createdAt - a.createdAt);
  const visits = (await db.list("visits")).filter(x => x.status !== "done").sort((a, b) => b.createdAt - a.createdAt);
  const announcements = (await db.list("announcements")).sort((a, b) => b.createdAt - a.createdAt).filter(canManagePost);
  const events = (await db.list("events")).sort((a, b) => evTs(b) - evTs(a)).filter(canManagePost);
  const roster = (await db.list("roster")).filter(r => r.month >= thisMonth());
  const preaching = (await db.list("preaching")).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const categories = (await db.list("resourceCategories")).sort((a, b) => a.name.localeCompare(b.name));
  const st = await getSettings();
  const admins = users.filter(x => x.role === "administrator");
  const groupLeaderIds = new Set(groups.map(g => g.leaderId).filter(Boolean));
  const leaderMembers = users.filter(x => ["pastoral_core", "senior_pastor", "cell_leader"].includes(x.role) || groupLeaderIds.has(x.id));
  const scopeSel = (val) => `<select name="scope">${auth.canPublishGlobal() ? `<option value="global" ${val === "global" ? "selected" : ""}>Church-wide</option>` : ""}<option value="local" ${val === "local" ? "selected" : ""}>Local (a cell)</option></select>`;
  const cellSel = (val) => `<select name="cellId">${DOMAIN_CELLS.map(c => `<option value="${c.id}" ${val === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;
  const memberOptions = users.map(m => `<option value="${m.id}">${esc(memberName(m))}</option>`).join("");
  const cellOpts = DOMAIN_CELLS.filter(c => auth.canPublishGlobal() || c.id === u.domainCell)
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

  return `
    <div class="card">
      <h2>Admin 🛠️</h2>
      <p class="sub">Create and manage everything here. The other tabs stay clean for viewing.</p>
    </div>

    <div class="card">
      <h2>📣 Post an announcement</h2>
      <form id="ann-form">
        <label>Title</label><input name="title" required>
        <label>Message</label><textarea name="body" rows="2" required></textarea>
        <div class="row">
          <div><label>Scope</label>
            <select name="scope">
              ${auth.canPublishGlobal() ? `<option value="global">Global (whole church)</option>` : ""}
              <option value="local">Local (a cell)</option>
            </select>
          </div>
          <div><label>Cell (for local)</label><select name="cellId">${cellOpts}</select></div>
        </div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px">
          <input type="checkbox" name="important" style="width:auto"> <span class="hint">Mark as important (pinned on the landing page)</span>
        </label>
        <div style="height:10px"></div>
        <button class="btn" type="submit">Publish</button>
      </form>
    </div>

    <div class="card">
      <h2>✏️ Manage announcements</h2>
      ${announcements.length ? announcements.map(a => editAnn === a.id ? `
        <form class="item ann-edit-form" data-id="${a.id}">
          <label>Title</label><input name="title" value="${esc(a.title)}" required>
          <label>Message</label><textarea name="body" rows="2" required>${esc(a.body)}</textarea>
          <div class="row">
            <div><label>Scope</label>${scopeSel(a.scope)}</div>
            <div><label>Cell (for local)</label>${cellSel(a.cellId)}</div>
          </div>
          <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" name="important" ${a.important ? "checked" : ""} style="width:auto"> <span class="hint">Important</span></label>
          <div class="row" style="margin-top:8px">
            <button class="btn sm" type="submit">Save</button>
            <button class="btn ghost sm" type="button" data-canceledit="ann">Cancel</button>
          </div>
        </form>` : `
        <div class="item">
          <h3>${a.important ? "📌 " : ""}${esc(a.title)} <span class="pill ${a.scope}">${a.scope === "global" ? "Church-wide" : esc(cellName(a.cellId))}</span></h3>
          <div class="meta">${esc(a.authorName)} · ${fmt(a.createdAt)}</div>
          <div class="row" style="margin-top:6px">
            <button class="btn ghost sm" data-editann="${a.id}">Edit</button>
            <button class="btn ghost sm" data-delann="${a.id}">Remove</button>
          </div>
        </div>`).join("") : `<div class="empty">No announcements you can manage.</div>`}
    </div>

    <div class="card">
      <h2>📅 Add a calendar activity</h2>
      <form id="event-form">
        <label>Title</label><input name="title" required>
        <div class="row">
          <div><label>Date</label><input name="date" type="date" required></div>
          <div><label>Scope</label>
            <select name="scope">
              ${auth.canPublishGlobal() ? `<option value="global">Church-wide</option>` : ""}
              <option value="local">My cell</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div><label>Cell (for local)</label><select name="cellId">${cellOpts}</select></div>
          <div><label>Note (optional)</label><input name="note"></div>
        </div>
        <div style="height:10px"></div>
        <button class="btn" type="submit">Add activity</button>
      </form>
    </div>

    <div class="card">
      <h2>✏️ Manage activities</h2>
      ${events.length ? events.map(e => editEvent === e.id ? `
        <form class="item event-edit-form" data-id="${e.id}">
          <label>Title</label><input name="title" value="${esc(e.title)}" required>
          <div class="row">
            <div><label>Date</label><input name="date" type="date" value="${esc(e.date)}" required></div>
            <div><label>Scope</label>${scopeSel(e.scope)}</div>
          </div>
          <div class="row">
            <div><label>Cell (for local)</label>${cellSel(e.cellId)}</div>
            <div><label>Note</label><input name="note" value="${esc(e.note || "")}"></div>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn sm" type="submit">Save</button>
            <button class="btn ghost sm" type="button" data-canceledit="event">Cancel</button>
          </div>
        </form>` : `
        <div class="item">
          <h3>${esc(e.title)} <span class="pill ${e.scope}">${e.scope === "global" ? "Church-wide" : esc(cellName(e.cellId))}</span></h3>
          <div class="meta">${dayFmt(e.date)}${e.note ? " · " + esc(e.note) : ""}</div>
          <div class="row" style="margin-top:6px">
            <button class="btn ghost sm" data-editevent="${e.id}">Edit</button>
            <button class="btn ghost sm" data-delevent="${e.id}">Remove</button>
          </div>
        </div>`).join("") : `<div class="empty">No activities you can manage.</div>`}
    </div>

    ${auth.canConfigure() ? `
    <div class="card">
      <h2>👑 Assign domain cell leaders</h2>
      ${DOMAIN_CELLS.map(c => {
        const cl = leaders.filter(l => l.cellId === c.id);
        return `
        <div class="item">
          <h3>${esc(c.name)}</h3>
          <div class="meta">${cl.length ? "Leaders: " + cl.map(l => esc(l.name)).join(", ") : "No leaders yet"}</div>
          <form class="row addleader-form" data-cell="${c.id}" style="margin-top:6px">
            <select name="userId" required><option value="">Select a member…</option>${memberOptions}</select>
            <button class="btn gold sm" type="submit">Make leader</button>
          </form>
        </div>`;
      }).join("")}
    </div>` : ""}

    <div class="card">
      <h2>📍 Connect groups</h2>
      <form id="group-form" class="row">
        <input name="name" placeholder="Group name" required>
        <input name="area" placeholder="Area / suburb" required>
        <button class="btn sm" type="submit">Create</button>
      </form>
      ${groups.length ? groups.map(g => {
        const gm = meetings.filter(m => m.groupId === g.id).sort((a, b) => b.date - a.date);
        return `
        <div class="item">
          <h3>${esc(g.name)} <span class="pill local">📍 ${esc(g.area)}</span></h3>
          <div class="meta">Leader: ${esc(g.leaderName)} · ${(g.members || []).length} member(s)${gm.length ? " · last meeting " + fmt(gm[0].date) : ""}</div>
          <div class="row" style="margin-top:6px">
            <button class="btn ghost sm" data-meeting="${g.id}">+ Log meeting</button>
            <button class="btn ghost sm" data-feedback="${g.id}">+ Feedback</button>
          </div>
          <form class="row addmember-form" data-group="${g.id}" style="margin-top:6px">
            <select name="userId" required><option value="">Add a member…</option>${memberOptions}</select>
            <button class="btn gold sm" type="submit">Add</button>
          </form>
          ${(g.members || []).length ? `<div class="meta" style="margin-top:6px">Members: ${(g.members || []).map(mid => { const m = users.find(x => x.id === mid); return m ? `${esc(memberName(m))} <a href="#" data-groupremove="${g.id}:${mid}" title="remove from group" style="color:var(--danger);text-decoration:none">✕</a>` : ""; }).filter(Boolean).join(" · ")}</div>` : ""}
        </div>`;
      }).join("") : `<div class="empty">No connect groups yet.</div>`}
    </div>

    ${auth.canConfigure() ? `
    <div class="card">
      <h2>✨ Testimonies awaiting approval</h2>
      ${pending.length ? pending.map(t => `
        <div class="item">
          <p>${esc(t.text)}</p>
          <div class="meta">${esc(t.authorName)} · ${fmt(t.createdAt)}</div>
          <button class="btn ghost sm" data-approve="${t.id}" style="margin-top:6px">Approve</button>
        </div>`).join("") : `<div class="empty">Nothing pending.</div>`}
    </div>` : ""}

    <div class="card">
      <h2>🙋 Visit requests</h2>
      ${visits.length ? visits.map(x => `
        <div class="item">
          <h3>${esc(x.requesterName)}${(x.groupIds || []).length ? "" : ` <span class="pill local">no group</span>`}</h3>
          <div class="meta">${esc(x.contact || "")}${x.note ? " · " + esc(x.note) : ""} · ${fmt(x.createdAt)}</div>
          <button class="btn ghost sm" data-visitdone="${x.id}" style="margin-top:6px">Mark done</button>
        </div>`).join("") : `<div class="empty">No open visit requests.</div>`}
    </div>

    <div class="card">
      <h2>🔔 Send a reminder / duty</h2>
      <form id="duty-form" class="row">
        <input name="text" placeholder="Reminder or duty for everyone…" required>
        <button class="btn sm" type="submit">Send</button>
      </form>
    </div>

    ${auth.canConfigure() ? `
    <div class="card">
      <h2>🗓️ Serving roster</h2>
      <p class="sub">Pick the month and the connect group on ministry, then assign its members to Communion, Prayer and Ushering.</p>
      <form id="roster-form">
        <div class="row">
          <div><label>Month</label><input name="month" type="month" value="${thisMonth()}" required></div>
          <div><label>Connect group on ministry</label>
            <select name="groupId" id="roster-group" required>${groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="row">
          <div><label>Duty</label><select name="duty">${Object.entries(DUTIES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
          <div><label>Member (of that group)</label><select name="memberId" id="roster-member" required></select></div>
        </div>
        <div style="height:10px"></div>
        <button class="btn" type="submit">Assign to roster</button>
      </form>
      <div style="margin-top:10px">${rosterMonthsHtml(roster, groups, true)}</div>
    </div>

    <div class="card">
      <h2>📖 Preaching roster <span class="pill role">Admin only</span></h2>
      <p class="sub">Visible to church leadership only — never shown to members, even when other rosters are published.</p>
      <form id="preach-form">
        <div class="row">
          <div><label>Date</label><input name="date" type="date" required></div>
          <div><label>Preacher</label><input name="preacher" required></div>
        </div>
        <label>Topic / notes (optional)</label><input name="topic">
        <div style="height:10px"></div>
        <button class="btn gold" type="submit">Add to preaching roster</button>
      </form>
      ${preaching.length ? preaching.map(pr => `
        <div class="item">
          <h3>${esc(pr.preacher)}</h3>
          <div class="meta">${esc(dayFmt(pr.date))}${pr.topic ? " · " + esc(pr.topic) : ""}</div>
          <button class="btn ghost sm" data-delpreach="${pr.id}" style="margin-top:6px">Remove</button>
        </div>`).join("") : `<div class="empty">No preaching assignments yet.</div>`}
    </div>` : ""}

    <div class="card">
      <h2>🔗 Church links</h2>
      <p class="sub">YouTube channel + latest sermon and Facebook page shown on the Resources tab. Paste full https links.</p>
      <form id="links-form">
        <label>YouTube channel URL</label><input name="youtubeUrl" type="url" value="${esc(st.youtubeUrl || "")}" placeholder="https://www.youtube.com/@...">
        <label>Facebook page URL</label><input name="facebookUrl" type="url" value="${esc(st.facebookUrl || "")}" placeholder="https://www.facebook.com/...">
        <label>Latest sermon — title</label><input name="sermonTitle" value="${esc(st.sermonTitle || "")}" placeholder="e.g. Forming Christ, Driving Change">
        <label>Latest sermon — video URL</label><input name="sermonUrl" type="url" value="${esc(st.sermonUrl || "")}" placeholder="https://youtu.be/...">
        <small class="hint">Auto-fetching the newest video needs the Supabase backend (YouTube RSS); for now paste the latest sermon link here.</small>
        <div style="height:10px"></div>
        <button class="btn" type="submit">Save links</button>
      </form>
    </div>

    <div class="card">
      <h2>📚 Resources & ministry links</h2>
      <label>Resource categories (e.g. Marriage, Finance, Parenting, Work, Business, Relationships)</label>
      <form id="category-form" class="row">
        <input name="name" placeholder="New category name" required>
        <button class="btn sm" type="submit">Add category</button>
      </form>
      ${categories.length ? `<div class="meta" style="margin:6px 0 12px">${categories.map(c => `${esc(c.name)} <a href="#" data-delcat="${c.id}" title="remove category" style="color:var(--danger);text-decoration:none">✕</a>`).join(" · ")}</div>` : `<div class="meta" style="margin:6px 0 12px">No categories yet — add a few above.</div>`}
      <form id="resource-form">
        <div class="row">
          <div><label>For (domain / ministry)</label>
            <select name="target">
              ${resTargetOptions().map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}
            </select>
          </div>
          <div><label>Classification</label>
            <select name="scope">
              <option value="global">Global (whole church)</option>
              <option value="local">Local (that domain/ministry only)</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div><label>Topic (optional)</label>
            <select name="category">
              <option value="">— none —</option>
              ${categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div><label>Title</label><input name="title" required></div>
        </div>
        <label>Link (URL)</label><input name="url" type="url" placeholder="https://..." required>
        <label>Note (optional)</label><input name="note">
        <div style="height:10px"></div>
        <button class="btn gold" type="submit">Add resource</button>
      </form>
      ${resources.length ? resources.map(r => `
        <div class="item">
          <h3>${esc(r.title)} <span class="pill local">${esc(resTargetName(resTarget(r)))}</span> <span class="pill ${resScope(r) === "global" ? "global" : "local"}">${resScope(r) === "global" ? "Global" : "Local"}</span>${resCategory(r) ? ` <span class="pill local">${esc(resCategory(r))}</span>` : ""}</h3>
          <div class="meta">${esc(safeUrl(r.url) || r.url || "")}</div>
          <button class="btn ghost sm" data-delres="${r.id}" style="margin-top:6px">Remove</button>
        </div>`).join("") : ""}
    </div>

    ${auth.isAdmin() ? `
    <div class="card">
      <h2>🗂️ Directory & export <span class="pill role">Admin</span></h2>
      <p class="sub">${users.length} members · ${admins.length} administrators · ${leaderMembers.length} leaders. Export opens in Excel.</p>
      <div class="row">
        <button class="btn sm" data-export="all">Export members (CSV)</button>
        <button class="btn ghost sm" data-export="leaders">Export leaders</button>
        <button class="btn ghost sm" data-export="admins">Export admins</button>
      </div>
      <div class="row" style="margin-top:8px">
        <div><label>Export a domain cell</label>
          <select id="export-cell">${DOMAIN_CELLS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
        </div>
        <div style="display:flex;align-items:flex-end"><button class="btn ghost sm" id="export-cell-btn" type="button">Export cell</button></div>
      </div>
      <div class="row">
        <div><label>Export a connect group</label>
          <select id="export-group">${groups.length ? groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("") : `<option value="">No groups yet</option>`}</select>
        </div>
        <div style="display:flex;align-items:flex-end"><button class="btn ghost sm" id="export-group-btn" type="button">Export group</button></div>
      </div>
      <div class="meta" style="margin-top:10px"><b>Administrators</b></div>
      ${admins.length ? admins.map(x => `<div class="item"><h3>${esc(memberName(x))}</h3><div class="meta">${esc(x.email || "no login")} · ${esc(cellName(x.domainCell))}</div></div>`).join("") : `<div class="empty">None.</div>`}
      <div class="meta" style="margin-top:10px"><b>Leaders</b></div>
      ${leaderMembers.length ? leaderMembers.map(x => `<div class="item"><h3>${esc(memberName(x))} <span class="pill role">${esc(roleName(x.role))}</span></h3><div class="meta">${esc(x.email || "")} · ${esc(cellName(x.domainCell))}</div></div>`).join("") : `<div class="empty">None yet.</div>`}
    </div>

    <div class="card">
      <h2>👥 Member database <span class="pill role">Admin</span></h2>
      <p class="sub">${users.length} member(s). Add people and manage roles.</p>
      <label>Add a person to the member database</label>
      <form id="addperson-form" class="grid2">
        <div><input name="name" placeholder="Name" required></div>
        <div><input name="surname" placeholder="Surname" required></div>
        <div><input name="email" type="email" placeholder="Email (optional)"></div>
        <div><select name="domainCell">${DOMAIN_CELLS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
      </form>
      <button class="btn gold sm" id="addperson-btn" style="margin:4px 0 12px">+ Add to member database</button>
      ${users.map(x => `
        <div class="item">
          <h3>${esc(memberName(x))}</h3>
          <div class="meta">${esc(x.email || "no login")}</div>
          <div class="row" style="margin-top:6px">
            <div><label>Role</label>
              <select data-role-for="${x.id}">
                ${ROLES.map(r => `<option value="${r.id}" ${r.id === x.role ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
              </select>
            </div>
            <div><label>Domain cell</label>
              <select data-cell-for="${x.id}">
                ${DOMAIN_CELLS.map(c => `<option value="${c.id}" ${x.domainCell === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
              </select>
            </div>
          </div>
          ${x.id === u.id ? `<div class="meta" style="margin-top:6px">(this is you)</div>` : `<button class="btn ghost sm" data-deluser="${x.id}" style="margin-top:6px">Remove from database</button>`}
        </div>`).join("")}
    </div>` : ""}`;
}

// ---------------------------------------------------------------------------
// RENDER + EVENT WIRING
// ---------------------------------------------------------------------------
const VIEWS = { home: homeView, upcoming: upcomingView, cells: cellsView, groups: groupsView, prayer: prayerView, testimonies: testimoniesView, resources: resourcesView, kids: kidsView, youth: youthView, admin: adminView, more: moreView };

async function render() {
  await auth.refresh();
  const inner = await VIEWS[view]();
  shell(inner);
  wire();
}

function wire() {
  const u = auth.current;
  const v = $("#view");
  if (!v) return;

  // Announcements
  const annForm = $("#ann-form");
  if (annForm) annForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const scope = auth.canPublishGlobal() ? f.scope : "local";
    await db.insert("announcements", {
      title: f.title, body: f.body, scope,
      cellId: scope === "global" ? null : f.cellId,
      important: !!f.important,
      authorId: u.id, authorName: `${u.name} ${u.surname}`
    });
    await notify("New announcement", f.title);
    render();
  };
  // Edit / remove announcements
  v.querySelectorAll("[data-editann]").forEach(b => b.onclick = () => { editAnn = b.dataset.editann; render(); });
  v.querySelectorAll("[data-delann]").forEach(b => b.onclick = async () => {
    if (confirm("Remove this announcement?")) { await db.remove("announcements", b.dataset.delann); render(); }
  });
  v.querySelectorAll(".ann-edit-form").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const scope = auth.canPublishGlobal() ? d.scope : "local";
    await db.update("announcements", f.dataset.id, { title: d.title, body: d.body, scope, cellId: scope === "global" ? null : d.cellId, important: !!d.important });
    editAnn = null; render();
  });

  // Calendar: add / remove events
  const evForm = $("#event-form");
  if (evForm) evForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (!f.title || !f.date) return;
    const scope = auth.canPublishGlobal() ? (f.scope || "global") : "local";
    await db.insert("events", {
      title: f.title, date: f.date, note: f.note || "", scope,
      cellId: scope === "global" ? null : (f.cellId || u.domainCell),
      authorId: u.id, authorName: `${u.name} ${u.surname}`
    });
    await notify("Event added", `${f.title} · ${dayFmt(f.date)}`);
    render();
  };
  v.querySelectorAll("[data-delevent]").forEach(b => b.onclick = async () => {
    if (confirm("Remove this activity?")) { await db.remove("events", b.dataset.delevent); render(); }
  });
  v.querySelectorAll("[data-editevent]").forEach(b => b.onclick = () => { editEvent = b.dataset.editevent; render(); });
  v.querySelectorAll(".event-edit-form").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const scope = auth.canPublishGlobal() ? d.scope : "local";
    await db.update("events", f.dataset.id, { title: d.title, date: d.date, note: d.note || "", scope, cellId: scope === "global" ? null : d.cellId });
    editEvent = null; render();
  });
  v.querySelectorAll("[data-canceledit]").forEach(b => b.onclick = () => {
    if (b.dataset.canceledit === "ann") editAnn = null; else editEvent = null;
    render();
  });

  // Serving roster: assign members of the chosen group to a duty
  const rForm = $("#roster-form");
  if (rForm) {
    const rgSel = $("#roster-group"), rmSel = $("#roster-member");
    (async () => {
      const groups = await db.list("connectGroups");
      const users = await db.list("users");
      const fill = () => {
        const g = groups.find(x => x.id === rgSel.value);
        const ids = g ? (g.members || []) : [];
        const opts = users.filter(x => ids.includes(x.id));
        rmSel.innerHTML = opts.length ? opts.map(m => `<option value="${m.id}">${esc(memberName(m))}</option>`).join("") : `<option value="">(no members in this group)</option>`;
      };
      rgSel.onchange = fill; fill();
    })();
    rForm.onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (!f.memberId) { alert("That group has no members yet — add members to the group first."); return; }
      const m = await db.get("users", f.memberId);
      await db.insert("roster", { month: f.month, groupId: f.groupId, duty: f.duty, memberId: f.memberId, memberName: m ? memberName(m) : "" });
      await notify("Roster updated", `${DUTIES[f.duty]} · ${monthLabel(f.month)}`);
      render();
    };
  }
  v.querySelectorAll("[data-delroster]").forEach(b => b.onclick = async e => { e.preventDefault(); await db.remove("roster", b.dataset.delroster); render(); });

  // Preaching roster (admin-only card)
  const preachForm = $("#preach-form");
  if (preachForm) preachForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await db.insert("preaching", { date: f.date, preacher: f.preacher, topic: (f.topic || "").trim() });
    render();
  };
  v.querySelectorAll("[data-delpreach]").forEach(b => b.onclick = async () => { await db.remove("preaching", b.dataset.delpreach); render(); });

  // Cells: join a cell
  v.querySelectorAll("[data-join]").forEach(b => b.onclick = async () => {
    await db.update("users", u.id, { domainCell: b.dataset.join });
    render();
  });
  // Cells: promote an existing member to leader (linked to the member database)
  v.querySelectorAll(".addleader-form").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const cellId = f.dataset.cell;
    const userId = f.querySelector("[name=userId]").value;
    if (!userId) return;
    const m = await db.get("users", userId);
    await db.insert("cellLeaders", { cellId, userId, name: memberName(m) });
    // Promote to Domain Cell Leader without demoting higher (church-level) roles.
    if (!m.role || m.role === "member") await db.update("users", userId, { role: "cell_leader", domainCell: cellId });
    await notify("Leader assigned", `${memberName(m)} now leads ${cellName(cellId)}.`);
    render();
  });

  // Groups
  const gForm = $("#group-form");
  if (gForm) gForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await db.insert("connectGroups", { name: f.name, area: f.area, leaderId: u.id, leaderName: `${u.name} ${u.surname}`, members: [] });
    render();
  };
  // Groups: add an existing member (linked to the member database)
  v.querySelectorAll(".addmember-form").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const groupId = f.dataset.group;
    const userId = f.querySelector("[name=userId]").value;
    if (!userId) return;
    const g = await db.get("connectGroups", groupId);
    const members = g.members || [];
    if (!members.includes(userId)) members.push(userId);
    await db.update("connectGroups", groupId, { members });
    render();
  });
  v.querySelectorAll("[data-meeting]").forEach(b => b.onclick = async () => {
    const notes = prompt("Meeting notes (attendance, topics):");
    if (notes === null) return;
    await db.insert("meetings", { groupId: b.dataset.meeting, date: Date.now(), notes });
    await notify("Meeting logged", "Monthly meeting recorded.");
    render();
  });
  v.querySelectorAll("[data-feedback]").forEach(b => b.onclick = async () => {
    const text = prompt("Feedback to the pastoral team:");
    if (!text) return;
    await db.insert("feedback", { groupId: b.dataset.feedback, text, authorId: u.id, authorName: `${u.name} ${u.surname}` });
    render();
  });

  // Request a visit (routed to the member's connect-group leaders + admins)
  const visitForm = $("#visit-form");
  if (visitForm) visitForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const groups = await db.list("connectGroups");
    const myGroups = groups.filter(g => (g.members || []).includes(u.id)).map(g => g.id);
    await db.insert("visits", {
      requesterId: u.id, requesterName: `${u.name} ${u.surname}`,
      contact: u.cellNumber || u.email || "", note: (f.note || "").trim(),
      groupIds: myGroups, status: "open"
    });
    await notify("Visit requested", "Your request was sent to your leaders and admins.");
    render();
  };
  v.querySelectorAll("[data-visitdone]").forEach(b => b.onclick = async () => {
    await db.update("visits", b.dataset.visitdone, { status: "done" });
    render();
  });

  // Members self-join / leave a connect group
  v.querySelectorAll("[data-groupjoin]").forEach(b => b.onclick = async () => {
    const g = await db.get("connectGroups", b.dataset.groupjoin);
    if (!g) return;
    const members = g.members || [];
    if (!members.includes(u.id)) { members.push(u.id); await db.update("connectGroups", g.id, { members }); }
    render();
  });
  v.querySelectorAll("[data-groupleave]").forEach(b => b.onclick = async () => {
    const g = await db.get("connectGroups", b.dataset.groupleave);
    if (!g) return;
    await db.update("connectGroups", g.id, { members: (g.members || []).filter(m => m !== u.id) });
    render();
  });

  // Weekly duties assigned by connect-group leaders
  v.querySelectorAll(".duty-assign-form").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (!d.memberId) return;
    const m = await db.get("users", d.memberId);
    await db.insert("groupDuties", { groupId: f.dataset.group, memberId: d.memberId, memberName: m ? memberName(m) : "", date: d.date, task: d.task, done: false, assignedBy: u.id });
    await db.insert("notifications", { userId: d.memberId, title: "New duty assigned", body: `${d.task}${d.date ? " (" + d.date + ")" : ""}` });
    await notify("Duty assigned", d.task);
    render();
  });
  v.querySelectorAll("[data-dutytoggle]").forEach(b => b.onclick = async () => {
    const d = await db.get("groupDuties", b.dataset.dutytoggle);
    if (d) await db.update("groupDuties", d.id, { done: !d.done });
    render();
  });
  v.querySelectorAll("[data-dutydel]").forEach(b => b.onclick = async () => {
    await db.remove("groupDuties", b.dataset.dutydel);
    render();
  });

  // Resources & church links
  const linksForm = $("#links-form");
  if (linksForm) linksForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await saveSettings({
      youtubeUrl: safeUrl(f.youtubeUrl), facebookUrl: safeUrl(f.facebookUrl),
      sermonUrl: safeUrl(f.sermonUrl), sermonTitle: (f.sermonTitle || "").trim()
    });
    await notify("Links saved", "Church links updated.");
    render();
  };
  const catForm = $("#category-form");
  if (catForm) catForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const name = (f.name || "").trim();
    if (!name) return;
    const existing = await db.list("resourceCategories");
    if (!existing.some(c => c.name.toLowerCase() === name.toLowerCase())) await db.insert("resourceCategories", { name });
    render();
  };
  v.querySelectorAll("[data-delcat]").forEach(b => b.onclick = async e => {
    e.preventDefault();
    await db.remove("resourceCategories", b.dataset.delcat);
    render();
  });
  const resForm = $("#resource-form");
  if (resForm) resForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (!safeUrl(f.url)) { alert("Please enter a full link starting with http:// or https://"); return; }
    await db.insert("resources", {
      target: f.target || "church", scope: f.scope || "global", category: (f.category || "").trim(),
      title: f.title, url: safeUrl(f.url), note: (f.note || "").trim()
    });
    await notify("Resource added", f.title);
    render();
  };
  v.querySelectorAll("[data-delres]").forEach(b => b.onclick = async () => {
    await db.remove("resources", b.dataset.delres);
    render();
  });

  // Prayer
  const pForm = $("#prayer-form");
  if (pForm) pForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await db.insert("prayerRequests", { text: f.text, isPrivate: !!f.isPrivate, prayedCount: 0, answered: false, authorId: u.id, authorName: f.isPrivate ? "You" : `${u.name} ${u.surname}` });
    render();
  };
  v.querySelectorAll("[data-pray]").forEach(b => b.onclick = async () => {
    const r = await db.get("prayerRequests", b.dataset.pray);
    await db.update("prayerRequests", r.id, { prayedCount: (r.prayedCount || 0) + 1 });
    render();
  });
  v.querySelectorAll("[data-answered]").forEach(b => b.onclick = async () => {
    await db.update("prayerRequests", b.dataset.answered, { answered: true });
    render();
  });
  const timer = $("#prayer-timer");
  if (timer) timer.onclick = () => {
    let s = 180; const out = $("#timer-out");
    out.textContent = "Praying… 3:00";
    const t = setInterval(() => {
      s--; const m = Math.floor(s / 60), sec = String(s % 60).padStart(2, "0");
      out.textContent = s > 0 ? `Praying… ${m}:${sec}` : "🙏 Amen.";
      if (s <= 0) { clearInterval(t); notify("Prayer complete", "Amen."); }
    }, 1000);
  };

  // Testimonies
  const tForm = $("#testi-form");
  if (tForm) tForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await db.insert("testimonies", { text: f.text, approved: false, authorId: u.id, authorName: `${u.name} ${u.surname}` });
    render();
  };
  v.querySelectorAll("[data-approve]").forEach(b => b.onclick = async () => {
    await db.update("testimonies", b.dataset.approve, { approved: true });
    render();
  });

  // More: push, duties, roles, logout
  const push = $("#enable-push");
  if (push) push.onclick = () => initNotifications(true);
  const dForm = $("#duty-form");
  if (dForm) dForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await db.insert("notifications", { userId: "all", title: "Duty / reminder", body: f.text });
    await notify("Duty assigned", f.text);
    render();
  };
  v.querySelectorAll("[data-role-for]").forEach(sel => sel.onchange = async () => {
    await db.update("users", sel.dataset.roleFor, { role: sel.value });
    render();
  });
  // Reallocate a member to a different domain cell
  v.querySelectorAll("[data-cell-for]").forEach(sel => sel.onchange = async () => {
    await db.update("users", sel.dataset.cellFor, { domainCell: sel.value });
    render();
  });
  // Remove a member from the database (with cleanup of leadership + group membership)
  v.querySelectorAll("[data-deluser]").forEach(b => b.onclick = async () => {
    const id = b.dataset.deluser;
    if (id === u.id) return;
    if (!confirm("Remove this person from the member database? This cannot be undone.")) return;
    for (const l of (await db.list("cellLeaders")).filter(x => x.userId === id)) await db.remove("cellLeaders", l.id);
    for (const g of await db.list("connectGroups")) {
      if ((g.members || []).includes(id)) await db.update("connectGroups", g.id, { members: g.members.filter(m => m !== id) });
    }
    await db.remove("users", id);
    render();
  });
  // Remove a member from a connect group
  v.querySelectorAll("[data-groupremove]").forEach(b => b.onclick = async e => {
    e.preventDefault();
    const [gid, mid] = b.dataset.groupremove.split(":");
    const g = await db.get("connectGroups", gid);
    if (g) await db.update("connectGroups", gid, { members: (g.members || []).filter(m => m !== mid) });
    render();
  });
  const pfForm = $("#profile-form");
  if (pfForm) pfForm.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const newEmail = (f.email || "").trim();
    if (newEmail && newEmail.toLowerCase() !== (u.email || "").toLowerCase()) {
      const all = await db.list("users");
      if (all.some(x => x.id !== u.id && (x.email || "").toLowerCase() === newEmail.toLowerCase())) {
        const el = $("#profile-err"); el.textContent = "That email is already in use."; el.classList.remove("hidden");
        return;
      }
    }
    await db.update("users", u.id, {
      name: f.name, surname: f.surname, age: f.age, gender: f.gender, school: f.school,
      cellNumber: f.cellNumber, email: newEmail, familyGroup: f.familyGroup,
      occupation: f.occupation, company: f.company, domainCell: f.domainCell, homeAddress: f.homeAddress
    });
    await auth.refresh();
    await notify("Profile updated", "Your details were saved.");
    render();
  };
  // Directory CSV export
  v.querySelectorAll("[data-export]").forEach(b => b.onclick = async () => {
    const all = await db.list("users");
    const groups = await db.list("connectGroups");
    const groupLeaderIds = new Set(groups.map(g => g.leaderId).filter(Boolean));
    const kind = b.dataset.export;
    let rows = all, name = "members";
    if (kind === "admins") { rows = all.filter(x => x.role === "administrator"); name = "administrators"; }
    else if (kind === "leaders") { rows = all.filter(x => ["pastoral_core", "senior_pastor", "cell_leader"].includes(x.role) || groupLeaderIds.has(x.id)); name = "leaders"; }
    rows = rows.slice().sort((a, b2) => memberName(a).localeCompare(memberName(b2)));
    downloadCsv(`egc-${name}-${todayStr()}.csv`, MEMBER_COLUMNS, rows);
  });
  const ecBtn = $("#export-cell-btn");
  if (ecBtn) ecBtn.onclick = async () => {
    const cid = $("#export-cell").value;
    const rows = (await db.list("users")).filter(x => x.domainCell === cid).sort((a, b) => memberName(a).localeCompare(memberName(b)));
    downloadCsv(`egc-cell-${cid}-${todayStr()}.csv`, MEMBER_COLUMNS, rows);
  };
  const egBtn = $("#export-group-btn");
  if (egBtn) egBtn.onclick = async () => {
    const gid = $("#export-group").value;
    if (!gid) return;
    const g = await db.get("connectGroups", gid);
    const ids = g ? (g.members || []) : [];
    const rows = (await db.list("users")).filter(x => ids.includes(x.id)).sort((a, b) => memberName(a).localeCompare(memberName(b)));
    const slug = (g && g.name ? g.name : gid).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCsv(`egc-group-${slug}-${todayStr()}.csv`, MEMBER_COLUMNS, rows);
  };
  const apBtn = $("#addperson-btn");
  if (apBtn) apBtn.onclick = async () => {
    const form = $("#addperson-form");
    if (!form.reportValidity()) return;
    const f = Object.fromEntries(new FormData(form));
    await db.insert("users", {
      name: f.name, surname: f.surname, email: (f.email || "").trim(),
      domainCell: f.domainCell || "church", role: "member", consent: true, addedByAdmin: true
    });
    await notify("Member added", `${f.name} ${f.surname} added to the member database.`);
    render();
  };
  // Invite / share
  const inviteMsg = `You're invited to join Ecclesia Glocal Church Family Connect 🙏\n\nOur church app for announcements, events, Connect Groups, prayer, testimonies and more.\n\nOpen it here: ${APP_URL}`;
  const waLink = "https://wa.me/?text=" + encodeURIComponent(inviteMsg);
  const waBtn = $("#share-whatsapp");
  if (waBtn) waBtn.onclick = () => window.open(waLink, "_blank", "noopener");
  const snBtn = $("#share-native");
  if (snBtn) snBtn.onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Ecclesia Glocal Church Family Connect", text: inviteMsg, url: APP_URL }); } catch { /* cancelled */ }
    } else { window.open(waLink, "_blank", "noopener"); }
  };
  const cpBtn = $("#copy-link");
  if (cpBtn) cpBtn.onclick = async () => {
    const st = $("#share-status");
    try { await navigator.clipboard.writeText(APP_URL); if (st) st.textContent = "Link copied ✓"; }
    catch { if (st) st.textContent = APP_URL; }
  };

  const installBtn = $("#install-app");
  if (installBtn) installBtn.onclick = async () => {
    const st = $("#install-status");
    if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) {
      if (st) st.textContent = "✓ Already installed — open it from your home screen.";
      return;
    }
    if (deferredInstall) {
      deferredInstall.prompt();
      const { outcome } = await deferredInstall.userChoice;
      deferredInstall = null;
      if (st) st.textContent = outcome === "accepted" ? "✓ Installing… check your home screen." : "No problem — you can install any time.";
    } else if (st) {
      st.textContent = "On iPhone use Safari's Share → Add to Home Screen. On other browsers, use the steps below.";
    }
  };
  const lo = $("#logout");
  if (lo) lo.onclick = async () => { await auth.logout(); boot(); };
}

// ---------------------------------------------------------------------------
// BOOT
async function boot() {
  await auth.init();
  if (auth.current) { view = "home"; render(); }
  else authScreen();
}

// ---------------------------------------------------------------------------
// SEAMLESS BACKGROUND UPDATES
// New code downloads in the background and is applied on the next natural
// reopen — never mid-action, and never touching data or the signed-in session
// (data lives in Supabase / local storage, not in the cached code).
// ---------------------------------------------------------------------------
function showUpdateToast() {
  if (document.getElementById("update-toast")) return;
  const bar = document.createElement("div");
  bar.id = "update-toast";
  bar.className = "update-toast";
  bar.innerHTML = `<span>A new version is ready.</span>
    <button id="update-refresh">Refresh</button>
    <button id="update-dismiss" aria-label="dismiss">✕</button>`;
  document.body.appendChild(bar);
  // Applying is just a reload — it keeps you signed in and loses no data.
  bar.querySelector("#update-refresh").onclick = () => location.reload();
  bar.querySelector("#update-dismiss").onclick = () => bar.remove();
}

// Capture the install prompt (Android/Chrome/Edge) so a button can trigger it.
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; });
window.addEventListener("appinstalled", () => { deferredInstall = null; });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").then(reg => {
    const check = () => { try { reg.update(); } catch { /* ignore */ } };
    check();                                   // check on load
    setInterval(check, 30 * 60 * 1000);        // and every 30 min in the background
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    // When a new version has downloaded and we're already running an old one,
    // offer a gentle, dismissible refresh — we never force it.
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateToast();
      });
    });
  }).catch(() => {});
}
boot();
