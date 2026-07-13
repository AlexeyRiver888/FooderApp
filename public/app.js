const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const state = {
  authHeader: "",
  user: null,
  session: null,
  currentIndex: 0,
  drag: null,
  pollTimer: null,
  adminOpen: false,
  pendingVotes: {}
};

const els = {
  adminToggle: document.querySelector("#adminToggle"),
  statusPanel: document.querySelector("#statusPanel"),
  datePill: document.querySelector("#datePill"),
  stageTitle: document.querySelector("#stageTitle"),
  stageHint: document.querySelector("#stageHint"),
  joinButton: document.querySelector("#joinButton"),
  startVoteButton: document.querySelector("#startVoteButton"),
  revealButton: document.querySelector("#revealButton"),
  peoplePanel: document.querySelector("#peoplePanel"),
  activeCount: document.querySelector("#activeCount"),
  sessionStatus: document.querySelector("#sessionStatus"),
  peopleList: document.querySelector("#peopleList"),
  winnerPanel: document.querySelector("#winnerPanel"),
  deck: document.querySelector("#deck"),
  venueCard: document.querySelector("#venueCard"),
  venueImage: document.querySelector("#venueImage"),
  venueAddress: document.querySelector("#venueAddress"),
  venueName: document.querySelector("#venueName"),
  actions: document.querySelector("#actions"),
  yesBadge: document.querySelector(".vote-badge.yes"),
  noBadge: document.querySelector(".vote-badge.no"),
  vetoBadge: document.querySelector(".vote-badge.veto"),
  yesButton: document.querySelector("#yesButton"),
  noButton: document.querySelector("#noButton"),
  vetoButton: document.querySelector("#vetoButton"),
  adminPanel: document.querySelector("#adminPanel"),
  venueForm: document.querySelector("#venueForm"),
  venueIdInput: document.querySelector("#venueIdInput"),
  venueNameInput: document.querySelector("#venueNameInput"),
  venueAddressInput: document.querySelector("#venueAddressInput"),
  venueImageInput: document.querySelector("#venueImageInput"),
  venuePhotoInput: document.querySelector("#venuePhotoInput"),
  venueImagePreview: document.querySelector("#venueImagePreview"),
  saveVenueButton: document.querySelector("#saveVenueButton"),
  resetFormButton: document.querySelector("#resetFormButton"),
  resetSessionButton: document.querySelector("#resetSessionButton"),
  venueList: document.querySelector("#venueList")
};

function initData() {
  return tg?.initData || "";
}

function sessionDateText(date) {
  if (!date) return "--";
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
}

function userName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || `id ${user.id}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

async function compressImage(file) {
  const image = await fileToImage(file);
  const maxSize = 1200;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(image.src);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function setSession(session) {
  state.session = session;
  state.currentIndex = nextUnvotedIndex();
  cleanupPendingVotes();
  preloadUpcomingImages();
  render();
}

function nextUnvotedIndex() {
  const venues = state.session?.venues || [];
  return venues.findIndex(venue => !effectiveVotes()[venue.id]);
}

function effectiveVotes() {
  return {
    ...(state.session?.votes || {}),
    ...state.pendingVotes
  };
}

function cleanupPendingVotes() {
  if (!state.session) return;
  for (const [venueId, vote] of Object.entries(state.pendingVotes)) {
    if (state.session.votes[venueId] === vote) delete state.pendingVotes[venueId];
  }
}

function preloadUpcomingImages() {
  const venues = state.session?.venues || [];
  const votes = effectiveVotes();
  venues
    .filter(venue => !votes[venue.id])
    .slice(0, 3)
    .forEach(venue => {
      const image = new Image();
      image.src = venue.image;
    });
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(async () => {
    if (!state.user) return;
    try {
      const payload = await api("/api/session");
      setSession(payload.session);
    } catch {
      // Polling is best-effort; direct actions still surface errors.
    }
  }, 5000);
}

async function login() {
  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ initData: initData() })
    });
    state.user = payload.user;
    state.authHeader = initData() ? `tma ${initData()}` : "";
    setSession(payload.session);
    startPolling();
  } catch (error) {
    els.stageTitle.textContent = "Не получилось войти";
    els.stageHint.textContent = initData()
      ? error.message
      : "Открой приложение из Telegram. В обычном браузере вход работает только в demo-режиме.";
  }
}

function render() {
  const session = state.session;
  if (!session) return;
  const canVoteNow = session.status === "voting" && session.isActive;

  els.datePill.textContent = sessionDateText(session.date);
  els.peoplePanel.classList.toggle("hidden", !state.user);
  els.activeCount.textContent = `${session.activeUsers.length} чел.`;
  els.sessionStatus.textContent = statusLabel(session.status);
  els.peopleList.innerHTML = session.activeUsers.length
    ? session.activeUsers.map(user => `<span>${escapeHtml(userName(user))}</span>`).join("")
    : "<span>Пока никто не нажал «Погнали»</span>";

  els.adminToggle.classList.toggle("hidden", !session.isAdmin);
  els.adminPanel.classList.toggle("hidden", !session.isAdmin || !state.adminOpen);
  if (session.isAdmin) renderAdminVenues();

  els.joinButton.classList.add("hidden");
  els.startVoteButton.classList.add("hidden");
  els.revealButton.classList.add("hidden");
  els.deck.classList.add("hidden");
  els.actions.classList.add("hidden");
  els.winnerPanel.classList.add("hidden");

  if (!session.venues.length) {
    els.stageTitle.textContent = "Сначала добавь заведения";
    els.stageHint.textContent = session.isAdmin
      ? "Открой админку и добавь название, адрес и картинку."
      : "Админ пока не добавил заведения для голосования.";
    return;
  }

  if (session.status === "joining") renderJoining(session);
  if (session.status === "voting") renderVoting(session, canVoteNow);
  if (session.status === "ready") renderReady(session);
  if (session.status === "finished") renderFinished(session);
  if (session.status === "waiting") renderWaiting(session);
  if (session.status === "closed") renderClosed(session);
}

function statusLabel(status) {
  if (status === "waiting") return "ожидание";
  if (status === "joining") return "сбор";
  if (status === "voting") return "голосование";
  if (status === "ready") return "готово";
  if (status === "finished") return "выбрали";
  if (status === "closed") return "закрыто";
  return status;
}

function renderWaiting(session) {
  els.stageTitle.textContent = `Обедаем ${sessionDateText(session.date)}?`;
  els.stageHint.textContent = "Сбор участников откроется в 11:00 по Екатеринбургу.";
}

function renderJoining(session) {
  els.stageTitle.textContent = `Обедаем ${sessionDateText(session.date)}?`;
  if (!session.isActive) {
    els.stageHint.textContent = "Сбор открыт до 11:20 по Екатеринбургу. Нажми «Погнали», чтобы попасть в список участников.";
    els.joinButton.classList.remove("hidden");
    return;
  }

  els.stageHint.textContent = `Ты в списке. Ждем 11:20, потом голосование начнется автоматически. Сейчас ${session.activeUsers.length} чел.`;
}

function renderVoting(session, canVoteNow) {
  if (canVoteNow && state.currentIndex >= 0) {
    els.stageTitle.textContent = "Выбирай свайпами";
    els.stageHint.textContent = "Вправо — да, влево — нет, вверх — ветто.";
    renderVenue(session.venues[state.currentIndex]);
    els.deck.classList.remove("hidden");
    els.actions.classList.remove("hidden");
    return;
  }

  els.stageTitle.textContent = "Твой голос принят";
  els.stageHint.textContent = `Ждем остальных: ${session.progress.done} из ${session.progress.total} голосов.`;
}

function renderClosed(session) {
  els.stageTitle.textContent = "Сбор закрыт";
  els.stageHint.textContent =
    session.activeUsers.length < 3
      ? `Сегодня не набралось 3 человека. Успели записаться: ${session.activeUsers.length}.`
      : "Сбор закрыт, но голосование не началось. Проверь, добавлены ли заведения.";
}

function renderReady() {
  els.stageTitle.textContent = "Все проголосовали";
  els.stageHint.textContent = "Интрига выдержана. Можно открыть результат.";
  els.revealButton.classList.remove("hidden");
}

function renderFinished(session) {
  if (session.winner) {
    els.stageTitle.textContent = "Идем сюда";
    els.stageHint.textContent =
      session.winnerReason === "random"
        ? "Была ничья или все варианты попали под ветто, поэтому приложение выбрало случайно."
        : "Победитель уже отправлен участникам сообщением от бота.";
    els.winnerPanel.innerHTML = `
      <img src="${escapeHtml(session.winner.image)}" alt="" />
      <div>
        <strong>${escapeHtml(session.winner.name)}</strong>
        <span>${escapeHtml(session.winner.address || session.winner.area)}</span>
      </div>
    `;
  } else {
    els.stageTitle.textContent = "Победитель не определился";
    els.stageHint.textContent = "Нет заведений для выбора.";
    els.winnerPanel.innerHTML = "<strong>Добавь заведения и сбрось сессию</strong>";
  }
  els.winnerPanel.classList.remove("hidden");
}

function renderVenue(venue) {
  els.venueCard.style.transition = "";
  els.venueCard.style.transform = "";
  els.venueCard.style.opacity = "1";
  setBadgeOpacity(0, 0, 0);
  els.venueImage.src = venue.image;
  els.venueImage.alt = venue.name;
  els.venueAddress.textContent = venue.address || venue.area;
  els.venueName.textContent = venue.name;
}

function renderAdminVenues() {
  const venues = state.session?.venues || [];
  els.venueList.innerHTML = venues.length
    ? venues
        .map(
          venue => `
            <div class="venue-row">
              <img src="${escapeHtml(venue.image)}" alt="" />
              <div>
                <strong>${escapeHtml(venue.name)}</strong>
                <span>${escapeHtml(venue.address || venue.area)}</span>
              </div>
              <button data-edit="${escapeHtml(venue.id)}" type="button">Изм.</button>
              <button data-delete="${escapeHtml(venue.id)}" type="button">Удал.</button>
            </div>
          `
        )
        .join("")
    : "<p class='hint'>Заведений пока нет.</p>";
}

function setBadgeOpacity(yes, no, veto) {
  els.yesBadge.style.opacity = yes;
  els.noBadge.style.opacity = no;
  els.vetoBadge.style.opacity = veto;
}

async function joinLunch() {
  try {
    const payload = await api("/api/session/join", { method: "POST", body: "{}" });
    setSession(payload.session);
  } catch (error) {
    alert(error.message);
  }
}

async function startVote() {
  try {
    const payload = await api("/api/session/start-vote", { method: "POST", body: "{}" });
    setSession(payload.session);
  } catch (error) {
    alert(error.message);
  }
}

async function reveal() {
  try {
    const payload = await api("/api/session/reveal", { method: "POST", body: "{}" });
    setSession(payload.session);
  } catch (error) {
    alert(error.message);
  }
}

async function vote(value) {
  const venue = state.session?.venues[state.currentIndex];
  if (!venue) return;

  animateOut(value);
  state.pendingVotes[venue.id] = value;
  const previousIndex = state.currentIndex;
  state.currentIndex = nextUnvotedIndex();
  setTimeout(() => {
    if (state.currentIndex !== previousIndex) render();
  }, 160);

  try {
    const payload = await api("/api/vote", {
      method: "POST",
      body: JSON.stringify({ venueId: venue.id, vote: value })
    });
    setSession(payload.session);
  } catch (error) {
    delete state.pendingVotes[venue.id];
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
  if (!state.session?.canVote) return;
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

function resetVenueForm() {
  els.venueIdInput.value = "";
  els.venueNameInput.value = "";
  els.venueAddressInput.value = "";
  els.venueImageInput.value = "";
  els.venuePhotoInput.value = "";
  els.venueImagePreview.src = "";
  els.venueImagePreview.classList.add("hidden");
  els.saveVenueButton.textContent = "Сохранить";
}

async function saveVenue(event) {
  event.preventDefault();
  if (!els.venueImageInput.value) {
    alert("Добавь фото заведения");
    return;
  }
  const venue = {
    id: els.venueIdInput.value,
    name: els.venueNameInput.value,
    address: els.venueAddressInput.value,
    image: els.venueImageInput.value
  };
  const method = venue.id ? "PUT" : "POST";
  try {
    const payload = await api("/api/admin/venues", {
      method,
      body: JSON.stringify(venue)
    });
    setSession(payload.session);
    resetVenueForm();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteVenue(id) {
  if (!confirm("Удалить заведение?")) return;
  try {
    const payload = await api("/api/admin/venues", {
      method: "DELETE",
      body: JSON.stringify({ id })
    });
    setSession(payload.session);
  } catch (error) {
    alert(error.message);
  }
}

async function resetSession() {
  if (!confirm("Сбросить сегодняшнюю сессию? Участники и голоса за сегодня будут удалены.")) return;
  try {
    const payload = await api("/api/admin/session/reset", {
      method: "POST",
      body: "{}"
    });
    setSession(payload.session);
    state.adminOpen = false;
    render();
  } catch (error) {
    alert(error.message);
  }
}

function onVenueListClick(event) {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const venue = state.session.venues.find(item => item.id === editId);
    if (!venue) return;
    els.venueIdInput.value = venue.id;
    els.venueNameInput.value = venue.name;
    els.venueAddressInput.value = venue.address || venue.area;
    els.venueImageInput.value = venue.image;
    els.venueImagePreview.src = venue.image;
    els.venueImagePreview.classList.remove("hidden");
    els.venuePhotoInput.value = "";
    els.saveVenueButton.textContent = "Обновить";
  }
  if (deleteId) deleteVenue(deleteId);
}

async function onPhotoSelected() {
  const file = els.venuePhotoInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Выбери изображение");
    els.venuePhotoInput.value = "";
    return;
  }
  try {
    els.saveVenueButton.disabled = true;
    els.saveVenueButton.textContent = "Готовлю фото...";
    const dataUrl = await compressImage(file);
    els.venueImageInput.value = dataUrl;
    els.venueImagePreview.src = dataUrl;
    els.venueImagePreview.classList.remove("hidden");
  } catch {
    alert("Не получилось подготовить фото");
    els.venuePhotoInput.value = "";
  } finally {
    els.saveVenueButton.disabled = false;
    els.saveVenueButton.textContent = els.venueIdInput.value ? "Обновить" : "Сохранить";
  }
}

els.joinButton.addEventListener("click", joinLunch);
els.startVoteButton.addEventListener("click", startVote);
els.revealButton.addEventListener("click", reveal);
els.yesButton.addEventListener("click", () => vote("yes"));
els.noButton.addEventListener("click", () => vote("no"));
els.vetoButton.addEventListener("click", () => vote("veto"));
els.venueCard.addEventListener("pointerdown", onPointerDown);
els.venueCard.addEventListener("pointermove", onPointerMove);
els.venueCard.addEventListener("pointerup", onPointerUp);
els.venueCard.addEventListener("pointercancel", onPointerUp);
els.adminToggle.addEventListener("click", () => {
  state.adminOpen = !state.adminOpen;
  render();
});
els.venueForm.addEventListener("submit", saveVenue);
els.venuePhotoInput.addEventListener("change", onPhotoSelected);
els.resetFormButton.addEventListener("click", resetVenueForm);
els.resetSessionButton.addEventListener("click", resetSession);
els.venueList.addEventListener("click", onVenueListClick);

login();
