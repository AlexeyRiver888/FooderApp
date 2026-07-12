import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cloneDefaultDb,
  getOrCreateSession,
  publicUser,
  sessionPayload,
  validateTelegramInitData
} from "./lib/app-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  try {
    const text = await fs.readFile(path.join(__dirname, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Local development works without .env; production should provide env vars.
  }
}

await loadEnv();

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || "";
const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_FILE = path.join(DATA_DIR, "db.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

let dbLock = Promise.resolve();
let store;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body is too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function ensureFileDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify(cloneDefaultDb(), null, 2));
  }
}

function createFileStore() {
  return {
    async init() {
      await ensureFileDb();
    },
    async readDb() {
      await ensureFileDb();
      return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
    },
    async withDb(mutator) {
      dbLock = dbLock.then(async () => {
        const current = await this.readDb();
        const result = await mutator(current);
        await fs.writeFile(DB_FILE, JSON.stringify(current, null, 2));
        return result;
      });
      return dbLock;
    }
  };
}

function useSslForDatabase(url) {
  return !url.includes("localhost") && !url.includes("127.0.0.1");
}

async function createPostgresStore() {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: useSslForDatabase(DATABASE_URL) ? { rejectUnauthorized: false } : false
  });

  async function init() {
    await pool.query(`
      create table if not exists users (
        id text primary key,
        first_name text not null default '',
        last_name text not null default '',
        username text not null default ''
      );

      create table if not exists invites (
        code text primary key,
        label text not null default '',
        active boolean not null default true,
        max_uses integer
      );

      create table if not exists invite_uses (
        invite_code text not null references invites(code) on delete cascade,
        user_id text not null references users(id) on delete cascade,
        used_at timestamptz not null default now(),
        primary key (invite_code, user_id)
      );

      create table if not exists venues (
        id text primary key,
        name text not null,
        area text not null default '',
        tags text[] not null default '{}',
        image text not null default '',
        sort_order integer not null default 0
      );

      create table if not exists sessions (
        date text primary key,
        created_at timestamptz not null default now()
      );

      create table if not exists session_active_users (
        session_date text not null references sessions(date) on delete cascade,
        user_id text not null references users(id) on delete cascade,
        activated_at timestamptz not null default now(),
        primary key (session_date, user_id)
      );

      create table if not exists votes (
        session_date text not null references sessions(date) on delete cascade,
        venue_id text not null references venues(id) on delete cascade,
        user_id text not null references users(id) on delete cascade,
        value text not null check (value in ('yes', 'no', 'veto')),
        voted_at timestamptz not null default now(),
        primary key (session_date, venue_id, user_id)
      );
    `);

    const seed = cloneDefaultDb();
    for (const invite of seed.invites) {
      await pool.query(
        `insert into invites (code, label, active, max_uses)
         values ($1, $2, $3, $4)
         on conflict (code) do nothing`,
        [invite.code, invite.label, invite.active, invite.maxUses]
      );
    }

    for (const [index, venue] of seed.venues.entries()) {
      await pool.query(
        `insert into venues (id, name, area, tags, image, sort_order)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do nothing`,
        [venue.id, venue.name, venue.area, venue.tags, venue.image, index]
      );
    }
  }

  async function readDb(client = pool) {
    const invitesResult = await client.query("select code, label, active, max_uses from invites order by code");
    const usersResult = await client.query("select id, first_name, last_name, username from users");
    const venuesResult = await client.query("select id, name, area, tags, image from venues order by sort_order, name");
    const sessionsResult = await client.query("select date, created_at from sessions");
    const activeResult = await client.query("select session_date, user_id from session_active_users");
    const votesResult = await client.query("select session_date, venue_id, user_id, value, voted_at from votes");
    const usesResult = await client.query("select invite_code, user_id from invite_uses");

    const usesByInvite = new Map();
    for (const row of usesResult.rows) {
      if (!usesByInvite.has(row.invite_code)) usesByInvite.set(row.invite_code, []);
      usesByInvite.get(row.invite_code).push(row.user_id);
    }

    const db = {
      invites: invitesResult.rows.map(row => ({
        code: row.code,
        label: row.label,
        active: row.active,
        maxUses: row.max_uses,
        usedBy: usesByInvite.get(row.code) || []
      })),
      users: {},
      venues: venuesResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        area: row.area,
        tags: row.tags || [],
        image: row.image
      })),
      sessions: {}
    };

    for (const row of usersResult.rows) {
      db.users[row.id] = {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        username: row.username
      };
    }

    for (const row of sessionsResult.rows) {
      db.sessions[row.date] = {
        date: row.date,
        activeUsers: [],
        votes: {},
        createdAt: row.created_at?.toISOString?.() || row.created_at
      };
    }

    for (const row of activeResult.rows) {
      db.sessions[row.session_date] ||= {
        date: row.session_date,
        activeUsers: [],
        votes: {},
        createdAt: new Date().toISOString()
      };
      db.sessions[row.session_date].activeUsers.push(row.user_id);
    }

    for (const row of votesResult.rows) {
      db.sessions[row.session_date] ||= {
        date: row.session_date,
        activeUsers: [],
        votes: {},
        createdAt: new Date().toISOString()
      };
      db.sessions[row.session_date].votes[row.venue_id] ||= {};
      db.sessions[row.session_date].votes[row.venue_id][row.user_id] = {
        value: row.value,
        at: row.voted_at?.toISOString?.() || row.voted_at
      };
    }

    return db;
  }

  async function writeDb(db, client) {
    for (const user of Object.values(db.users)) {
      await client.query(
        `insert into users (id, first_name, last_name, username)
         values ($1, $2, $3, $4)
         on conflict (id) do update set
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           username = excluded.username`,
        [user.id, user.firstName || "", user.lastName || "", user.username || ""]
      );
    }

    for (const invite of db.invites) {
      await client.query(
        `insert into invites (code, label, active, max_uses)
         values ($1, $2, $3, $4)
         on conflict (code) do update set
           label = excluded.label,
           active = excluded.active,
           max_uses = excluded.max_uses`,
        [invite.code, invite.label || "", invite.active, invite.maxUses]
      );

      for (const userId of invite.usedBy || []) {
        await client.query(
          `insert into invite_uses (invite_code, user_id)
           values ($1, $2)
           on conflict do nothing`,
          [invite.code, userId]
        );
      }
    }

    for (const [index, venue] of db.venues.entries()) {
      await client.query(
        `insert into venues (id, name, area, tags, image, sort_order)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
           name = excluded.name,
           area = excluded.area,
           tags = excluded.tags,
           image = excluded.image,
           sort_order = excluded.sort_order`,
        [venue.id, venue.name, venue.area, venue.tags || [], venue.image, index]
      );
    }

    for (const session of Object.values(db.sessions)) {
      await client.query(
        `insert into sessions (date, created_at)
         values ($1, coalesce($2::timestamptz, now()))
         on conflict (date) do nothing`,
        [session.date, session.createdAt || null]
      );

      for (const userId of session.activeUsers || []) {
        await client.query(
          `insert into session_active_users (session_date, user_id)
           values ($1, $2)
           on conflict do nothing`,
          [session.date, userId]
        );
      }

      for (const [venueId, venueVotes] of Object.entries(session.votes || {})) {
        for (const [userId, vote] of Object.entries(venueVotes)) {
          await client.query(
            `insert into votes (session_date, venue_id, user_id, value, voted_at)
             values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))
             on conflict (session_date, venue_id, user_id) do update set
               value = excluded.value,
               voted_at = excluded.voted_at`,
            [session.date, venueId, userId, vote.value, vote.at || null]
          );
        }
      }
    }
  }

  return {
    init,
    readDb,
    async withDb(mutator) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(927441)");
        const db = await readDb(client);
        const result = await mutator(db);
        await writeDb(db, client);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

async function requireAuth(req, res) {
  const auth = req.headers.authorization || "";
  const initData = auth.startsWith("tma ") ? auth.slice(4) : "";
  const telegramUser = validateTelegramInitData(initData);
  if (!telegramUser?.id) {
    sendError(res, 401, "Telegram login is required");
    return null;
  }
  return publicUser(telegramUser);
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/login" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const user = validateTelegramInitData(body.initData || "");
    if (!user?.id) return sendError(res, 401, "Telegram login is required");

    const savedUser = publicUser(user);
    const result = await store.withDb(async db => {
      const invite = db.invites.find(item => item.code === body.inviteCode && item.active);
      if (!invite) return { ok: false, status: 403, message: "Invite is invalid" };
      const userId = savedUser.id;
      const alreadyUsed = invite.usedBy.includes(userId);
      if (!alreadyUsed && invite.maxUses && invite.usedBy.length >= invite.maxUses) {
        return { ok: false, status: 403, message: "Invite is exhausted" };
      }
      db.users[userId] = savedUser;
      if (!alreadyUsed) invite.usedBy.push(userId);
      return { ok: true, user: savedUser, session: sessionPayload(db, userId) };
    });

    if (!result.ok) return sendError(res, result.status, result.message);
    return sendJson(res, 200, result);
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (pathname === "/api/session" && req.method === "GET") {
    const db = await store.readDb();
    return sendJson(res, 200, { user, session: sessionPayload(db, user.id) });
  }

  if (pathname === "/api/session/activate" && req.method === "POST") {
    const result = await store.withDb(async db => {
      db.users[user.id] = user;
      const session = getOrCreateSession(db);
      if (!session.activeUsers.includes(user.id)) session.activeUsers.push(user.id);
      return { user, session: sessionPayload(db, user.id) };
    });
    return sendJson(res, 200, result);
  }

  if (pathname === "/api/vote" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const allowedVotes = new Set(["yes", "no", "veto"]);
    if (!allowedVotes.has(body.vote)) return sendError(res, 400, "Unknown vote");

    const result = await store.withDb(async db => {
      const session = getOrCreateSession(db);
      if (!session.activeUsers.includes(user.id)) {
        return { ok: false, status: 409, message: "Activate today's session first" };
      }
      const venue = db.venues.find(item => item.id === body.venueId);
      if (!venue) return { ok: false, status: 404, message: "Venue not found" };

      session.votes[venue.id] ||= {};
      session.votes[venue.id][user.id] = {
        value: body.vote,
        at: new Date().toISOString()
      };

      return { ok: true, session: sessionPayload(db, user.id) };
    });

    if (!result.ok) return sendError(res, result.status, result.message);
    return sendJson(res, 200, result);
  }

  sendError(res, 404, "Not found");
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" });
    res.end(fallback);
  }
}

store = DATABASE_URL ? await createPostgresStore() : createFileStore();
await store.init();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendError(res, 500, "Internal server error");
  }
});

server.listen(PORT, () => {
  const storage = DATABASE_URL ? "Supabase Postgres" : "local JSON";
  console.log(`Telegram venue swipe mini-app running at http://localhost:${PORT} with ${storage}`);
});
