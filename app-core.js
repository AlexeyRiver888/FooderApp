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
  venues: [
    {
      id: "luna",
      name: "Luna Bar",
      area: "Center",
      tags: ["cocktails", "music"],
      image: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "miso",
      name: "Miso House",
      area: "Riverside",
      tags: ["ramen", "quiet"],
      image: "https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "verde",
      name: "Verde",
      area: "Old Town",
      tags: ["vegetarian", "wine"],
      image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "smoke",
      name: "Smoke Yard",
      area: "North",
      tags: ["bbq", "beer"],
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80"
    }
  ],
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

export function getOrCreateSession(db, key = todayKey()) {
  db.sessions ||= {};
  if (!db.sessions[key]) {
    db.sessions[key] = {
      date: key,
      activeUsers: [],
      votes: {},
      createdAt: new Date().toISOString()
    };
  }
  return db.sessions[key];
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

export function sessionPayload(db, userId) {
  const session = getOrCreateSession(db);
  const score = scoreSession(session, db.venues);
  const voted = {};

  for (const venue of db.venues) {
    voted[venue.id] = session.votes[venue.id]?.[userId]?.value || null;
  }

  return {
    date: session.date,
    isActive: session.activeUsers.includes(userId),
    activeUsers: session.activeUsers.map(id => db.users[id]).filter(Boolean),
    venues: db.venues,
    votes: voted,
    score
  };
}
