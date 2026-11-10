(function () {
  "use strict";

  const Engine = window.SanpiEngine;
  const TOKEN_PREFIX = "sanpi-online-token:";
  const NAME_KEY = "sanpi-online-name";
  const AVATAR_KEY = "sanpi-online-avatar";
  const PREF_KEY = "sanpi-online-preferences";
  const HOST_TOKEN_KEY = "sanpi-online-host-token";
  const QUICK_VOICE_FILES = Object.freeze({
    hurry: "/assets/voice/quick-hurry.mp3",
    call: "/assets/voice/quick-call.mp3",
    think: "/assets/voice/quick-think.mp3",
    nice: "/assets/voice/quick-nice.mp3",
    close: "/assets/voice/quick-close.mp3",
    friendly: "/assets/voice/quick-friendly.mp3",
    again: "/assets/voice/quick-again.mp3",
    wow: "/assets/voice/quick-wow.mp3"
  });
  const PRESET_AVATARS = [
    { id: "jester", emoji: "🃏", color: "#70435f" },
    { id: "fox", emoji: "🦊", color: "#8d4d2f" },
    { id: "cat", emoji: "🐱", color: "#5a5b78" },
    { id: "tiger", emoji: "🐯", color: "#876231" },
    { id: "rabbit", emoji: "🐰", color: "#795874" },
    { id: "owl", emoji: "🦉", color: "#315d59" },
    { id: "bear", emoji: "🐻", color: "#6b4a31" },
    { id: "wolf", emoji: "🐺", color: "#445462" },
    { id: "panda", emoji: "🐼", color: "#59635d" },
    { id: "lion", emoji: "🦁", color: "#8b5b21" }
  ];
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
      { x: 8, y: 68 },
      { x: 8, y: 43 },
      { x: 28, y: 17 },
      { x: 50, y: 13 },
      { x: 72, y: 17 },
      { x: 92, y: 43 },
      { x: 92, y: 68 }
    ],
    8: [
      { x: 8, y: 69 },
      { x: 8, y: 45 },
      { x: 22, y: 20 },
      { x: 42, y: 13 },
      { x: 58, y: 13 },
      { x: 78, y: 20 },
      { x: 92, y: 45 },
      { x: 92, y: 69 }
    ],
    9: [
      { x: 8, y: 70 },
      { x: 7, y: 45 },
      { x: 18, y: 16 },
      { x: 34, y: 14 },
      { x: 50, y: 14 },
      { x: 66, y: 14 },
      { x: 82, y: 16 },
      { x: 93, y: 45 },
      { x: 92, y: 70 }
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
    hostPortalMode: false,
    hostToken: null,
    hostAuthorized: false,
    opponentDrawerOpen: false,
    mobileToolsOpen: false,
    countdownTimer: null,
    draftAvatars: {
      create: "preset:jester",
      join: "preset:jester",
      rename: "preset:jester"
    },
    preferences: {
      sound: true,
      motion: true,
      localChatMuted: false
    },
    activeSocialTab: "equity",
    unreadChat: 0,
    lastPresentationSequence: 0,
    lastPresentationKey: "",
    lastShuffleCeremonyKey: "",
    lastChatMessageId: null,
    pendingChatBubble: null,
    lastTurnAlertSignature: "",
    lastResultSignature: "",
    voiceQueue: [],
    voicePlaying: false,
    voiceCache: new Map(),
    audioContext: null,
    rewindTickTimer: null,
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
    "createAvatarPreview",
    "createAvatarFile",
    "createPresetAvatars",
    "joinAvatarPreview",
    "joinAvatarFile",
    "joinPresetAvatars",
    "entryError",
    "hostPrivatePanel",
    "roomScreen",
    "headerRoomCode",
    "connectionBadge",
    "selfProfileAvatar",
    "copyLinkButton",
    "renameButton",
    "onlineSoundToggle",
    "onlineMotionToggle",
    "rulesButton",
    "mobileToolsButton",
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
    "lobbyStakeSettings",
    "lobbyStartingChipsInput",
    "lobbyAnteInput",
    "lobbyBetCapInput",
    "saveStakeSettingsButton",
    "lobbyStartButton",
    "lobbyHostTargetSelect",
    "lobbyRemoveButton",
    "transferHostButton",
    "onlineGameArea",
    "onlineTableShell",
    "onlineShuffleCeremony",
    "mobileOpponentsToggle",
    "mobileOpponentSummary",
    "mobileOpponentDetail",
    "mobileOpponentsBackdrop",
    "mobileOpponentCloseButton",
    "onlineTurnAlert",
    "onlineTurnAlertText",
    "onlineGoToActionButton",
    "rewindPanel",
    "rewindTitle",
    "rewindCountdown",
    "rewindDescription",
    "rewindSelectArea",
    "rewindTargetSelect",
    "rewindRequestButton",
    "rewindSkipButton",
    "rewindIncomingArea",
    "rewindIncomingText",
    "rewindAcceptButton",
    "rewindDeclineButton",
    "rewindViewNotice",
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
    "onlineRaiseInput",
    "onlineRaiseButton",
    "onlineQuickRaises",
    "onlineFoldButton",
    "onlineCallButton",
    "onlineAllInButton",
    "onlineWaitingControls",
    "onlineWaitingTitle",
    "onlineWaitingDescription",
    "hostSkipButton",
    "onlineEarlyFoldButton",
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
    "nextMatchSettings",
    "nextStartingChipsInput",
    "nextAnteInput",
    "nextBetCapInput",
    "applyNextSettingsButton",
    "onlineRemainingText",
    "onlineStakesText",
    "onlineActionDock",
    "onlineMoreTools",
    "mobileToolsCloseButton",
    "mobileRulesButton",
    "mobileLeaveButton",
    "mobileToolsBackdrop",
    "equityTab",
    "chatTab",
    "chatUnreadBadge",
    "equityPanel",
    "equityHandLabel",
    "equitySample",
    "equityBars",
    "chatPanel",
    "chatDisabledNotice",
    "chatMessages",
    "quickPhraseBar",
    "emoteTarget",
    "chatForm",
    "chatInput",
    "chatSendButton",
    "chatLocalMuteButton",
    "chatStatusText",
    "hostChatControls",
    "chatModerationTarget",
    "hostMuteButton",
    "hostUnmuteButton",
    "hostClearChatButton",
    "hostToggleChatButton",
    "renameDialog",
    "renameForm",
    "renameInput",
    "renameAvatarPreview",
    "renameAvatarFile",
    "renamePresetAvatars",
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

  function loadPreferredAvatar() {
    try {
      return localStorage.getItem(AVATAR_KEY) || "preset:jester";
    } catch {
      return "preset:jester";
    }
  }

  function loadHostToken() {
    try {
      return localStorage.getItem(HOST_TOKEN_KEY) || null;
    } catch {
      return null;
    }
  }

  function saveHostToken(token) {
    state.hostToken = token;
    try {
      localStorage.setItem(HOST_TOKEN_KEY, token);
    } catch {
      // The current link still works until the page is closed.
    }
  }

  function rememberName(name) {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Naming still works for the current page.
    }
  }

  function rememberAvatar(avatar) {
    state.draftAvatars.create = avatar;
    state.draftAvatars.join = avatar;
    state.draftAvatars.rename = avatar;
    try {
      localStorage.setItem(AVATAR_KEY, avatar);
    } catch {
      showToast("头像没能保存到本地浏览器。");
    }
  }

  function loadPreferences() {
    try {
      state.preferences = Object.assign(
        state.preferences,
        JSON.parse(localStorage.getItem(PREF_KEY) || "{}")
      );
    } catch {
      // Defaults are already loaded.
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(state.preferences));
    } catch {
      // Preferences remain active for the current page.
    }
  }

  function presetAvatar(avatar) {
    return (
      PRESET_AVATARS.find((entry) => avatar === `preset:${entry.id}`) ||
      PRESET_AVATARS[0]
    );
  }

  function avatarMarkup(userOrAvatar, classes) {
    const avatar =
      typeof userOrAvatar === "string"
        ? userOrAvatar
        : userOrAvatar?.avatarUrl || "preset:jester";
    const extra = classes || "";
    if (avatar.startsWith("preset:")) {
      const preset = presetAvatar(avatar);
      return `<span class="avatar ${extra}" style="background:${preset.color}"><span class="avatar-glyph" aria-hidden="true">${preset.emoji}</span></span>`;
    }
    return `<span class="avatar ${extra}"><img class="avatar-image" src="${escapeHtml(
      avatar
    )}" alt="" referrerpolicy="no-referrer" /></span>`;
  }

  function renderProfileAvatar(container, avatar) {
    if (!container) {
      return;
    }
    if (avatar.startsWith("preset:")) {
      const preset = presetAvatar(avatar);
      container.textContent = preset.emoji;
      container.style.background = preset.color;
    } else {
      container.style.background = "";
      container.innerHTML = `<img class="avatar-image" src="${escapeHtml(
        avatar
      )}" alt="" referrerpolicy="no-referrer" />`;
    }
  }

  function renderAvatarPickers() {
    const pairs = [
      ["create", el.createPresetAvatars],
      ["join", el.joinPresetAvatars],
      ["rename", el.renamePresetAvatars]
    ];
    pairs.forEach(([mode, container]) => {
      if (!container) {
        return;
      }
      container.innerHTML = PRESET_AVATARS.map(
        (preset) =>
          `<button type="button" class="avatar-preset-button ${
            state.draftAvatars[mode] === `preset:${preset.id}`
              ? "is-selected"
              : ""
          }" data-avatar-mode="${mode}" data-preset="${
            preset.id
          }" aria-label="选择${preset.emoji}头像">${preset.emoji}</button>`
      ).join("");
    });
    renderProfileAvatar(el.createAvatarPreview, state.draftAvatars.create);
    renderProfileAvatar(el.joinAvatarPreview, state.draftAvatars.join);
    renderProfileAvatar(el.renameAvatarPreview, state.draftAvatars.rename);
  }

  async function compressAvatarFile(file) {
    if (!file) {
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("原始图片不能超过 10MB。");
    }
    const signature = new Uint8Array(
      await file.slice(0, 32).arrayBuffer()
    );
    const isPng =
      signature[0] === 0x89 &&
      signature[1] === 0x50 &&
      signature[2] === 0x4e &&
      signature[3] === 0x47;
    const isJpeg =
      signature[0] === 0xff &&
      signature[1] === 0xd8 &&
      signature[2] === 0xff;
    const isWebp =
      String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
    const declaredType = String(file.type || "").toLowerCase();
    const extension = String(file.name || "")
      .toLowerCase()
      .split(".")
      .pop();
    const inferredType = isPng
      ? "image/png"
      : isJpeg
        ? "image/jpeg"
        : isWebp
          ? "image/webp"
          : ["image/png", "image/x-png", "image/apng"].includes(declaredType) ||
              ["png", "apng"].includes(extension)
            ? "image/png"
            : ["image/jpeg", "image/jpg"].includes(declaredType) ||
                ["jpg", "jpeg"].includes(extension)
              ? "image/jpeg"
              : declaredType === "image/webp" || extension === "webp"
                ? "image/webp"
                : "";
    if (!inferredType) {
      throw new Error("头像只支持 PNG、JPEG 或 WebP。");
    }
    let bitmap = null;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image"
      }).catch(() => null);
    }
    if (!bitmap) {
      const objectUrl = URL.createObjectURL(
        file.type ? file : new Blob([file], { type: inferredType })
      );
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("无法读取这张图片。"));
        image.src = objectUrl;
      }).finally(() => URL.revokeObjectURL(objectUrl));
    }
    if (!bitmap) {
      throw new Error("无法读取这张图片。");
    }
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const size = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - size) / 2;
    const sy = (bitmap.height - size) / 2;
    context.drawImage(bitmap, sx, sy, size, size, 0, 0, 256, 256);
    bitmap.close?.();
    const encode = (targetCanvas, quality = 0.82) => {
      const dataUrl = targetCanvas.toDataURL("image/webp", quality);
      return dataUrl.startsWith("data:image/webp")
        ? dataUrl
        : targetCanvas.toDataURL("image/png");
    };
    let dataUrl = encode(canvas);
    if (dataUrl.length > 250_000) {
      const compact = document.createElement("canvas");
      compact.width = 192;
      compact.height = 192;
      const compactContext = compact.getContext("2d");
      compactContext.drawImage(canvas, 0, 0, 192, 192);
      dataUrl = encode(compact, 0.72);
    }
    if (dataUrl.length > 250_000) {
      throw new Error("图片压缩后仍然过大，请换一张更小的图片。");
    }
    return dataUrl;
  }

  async function applyAvatarFile(mode, file) {
    if (!file) {
      return;
    }
    try {
      const dataUrl = await compressAvatarFile(file);
      state.draftAvatars[mode] = dataUrl;
      renderAvatarPickers();
    } catch (error) {
      if (mode === "rename") {
        el.renameError.textContent = error.message;
        el.renameError.hidden = false;
      } else {
        setEntryError(error.message);
      }
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
    el.onlineTurnAlert.hidden = true;
    document.body.classList.remove("is-my-turn");
    if (document.title.startsWith("●")) {
      document.title = "三皮牌局 · 联机";
    }
    refreshHostEntryVisibility();
    const preferredName = loadPreferredName();
    const preferredAvatar = loadPreferredAvatar();
    state.draftAvatars.create = preferredAvatar;
    state.draftAvatars.join = preferredAvatar;
    if (mode === "create" && !el.createName.value) {
      el.createName.value = preferredName;
    }
    if (mode === "join") {
      el.joinCode.textContent = state.roomCode || "------";
      if (!el.joinName.value) {
        el.joinName.value = preferredName;
      }
    }
    renderAvatarPickers();
    setEntryError(errorMessage || "");
  }

  function refreshHostEntryVisibility() {
    const privateHost = state.hostPortalMode && !state.hostAuthorized;
    el.hostPrivatePanel.hidden = !privateHost;
    el.createRoomPanel.hidden =
      state.entryMode !== "create" || privateHost;
    el.joinRoomPanel.hidden = state.entryMode !== "join";
  }

  async function verifyHostToken() {
    if (!state.hostToken) {
      state.hostAuthorized = false;
      refreshHostEntryVisibility();
      return;
    }
    try {
      const response = await fetch("/api/host/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: state.hostToken })
      });
      if (!response.ok) {
        state.hostToken = null;
        localStorage.removeItem(HOST_TOKEN_KEY);
        state.hostAuthorized = false;
      } else {
        state.hostAuthorized = true;
      }
    } catch {
      state.hostAuthorized = false;
    }
    refreshHostEntryVisibility();
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
      const payload = await requestJson("/api/rooms", {
        name,
        seatCap,
        avatar: state.draftAvatars.create,
        ownerToken:
          state.hostPortalMode && state.hostAuthorized
            ? state.hostToken
            : undefined
      });
      saveSession(payload.roomCode, payload);
      rememberName(name);
      rememberAvatar(state.draftAvatars.create);
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
        { name, avatar: state.draftAvatars.join }
      );
      saveSession(state.roomCode, payload);
      rememberName(name);
      rememberAvatar(state.draftAvatars.join);
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
        playResultSoundForGame(state.room.game);
        flushChatBubble();
      } else if (message.type === "room:chat") {
        handleIncomingChat(message.message);
      } else if (message.type === "room:emote") {
        animateIncomingEmote(message.message);
      } else if (message.type === "room:chat-history") {
        if (state.room?.chat) {
          state.room.chat.messages = message.messages;
          renderChat();
        }
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

  function ensureAudioContext() {
    if (!state.preferences.sound || state.preferences.localChatMuted) {
      return null;
    }
    if (!state.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return null;
      }
      state.audioContext = new AudioContext();
    }
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }
    return state.audioContext;
  }

  function playTone(frequency, duration, volume, type) {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      context.currentTime + 0.015
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + duration
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.03);
  }

  function playDealSound(slot) {
    playNoiseBurst(0.038, slot === "up" ? 0.006 : 0.0045, 1500);
    playTone(slot === "up" ? 520 : 350, 0.045, 0.011, "triangle");
  }

  function playNoiseBurst(duration, volume, centerFrequency) {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }
    const frameCount = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = centerFrequency;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + duration
    );
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();
  }

  function playChatTone(direction) {
    if (direction === "send") {
      playTone(760, 0.055, 0.011, "sine");
      window.setTimeout(() => playTone(920, 0.045, 0.007, "sine"), 35);
      return;
    }
    playTone(610, 0.07, 0.01, "sine");
  }

  function playActionSound(type) {
    if (type === "fold") {
      playNoiseBurst(0.12, 0.004, 900);
      playTone(240, 0.1, 0.01, "triangle");
      return;
    }
    if (type === "all_in") {
      [0, 60, 120].forEach((delay, index) => {
        window.setTimeout(
          () => playTone(260 + index * 80, 0.1, 0.012, "triangle"),
          delay
        );
      });
      playNoiseBurst(0.18, 0.01, 700);
      return;
    }
    playTone(type === "raise" ? 420 : 330, 0.055, 0.012, "triangle");
    window.setTimeout(
      () => playTone(type === "raise" ? 620 : 460, 0.07, 0.008, "triangle"),
      45
    );
  }

  function playShuffleCeremonySound() {
    playNoiseBurst(0.28, 0.012, 1200);
    [0, 120, 240, 360].forEach((delay, index) => {
      window.setTimeout(
        () => playNoiseBurst(0.09, 0.006, 900 + index * 260),
        delay
      );
    });
    [0, 220, 440].forEach((delay, index) => {
      window.setTimeout(
        () => playTone(180 + index * 70, 0.1, 0.008, "triangle"),
        delay
      );
    });
  }

  function playResultSoundForGame(game) {
    if (!game || game.phase !== "complete") {
      return;
    }
    const signature = `${game.handNo}:${game.summary?.key || ""}:${game.summary?.winners?.join(",") || ""}`;
    if (signature === state.lastResultSignature) {
      return;
    }
    state.lastResultSignature = signature;
    const selfIndex = findSelfGameIndex(game);
    const isWinner = game.summary?.winners?.includes(selfIndex);
    if (isWinner) {
      [523, 659, 784, 1046].forEach((frequency, index) => {
        window.setTimeout(
          () => playTone(frequency, 0.13, 0.012, "sine"),
          index * 75
        );
      });
      return;
    }
    playTone(310, 0.13, 0.009, "sine");
    window.setTimeout(() => playTone(233, 0.18, 0.007, "sine"), 80);
  }

  function playEmoteImpact(item) {
    if (item === "flower") {
      [660, 880, 1100].forEach((frequency, index) => {
        window.setTimeout(
          () => playTone(frequency, 0.12, 0.009, "sine"),
          index * 60
        );
      });
      return;
    }
    if (item === "egg") {
      playTone(155, 0.075, 0.028, "square");
      playNoiseBurst(0.09, 0.018, 850);
      window.setTimeout(() => playTone(82, 0.11, 0.016, "triangle"), 42);
      return;
    }
    playTone(118, 0.08, 0.022, "sawtooth");
    playNoiseBurst(0.13, 0.012, 480);
  }

  function speakQuickPhrase(phraseId, text) {
    if (
      !state.preferences.sound ||
      state.preferences.localChatMuted
    ) {
      return;
    }
    state.voiceQueue.push({ phraseId, text });
    if (state.voicePlaying) {
      return;
    }
    const playNext = () => {
      const next = state.voiceQueue.shift();
      if (!next) {
        state.voicePlaying = false;
        return;
      }
      state.voicePlaying = true;
      const source = QUICK_VOICE_FILES[next.phraseId];
      if (!source) {
        speakWithSystemVoice(next.text, playNext);
        return;
      }
      let audio = state.voiceCache.get(next.phraseId);
      if (!audio) {
        audio = new Audio(source);
        audio.preload = "auto";
        audio.volume = 0.82;
        state.voiceCache.set(next.phraseId, audio);
      }
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        playNext();
      };
      audio.onended = finish;
      audio.onerror = () => {
        if (settled) {
          return;
        }
        settled = true;
        speakWithSystemVoice(next.text, playNext);
      };
      audio.currentTime = 0;
      audio.play().catch(() => {
        if (settled) {
          return;
        }
        settled = true;
        speakWithSystemVoice(next.text, playNext);
      });
    };
    playNext();
  }

  function speakWithSystemVoice(text, done) {
    if (!("speechSynthesis" in window)) {
      playChatTone("receive");
      done();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.05;
    utterance.pitch = 1.08;
    const chinese = window.speechSynthesis
      .getVoices()
      .find((voice) => /^zh|Chinese|中文/i.test(`${voice.lang} ${voice.name}`));
    if (chinese) {
      utterance.voice = chinese;
    }
    utterance.onend = done;
    utterance.onerror = () => {
      playChatTone("receive");
      done();
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      playChatTone("receive");
      done();
    }
  }

  function handleIncomingChat(message) {
    if (!message) {
      return;
    }
    if (message.id && message.id === state.lastChatMessageId) {
      return;
    }
    state.lastChatMessageId = message.id || state.lastChatMessageId;
    const isSelf = message.userId === state.room?.self?.id;
    state.pendingChatBubble = {
      userId: message.userId,
      text:
        message.kind === "emote"
          ? `${message.item === "egg" ? "🥚" : message.item === "tomato" ? "🍅" : "🌹"} 投掷`
          : message.text,
      createdAt: Date.now()
    };
    if (message.kind === "quick") {
      speakQuickPhrase(message.phraseId, message.text);
    } else {
      playChatTone(isSelf ? "send" : "receive");
    }
    if (!isSelf && state.activeSocialTab !== "chat") {
      state.unreadChat += 1;
      renderChatUnread();
    }
  }

  function flushChatBubble() {
    if (!state.pendingChatBubble) {
      return;
    }
    const bubble = state.pendingChatBubble;
    state.pendingChatBubble = null;
    const game = state.room?.game;
    const playerIndex =
      game?.players.findIndex((player) => player.id === bubble.userId) ?? -1;
    if (playerIndex < 0) {
      return;
    }
    const target =
      document.querySelector(
        `.seat[data-seat-index="${playerIndex}"]`
      ) ||
      (playerIndex === findSelfGameIndex(game)
        ? document.querySelector(".human-hand-card")
        : null);
    if (!target) {
      return;
    }
    target.querySelector(".seat-chat-bubble")?.remove();
    const node = document.createElement("div");
    node.className = "seat-chat-bubble";
    node.textContent = bubble.text;
    target.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }

  function animateIncomingEmote(message) {
    if (!message) {
      return;
    }
    const game = state.room?.game;
    if (!game) {
      return;
    }
    const sourceIndex = game.players.findIndex(
      (player) => player.id === message.userId
    );
    const targetIndex = game.players.findIndex(
      (player) => player.id === message.targetId
    );
    if (sourceIndex < 0 || targetIndex < 0) {
      playEmoteImpact(message.item);
      return;
    }
    const sourceSelfIndex = findSelfGameIndex(game);
    const source =
      document.querySelector(`.seat[data-seat-index="${sourceIndex}"]`) ||
      (sourceIndex === sourceSelfIndex
        ? document.querySelector(".human-hand-card")
        : null);
    const target = document.querySelector(
      `.seat[data-seat-index="${targetIndex}"]`
    ) ||
      (targetIndex === findSelfGameIndex(game)
        ? document.querySelector(".human-hand-card")
        : null);
    if (!source || !target) {
      playEmoteImpact(message.item);
      return;
    }
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) {
      playEmoteImpact(message.item);
      return;
    }
    const item =
      message.item === "egg" ? "🥚" : message.item === "tomato" ? "🍅" : "🌹";
    const node = document.createElement("span");
    node.className = "flying-emote";
    node.textContent = item;
    node.style.left = `${from.left + from.width / 2}px`;
    node.style.top = `${from.top + from.height / 2}px`;
    document.body.appendChild(node);
    const animation = node.animate(
      [
        { transform: "translate(0, 0) scale(.8)", opacity: 0.4 },
        {
          transform: `translate(${(to.left - from.left) / 2}px, ${
            Math.min(from.top, to.top) - from.top - 90
          }px) scale(1.15) rotate(120deg)`,
          opacity: 1,
          offset: 0.55
        },
        {
          transform: `translate(${to.left - from.left}px, ${
            to.top - from.top
          }px) scale(.65) rotate(260deg)`,
          opacity: 0.8
        }
      ],
      {
        duration: prefsMotion() ? 680 : 1,
        easing: "ease-in"
      }
    );
    animation.finished.finally(() => {
      node.remove();
      playEmoteImpact(message.item);
      if (target) {
        const baseTransform = target.classList.contains("seat")
          ? "translate(-50%, -50%)"
          : "translate(0, 0)";
        target.animate(
          [
            { transform: `${baseTransform} rotate(0)` },
            { transform: `${baseTransform} rotate(-2deg) translateX(-4px)` },
            { transform: `${baseTransform} rotate(2deg) translateX(4px)` },
            { transform: `${baseTransform} rotate(0)` }
          ],
          { duration: prefsMotion() ? 260 : 1 }
        );
      }
    });
  }

  function prefsMotion() {
    return (
      state.preferences.motion &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
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
      isWinner ? "is-winner" : "",
      player.rewindRevealed ? "is-rewind-revealed" : ""
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
        data-seat-index="${index}"
        style="--seat-x:${position.x}%;--seat-y:${position.y}%"
        aria-label="${escapeHtml(player.name)}，${formatNumber(player.stack)} 筹码，${escapeHtml(status)}"
      >
        <div class="seat-badge-row">${dealer}${offline}${turn}</div>
        <div class="seat-topline">
          ${avatarMarkup(rosterUser?.avatarUrl || "preset:jester")}
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
      } ${player.eliminated ? "is-eliminated" : ""}" data-seat-index="${player.seat}">
        <div class="human-hand-identity">
          ${avatarMarkup(
            state.room.users.find((user) => user.id === player.id)?.avatarUrl ||
              "preset:jester",
            "human-avatar"
          )}
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
    const foldedCount = opponents.filter((entry) => entry.player.folded).length;
    const actor =
      game.actorIndex === null || game.actorIndex === undefined
        ? null
        : game.players[game.actorIndex];
    const actorLabel =
      actor?.id === state.room?.self?.id
        ? "轮到你行动"
        : actor
          ? `当前：${actor.name}`
          : "等待行动";
    el.mobileOpponentSummary.textContent = `对手 ${opponents.length}`;
    el.mobileOpponentDetail.textContent = foldedCount
      ? `${actorLabel} · ${foldedCount} 人已弃`
      : actorLabel;
    el.mobileOpponentsToggle.disabled = opponents.length === 0;
    if (opponents.length === 0 && state.opponentDrawerOpen) {
      setOpponentDrawerOpen(false);
    } else {
      syncMobileDrawers();
    }
  }

  function setOpponentDrawerOpen(open) {
    state.opponentDrawerOpen = Boolean(open);
    syncMobileDrawers();
  }

  function setMobileToolsOpen(open) {
    state.mobileToolsOpen = Boolean(open);
    syncMobileDrawers();
  }

  function syncMobileDrawers() {
    const opponentOpen =
      state.opponentDrawerOpen && Boolean(state.room?.game);
    const toolsOpen = state.mobileToolsOpen && Boolean(state.room?.game);
    el.onlineTableShell.classList.toggle("opponents-open", opponentOpen);
    el.onlineActionDock.classList.toggle("mobile-tools-open", toolsOpen);
    document.body.classList.toggle(
      "mobile-drawer-open",
      opponentOpen || toolsOpen
    );
    el.mobileOpponentsToggle.setAttribute(
      "aria-expanded",
      String(opponentOpen)
    );
    el.mobileToolsButton.setAttribute("aria-expanded", String(toolsOpen));
    el.mobileOpponentsBackdrop.hidden = !opponentOpen;
    el.mobileOpponentCloseButton.hidden = !opponentOpen;
    el.mobileToolsBackdrop.hidden = !toolsOpen;
  }

  function animatePresentationCard(game) {
    const presentation = game.presentation;
    const last = presentation?.last;
    if (!presentation || !last) {
      return;
    }
    const key = `${game.handNo}:${presentation.kind}`;
    if (
      state.lastPresentationKey === key &&
      state.lastPresentationSequence === last.sequence
    ) {
      return;
    }
    state.lastPresentationKey = key;
    state.lastPresentationSequence = last.sequence;
    if (!prefsMotion()) {
      return;
    }
    const selfIndex = findSelfGameIndex(game);
    const selector =
      last.seat === selfIndex
        ? `#onlineHumanHandZone .role-${last.slot} .playing-card`
        : `.seat[data-seat-index="${last.seat}"] .role-${last.slot} .playing-card`;
    const target = document.querySelector(selector);
    const deck = document.querySelector(".online-table-shell .mini-deck");
    if (!target || !deck) {
      return;
    }
    const targetRect = target.getBoundingClientRect();
    const deckRect = deck.getBoundingClientRect();
    if (!targetRect.width || !deckRect.width) {
      return;
    }
    const clone = document.createElement("div");
    clone.className = "playing-card card-back dealing-flight-card";
    clone.style.left = `${deckRect.left}px`;
    clone.style.top = `${deckRect.top}px`;
    clone.style.width = `${Math.min(42, targetRect.width)}px`;
    clone.style.height = `${Math.min(60, targetRect.height)}px`;
    document.body.appendChild(clone);
    target.style.visibility = "hidden";
    const deltaX = targetRect.left - deckRect.left;
    const deltaY = targetRect.top - deckRect.top;
    const animation = clone.animate(
      [
        { transform: "translate(0, 0) rotate(-8deg) scale(.8)", opacity: 0.35 },
        {
          transform: `translate(${deltaX * 0.52}px, ${
            deltaY * 0.52 - 42
          }px) rotate(5deg) scale(1.04)`,
          opacity: 1,
          offset: 0.55
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) rotate(0) scale(1)`,
          opacity: 1
        }
      ],
      { duration: 360, easing: "cubic-bezier(.22,.72,.25,1)" }
    );
    playDealSound(last.slot);
    animation.finished
      .catch(() => {})
      .finally(() => {
        clone.remove();
        target.style.visibility = "";
        target.classList.add("card-flip-in");
      });
  }

  function renderGameCenter(game) {
    const actor =
      game.actorIndex !== null ? game.players[game.actorIndex] : null;
    el.headerRoomCode.textContent = state.room.code;
    el.onlinePhaseText.textContent = state.room.status === "rewind"
      ? "回溯选择阶段"
      : game.tableOver
      ? "本局结束"
      : game.presentation?.kind === "initial"
        ? game.presentation.stage === "hole" &&
          game.presentation.sequence === 0 &&
          game.reshuffledThisHand
          ? "正在重新洗牌"
          : game.presentation.stage === "hole"
          ? "正在发暗牌"
          : game.presentation.stage === "up"
            ? "正在发明牌"
            : "正在确定先手"
        : game.presentation?.kind === "draw"
          ? game.presentation.stage === "reshuffle"
            ? "第一轮加注 · 重新洗牌"
            : game.presentation.stage === "discard"
              ? "正在暗弃一张牌"
              : game.presentation.stage === "opening2"
                ? `第三张牌先手：${
                    game.players[game.secondOpenerIndex]?.name || "等待确定"
                  }`
                : "正在依次摸牌"
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
    el.onlinePotAmount.textContent = formatNumber(Engine.totalPot(game));
    el.onlineDeckCount.textContent = `${game.deckCount ?? 0} 张`;
    el.onlineDiscardPile.classList.toggle(
      "has-card",
      Boolean(game.discardCard || game.hasDiscard)
    );
    if (state.room.status === "rewind") {
      el.onlineTableHint.textContent =
        "回溯者可选择查看目标，发牌在下注前暂时等待。";
    } else if (game.tableOver) {
      el.onlineTableHint.textContent = game.tableOver.reason;
    } else if (game.presentation) {
      el.onlineTableHint.textContent =
        game.presentation.kind === "initial"
          ? game.presentation.stage === "hole" &&
            game.presentation.sequence === 0 &&
            game.reshuffledThisHand
            ? "剩余牌堆不足，正在收回 94 张牌统一重洗。"
            : "牌正从牌堆发往每位玩家，请稍候。"
          : game.presentation.stage === "reshuffle"
            ? "第一轮出现加注，剩余牌堆正在重新洗牌。"
            : game.presentation.stage === "opening2"
              ? "第二轮由第三张牌点数最大者先下注，赖子不参与先手。"
              : "第三张牌正在依次公开。";
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

  function renderShuffleCeremony(game) {
    const active = game?.presentation?.stage === "reshuffle";
    el.onlineShuffleCeremony.hidden = !active;
    if (!active) {
      state.lastShuffleCeremonyKey = "";
      return;
    }
    const key = `${game.handNo}:reshuffle`;
    if (state.lastShuffleCeremonyKey === key) {
      return;
    }
    state.lastShuffleCeremonyKey = key;
    playShuffleCeremonySound();
  }

  function sendPlayerAction(action) {
    if (!state.room?.game || state.pendingAction) {
      return;
    }
    playActionSound(action.type);
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

  function sendEarlyFold() {
    const game = state.room?.game;
    if (!game) {
      return;
    }
    const requestId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (
      sendMessage({
        type: "early-fold",
        handNo: game.handNo,
        requestId
      })
    ) {
      state.pendingAction = true;
      renderActionControls();
    }
  }

  function renderOnlineTurnAlert() {
    const game = state.room?.game;
    const selfIndex = game ? findSelfGameIndex(game) : -1;
    const active =
      Boolean(game) &&
      !game.presentation &&
      selfIndex >= 0 &&
      !game.players[selfIndex].folded &&
      !game.players[selfIndex].eliminated &&
      game.actorIndex === selfIndex &&
      ["bet1", "bet2"].includes(game.phase);
    if (!active) {
      el.onlineTurnAlert.hidden = true;
      document.body.classList.remove("is-my-turn");
      if (document.title.startsWith("●")) {
        document.title = "三皮牌局 · 联机";
      }
      return;
    }
    el.onlineTurnAlert.hidden = false;
    document.body.classList.add("is-my-turn");
    const signature = `${game.handNo}:${game.phase}:${game.actorIndex}:${game.currentBet}:${game.actedThisRound.join(",")}`;
    if (signature !== state.lastTurnAlertSignature) {
      state.lastTurnAlertSignature = signature;
      el.onlineTurnAlertText.textContent =
        game.phase === "bet1" ? "第一轮，请选择操作" : "第二轮，请选择操作";
      document.title = "● 轮到你 · 三皮牌局";
      playTone(540, 0.11, 0.022, "triangle");
      window.setTimeout(() => playTone(720, 0.15, 0.016, "triangle"), 90);
      if ("vibrate" in navigator && state.preferences.sound) {
        navigator.vibrate([120, 70, 120]);
      }
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
    const canEarlyFold =
      !isMyTurn &&
      !game.presentation &&
      selfIndex >= 0 &&
      Engine.getEarlyFoldEligibility(game, selfIndex);
    el.onlineBettingControls.hidden = !isMyTurn;
    el.onlineWaitingControls.hidden = true;
    el.onlineResultPanel.hidden = game.phase !== "complete";
    el.onlineEarlyFoldButton.hidden = !canEarlyFold;
    if (isMyTurn) {
      const legal = Engine.getLegalActions(game, selfIndex);
      const need = Math.max(0, game.currentBet - self.roundContribution);
      const pot = Engine.totalPot(game);
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
        el.onlineRaiseInput.min = String(legal.raise.min);
        el.onlineRaiseInput.max = String(legal.raise.max);
        el.onlineRaiseInput.step = String(legal.raise.step);
        const value = Number(slider.value);
        if (!Number.isFinite(value) || value < legal.raise.min || value > legal.raise.max) {
          slider.value = String(legal.raise.min);
        }
        if (document.activeElement !== el.onlineRaiseInput) {
          el.onlineRaiseInput.value = slider.value;
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
      el.onlineEarlyFoldButton.hidden = true;
      return;
    }

    if (game.presentation) {
      el.onlineWaitingControls.hidden = false;
      el.onlineTurnEyebrow.textContent = "发牌动画";
      el.onlineTurnTitle.textContent =
        game.presentation.kind === "initial" ? "正在发牌" : "正在依次摸牌";
      el.onlineTurnDescription.textContent = "动画完成后才会开放下注操作。";
      el.onlineWaitingTitle.textContent = "请稍候";
      el.onlineWaitingDescription.textContent =
        "所有玩家会看到同一套发牌顺序。";
      el.hostSkipButton.hidden = true;
      el.onlineEarlyFoldButton.hidden = true;
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

  function renderRewind(room) {
    const info = room?.rewind;
    const active = Boolean(info?.active);
    const acceptedTarget = info?.acceptedTargetId
      ? room.users.find((user) => user.id === info.acceptedTargetId)
      : null;
    const incoming = info?.incoming?.[0] || null;
    const show =
      active &&
      (info.selfEligible || info.incoming?.length || info.outgoing);
    el.rewindPanel.hidden = !show && !acceptedTarget;
    if (el.rewindPanel.hidden) {
      return;
    }
    const remaining = active
      ? Math.max(0, Math.ceil((info.deadline - Date.now()) / 1000))
      : 0;
    el.rewindCountdown.textContent = active ? `${remaining}s` : "";
    if (acceptedTarget) {
      el.rewindTitle.textContent = `回溯视界：${acceptedTarget.name}`;
      el.rewindDescription.textContent =
        "对方已同意，你可以在本手看到其底牌；该信息只显示在你的浏览器。";
      el.rewindSelectArea.hidden = true;
      el.rewindIncomingArea.hidden = true;
      el.rewindViewNotice.hidden = false;
      el.rewindViewNotice.textContent = `正在查看 ${acceptedTarget.name} 的底牌`;
      return;
    }
    el.rewindViewNotice.hidden = true;
    el.rewindSelectArea.hidden = !(info.selfEligible && !info.outgoing);
    el.rewindIncomingArea.hidden = !incoming;
    el.rewindTitle.textContent = "回溯选择";
    el.rewindDescription.textContent =
      "你可以选择一名在座玩家，对方同意后查看其本手底牌。";
    if (info.selfEligible && !info.outgoing) {
      el.rewindTargetSelect.innerHTML = info.targets
        .map(
          (target) =>
            `<option value="${escapeHtml(target.id)}">${escapeHtml(
              target.name
            )}</option>`
        )
        .join("");
      el.rewindRequestButton.disabled = !info.targets.length;
      el.rewindSkipButton.disabled = false;
    }
    if (info.outgoing) {
      const target = room.users.find(
        (user) => user.id === info.outgoing.targetId
      );
      el.rewindDescription.textContent =
        info.outgoing.status === "pending"
          ? `已请求 ${target?.name || "对方"}，等待同意。`
          : info.outgoing.status === "accepted"
            ? `${target?.name || "对方"} 已同意。`
            : info.outgoing.status === "declined"
              ? `${target?.name || "对方"} 拒绝了查看请求。`
              : "本手选择不回溯。";
    }
    if (incoming) {
      el.rewindIncomingText.textContent = `${incoming.rewinderName} 请求查看你的底牌，是否同意？`;
    }
  }

  function updateOnlineRaiseDisplay() {
    el.onlineRaiseValue.textContent = formatNumber(
      Number(el.onlineRaiseSlider.value)
    );
    if (document.activeElement !== el.onlineRaiseInput) {
      el.onlineRaiseInput.value = el.onlineRaiseSlider.value;
    }
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
    const pot = Engine.totalPot(game);
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

  function commitOnlineRaiseInput() {
    const slider = el.onlineRaiseSlider;
    const min = Number(slider.min);
    const max = Number(slider.max);
    const step = Math.max(1, Number(slider.step) || 1);
    const raw = Number(el.onlineRaiseInput.value);
    const safe = Number.isFinite(raw) ? raw : min;
    const rounded =
      Math.round(clamp(safe, min, max) / step) * step;
    slider.value = String(clamp(rounded, min, max));
    el.onlineRaiseInput.value = slider.value;
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
    const selfUser = state.room.users.find((user) => user.id === self.id);
    el.onlineResultEyebrow.textContent = game.tableOver ? "本桌结束" : "本手结算";
    if (game.tableOver?.status === "won" && game.tableOver.winnerId === self.id) {
      el.onlineResultTitle.textContent = "你赢下了整桌";
    } else if (selfPlayer?.eliminated) {
      el.onlineResultTitle.textContent = selfUser?.rewindEligible
        ? `${selfUser.rewindStage}转回溯者，可在下一手申请查看`
        : "筹码耗尽，已退出座位";
    } else if (selfAward) {
      el.onlineResultTitle.textContent = `你赢得 ${formatNumber(selfAward.amount)} 筹码`;
    } else if (summary.awards.length === 1) {
      el.onlineResultTitle.textContent = `${summary.awards[0].name} 收下底池`;
    } else if (!summary.awards.length && summary.carryPotOut > 0) {
      el.onlineResultTitle.textContent = `平局，${formatNumber(
        summary.carryPotOut
      )} 筹码保留到下一手`;
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
        } · ${pot.carried ? "并列，结转下一手" : escapeHtml(names)}</span><span>${formatNumber(
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
    if (room?.game) {
      renderRewind(room);
    }
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
    el.hostControls.hidden = !isHost || Boolean(room.game?.presentation);
    el.hostPauseButton.hidden =
      !game || game.phase !== "complete" || Boolean(room.paused);
    el.hostResumeButton.hidden =
      !game || game.phase !== "complete" || !room.paused;
    el.hostStartNowButton.hidden =
      !game || game.phase !== "complete" || Boolean(game.tableOver);
    el.hostRestartButton.hidden = !game?.tableOver;
    el.nextMatchSettings.hidden = !isHost || !game?.tableOver;
    if (document.activeElement !== el.nextAnteInput) {
      el.nextAnteInput.value = String(room.ante ?? 10);
    }
    if (document.activeElement !== el.nextStartingChipsInput) {
      el.nextStartingChipsInput.value = String(room.startingChips ?? 1000);
    }
    if (document.activeElement !== el.nextBetCapInput) {
      el.nextBetCapInput.value = String(room.betCap ?? 0);
    }
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

  function renderChatUnread() {
    el.chatUnreadBadge.hidden = state.unreadChat <= 0;
    el.chatUnreadBadge.textContent = String(Math.min(99, state.unreadChat));
  }

  function setSocialTab(tab) {
    state.activeSocialTab = tab;
    const equityActive = tab === "equity";
    el.equityTab.classList.toggle("is-active", equityActive);
    el.chatTab.classList.toggle("is-active", !equityActive);
    el.equityTab.setAttribute("aria-selected", String(equityActive));
    el.chatTab.setAttribute("aria-selected", String(!equityActive));
    el.equityPanel.hidden = !equityActive;
    el.chatPanel.hidden = equityActive;
    if (!equityActive) {
      state.unreadChat = 0;
      renderChatUnread();
    }
  }

  function emoteLabel(item) {
    return item === "egg" ? "🥚 鸡蛋" : item === "tomato" ? "🍅 番茄" : "🌹 鲜花";
  }

  function renderChat() {
    const chat = state.room?.chat;
    if (!chat) {
      return;
    }
    el.chatDisabledNotice.hidden = chat.enabled;
    el.chatInput.disabled = !chat.enabled || chat.muted;
    el.chatSendButton.disabled = !chat.enabled || chat.muted;
    Array.from(el.quickPhraseBar.querySelectorAll("button")).forEach((button) => {
      button.disabled = !chat.enabled || chat.muted;
    });
    Array.from(document.querySelectorAll(".emote-button")).forEach((button) => {
      button.disabled = !chat.enabled || chat.muted;
    });
    el.chatStatusText.textContent = chat.muted
      ? "你已被房主禁言"
      : chat.enabled
        ? "最近 50 条消息仅在本房间保留"
        : "房主已关闭聊天";

    if (!el.quickPhraseBar.childElementCount) {
      el.quickPhraseBar.innerHTML = chat.quickPhrases
        .map(
          (phrase) =>
            `<button type="button" data-phrase-id="${escapeHtml(
              phrase.id
            )}" title="${escapeHtml(phrase.text)}">${escapeHtml(
              phrase.text
            )}</button>`
        )
        .join("");
    }

    const targets = state.room.users.filter(
      (user) => user.id !== state.room.self.id
    );
    el.emoteTarget.innerHTML = targets.length
      ? targets
          .map(
            (user) =>
              `<option value="${escapeHtml(user.id)}">${escapeHtml(
                user.name
              )}${user.connected ? "" : "（离线）"}</option>`
          )
          .join("")
      : '<option value="">暂无目标</option>';
    el.emoteTarget.disabled = !chat.enabled || chat.muted || !targets.length;

    const currentUserMap = new Map(
      state.room.users.map((user) => [user.id, user])
    );
    const messages = chat.messages || [];
    el.chatMessages.innerHTML = messages.length
      ? messages
          .map((message) => {
            if (message.kind === "system") {
              return `
                <article class="chat-message chat-system-message">
                  <div class="chat-message-body">
                    <div class="chat-message-head">
                      <strong>系统</strong>
                      <time>${new Date(message.createdAt).toLocaleTimeString(
                        "zh-CN",
                        { hour: "2-digit", minute: "2-digit" }
                      )}</time>
                    </div>
                    <div class="chat-message-text">${escapeHtml(
                      message.text
                    )}</div>
                  </div>
                </article>`;
            }
            const sender = currentUserMap.get(message.userId) || {
              name: message.name,
              avatarUrl: message.avatarUrl
            };
            const text =
              message.kind === "emote"
                ? `${sender.name} 向 ${
                    currentUserMap.get(message.targetId)?.name || "玩家"
                  } 扔了${emoteLabel(message.item)}`
                : message.text;
            return `
              <article class="chat-message">
                ${avatarMarkup(sender.avatarUrl || "preset:jester")}
                <div class="chat-message-body">
                  <div class="chat-message-head">
                    <strong>${escapeHtml(sender.name)}</strong>
                    <time>${new Date(message.createdAt).toLocaleTimeString(
                      "zh-CN",
                      { hour: "2-digit", minute: "2-digit" }
                    )}</time>
                  </div>
                  <div class="chat-message-text ${
                    message.kind === "quick"
                      ? "is-quick"
                      : message.kind === "emote"
                        ? "is-emote"
                        : ""
                  }">${escapeHtml(text)}</div>
                </div>
              </article>
            `;
          })
          .join("")
      : '<p class="equity-note">还没有人说话，先打个招呼吧。</p>';
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;

    const isHost = state.room.self?.isHost;
    el.hostChatControls.hidden = !isHost;
    el.hostToggleChatButton.textContent = chat.enabled ? "关闭聊天" : "开启聊天";
    const mgmtTargets = state.room.users.filter(
      (user) => user.id !== state.room.self.id
    );
    el.chatModerationTarget.innerHTML = mgmtTargets.length
      ? mgmtTargets
          .map(
            (user) =>
              `<option value="${escapeHtml(user.id)}">${escapeHtml(
                user.name
              )}${user.chatMuted ? "（已禁言）" : ""}</option>`
          )
          .join("")
      : '<option value="">暂无可管理玩家</option>';
    [el.hostMuteButton, el.hostUnmuteButton].forEach((button) => {
      button.disabled = !mgmtTargets.length;
    });
  }

  function renderEquity(game) {
    const selfIndex = findSelfGameIndex(game);
    const self = selfIndex >= 0 ? game.players[selfIndex] : null;
    if (!self || !game.equity) {
      el.equityHandLabel.textContent = game.presentation ? "等待发牌" : "暂无估算";
      el.equitySample.textContent = "基于公开信息估算";
      el.equityBars.innerHTML =
        '<p class="equity-note">完成本轮发牌后会显示所有活跃玩家的估算赢面。</p>';
      return;
    }
    const cards = [self.holeCard, self.upCard, self.drawCard].filter(Boolean);
    if (cards.length === 3) {
      const hand = Engine.evaluateHand(cards);
      el.equityHandLabel.textContent = hand.description;
    } else {
      el.equityHandLabel.textContent = `${cards.length} 张已知牌`;
    }
    el.equitySample.textContent = `${game.equity.sampleCount} 次抽样`;
    el.equityBars.innerHTML = game.equity.players
      .map((entry) => {
        const player = game.players[entry.playerIndex];
        return `
          <div class="equity-row">
            <span class="equity-name ${
              player.id === self.id ? "is-self" : ""
            }">${escapeHtml(player.id === self.id ? "你" : player.name)}</span>
            <span class="equity-track"><span class="equity-fill" style="width:${entry.equity}%"></span></span>
            <span class="equity-value">${entry.equity}%</span>
          </div>
        `;
      })
      .join("");
  }

  function renderProfile(room) {
    if (!room.self) {
      return;
    }
    el.selfProfileAvatar.innerHTML = "";
    renderProfileAvatar(el.selfProfileAvatar, room.self.avatarUrl);
    el.selfProfileAvatar.title = room.self.name;
  }

  function renderLobby() {
    const room = state.room;
    state.opponentDrawerOpen = false;
    state.mobileToolsOpen = false;
    el.mobileToolsButton.hidden = true;
    syncMobileDrawers();
    el.rewindPanel.hidden = true;
    el.onlineTurnAlert.hidden = true;
    document.body.classList.remove("is-my-turn");
    if (document.title.startsWith("●")) {
      document.title = "三皮牌局 · 联机";
    }
    el.lobbyArea.hidden = false;
    el.onlineGameArea.hidden = true;
    el.headerRoomCode.textContent = room.code;
    renderProfile(room);
    el.seatCapText.textContent = room.seatCap;
    el.seatedPlayerCount.textContent = room.seats.filter(Boolean).length;
    el.lobbyRoomStatus.textContent =
      room.status === "matchOver" ? "上一局结束" : "等待开局";
    const stakeText = `每人本钱 ${formatNumber(
      room.startingChips
    )} · 底注 ${formatNumber(room.ante)} · 单注封顶 ${
      room.betCap > 0 ? formatNumber(room.betCap) : "无上限"
    }`;
    el.lobbyLead.textContent =
      room.seats.filter(Boolean).length < 2
        ? `至少还需要一名玩家入座。当前 ${stakeText}。`
        : `玩家已入座，当前 ${stakeText}，房主可以开始第一手。`;
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
            ${avatarMarkup(seatUser.avatarUrl || "preset:jester")}
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
    const sidePeople = spectators.concat(room.rewinders || []);
    el.spectatorCount.textContent = `${sidePeople.length} 人`;
    el.spectatorList.innerHTML = sidePeople.length
      ? sidePeople
          .map(
            (user) =>
              `<div class="spectator-item">${avatarMarkup(
                user.avatarUrl
              )}<b>${escapeHtml(user.name)}${
                user.isSelf ? "（你）" : ""
              }</b><span>${
                user.rewindEligible
                  ? `${user.rewindStage}转回溯者`
                  : user.connected
                    ? "旁观中"
                    : "离线"
              }</span></div>`
          )
          .join("")
      : '<div class="spectator-item">暂无旁观者<span>—</span></div>';

    const isHost = room.self?.isHost;
    el.lobbyStartButton.hidden = !isHost;
    el.lobbyStartButton.disabled = room.seats.filter(Boolean).length < 2;
    el.lobbyStakeSettings.hidden = !isHost;
    if (document.activeElement !== el.lobbyAnteInput) {
      el.lobbyAnteInput.value = String(room.ante ?? 10);
    }
    if (document.activeElement !== el.lobbyStartingChipsInput) {
      el.lobbyStartingChipsInput.value = String(room.startingChips ?? 1000);
    }
    if (document.activeElement !== el.lobbyBetCapInput) {
      el.lobbyBetCapInput.value = String(room.betCap ?? 0);
    }
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
    renderChat();
  }

  function renderGame() {
    const room = state.room;
    const game = room.game;
    el.lobbyArea.hidden = true;
    el.onlineGameArea.hidden = false;
    el.mobileToolsButton.hidden = false;
    el.headerRoomCode.textContent = room.code;
    renderProfile(room);
    renderGameSeats(game);
    renderGameCenter(game);
    renderShuffleCeremony(game);
    renderRewind(room);
    renderActionControls();
    renderResult(game);
    renderHostControls();
    renderEquity(game);
    renderChat();
    renderOnlineTurnAlert();
    const remaining = game.players.filter((player) => !player.eliminated).length;
    el.onlineRemainingText.textContent = `剩余 ${remaining} 人`;
    el.onlineStakesText.textContent = `本钱 ${formatNumber(
      state.room.startingChips
    )} · 底注 ${formatNumber(state.room.ante)} · 单注封顶 ${
      state.room.betCap > 0 ? formatNumber(state.room.betCap) : "无上限"
    }`;
    animatePresentationCard(game);
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
    state.draftAvatars.rename =
      state.room.self.avatarUrl || "preset:jester";
    renderAvatarPickers();
    el.renameError.hidden = true;
    if (typeof el.renameDialog.showModal === "function") {
      el.renameDialog.showModal();
    } else {
      el.renameDialog.setAttribute("open", "");
    }
  }

  async function uploadProfileAvatar(avatar) {
    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify({ avatar })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "头像更新失败。");
    }
    return payload.avatarUrl;
  }

  async function submitRename(event) {
    event.preventDefault();
    const name = el.renameInput.value.trim();
    if (!name) {
      return;
    }
    el.renameError.hidden = true;
    try {
      const avatar = state.draftAvatars.rename;
      await uploadProfileAvatar(avatar);
      if (sendMessage({ type: "rename", name })) {
        rememberName(name);
        rememberAvatar(avatar);
        el.renameDialog.close();
      }
    } catch (error) {
      el.renameError.textContent = error.message;
      el.renameError.hidden = false;
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

  function stakeSettingsFrom(inputAnte, inputCap, inputStartingChips) {
    return {
      ante: Number(inputAnte.value),
      betCap: Number(inputCap.value),
      startingChips: Number(inputStartingChips.value)
    };
  }

  function selectedHostTarget(select) {
    return select.value || null;
  }

  function applyOnlinePreferences() {
    el.onlineSoundToggle.setAttribute(
      "aria-pressed",
      String(state.preferences.sound)
    );
    el.onlineSoundToggle.textContent = state.preferences.sound ? "♪" : "×";
    el.onlineSoundToggle.title = state.preferences.sound
      ? "关闭声音和语音"
      : "开启声音和语音";
    el.onlineMotionToggle.setAttribute(
      "aria-pressed",
      String(state.preferences.motion)
    );
    el.onlineMotionToggle.textContent = state.preferences.motion ? "◌" : "—";
    el.onlineMotionToggle.title = state.preferences.motion
      ? "关闭动画"
      : "开启动画";
    el.chatLocalMuteButton.textContent = state.preferences.localChatMuted
      ? "取消本地静音"
      : "本地静音";
    document.body.classList.toggle(
      "no-motion",
      !state.preferences.motion
    );
  }

  function toggleSoundPreference() {
    state.preferences.sound = !state.preferences.sound;
    savePreferences();
    applyOnlinePreferences();
    showToast(state.preferences.sound ? "声音已开启" : "声音已关闭");
  }

  function toggleMotionPreference() {
    state.preferences.motion = !state.preferences.motion;
    savePreferences();
    applyOnlinePreferences();
    showToast(state.preferences.motion ? "动画已开启" : "动画已关闭");
  }

  function toggleLocalChatMute() {
    state.preferences.localChatMuted = !state.preferences.localChatMuted;
    savePreferences();
    applyOnlinePreferences();
  }

  function bindEvents() {
    el.createRoomForm?.addEventListener("submit", createRoom);
    el.joinRoomForm?.addEventListener("submit", joinRoom);
    [
      ["create", el.createAvatarFile],
      ["join", el.joinAvatarFile],
      ["rename", el.renameAvatarFile]
    ].forEach(([mode, input]) => {
      input?.addEventListener("change", () => {
        applyAvatarFile(mode, input.files?.[0]);
        input.value = "";
      });
    });
    [el.createPresetAvatars, el.joinPresetAvatars, el.renamePresetAvatars].forEach(
      (container) => {
        container?.addEventListener("click", (event) => {
          const button = event.target.closest("[data-preset]");
          if (!button) {
            return;
          }
          const mode = button.dataset.avatarMode;
          state.draftAvatars[mode] = `preset:${button.dataset.preset}`;
          renderAvatarPickers();
        });
      }
    );
    el.copyLinkButton.addEventListener("click", copyInviteLink);
    el.copyLinkLargeButton.addEventListener("click", copyInviteLink);
    el.renameButton.addEventListener("click", openRenameDialog);
    el.renameForm.addEventListener("submit", submitRename);
    el.closeRenameButton.addEventListener("click", () => el.renameDialog.close());
    el.rulesButton.addEventListener("click", () => el.rulesDialog.showModal());
    el.mobileRulesButton.addEventListener("click", () =>
      el.rulesDialog.showModal()
    );
    el.closeRulesButton.addEventListener("click", () => el.rulesDialog.close());
    el.mobileOpponentsToggle.addEventListener("click", () =>
      setOpponentDrawerOpen(!state.opponentDrawerOpen)
    );
    el.mobileOpponentsBackdrop.addEventListener("click", () =>
      setOpponentDrawerOpen(false)
    );
    el.mobileOpponentCloseButton.addEventListener("click", () =>
      setOpponentDrawerOpen(false)
    );
    el.mobileToolsButton.addEventListener("click", () =>
      setMobileToolsOpen(!state.mobileToolsOpen)
    );
    el.mobileToolsBackdrop.addEventListener("click", () =>
      setMobileToolsOpen(false)
    );
    el.mobileToolsCloseButton.addEventListener("click", () =>
      setMobileToolsOpen(false)
    );
    el.leaveRoomButton.addEventListener("click", leaveRoom);
    el.mobileLeaveButton.addEventListener("click", leaveRoom);
    el.onlineSoundToggle.addEventListener("click", toggleSoundPreference);
    el.onlineMotionToggle.addEventListener("click", toggleMotionPreference);
    el.equityTab.addEventListener("click", () => setSocialTab("equity"));
    el.chatTab.addEventListener("click", () => setSocialTab("chat"));
    el.chatLocalMuteButton.addEventListener("click", toggleLocalChatMute);
    el.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = el.chatInput.value.trim();
      if (!text) {
        return;
      }
      if (sendMessage({ type: "chat:send", kind: "text", text })) {
        el.chatInput.value = "";
      }
    });
    el.quickPhraseBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-phrase-id]");
      if (button) {
        sendMessage({
          type: "chat:send",
          kind: "quick",
          phraseId: button.dataset.phraseId
        });
      }
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-emote]");
      if (!button || !state.room) {
        return;
      }
      const targetId = el.emoteTarget.value;
      if (!targetId) {
        showToast("请先选择一个玩家。");
        return;
      }
      sendMessage({
        type: "emote:throw",
        targetId,
        item: button.dataset.emote
      });
    });
    el.hostMuteButton.addEventListener("click", () => {
      const targetId = el.chatModerationTarget.value;
      if (targetId) {
        sendMessage({ type: "host:chat:mute", targetId, muted: true });
      }
    });
    el.hostUnmuteButton.addEventListener("click", () => {
      const targetId = el.chatModerationTarget.value;
      if (targetId) {
        sendMessage({ type: "host:chat:mute", targetId, muted: false });
      }
    });
    el.hostClearChatButton.addEventListener("click", () => {
      if (window.confirm("确认清空房间内的全部聊天记录？")) {
        sendMessage({ type: "host:chat:clear" });
      }
    });
    el.hostToggleChatButton.addEventListener("click", () => {
      sendMessage({
        type: "host:chat:enable",
        enabled: !state.room.chat.enabled
      });
    });
    el.rewindRequestButton.addEventListener("click", () => {
      const targetId = el.rewindTargetSelect.value;
      if (targetId) {
        sendMessage({ type: "rewind:select", targetId });
      }
    });
    el.rewindSkipButton.addEventListener("click", () => {
      sendMessage({ type: "rewind:select", targetId: null });
    });
    el.rewindAcceptButton.addEventListener("click", () => {
      const request = state.room?.rewind?.incoming?.[0];
      if (request) {
        sendMessage({
          type: "rewind:respond",
          rewinderId: request.rewinderId,
          accepted: true
        });
      }
    });
    el.rewindDeclineButton.addEventListener("click", () => {
      const request = state.room?.rewind?.incoming?.[0];
      if (request) {
        sendMessage({
          type: "rewind:respond",
          rewinderId: request.rewinderId,
          accepted: false
        });
      }
    });
    el.lobbyStartButton.addEventListener("click", () =>
      sendHostCommand(
        "host:start",
        stakeSettingsFrom(
          el.lobbyAnteInput,
          el.lobbyBetCapInput,
          el.lobbyStartingChipsInput
        )
      )
    );
    el.saveStakeSettingsButton.addEventListener("click", () =>
      sendHostCommand(
        "host:settings",
        stakeSettingsFrom(
          el.lobbyAnteInput,
          el.lobbyBetCapInput,
          el.lobbyStartingChipsInput
        )
      )
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
      sendHostCommand(
        "host:start",
        stakeSettingsFrom(
          el.nextAnteInput,
          el.nextBetCapInput,
          el.nextStartingChipsInput
        )
      )
    );
    el.applyNextSettingsButton.addEventListener("click", () =>
      sendHostCommand(
        "host:settings",
        stakeSettingsFrom(
          el.nextAnteInput,
          el.nextBetCapInput,
          el.nextStartingChipsInput
        )
      )
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
    el.onlineEarlyFoldButton.addEventListener("click", () => {
      if (window.confirm("确定提前弃牌吗？弃牌后不能撤回。")) {
        sendEarlyFold();
      }
    });
    el.onlineGoToActionButton.addEventListener("click", () => {
      el.onlineBettingControls.scrollIntoView({
        behavior: prefsMotion() ? "smooth" : "auto",
        block: "center"
      });
    });
    el.onlineCallButton.addEventListener("click", () =>
      sendPlayerAction({ type: "call" })
    );
    el.onlineAllInButton.addEventListener("click", () =>
      sendPlayerAction({ type: "all_in" })
    );
    el.onlineRaiseButton.addEventListener("click", () => {
      commitOnlineRaiseInput();
      sendPlayerAction({
        type: "raise",
        amount: Number(el.onlineRaiseSlider.value)
      });
    });
    el.onlineRaiseSlider.addEventListener("input", updateOnlineRaiseDisplay);
    el.onlineRaiseInput.addEventListener("change", commitOnlineRaiseInput);
    el.onlineRaiseInput.addEventListener("blur", commitOnlineRaiseInput);
    el.onlineRaiseInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitOnlineRaiseInput();
      }
    });
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
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (state.opponentDrawerOpen) {
        setOpponentDrawerOpen(false);
      }
      if (state.mobileToolsOpen) {
        setMobileToolsOpen(false);
      }
    });
  }

  function init() {
    cacheElements();
    bindEvents();
    loadPreferences();
    const savedAvatar = loadPreferredAvatar();
    state.draftAvatars.create = savedAvatar;
    state.draftAvatars.join = savedAvatar;
    state.draftAvatars.rename = savedAvatar;
    applyOnlinePreferences();
    renderAvatarPickers();
    setSocialTab("equity");
    state.hostPortalMode =
      location.pathname === "/host" || location.pathname === "/host/";
    state.hostToken = loadHostToken();
    if (state.hostPortalMode) {
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      const incomingToken = hash.get("owner");
      if (incomingToken) {
        state.hostToken = incomingToken;
        saveHostToken(incomingToken);
        history.replaceState({}, "", "/host");
      }
      verifyHostToken();
    }
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
