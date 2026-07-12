const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const state = {
  authHeader: "",
  user: null,
  session: null,
  currentIndex: 0,
  drag: null
};

const els = {
  loginPanel: document.querySelector("#loginPanel"),
  inviteInput: document.querySelector("#inviteInput"),
  loginButton: document.querySelector("#loginButton"),
  sessionPanel: document.querySelector("#sessionPanel"),
  activateButton: document.querySelector("#activateButton"),
  activeCount: document.querySelector("#activeCount"),
  datePill: document.querySelector("#datePill"),
  winnerPanel: document.querySelector("#winnerPanel"),
  deck: document.querySelector("#deck"),
  venueCard: document.querySelector("#venueCard"),
  venueImage: document.querySelector("#venueImage"),
  venueArea: document.querySelector("#venueArea"),
  venueName: document.querySelector("#venueName"),
  venueTags: document.querySelector("#venueTags"),
  actions: document.querySelector("#actions"),
  scoreboard: document.querySelector("#scoreboard"),
  yesBadge: document.querySelector(".vote-badge.yes"),
  noBadge: document.querySelector(".vote-badge.no"),
  vetoBadge: document.querySelector(".vote-badge.veto"),
  yesButton: document.querySelector("#yesButton"),
  noButton: document.querySelector("#noButton"),
  vetoButton: document.querySelector("#vetoButton")
};

function initData() {
  return tg?.initData || "";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(state.authHeader ? { authorization: state.authHeader } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function setSession(session) {
  state.session = session;
  state.currentIndex = nextUnvotedIndex();
  render();
}

function nextUnvotedIndex() {
  const venues = state.session?.venues || [];
  return venues.findIndex(venue => !state.session.votes[venue.id]);
}

function render() {
  const session = state.session;
  els.loginPanel.classList.toggle("hidden", Boolean(state.user));
  els.sessionPanel.classList.toggle("hidden", !state.user);
  els.datePill.textContent = session?.date || "--";

  if (!session) return;

  els.activeCount.textContent = String(session.activeUsers.length);
  els.activateButton.disabled = session.isActive;
  els.activateButton.textContent = session.isActive ? "День активен" : "Активировать день";

  const canVote = session.isActive && state.currentIndex >= 0;
  els.deck.classList.toggle("hidden", !canVote);
  els.actions.classList.toggle("hidden", !canVote);

  if (canVote) renderVenue(session.venues[state.currentIndex]);
  renderWinner();
  renderScoreboard();
}

function renderVenue(venue) {
  els.venueCard.style.transition = "";
  els.venueCard.style.transform = "";
  els.venueCard.style.opacity = "1";
  setBadgeOpacity(0, 0, 0);
  els.venueImage.src = venue.image;
  els.venueImage.alt = venue.name;
  els.venueArea.textContent = venue.area;
  els.venueName.textContent = venue.name;
  els.venueTags.innerHTML = venue.tags.map(tag => `<span>${tag}</span>`).join("");
}

function renderWinner() {
  const winnerId = state.session.score.winnerVenueId;
  const winner = state.session.venues.find(venue => venue.id === winnerId);
  els.winnerPanel.classList.toggle("hidden", !winner);
  if (winner) {
    els.winnerPanel.innerHTML = `<strong>${winner.name}</strong><br><span>Побеждает прямо сейчас</span>`;
  }
}

function renderScoreboard() {
  els.scoreboard.classList.toggle("hidden", !state.session);
  const rows = state.session.score.stats
    .map(item => ({
      ...item,
      venue: state.session.venues.find(venue => venue.id === item.venueId)
    }))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.yes - a.yes)
    .map(item => {
      const blocked = item.veto > 0 ? " · ветто" : "";
      return `
        <div class="score-row">
          <div>
            <strong>${item.venue.name}</strong>
            <div class="score-meta">${item.yes} да · ${item.no} нет${blocked}</div>
          </div>
          <strong>${item.eligible ? item.yes : "X"}</strong>
        </div>
      `;
    })
    .join("");
  els.scoreboard.innerHTML = rows;
}

function setBadgeOpacity(yes, no, veto) {
  els.yesBadge.style.opacity = yes;
  els.noBadge.style.opacity = no;
  els.vetoBadge.style.opacity = veto;
}

async function login() {
  els.loginButton.disabled = true;
  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        inviteCode: els.inviteInput.value.trim(),
        initData: initData()
      })
    });
    state.user = payload.user;
    state.authHeader = `tma ${initData()}`;
    if (!initData()) state.authHeader = "";
    setSession(payload.session);
  } catch (error) {
    alert(error.message);
  } finally {
    els.loginButton.disabled = false;
  }
}

async function activate() {
  try {
    const payload = await api("/api/session/activate", { method: "POST", body: "{}" });
    setSession(payload.session);
  } catch (error) {
    alert(error.message);
  }
}

async function vote(value) {
  const venue = state.session?.venues[state.currentIndex];
  if (!venue) return;

  animateOut(value);
  try {
    const payload = await api("/api/vote", {
      method: "POST",
      body: JSON.stringify({ venueId: venue.id, vote: value })
    });
    setTimeout(() => setSession(payload.session), 160);
  } catch (error) {
    alert(error.message);
    render();
  }
}

function animateOut(value) {
  const x = value === "yes" ? 520 : value === "no" ? -520 : 0;
  const y = value === "veto" ? -520 : 40;
  const rotation = value === "yes" ? 18 : value === "no" ? -18 : 0;
  els.venueCard.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
  els.venueCard.style.opacity = "0";
}

function onPointerDown(event) {
  if (!state.session?.isActive) return;
  els.venueCard.setPointerCapture(event.pointerId);
  state.drag = {
    startX: event.clientX,
    startY: event.clientY,
    x: 0,
    y: 0
  };
}

function onPointerMove(event) {
  if (!state.drag) return;
  const x = event.clientX - state.drag.startX;
  const y = event.clientY - state.drag.startY;
  state.drag.x = x;
  state.drag.y = y;
  els.venueCard.style.transform = `translate(${x}px, ${y}px) rotate(${x / 18}deg)`;
  setBadgeOpacity(Math.max(0, x / 120), Math.max(0, -x / 120), Math.max(0, -y / 100));
}

function onPointerUp() {
  if (!state.drag) return;
  const { x, y } = state.drag;
  state.drag = null;
  if (y < -115) return vote("veto");
  if (x > 110) return vote("yes");
  if (x < -110) return vote("no");
  render();
}

els.loginButton.addEventListener("click", login);
els.activateButton.addEventListener("click", activate);
els.yesButton.addEventListener("click", () => vote("yes"));
els.noButton.addEventListener("click", () => vote("no"));
els.vetoButton.addEventListener("click", () => vote("veto"));
els.venueCard.addEventListener("pointerdown", onPointerDown);
els.venueCard.addEventListener("pointermove", onPointerMove);
els.venueCard.addEventListener("pointerup", onPointerUp);
els.venueCard.addEventListener("pointercancel", onPointerUp);

if (tg?.initDataUnsafe?.user) {
  els.inviteInput.focus();
}
