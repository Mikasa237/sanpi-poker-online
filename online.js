(function () {
  "use strict";

  const Engine = window.SanpiEngine;
  const TOKEN_PREFIX = "sanpi-online-token:";
  const NAME_KEY = "sanpi-online-name";
  const ONLINE_LAYOUTS = {
    1: [{ x: 50, y: 18 }],
    2: [{ x: 17, y: 43 }, { x: 83, y: 43 }],
    3: [{ x: 14, y: 48 }, { x: 50, y: 17 }, { x: 86, y: 48 }],
    4: [
      { x: 11, y: 57 },
      { x: 26, y: 21 },
      { x: 74, y: 21 },
      { x: 89, y: 57 }
    ],
    5: [
      { x: 10, y: 61 },
      { x: 14, y: 35 },
      { x: 50, y: 16 },
      { x: 86, y: 35 },
      { x: 90, y: 61 }
    ],
    6: [
      { x: 9, y: 63 },
      { x: 10, y: 38 },
      { x: 28, y: 18 },
      { x: 72, y: 18 },
      { x: 90, y: 38 },
      { x: 91, y: 63 }
    ],
    7: [
      { x: 8, y: 64 },
      { x: 8, y: 40 },
      { x: 28, y: 16 },
      { x: 50, y: 11 },
      { x: 72, y: 16 },
      { x: 92, y: 40 },
      { x: 92, y: 64 }
    ],
    8: [
      { x: 8, y: 65 },
      { x: 7, y: 43 },
      { x: 21, y: 23 },
      { x: 36, y: 13 },
      { x: 64, y: 13 },
      { x: 79, y: 23 },
      { x: 93, y: 43 },
      { x: 92, y: 65 }
    ],
    9: [
      { x: 8, y: 66 },
      { x: 7, y: 45 },
      { x: 18, y: 27 },
      { x: 34, y: 14 },
      { x: 50, y: 10 },
      { x: 66, y: 14 },
      { x: 82, y: 27 },
      { x: 93, y: 45 },
      { x: 92, y: 66 }
    ]
  };

  const state = {
    roomCode: null,
    token: null,
    userId: null,
    room: null,
    socket: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    intentionalClose: false,
    pendingAction: false,
    entryMode: "create",
    countdownTimer: null
  };

  const el = {};
  const ids = [
    "loadingScreen",
    "entryScreen",
    "createRoomForm",
    "joinRoomForm",
    "createRoomPanel",
    "joinRoomPanel",
    "joinCode",
    "createName",
    "createSeatCap",
    "createRoomButton",
    "joinName",
    "joinRoomButton",
    "entryError",
    "roomScreen",
    "headerRoomCode",
    "connectionBadge",
    "copyLinkButton",
    "renameButton",
    "rulesButton",
    "leaveRoomButton",
    "lobbyArea",
    "lobbyLead",
    "shareUrlText",
    "copyLinkLargeButton",
    "seatedPlayerCount",
    "seatCapText",
    "lobbyRoomStatus",
    "lobbySeats",
    "spectatorCount",
    "spectatorList",
    "hostHint",
    "lobbyStartButton",
    "lobbyHostTargetSelect",
    "lobbyRemoveButton",
    "transferHostButton",
    "onlineGameArea",
    "onlineTableShell",
    "onlineSeatLayer",
    "onlineHumanHandZone",
    "spectatorNotice",
    "onlinePhaseDot",
    "onlinePhaseText",
    "onlinePotAmount",
    "onlineDeckCount",
    "onlineDiscardPile",
    "onlineTableHint",
    "onlineMiniLog",
    "onlineTurnPanel",
    "onlineTurnEyebrow",
    "onlineTurnTitle",
    "onlineTurnDescription",
    "onlineBettingControls",
    "onlineCallNeed",
    "onlinePotOdds",
    "onlineCurrentBet",
    "onlineRaiseControl",
    "onlineRaiseLabel",
    "onlineRaiseValue",
    "onlineRaiseSlider",
    "onlineRaiseButton",
    "onlineQuickRaises",
    "onlineFoldButton",
    "onlineCallButton",
    "onlineAllInButton",
    "onlineWaitingControls",
    "onlineWaitingTitle",
    "onlineWaitingDescription",
    "hostSkipButton",
    "onlineResultPanel",
    "onlineResultEyebrow",
    "onlineResultTitle",
    "onlineResultPot",
    "onlineResultAwards",
    "onlineNextHint",
    "onlineResultDetails",
    "onlineResultDetailBody",
    "hostControls",
    "hostPauseButton",
    "hostResumeButton",
    "hostStartNowButton",
    "hostRestartButton",
    "hostTargetSelect",
    "hostRemoveButton",
    "hostTransferButton",
    "onlineRemainingText",
    "renameDialog",
    "renameForm",
    "renameInput",
    "renameError",
    "closeRenameButton",
    "rulesDialog",
    "closeRulesButton",
    "onlineToast"
  ];

  function cacheElements() {
    ids.forEach((id) => {
      el[id] = document.getElementById(id);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(Math.round(Number(value) || 0));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function tokenKey(code) {
    return `${TOKEN_PREFIX}${code}`;
  }

  function saveSession(code, payload) {
    state.roomCode = code;
    state.token = payload.token;
    state.userId = payload.userId;
    try {
      localStorage.setItem(
        tokenKey(code),
        JSON.stringify({
          token: payload.token,
          userId: payload.userId
        })
      );
    } catch {
      showToast("浏览器存储不可用，刷新后需要重新加入房间。");
    }
  }

  function loadSession(code) {
    try {
      const raw = localStorage.getItem(tokenKey(code));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed.token || !parsed.userId) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function removeSession(code) {
    try {
      localStorage.removeItem(tokenKey(code));
    } catch {
      // Storage may be disabled; leaving still terminates the socket.
    }
  }

  async function requestJson(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {})
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || `请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function routeCode() {
    const match = location.pathname.match(/^\/room\/([A-Z0-9]{6})\/?$/);
    return match ? match[1] : null;
  }

  function loadPreferredName() {
    try {
      return localStorage.getItem(NAME_KEY) || "";
    } catch {
      return "";
    }
  }

  function rememberName(name) {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Naming still works for the current page.
    }
  }

  function setEntryError(message) {
    el.entryError.textContent = message || "";
    el.entryError.hidden = !message;
  }

  function showEntry(mode, errorMessage) {
    clearTimeout(state.reconnectTimer);
    state.entryMode = mode;
    el.loadingScreen.hidden = true;
    el.roomScreen.hidden = true;
    el.entryScreen.hidden = false;
    el.createRoomPanel.hidden = mode !== "create";
    el.joinRoomPanel.hidden = mode !== "join";
    const preferredName = loadPreferredName();
    if (mode === "create" && !el.createName.value) {
      el.createName.value = preferredName;
    }
    if (mode === "join") {
      el.joinCode.textContent = state.roomCode || "------";
      if (!el.joinName.value) {
        el.joinName.value = preferredName;
      }
    }
    setEntryError(errorMessage || "");
  }

  function showRoom() {
    el.loadingScreen.hidden = true;
    el.entryScreen.hidden = true;
    el.roomScreen.hidden = false;
  }

  function setConnection(status, text) {
    el.connectionBadge.dataset.state = status;
    el.connectionBadge.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(text)}`;
  }

  async function createRoom(event) {
    event.preventDefault();
    setEntryError("");
    const name = el.createName.value.trim();
    const seatCap = Number(el.createSeatCap.value);
    el.createRoomButton.disabled = true;
    try {
      const payload = await requestJson("/api/rooms", { name, seatCap });
      saveSession(payload.roomCode, payload);
      rememberName(name);
      state.roomCode = payload.roomCode;
      history.replaceState({}, "", `/room/${payload.roomCode}`);
      showRoom();
      connectSocket();
    } catch (error) {
      setEntryError(error.message);
    } finally {
      el.createRoomButton.disabled = false;
    }
  }

  async function joinRoom(event) {
    event.preventDefault();
    if (!state.roomCode) {
      setEntryError("房间链接无效。");
      return;
    }
    setEntryError("");
    const name = el.joinName.value.trim();
    el.joinRoomButton.disabled = true;
    try {
      const payload = await requestJson(
        `/api/rooms/${state.roomCode}/join`,
        { name }
      );
      saveSession(state.roomCode, payload);
      rememberName(name);
      showRoom();
      connectSocket();
    } catch (error) {
      setEntryError(error.message);
    } finally {
      el.joinRoomButton.disabled = false;
    }
  }

  async function restoreSession() {
    const saved = loadSession(state.roomCode);
    if (!saved) {
      showEntry("join");
      return;
    }
    state.token = saved.token;
    state.userId = saved.userId;
    try {
      const payload = await requestJson(
        `/api/rooms/${state.roomCode}/join`,
        { token: saved.token }
      );
      saveSession(state.roomCode, payload);
      showRoom();
      connectSocket();
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        removeSession(state.roomCode);
        showEntry("join", error.message);
        return;
      }
      showEntry("join", `暂时无法连接服务器：${error.message}`);
    }
  }

  async function restoreFragmentSession(token) {
    state.token = token;
    try {
      const payload = await requestJson(
        `/api/rooms/${state.roomCode}/join`,
        { token }
      );
      saveSession(state.roomCode, payload);
      showRoom();
      connectSocket();
    } catch (error) {
      removeSession(state.roomCode);
      showEntry("join", `房主链接已失效：${error.message}`);
    }
  }

  function connectSocket() {
    if (!state.token || !state.roomCode) {
      return;
    }
    clearTimeout(state.reconnectTimer);
    state.intentionalClose = false;
    setConnection("reconnecting", "连接中");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    state.socket = socket;

    socket.addEventListener("open", () => {
      state.reconnectAttempt = 0;
      socket.send(
        JSON.stringify({
          type: "auth",
          roomCode: state.roomCode,
          token: state.token
        })
      );
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        showToast("收到无法识别的服务器消息。");
        return;
      }
      if (message.type === "room:state") {
        state.room = message.room;
        state.pendingAction = false;
        setConnection("connected", "已连接");
        showRoom();
        render();
      } else if (message.type === "error") {
        state.pendingAction = false;
        showToast(message.message || "操作失败");
        if (el.renameDialog.open) {
          el.renameError.textContent = message.message || "昵称修改失败";
          el.renameError.hidden = false;
        }
        renderActionControls();
      }
    });

    socket.addEventListener("close", (event) => {
      if (state.intentionalClose) {
        return;
      }
      if (event.code === 4001) {
        state.intentionalClose = true;
        setConnection("reconnecting", "已被新页面接管");
        showToast("该房间已在另一个页面打开，本页面停止同步");
        return;
      }
      if (event.code === 4004) {
        state.intentionalClose = true;
        removeSession(state.roomCode);
        showEntry("join", "房间不存在、凭证已失效，或服务器已经重启。");
        return;
      }
      setConnection("reconnecting", "重连中");
      state.reconnectAttempt += 1;
      const delay = Math.min(8000, 700 * 2 ** Math.min(4, state.reconnectAttempt));
      state.reconnectTimer = setTimeout(connectSocket, delay);
      if ([4003, 4008].includes(event.code)) {
        showToast("连接认证失败，请刷新页面后重试");
      }
    });
    socket.addEventListener("error", () => {
      setConnection("reconnecting", "连接异常");
    });
  }

  function sendMessage(message) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      showToast("连接正在恢复，请稍后再试。");
      return false;
    }
    state.socket.send(JSON.stringify(message));
    return true;
  }

  function cardMarkup(card, options) {
    const opts = options || {};
    if (opts.hidden || (!card && opts.hidden)) {
      return '<div class="playing-card card-back" aria-label="暗牌"></div>';
    }
    if (!card) {
      return `<div class="playing-card is-empty" aria-label="${opts.label || "空牌位"}"></div>`;
    }
    const classes = [
      "playing-card",
      card.color === "red" ? "is-red" : "",
      card.kind !== "normal" ? "is-special" : "",
      card.kind === "wild" ? "is-wild" : "",
      opts.humanCard ? "is-human-card" : "",
      opts.publicCard ? "is-public-card" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const aria =
      card.kind === "normal" ? `${card.suitName}${card.label}` : card.label;
    if (card.kind !== "normal") {
      const art =
        card.kind === "wild"
          ? "/assets/wildcard.svg"
          : card.rank === "BJ"
            ? "/assets/joker-color.svg"
            : "/assets/joker-mono.svg";
      return `
        <div class="${classes}" aria-label="${escapeHtml(aria)}">
          <img class="joker-art" src="${art}" alt="" draggable="false" />
          <span class="special-tag">${escapeHtml(card.label)}</span>
          <span class="special-caption">${card.kind === "wild" ? "WILD" : "JOKER"}</span>
        </div>
      `;
    }
    return `
      <div class="${classes}" aria-label="${escapeHtml(aria)}">
        <span class="card-corner"><span>${escapeHtml(card.label)}</span><span>${card.suitSymbol}</span></span>
        <span class="card-suit-large">${card.suitSymbol}</span>
        <span class="card-corner bottom"><span>${escapeHtml(card.label)}</span><span>${card.suitSymbol}</span></span>
      </div>
    `;
  }

  function miniCardSlot(card, role, options) {
    const opts = options || {};
    const publicCard = role === "up" || (role === "draw" && Boolean(card));
    const label = role === "up" ? "明" : role === "draw" && card ? "摸" : "";
    return `
      <div class="mini-card-slot role-${role} ${publicCard ? "is-face-up" : ""}">
        ${label ? `<span class="mini-card-label" aria-hidden="true">${label}</span>` : ""}
        ${cardMarkup(card, {
          hidden: opts.hidden,
          publicCard,
          label: role === "draw" ? "待摸牌" : "空牌位"
        })}
      </div>
    `;
  }

  function findSelfGameIndex(game) {
    return game.players.findIndex(
      (player) => state.room?.self && player.id === state.room.self.id
    );
  }

  function visiblePlayerEntries(game) {
    return game.players
      .map((player, index) => ({ player, index }))
      .filter((entry) => !entry.player.id.startsWith("empty-"));
  }

  function rotatedPlayers(game) {
    const selfIndex = findSelfGameIndex(game);
    const visible = visiblePlayerEntries(game);
    if (selfIndex < 0) {
      return visible;
    }
    const start = visible.findIndex((entry) => entry.index === selfIndex);
    if (start < 0) {
      return visible;
    }
    return Array.from({ length: visible.length }, (_, offset) => {
      return visible[(start + offset) % visible.length];
    });
  }

  function opponentPosition(ordinal, count) {
    return ONLINE_LAYOUTS[count]?.[ordinal] || { x: 50, y: 15 };
  }

  function playerStatus(player) {
    if (player.eliminated) {
      return "筹码耗尽";
    }
    if (player.folded) {
      return "已弃牌";
    }
    if (player.allIn) {
      return "已全下";
    }
    return player.lastAction || "等待";
  }

  function seatMarkup(player, index, ordinal, count) {
    const position = opponentPosition(ordinal, count);
    const isCurrent =
      ["bet1", "bet2"].includes(state.room.game.phase) &&
      state.room.game.actorIndex === index;
    const rosterUser = state.room.users.find((entry) => entry.id === player.id);
    const connected = rosterUser ? rosterUser.connected : false;
    const isWinner = Boolean(
      state.room.game.summary &&
      state.room.game.summary.winners.includes(index)
    );
    const status = playerStatus(player);
    const classes = [
      "seat",
      "online-player-seat",
      isCurrent ? "is-current" : "",
      player.folded ? "is-folded" : "",
      player.eliminated ? "is-eliminated" : "",
      !connected ? "is-offline" : "",
      isWinner ? "is-winner" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const hiddenHole = !player.holeCard && player.hasHiddenHole;
    const cards = [
      miniCardSlot(player.holeCard, "hole", { hidden: hiddenHole }),
      miniCardSlot(player.upCard, "up"),
      miniCardSlot(player.drawCard, "draw")
    ].join("");
    const dealer =
      state.room.game.dealerIndex === index
        ? '<span class="seat-badge" aria-label="庄家">庄</span>'
        : "";
    const turn = isCurrent
      ? '<span class="seat-badge turn-badge" aria-label="当前行动">行动</span>'
      : "";
    const offline = !connected
      ? '<span class="seat-badge offline-badge" aria-label="离线">离线</span>'
      : "";
    return `
      <article
        class="${classes}"
        style="--seat-x:${position.x}%;--seat-y:${position.y}%"
        aria-label="${escapeHtml(player.name)}，${formatNumber(player.stack)} 筹码，${escapeHtml(status)}"
      >
        <div class="seat-badge-row">${dealer}${offline}${turn}</div>
        <div class="seat-topline">
          <div class="avatar" aria-hidden="true">${escapeHtml(player.name.slice(0, 1))}</div>
          <div class="seat-identity">
            <strong>${escapeHtml(player.name)}</strong>
            <span>${connected ? "在线" : "离线"} · 座位 ${index + 1}</span>
          </div>
          <div class="seat-stack">
            <strong>${formatNumber(player.stack)}</strong>
            <span>筹码</span>
          </div>
        </div>
        <div class="seat-cards">${cards}</div>
        <div class="seat-meta">
          <span class="seat-action">${escapeHtml(status)}</span>
          <span class="seat-contribution">${
            player.roundContribution
              ? `本轮 +${formatNumber(player.roundContribution)}`
              : `本手 ${formatNumber(player.handContribution)}`
          }</span>
        </div>
      </article>
    `;
  }

  function heroCardSlot(card, role, title, caption) {
    const publicCard = role !== "hole" && Boolean(card);
    return `
      <div class="hero-card-slot role-${role} ${publicCard ? "is-face-up" : ""}">
        ${cardMarkup(card, {
          humanCard: true,
          publicCard,
          label: role === "draw" ? "等待摸牌" : "空牌位"
        })}
        <div class="hero-card-label">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(caption)}</span>
        </div>
      </div>
    `;
  }

  function humanHandMarkup(player) {
    const isCurrent =
      ["bet1", "bet2"].includes(state.room.game.phase) &&
      state.room.game.actorIndex === player.seat;
    const status = playerStatus(player);
    const dealer =
      state.room.game.dealerIndex === player.seat
        ? '<span class="hero-badge dealer">庄</span>'
        : "";
    const turn = isCurrent
      ? '<span class="hero-badge turn">你的回合</span>'
      : "";
    return `
      <article class="human-hand-card ${isCurrent ? "is-current" : ""} ${
        player.folded ? "is-folded" : ""
      } ${player.eliminated ? "is-eliminated" : ""}">
        <div class="human-hand-identity">
          <div class="human-avatar avatar" aria-hidden="true">${escapeHtml(
            player.name.slice(0, 1)
          )}</div>
          <div>
            <strong>${escapeHtml(player.name)} 的手牌</strong>
            <span>${player.eliminated ? "筹码耗尽，已退出座位" : "底牌仅你可见"}</span>
          </div>
          <div class="human-stack">
            <strong>${formatNumber(player.stack)}</strong>
            <span>筹码</span>
          </div>
        </div>
        <div class="hero-hand-cards">
          ${heroCardSlot(player.holeCard, "hole", "底牌", "仅你可见")}
          ${heroCardSlot(player.upCard, "up", "明牌", "桌面公开")}
          ${heroCardSlot(
            player.drawCard,
            "draw",
            "摸牌",
            player.drawCard ? "桌面公开" : "第一轮后"
          )}
        </div>
        <div class="human-hand-state">
          <div class="hero-badge-row">${dealer}${turn}</div>
          <strong>${escapeHtml(status)}</strong>
          <span>${
            player.roundContribution
              ? `本轮投入 ${formatNumber(player.roundContribution)}`
              : `本手投入 ${formatNumber(player.handContribution)}`
          }</span>
        </div>
      </article>
    `;
  }

  function renderGameSeats(game) {
    const ordered = rotatedPlayers(game);
    const selfIndex = findSelfGameIndex(game);
    const self = selfIndex >= 0 ? game.players[selfIndex] : null;
    const opponents = ordered.filter((entry) => entry.index !== selfIndex);
    el.onlineSeatLayer.innerHTML = opponents
      .map((entry, ordinal) =>
        seatMarkup(entry.player, entry.index, ordinal, opponents.length)
      )
      .join("");
    el.onlineHumanHandZone.innerHTML = self ? humanHandMarkup(self) : "";
    el.onlineHumanHandZone.hidden = !self;
    el.spectatorNotice.hidden = Boolean(self);
    el.onlineTableShell.classList.toggle(
      "is-large-table",
      opponents.length >= 7
    );
  }

  function renderGameCenter(game) {
    const actor =
      game.actorIndex !== null ? game.players[game.actorIndex] : null;
    el.headerRoomCode.textContent = state.room.code;
    el.onlinePhaseText.textContent = game.tableOver
      ? "本局结束"
      : game.phase === "bet1"
        ? "第一轮下注"
        : game.phase === "bet2"
          ? "第二轮下注"
          : game.phase === "complete"
            ? "本手结算"
            : "等待开局";
    el.onlinePhaseDot.classList.toggle(
      "is-complete",
      game.phase === "complete"
    );
    el.onlinePotAmount.textContent = formatNumber(Engine.roundPot(game.players));
    el.onlineDeckCount.textContent = `${game.deckCount ?? 0} 张`;
    el.onlineDiscardPile.classList.toggle(
      "has-card",
      Boolean(game.discardCard || game.hasDiscard)
    );
    if (game.tableOver) {
      el.onlineTableHint.textContent = game.tableOver.reason;
    } else if (game.phase === "complete") {
      el.onlineTableHint.textContent = game.summary?.reason || "本手结束";
    } else if (actor) {
      el.onlineTableHint.textContent =
        actor.id === state.room.self.id
          ? "轮到你行动。"
          : `等待 ${actor.name} 行动。`;
    } else {
      el.onlineTableHint.textContent = "牌局同步中。";
    }
    const latest = (game.logs || [])
      .filter((entry) => entry.hand === game.handNo)
      .slice(-2)
      .map((entry) => entry.text);
    el.onlineMiniLog.textContent = latest.join(" ");
  }

  function sendPlayerAction(action) {
    if (!state.room?.game || state.pendingAction) {
      return;
    }
    const requestId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (
      sendMessage({
        type: "action",
        handNo: state.room.game.handNo,
        requestId,
        action
      })
    ) {
      state.pendingAction = true;
      renderActionControls();
    }
  }

  function setButtonDisabled(button, disabled) {
    button.disabled = Boolean(disabled);
  }

  function renderActionControls() {
    const game = state.room?.game;
    if (!game) {
      return;
    }
    const selfIndex = findSelfGameIndex(game);
    const self = selfIndex >= 0 ? game.players[selfIndex] : null;
    const isMyTurn =
      Boolean(self) &&
      !self.eliminated &&
      !self.folded &&
      game.actorIndex === selfIndex &&
      ["bet1", "bet2"].includes(game.phase);
    el.onlineBettingControls.hidden = !isMyTurn;
    el.onlineWaitingControls.hidden = true;
    el.onlineResultPanel.hidden = game.phase !== "complete";
    if (isMyTurn) {
      const legal = Engine.getLegalActions(game, selfIndex);
      const need = Math.max(0, game.currentBet - self.roundContribution);
      const pot = Engine.roundPot(game.players);
      const callAmount = legal.call ? legal.call.amount : need;
      el.onlineCallNeed.textContent = formatNumber(callAmount);
      el.onlineCurrentBet.textContent = formatNumber(game.currentBet);
      el.onlinePotOdds.textContent =
        callAmount > 0
          ? `${Math.round((callAmount / (pot + callAmount)) * 100)}%`
          : "—";
      el.onlineFoldButton.hidden = !legal.fold;
      el.onlineFoldButton.disabled = state.pendingAction;
      el.onlineCallButton.hidden = !legal.call;
      if (legal.call) {
        el.onlineCallButton.textContent = `${legal.call.label} ${formatNumber(
          legal.call.amount
        )}`;
        el.onlineCallButton.disabled = state.pendingAction;
      }
      el.onlineAllInButton.hidden = !legal.allIn;
      if (legal.allIn) {
        el.onlineAllInButton.textContent = `全下 ${formatNumber(
          legal.allIn.amount
        )}`;
        el.onlineAllInButton.disabled = state.pendingAction;
      }
      el.onlineRaiseControl.hidden = !legal.raise;
      if (legal.raise) {
        const slider = el.onlineRaiseSlider;
        slider.min = String(legal.raise.min);
        slider.max = String(legal.raise.max);
        slider.step = String(legal.raise.step);
        const value = Number(slider.value);
        if (!Number.isFinite(value) || value < legal.raise.min || value > legal.raise.max) {
          slider.value = String(legal.raise.min);
        }
        el.onlineRaiseLabel.textContent = `${legal.raise.label}到`;
        el.onlineRaiseButton.textContent = legal.raise.label;
        el.onlineRaiseButton.disabled = state.pendingAction;
        slider.disabled = state.pendingAction;
        updateOnlineRaiseDisplay();
      }
      el.onlineTurnEyebrow.textContent =
        game.phase === "bet1" ? "第一轮 · 轮到你" : "第二轮 · 轮到你";
      el.onlineTurnTitle.textContent = "选择你的行动";
      el.onlineTurnDescription.textContent =
        "服务器会验证金额和行动顺序，其他玩家的底牌不会下发到你的浏览器。";
      el.hostSkipButton.hidden = true;
      return;
    }

    if (game.phase === "complete") {
      el.onlineTurnEyebrow.textContent = game.tableOver ? "本桌结束" : "本手结算";
      el.onlineTurnTitle.textContent = game.tableOver
        ? game.tableOver.reason
        : "等待下一手";
      el.onlineTurnDescription.textContent = game.tableOver
        ? "房主可以重新开一局。"
        : "结算结束后会自动开始下一手，房主可以暂停或立即开始。";
      return;
    }

    el.onlineWaitingControls.hidden = false;
    const actor =
      game.actorIndex !== null ? game.players[game.actorIndex] : null;
    el.onlineTurnEyebrow.textContent = self
      ? game.phase === "bet2"
        ? "第二轮下注"
        : "第一轮下注"
      : "旁观模式";
    el.onlineTurnTitle.textContent = actor
      ? `等待 ${actor.name} 行动`
      : "等待牌局继续";
    el.onlineTurnDescription.textContent = self?.folded
      ? "你已弃牌，本手结束后可以等待下一手。"
      : self?.eliminated
        ? "筹码耗尽，下一手将作为旁观者。"
        : "联机状态会自动同步。";
    el.onlineWaitingTitle.textContent = actor
      ? `${actor.name} 正在决策`
      : "等待房主";
    el.onlineWaitingDescription.textContent = actor
      ? "断线玩家不会自动弃牌，房主可以手动跳过。"
      : "请等待牌局开始。";
    el.hostSkipButton.hidden = !(
      state.room.self.isHost &&
      actor &&
      actor.id !== state.room.self.id
    );
  }

  function updateOnlineRaiseDisplay() {
    el.onlineRaiseValue.textContent = formatNumber(
      Number(el.onlineRaiseSlider.value)
    );
  }

  function setQuickRaise(kind) {
    const game = state.room?.game;
    const selfIndex = game ? findSelfGameIndex(game) : -1;
    if (selfIndex < 0) {
      return;
    }
    const legal = Engine.getLegalActions(game, selfIndex);
    if (!legal.raise) {
      return;
    }
    const self = game.players[selfIndex];
    const pot = Engine.roundPot(game.players);
    const need = Math.max(0, game.currentBet - self.roundContribution);
    const step = legal.raise.step;
    let target = legal.raise.min;
    if (kind === "half") {
      target = game.currentBet + (pot + need) * 0.5;
    } else if (kind === "pot") {
      target = game.currentBet + pot + need;
    } else if (kind === "max") {
      target = legal.raise.max;
    }
    target = Math.round(target / step) * step;
    el.onlineRaiseSlider.value = String(
      clamp(target, legal.raise.min, legal.raise.max)
    );
    updateOnlineRaiseDisplay();
  }

  function renderResult(game) {
    if (game.phase !== "complete" || !game.summary) {
      return;
    }
    const summary = game.summary;
    const self = state.room.self;
    const selfAward = summary.awards.find((award) => award.playerId === self.id);
    const selfPlayer = game.players.find((player) => player.id === self.id);
    el.onlineResultEyebrow.textContent = game.tableOver ? "本桌结束" : "本手结算";
    if (game.tableOver?.status === "won" && game.tableOver.winnerId === self.id) {
      el.onlineResultTitle.textContent = "你赢下了整桌";
    } else if (selfPlayer?.eliminated) {
      el.onlineResultTitle.textContent = "筹码耗尽，已退出座位";
    } else if (selfAward) {
      el.onlineResultTitle.textContent = `你赢得 ${formatNumber(selfAward.amount)} 筹码`;
    } else if (summary.awards.length === 1) {
      el.onlineResultTitle.textContent = `${summary.awards[0].name} 收下底池`;
    } else {
      el.onlineResultTitle.textContent = "本手结算";
    }
    el.onlineResultPot.textContent = formatNumber(summary.potTotal);
    el.onlineResultAwards.innerHTML = summary.awards
      .map(
        (award) =>
          `<span class="award-chip">${escapeHtml(award.name)} <strong>+${formatNumber(
            award.amount
          )}</strong></span>`
      )
      .join("");
    const evaluations = summary.evaluations.length
      ? summary.evaluations
          .map((entry) => {
            const cards = entry.cards.map((card) => Engine.cardText(card)).join(" ");
            return `<div class="result-detail-line"><span>${escapeHtml(
              entry.name
            )} · ${escapeHtml(entry.evaluation.description)}</span><span>${escapeHtml(
              cards
            )}</span></div>`;
          })
          .join("")
      : `<div class="result-detail-line"><span>${escapeHtml(
          summary.reason
        )}</span><span>无需开牌</span></div>`;
    const pots = summary.settlements
      .map((pot) => {
        const names = pot.winners
          .map((index) => game.players[index].name)
          .join("、");
        return `<div class="result-detail-line"><span>${
          pot.index === 0 ? "主池" : `边池 ${pot.index}`
        } · ${escapeHtml(names)}</span><span>${formatNumber(
          pot.amount
        )}</span></div>`;
      })
      .join("");
    el.onlineResultDetailBody.innerHTML = evaluations + pots;
    el.onlineResultPanel.classList.toggle(
      "is-loss",
      Boolean(selfPlayer?.eliminated)
    );
    el.onlineResultPanel.classList.toggle(
      "is-victory",
      game.tableOver?.winnerId === self.id
    );
    updateCountdown();
  }

  function updateCountdown() {
    const room = state.room;
    if (!room?.game || room.game.phase !== "complete" || !room.nextHandAt) {
      el.onlineNextHint.textContent = room?.paused
        ? "自动续手已暂停，等待房主继续。"
        : room?.game?.tableOver
          ? "本桌牌局已经结束。"
          : "等待下一手。";
      return;
    }
    const remaining = Math.max(0, Math.ceil((room.nextHandAt - Date.now()) / 1000));
    el.onlineNextHint.textContent = `${remaining} 秒后自动开始下一手${
      room.paused ? "（房主已暂停）" : ""
    }`;
  }

  function renderHostControls() {
    const room = state.room;
    const game = room?.game;
    const isHost = room.self?.isHost;
    el.hostControls.hidden = !isHost;
    el.hostPauseButton.hidden =
      !game || game.phase !== "complete" || Boolean(room.paused);
    el.hostResumeButton.hidden =
      !game || game.phase !== "complete" || !room.paused;
    el.hostStartNowButton.hidden =
      !game || game.phase !== "complete" || Boolean(game.tableOver);
    el.hostRestartButton.hidden = !game?.tableOver;
    const gameTargets = room.users.filter(
      (user) => user.id !== room.self.id && user.seat !== null
    );
    el.hostTargetSelect.innerHTML = gameTargets.length
      ? gameTargets
          .map(
            (user) =>
              `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}${
                user.connected ? "" : "（离线）"
              }</option>`
          )
          .join("")
      : '<option value="">暂无可管理人员</option>';
    el.hostRemoveButton.disabled = !gameTargets.length;
    const transferable = room.users.filter(
      (user) => user.id !== room.self.id && user.connected
    );
    el.hostTransferButton.disabled = !transferable.length;
  }

  function renderLobby() {
    const room = state.room;
    el.lobbyArea.hidden = false;
    el.onlineGameArea.hidden = true;
    el.headerRoomCode.textContent = room.code;
    el.seatCapText.textContent = room.seatCap;
    el.seatedPlayerCount.textContent = room.seats.filter(Boolean).length;
    el.lobbyRoomStatus.textContent =
      room.status === "matchOver" ? "上一局结束" : "等待开局";
    el.lobbyLead.textContent =
      room.seats.filter(Boolean).length < 2
        ? "至少还需要一名玩家入座。"
        : "玩家已入座，房主可以开始第一手。";
    const shareUrl = `${location.origin}/room/${room.code}`;
    el.shareUrlText.textContent = shareUrl;
    el.lobbySeats.innerHTML = room.seats
      .map((seatUser, seatIndex) => {
        if (!seatUser) {
          return `
            <div class="lobby-seat is-empty">
              <span>座位 ${seatIndex + 1} · 等待玩家</span>
            </div>
          `;
        }
        const user = room.users.find((entry) => entry.id === seatUser.userId);
        return `
          <div class="lobby-seat ${user?.isSelf ? "is-self" : ""} ${
            user?.connected ? "" : "is-offline"
          }">
            ${user?.isHost ? '<span class="seat-role">房主</span>' : ""}
            <div class="avatar" aria-hidden="true">${escapeHtml(
              seatUser.name.slice(0, 1)
            )}</div>
            <div>
              <strong>${escapeHtml(seatUser.name)}${
                user?.isSelf ? "（你）" : ""
              }</strong>
              <span>${user?.connected ? "已连接" : "离线"} · 座位 ${
                seatIndex + 1
              }</span>
            </div>
          </div>
        `;
      })
      .join("");
    const spectators = room.spectators;
    el.spectatorCount.textContent = `${spectators.length} 人`;
    el.spectatorList.innerHTML = spectators.length
      ? spectators
          .map(
            (user) =>
              `<div class="spectator-item">${escapeHtml(user.name)}${
                user.isSelf ? "（你）" : ""
              }<span>${user.connected ? "旁观中" : "离线"}</span></div>`
          )
          .join("")
      : '<div class="spectator-item">暂无旁观者<span>—</span></div>';

    const isHost = room.self?.isHost;
    el.lobbyStartButton.hidden = !isHost;
    el.lobbyStartButton.disabled = room.seats.filter(Boolean).length < 2;
    el.hostHint.textContent = isHost
      ? room.seats.filter(Boolean).length < 2
        ? "至少需要两名在座玩家才能开局。"
        : "所有人入座后即可开始，牌局开始后加入者会先旁观。"
      : "等待房主开始牌局。";
    el.lobbyHostTargetSelect.parentElement.hidden = !isHost;
    const targets = room.users.filter(
      (user) => user.id !== room.self.id && user.seat !== null
    );
    el.lobbyHostTargetSelect.innerHTML = targets.length
      ? targets
          .map(
            (user) =>
              `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}${
                user.connected ? "" : "（离线）"
              }</option>`
          )
          .join("")
      : '<option value="">暂无可管理人员</option>';
    el.lobbyRemoveButton.hidden = !isHost;
    el.lobbyRemoveButton.disabled = !targets.length;
    el.transferHostButton.hidden = !isHost;
    el.transferHostButton.disabled =
      !room.users.some((user) => user.id !== room.self.id && user.connected);
  }

  function renderGame() {
    const room = state.room;
    const game = room.game;
    el.lobbyArea.hidden = true;
    el.onlineGameArea.hidden = false;
    el.headerRoomCode.textContent = room.code;
    renderGameSeats(game);
    renderGameCenter(game);
    renderActionControls();
    renderResult(game);
    renderHostControls();
    const remaining = game.players.filter((player) => !player.eliminated).length;
    el.onlineRemainingText.textContent = `剩余 ${remaining} 人`;
  }

  function render() {
    if (!state.room) {
      return;
    }
    if (!state.room.game) {
      renderLobby();
    } else {
      renderGame();
    }
  }

  function showToast(message) {
    el.onlineToast.textContent = message;
    el.onlineToast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      el.onlineToast.hidden = true;
    }, 3000);
  }

  async function copyInviteLink() {
    const link = `${location.origin}/room/${state.room?.code || state.roomCode}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("邀请链接已复制");
    } catch {
      showToast(`邀请链接：${link}`);
    }
  }

  function openRenameDialog() {
    if (!state.room?.self) {
      return;
    }
    el.renameInput.value = state.room.self.name;
    el.renameError.hidden = true;
    if (typeof el.renameDialog.showModal === "function") {
      el.renameDialog.showModal();
    } else {
      el.renameDialog.setAttribute("open", "");
    }
  }

  function submitRename(event) {
    event.preventDefault();
    const name = el.renameInput.value.trim();
    if (!name) {
      return;
    }
    if (sendMessage({ type: "rename", name })) {
      rememberName(name);
      el.renameDialog.close();
    }
  }

  function leaveRoom() {
    if (!window.confirm("确定离开这个联机房间吗？本手中的座位会在本手结束后释放。")) {
      return;
    }
    sendMessage({ type: "leave" });
    state.intentionalClose = true;
    clearTimeout(state.reconnectTimer);
    state.socket?.close();
    removeSession(state.roomCode);
    location.href = "/index.html";
  }

  function sendHostCommand(type, extra) {
    sendMessage(Object.assign({ type }, extra || {}));
  }

  function selectedHostTarget(select) {
    return select.value || null;
  }

  function bindEvents() {
    el.createRoomForm?.addEventListener("submit", createRoom);
    el.joinRoomForm?.addEventListener("submit", joinRoom);
    el.copyLinkButton.addEventListener("click", copyInviteLink);
    el.copyLinkLargeButton.addEventListener("click", copyInviteLink);
    el.renameButton.addEventListener("click", openRenameDialog);
    el.renameForm.addEventListener("submit", submitRename);
    el.closeRenameButton.addEventListener("click", () => el.renameDialog.close());
    el.rulesButton.addEventListener("click", () => el.rulesDialog.showModal());
    el.closeRulesButton.addEventListener("click", () => el.rulesDialog.close());
    el.leaveRoomButton.addEventListener("click", leaveRoom);
    el.lobbyStartButton.addEventListener("click", () =>
      sendHostCommand("host:start")
    );
    el.hostPauseButton.addEventListener("click", () =>
      sendHostCommand("host:pause")
    );
    el.hostResumeButton.addEventListener("click", () =>
      sendHostCommand("host:resume")
    );
    el.hostStartNowButton.addEventListener("click", () =>
      sendHostCommand("host:start")
    );
    el.hostRestartButton.addEventListener("click", () =>
      sendHostCommand("host:start")
    );
    el.hostSkipButton.addEventListener("click", () => {
      const actor =
        state.room.game?.actorIndex !== null
          ? state.room.game?.players[state.room.game?.actorIndex]
          : null;
      if (
        actor &&
        window.confirm(`确认跳过 ${actor.name}？本次操作视为弃牌。`)
      ) {
        sendHostCommand("host:skip", { targetId: actor.id });
      }
    });
    el.hostRemoveButton.addEventListener("click", () => {
      const targetId = selectedHostTarget(el.hostTargetSelect);
      if (
        targetId &&
        window.confirm("确认在本手结束后把该玩家移出座位？")
      ) {
        sendHostCommand("host:remove", { targetId });
      }
    });
    el.hostTransferButton.addEventListener("click", () => {
      const targetId = selectedHostTarget(el.hostTargetSelect);
      if (targetId && window.confirm("确认转让房主？")) {
        sendHostCommand("host:transfer", { targetId });
      }
    });
    el.lobbyRemoveButton.addEventListener("click", () => {
      const targetId = selectedHostTarget(el.lobbyHostTargetSelect);
      if (targetId && window.confirm("确认将该玩家移出座位？")) {
        sendHostCommand("host:remove", { targetId });
      }
    });
    el.transferHostButton.addEventListener("click", () => {
      const targetId = selectedHostTarget(el.lobbyHostTargetSelect);
      if (targetId && window.confirm("确认转让房主？")) {
        sendHostCommand("host:transfer", { targetId });
      }
    });
    el.onlineFoldButton.addEventListener("click", () =>
      sendPlayerAction({ type: "fold" })
    );
    el.onlineCallButton.addEventListener("click", () =>
      sendPlayerAction({ type: "call" })
    );
    el.onlineAllInButton.addEventListener("click", () =>
      sendPlayerAction({ type: "all_in" })
    );
    el.onlineRaiseButton.addEventListener("click", () =>
      sendPlayerAction({
        type: "raise",
        amount: Number(el.onlineRaiseSlider.value)
      })
    );
    el.onlineRaiseSlider.addEventListener("input", updateOnlineRaiseDisplay);
    el.onlineQuickRaises.addEventListener("click", (event) => {
      const button = event.target.closest("[data-raise]");
      if (button) {
        setQuickRaise(button.dataset.raise);
      }
    });
    [el.rulesDialog, el.renameDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          dialog.close();
        }
      });
    });
  }

  function init() {
    cacheElements();
    bindEvents();
    state.countdownTimer = setInterval(updateCountdown, 250);
    const code = routeCode();
    if (code) {
      state.roomCode = code;
      if (location.protocol === "file:") {
        showEntry(
          "join",
          "联机模式需要通过 npm start 启动服务器，不能直接双击本地文件进入房间。"
        );
        el.joinRoomButton.disabled = true;
        return;
      }
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      const fragmentToken = hash.get("owner");
      if (fragmentToken) {
        history.replaceState({}, "", location.pathname);
        restoreFragmentSession(fragmentToken);
        return;
      }
      restoreSession();
      return;
    }
    showEntry("create");
    if (location.protocol === "file:") {
      setEntryError(
        "联机模式需要通过 npm start 启动服务器；双击文件仅能使用单机模式。"
      );
      el.createRoomButton.disabled = true;
    }
  }

  init();
})();
