import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const J = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (v && typeof v === "object" ? sum(v) : Number(v) || 0), 0);
const clean = (s, n = 200) => String(s == null ? "" : s).trim().slice(0, n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN_PROFILE = { name: "Subbulakshmi T", email: "subbulakshmitce@gmail.com", username: "admin", admin: true };

export default async (req) => {
  if (req.method !== "POST") return J({ error: "POST only" }, 405);
  let b;
  try { b = await req.json(); } catch { return J({ error: "Bad request" }, 400); }

  const users = getStore("pylab-users");
  const sess = getStore("pylab-sessions");
  const fbs = getStore("pylab-feedback");

  const newSession = async (username, role) => {
    const t = crypto.randomBytes(24).toString("hex");
    await sess.setJSON(t, { username, role, exp: Date.now() + 12 * 3600 * 1000 });
    return t;
  };
  const auth = async () => {
    if (!b.token) return null;
    const s = await sess.get(String(b.token), { type: "json" });
    return s && s.exp > Date.now() ? s : null;
  };
  const pub = (u) => ({ name: u.name, email: u.email, country: u.country, college: u.college, username: u.username, joined: u.joined });

  try {
    switch (b.action) {
      case "signup": {
        const f = { name: clean(b.name), email: clean(b.email).toLowerCase(), country: clean(b.country), college: clean(b.college) };
        const username = clean(b.username, 20).toLowerCase(), pw = String(b.password || "");
        if (!f.name || !f.email || !f.country || !f.college || !username || !pw) return J({ error: "Please fill in every field." }, 400);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return J({ error: "Enter a valid email address." }, 400);
        if (!/^[a-z0-9_.]{3,20}$/.test(username)) return J({ error: "User name must be 3-20 letters, digits, _ or ." }, 400);
        if (username === "admin") return J({ error: "That user name is reserved." }, 400);
        if (pw.length < 6) return J({ error: "Password must have at least 6 characters." }, 400);
        if (await users.get(username)) return J({ error: "That user name is already taken." }, 409);
        const salt = crypto.randomBytes(16).toString("hex");
        const u = { ...f, username, salt, hash: hashPw(pw, salt), joined: new Date().toISOString(), secs: {}, runs: 0, total: 0, updated: Date.now() };
        await users.setJSON(username, u);
        return J({ token: await newSession(username, "user"), prof: pub(u), secs: {}, runs: 0 });
      }
      case "login": {
        const username = clean(b.username, 20).toLowerCase(), pw = String(b.password || "");
        if (username === "admin") {
          const ok = same(pw, process.env.ADMIN_PASSWORD || "testsuccess");
          if (!ok) { await wait(700); return J({ error: "Incorrect user name or password." }, 401); }
          return J({ token: await newSession("admin", "admin"), admin: true });
        }
        const u = username ? await users.get(username, { type: "json" }) : null;
        if (!u || !same(hashPw(pw, u.salt), u.hash)) { await wait(700); return J({ error: "Incorrect user name or password." }, 401); }
        return J({ token: await newSession(username, "user"), prof: pub(u), secs: u.secs || {}, runs: u.runs || 0 });
      }
      case "me": {
        const s = await auth();
        if (!s) return J({ error: "Session expired. Please log in again." }, 401);
        if (s.role === "admin") return J({ admin: true, token: b.token });
        const u = await users.get(s.username, { type: "json" });
        if (!u) return J({ error: "Account not found." }, 401);
        return J({ token: b.token, prof: pub(u), secs: u.secs || {}, runs: u.runs || 0 });
      }
      case "progress": {
        const s = await auth();
        if (!s || s.role !== "user") return J({ error: "Not signed in." }, 401);
        const u = await users.get(s.username, { type: "json" });
        if (!u) return J({ error: "Account not found." }, 404);
        const secs = b.secs && typeof b.secs === "object" ? b.secs : {};
        if (JSON.stringify(secs).length > 20000) return J({ error: "Too much data." }, 400);
        u.secs = secs;
        u.runs = Math.max(0, Math.min(1e6, Number(b.runs) || 0));
        u.total = sum(secs);
        u.updated = Date.now();
        await users.setJSON(s.username, u);
        return J({ ok: true });
      }
      case "feedback": {
        const s = await auth();
        if (!s || s.role !== "user") return J({ error: "Not signed in." }, 401);
        const u = await users.get(s.username, { type: "json" });
        const old = (await fbs.get(s.username, { type: "json" })) || { entries: [] };
        const e = {
          name: b.anon ? "Anonymous" : u.name,
          rating: Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0)),
          comment: clean(b.comment, 1000),
          t: Date.now(),
        };
        old.entries = old.entries.concat([e]).slice(-10);
        await fbs.setJSON(s.username, old);
        return J({ ok: true });
      }
      case "admin": {
        const s = await auth();
        if (!s || s.role !== "admin") return J({ error: "Administrator access only." }, 403);
        const list = async (store) => {
          const { blobs } = await store.list();
          return (await Promise.all(blobs.map((x) => store.get(x.key, { type: "json" })))).filter(Boolean);
        };
        const all = await list(users);
        const out = all.map((u) => ({
          username: u.username, name: u.name, email: u.email, country: u.country, college: u.college, joined: u.joined,
          total: u.total || 0, runs: u.runs || 0, secs: u.secs || {}, updated: u.updated,
          sections: Object.keys(u.secs || {}).filter((k) => sum(u.secs[k]) > 0),
        }));
        return J({ users: out, feedback: await list(fbs) });
      }
      case "logout": {
        if (b.token) await sess.delete(String(b.token));
        return J({ ok: true });
      }
      default:
        return J({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return J({ error: "Server error. Please try again." }, 500);
  }
};

export const config = { path: "/api" };
