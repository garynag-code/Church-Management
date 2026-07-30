// ---------------------------------------------------------------------------
// APP — UI, routing and all feature logic
// ---------------------------------------------------------------------------
import { db } from "./db.js";
import { auth } from "./auth.js";
import { DOMAIN_CELLS, ROLES, isSyncEnabled } from "./config.js";
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
// Church-level roles see the full member database and every cell/group.
const seeAllMembers = () => auth.canConfigure(); // admin + pastoral core + senior pastors

let view = "home";

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
    ["home", "🏠", "Home"], ["calendar", "📅", "Calendar"], ["cells", "🌐", "Cells"],
    ["groups", "📍", "Groups"], ["prayer", "🙏", "Prayer"], ["testimonies", "✨", "My Testimony"],
    ["more", "⚙️", "More"]
  ];
  $("#root").innerHTML = `
    <div class="topbar">
      <img class="logo" src="./icons/icon.svg" alt="">
      <div><h1>EGC Family Connect</h1></div>
      <div class="who">${esc(u.name)} ${esc(u.surname)}<br><span class="badge">${esc(roleName(u.role))}</span></div>
    </div>
    <div class="app"><div class="view" id="view">${inner}</div></div>
    <nav class="nav" style="grid-template-columns:repeat(${navItems.length},1fr)">
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
  const canPost = auth.canLeadCell();
  const cellOpts = DOMAIN_CELLS.filter(c => auth.canPublishGlobal() || c.id === u.domainCell)
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

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

    ${canPost ? `
    <div class="card">
      <h2>Post an announcement</h2>
      <p class="sub">${auth.canPublishGlobal() ? "Global posts reach every Domain Cell." : "You can post locally to your cell."}</p>
      <form id="ann-form">
        <label>Title</label><input name="title" required>
        <label>Message</label><textarea name="body" rows="2" required></textarea>
        <div class="row">
          <div>
            <label>Scope</label>
            <select name="scope">
              ${auth.canPublishGlobal() ? `<option value="global">Global (whole church)</option>` : ""}
              <option value="local">Local (a cell)</option>
            </select>
          </div>
          <div>
            <label>Cell (for local)</label>
            <select name="cellId">${cellOpts}</select>
          </div>
        </div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px">
          <input type="checkbox" name="important" style="width:auto"> <span class="hint">Mark as important (pinned on the landing page)</span>
        </label>
        <div style="height:10px"></div>
        <button class="btn" type="submit">Publish</button>
      </form>
    </div>` : ""}

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

let calCursor = null; // { y, m } month currently shown

async function calendarView() {
  const u = auth.current;
  const seeAll = seeAllMembers(); // admins/pastoral/senior see the whole church
  const all = await db.list("events");
  const events = seeAll ? all : all.filter(e => e.scope === "global" || e.cellId === u.domainCell);
  const canAdd = auth.canLeadCell();
  const today = todayStr();
  if (!calCursor) { const n = new Date(); calCursor = { y: n.getFullYear(), m: n.getMonth() }; }
  const { y, m } = calCursor;

  const monthEvents = events
    .filter(e => { const d = new Date(e.date + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === m; })
    .sort((a, b) => evTs(a) - evTs(b));
  const evByDay = {};
  monthEvents.forEach(e => { const d = new Date(e.date + "T00:00:00").getDate(); (evByDay[d] ||= []).push(e); });

  const startDay = new Date(y, m, 1).getDay();          // 0 = Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const cellOpts = DOMAIN_CELLS.filter(c => auth.canPublishGlobal() || c.id === u.domainCell)
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <button class="btn ghost sm" data-calnav="-1">‹</button>
        <h2 style="margin:0">${MONTHS[m]} ${y} 📅</h2>
        <button class="btn ghost sm" data-calnav="1">›</button>
      </div>
      <p class="sub">${monthEvents.length} activit${monthEvents.length === 1 ? "y" : "ies"}${seeAll ? " · whole church" : " · your church + cell"}</p>
      <div class="cal-grid">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<div class="cal-h">${d}</div>`).join("")}
        ${cells.map(d => {
          if (d === null) return `<div class="cal-cell cal-empty"></div>`;
          const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const evs = evByDay[d] || [];
          return `<div class="cal-cell${ds === today ? " cal-today" : ""}">
            <div class="cal-day">${d}</div>
            ${evs.slice(0, 3).map(e => `<div class="cal-ev ${e.scope}" title="${esc(e.title)}">${esc(e.title)}</div>`).join("")}
            ${evs.length > 3 ? `<div class="cal-more">+${evs.length - 3} more</div>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>

    ${canAdd ? `
    <div class="card">
      <h2>Add an activity</h2>
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
    </div>` : ""}

    <div class="card">
      <h2>Activities in ${MONTHS[m]}</h2>
      ${monthEvents.length ? monthEvents.map(e => `
        <div class="item">
          <h3>${e.date < today ? "<span style='opacity:.45'>✓ </span>" : ""}${esc(e.title)} <span class="pill ${e.scope}">${e.scope === "global" ? "Church-wide" : esc(cellName(e.cellId))}</span></h3>
          <div class="meta">${dayFmt(e.date)}${e.note ? " · " + esc(e.note) : ""}${e.authorName ? " · " + esc(e.authorName) : ""}</div>
          ${(auth.canConfigure() || e.authorId === u.id) ? `<button class="btn ghost sm" data-delevent="${e.id}" style="margin-top:6px">Remove</button>` : ""}
        </div>`).join("") : `<div class="empty">No activities this month.</div>`}
    </div>`;
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
      const canManage = seeAll || iLeadThis;               // add/promote leaders
      const canViewMembers = canManage || u.domainCell === c.id; // members see their own cell's contacts
      const leaderIds = new Set(cLeaders.map(l => l.userId));
      // Leaders can be drawn from the whole member database, not just this cell.
      const memberOpts = users.map(m => `<option value="${m.id}">${esc(memberName(m))}${m.domainCell && m.domainCell !== c.id ? " (" + esc(cellName(m.domainCell)) + ")" : ""}</option>`).join("");
      return `
      <div class="card">
        <h2>${esc(c.name)} ${c.primary ? `<span class="pill global">Primary</span>` : ""}</h2>
        <p class="sub">${members.length} member(s)${cLeaders.length ? " · Leaders: " + cLeaders.map(l => esc(l.name)).join(", ") : " · No leaders yet"}</p>
        <div class="row">
          ${mine ? `<button class="btn ghost sm" disabled>✓ Your cell</button>`
                 : `<button class="btn sm" data-join="${c.id}">Join ${esc(c.name)}</button>`}
        </div>
        ${canManage ? `
          <label>Add a leader (from the member database)</label>
          <form class="row addleader-form" data-cell="${c.id}">
            <select name="userId" required>
              <option value="">Select a member…</option>
              ${memberOpts}
            </select>
            <button class="btn gold sm" type="submit">Make leader</button>
          </form>` : ""}
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
  const canManage = auth.canLeadCell();
  const meetings = await db.list("meetings");
  const feedback = await db.list("feedback");
  const memberOptions = users.map(m => `<option value="${m.id}">${esc(memberName(m))}</option>`).join("");
  return `
    <div class="card">
      <h2>Connect Groups</h2>
      <p class="sub">Geographical groups that meet monthly. Leaders add members from the database, record meetings, and submit feedback — and see only their own group's members.</p>
      ${canManage ? `
      <form id="group-form" class="row">
        <input name="name" placeholder="Group name" required>
        <input name="area" placeholder="Area / suburb" required>
        <button class="btn sm" type="submit">Create</button>
      </form>` : ""}
    </div>
    ${groups.length ? groups.map(g => {
      const gm = meetings.filter(m => m.groupId === g.id).sort((a, b) => b.date - a.date);
      const gf = feedback.filter(f => f.groupId === g.id).sort((a, b) => b.createdAt - a.createdAt);
      const isLeader = g.leaderId === u.id || auth.canConfigure();
      const memberIds = g.members || [];
      const gMembers = users.filter(x => memberIds.includes(x.id));
      const inGroup = memberIds.includes(u.id);
      const canViewGroup = isLeader || inGroup;   // members of the group see its contacts
      return `
      <div class="card">
        <h2>${esc(g.name)} <span class="pill local">📍 ${esc(g.area)}</span></h2>
        <p class="sub">Leader: ${esc(g.leaderName)} · ${memberIds.length} member(s)</p>
        ${isLeader ? `
          <div class="row">
            <button class="btn ghost sm" data-meeting="${g.id}">+ Log monthly meeting</button>
            <button class="btn ghost sm" data-feedback="${g.id}">+ Submit feedback</button>
          </div>
          <label>Add a member (from the member database)</label>
          <form class="row addmember-form" data-group="${g.id}">
            <select name="userId" required><option value="">Select a member…</option>${memberOptions}</select>
            <button class="btn gold sm" type="submit">Add</button>
          </form>` : ""}
        ${canViewGroup ? `
          <div style="margin-top:10px" class="meta"><b>Contacts in this group</b></div>
          ${gMembers.length ? gMembers.map(m => `
            <div class="item">
              <h3>${esc(memberName(m))}</h3>
              <div class="meta">${esc(m.email || "")}${m.cellNumber ? " · " + esc(m.cellNumber) : ""}</div>
            </div>`).join("") : `<div class="empty">No members added yet.</div>`}
        ` : ""}
        ${isLeader && gm.length ? `<div class="item"><div class="meta">Last meeting: ${fmt(gm[0].date)} — ${esc(gm[0].notes || "")}</div></div>` : ""}
        ${isLeader && gf.length ? gf.slice(0, 3).map(f => `<div class="item"><p>💬 ${esc(f.text)}</p><div class="meta">${esc(f.authorName)} · ${fmt(f.createdAt)}</div></div>`).join("") : ""}
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
          ${!t.approved && auth.canConfigure() ? `<button class="btn ghost sm" data-approve="${t.id}" style="margin-top:6px">Approve</button>` : ""}
        </div>`).join("") : `<div class="empty">No testimonies yet.</div>`}
    </div>`;
}

async function moreView() {
  const u = auth.current;
  const users = auth.isAdmin() ? await db.list("users") : [];
  const notifs = (await db.list("notifications")).filter(n => n.userId === u.id || n.userId === "all")
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  return `
    <div class="card">
      <h2>Notifications & Reminders</h2>
      <p class="sub">Free web-push + in-app reminders for meetings, feedback and duties.</p>
      <button class="btn ghost sm" id="enable-push">Enable device notifications</button>
      ${auth.canLeadCell() ? `
        <form id="duty-form" style="margin-top:12px">
          <div class="row">
            <input name="text" placeholder="Assign a duty / reminder…" required>
            <button class="btn sm" type="submit">Send</button>
          </div>
        </form>` : ""}
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

    ${auth.isAdmin() ? `
    <div class="card">
      <h2>Administration <span class="pill role">Admin</span></h2>
      <p class="sub">Master member database: ${users.length} member(s). Full access. Add people here or promote leaders — every person is one linked member record.</p>
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
          <div class="meta">${esc(x.email || "no login")} · ${esc(cellName(x.domainCell))}</div>
          <select data-role-for="${x.id}" style="margin-top:6px">
            ${ROLES.map(r => `<option value="${r.id}" ${r.id === x.role ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
          </select>
        </div>`).join("")}
    </div>` : ""}

    <div class="card">
      <h2>About & data</h2>
      <p class="sub">Mode: <b>${db.mode === "sync" ? "Synced (Supabase free tier)" : "Local (this device)"}</b></p>
      <button class="btn danger sm" id="logout">Sign out</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// RENDER + EVENT WIRING
// ---------------------------------------------------------------------------
const VIEWS = { home: homeView, calendar: calendarView, cells: cellsView, groups: groupsView, prayer: prayerView, testimonies: testimoniesView, more: moreView };

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
    await db.remove("events", b.dataset.delevent);
    render();
  });
  v.querySelectorAll("[data-calnav]").forEach(b => b.onclick = () => {
    let mm = calCursor.m + parseInt(b.dataset.calnav, 10), yy = calCursor.y;
    if (mm < 0) { mm = 11; yy--; } else if (mm > 11) { mm = 0; yy++; }
    calCursor = { y: yy, m: mm };
    render();
  });

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
  const lo = $("#logout");
  if (lo) lo.onclick = () => { auth.logout(); boot(); };
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------
async function boot() {
  await auth.init();
  if (auth.current) { view = "home"; render(); }
  else authScreen();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
boot();
