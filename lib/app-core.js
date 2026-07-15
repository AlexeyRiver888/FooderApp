import crypto from "node:crypto";

export const defaultDb = {
  invites: [
    {
      code: "demo",
      label: "Demo invite",
      active: true,
      maxUses: 50,
      usedBy: []
    }
  ],
  users: {},
  venues: [],
  sessions: {}
};

export function cloneDefaultDb() {
  return JSON.parse(JSON.stringify(defaultDb));
}

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function zonedNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute)
  };
}

export const MIN_PARTICIPANTS = 2;

export const SCHEDULE_MINUTES = {
  joinStart: 10 * 60,
  voteStart: 11 * 60,
  voteEnd: 11 * 60 + 40,
  fallbackResult: 12 * 60
};

export function scheduledStatusForNow(date = new Date()) {
  const now = zonedNowParts(date);
  if (now.minuteOfDay < SCHEDULE_MINUTES.joinStart) return "waiting";
  if (now.minuteOfDay < SCHEDULE_MINUTES.voteStart) return "joining";
  if (now.minuteOfDay < SCHEDULE_MINUTES.voteEnd) return "voting";
  if (now.minuteOfDay < SCHEDULE_MINUTES.fallbackResult) return "closed";
  return "fallback";
}

export function validateTelegramInitData(initData) {
  const demoMode = process.env.DEMO_MODE !== "false";
  const botToken = process.env.BOT_TOKEN || "";

  if (!initData) {
    if (!demoMode) return null;
    return {
      id: 10001,
      first_name: "Demo",
      last_name: "User",
      username: "demo_user"
    };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !botToken) {
    if (!demoMode) return null;
  } else {
    params.delete("hash");
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash))) return null;
  }

  const userJson = params.get("user");
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

export function publicUser(user) {
  return {
    id: String(user.id),
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    username: user.username || ""
  };
}

export function adminIds() {
  return new Set(
    (process.env.ADMIN_TELEGRAM_IDS || "")
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  );
}

export function isAdminUser(userId) {
  return adminIds().has(String(userId));
}

export function getOrCreateSession(db, key = todayKey()) {
  db.sessions ||= {};
  if (!db.sessions[key]) {
    db.sessions[key] = {
      date: key,
      status: "joining",
      activeUsers: [],
      votes: {},
      createdAt: new Date().toISOString(),
      revealedAt: null,
      resultNotifiedAt: null,
      winnerVenueId: null,
      winnerReason: null,
      lunchPromptNotifiedAt: null,
      votingNotifiedAt: null
    };
  }
  db.sessions[key].status ||= "joining";
  db.sessions[key].activeUsers ||= [];
  db.sessions[key].votes ||= {};
  db.sessions[key].revealedAt ||= null;
  db.sessions[key].resultNotifiedAt ||= null;
  db.sessions[key].winnerVenueId ||= null;
  db.sessions[key].winnerReason ||= null;
  db.sessions[key].lunchPromptNotifiedAt ||= null;
  db.sessions[key].votingNotifiedAt ||= null;
  return db.sessions[key];
}

export function applyScheduleToSession(session, venues, date = new Date()) {
  if (session.status === "ready" || session.status === "finished") return session;
  const scheduledStatus = scheduledStatusForNow(date);
  if (scheduledStatus === "waiting") {
    session.status = "waiting";
    return session;
  }
  if (scheduledStatus === "joining") {
    session.status = "joining";
    return session;
  }
  if (scheduledStatus === "closed" || scheduledStatus === "fallback") {
    session.status = "closed";
    return session;
  }
  if (session.status === "waiting" || session.status === "joining" || session.status === "closed") {
    session.status = session.activeUsers.length >= MIN_PARTICIPANTS && venues.length > 0 ? "voting" : "closed";
  }
  return session;
}

export function scoreSession(session, venues) {
  const activeUsers = new Set(session.activeUsers);
  const userCount = activeUsers.size;
  const stats = venues.map(venue => {
    const votes = session.votes[venue.id] || {};
    const yesUsers = [];
    const noUsers = [];
    const vetoUsers = [];

    for (const [userId, vote] of Object.entries(votes)) {
      if (!activeUsers.has(userId)) continue;
      if (vote.value === "yes") yesUsers.push(userId);
      if (vote.value === "no") noUsers.push(userId);
      if (vote.value === "veto") vetoUsers.push(userId);
    }

    return {
      venueId: venue.id,
      yes: yesUsers.length,
      no: noUsers.length,
      veto: vetoUsers.length,
      eligible: vetoUsers.length === 0,
      remaining: Math.max(0, userCount - yesUsers.length - noUsers.length - vetoUsers.length)
    };
  });

  const eligible = stats.filter(item => item.eligible);
  const sorted = [...eligible].sort((a, b) => b.yes - a.yes || a.venueId.localeCompare(b.venueId));
  const leader = sorted[0] || null;
  const runnerUp = sorted[1] || null;
  const winner = leader && (!runnerUp || leader.yes > runnerUp.yes) ? leader : null;

  return {
    userCount,
    stats,
    winnerVenueId: winner ? winner.venueId : null
  };
}

export function allParticipantsVoted(session, venues) {
  if (!session.activeUsers.length || !venues.length) return false;
  return session.activeUsers.every(userId =>
    venues.every(venue => Boolean(session.votes[venue.id]?.[userId]?.value))
  );
}

export function voteProgress(session, venues) {
  const total = session.activeUsers.length * venues.length;
  if (!total) return { done: 0, total: 0 };
  let done = 0;
  for (const userId of session.activeUsers) {
    for (const venue of venues) {
      if (session.votes[venue.id]?.[userId]?.value) done += 1;
    }
  }
  return { done, total };
}

export function normalizeVenue(input) {
  const name = String(input.name || "").trim();
  const address = String(input.address || input.area || "").trim();
  const image = String(input.image || "").trim();
  const id =
    String(input.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || crypto.randomUUID();

  if (!name) throw new Error("Venue name is required");
  if (!address) throw new Error("Venue address is required");
  if (!image) throw new Error("Venue image is required");

  return { id, name, address, area: address, tags: [], image };
}

export function sessionPayload(db, userId) {
  const session = getOrCreateSession(db);
  const score = scoreSession(session, db.venues);
  const voted = {};
  const hasCompletedOwnVotes =
    session.activeUsers.includes(userId) && db.venues.every(venue => Boolean(session.votes[venue.id]?.[userId]?.value));
  const resultVenueId = session.winnerVenueId || score.winnerVenueId;
  const winner = session.status === "finished" ? db.venues.find(venue => venue.id === resultVenueId) || null : null;

  for (const venue of db.venues) {
    voted[venue.id] = session.votes[venue.id]?.[userId]?.value || null;
  }

  return {
    date: session.date,
    status: session.status,
    isActive: session.activeUsers.includes(userId),
    canJoin: session.status === "joining",
    canStartVoting: false,
    canVote: session.status === "voting" && session.activeUsers.includes(userId) && !hasCompletedOwnVotes,
    canReveal: session.status === "ready",
    hasCompletedOwnVotes,
    progress: voteProgress(session, db.venues),
    activeUsers: session.activeUsers.map(id => db.users[id]).filter(Boolean),
    venues: db.venues,
    votes: voted,
    winner,
    winnerReason: session.status === "finished" ? session.winnerReason : null,
    isAdmin: isAdminUser(userId)
  };
}
