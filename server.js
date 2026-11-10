"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");
const Engine = require("./engine.js");

const ROOT = __dirname;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const MAX_ROOM_PEOPLE = 10;
const AUTO_NEXT_MS = 8000;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const HOST_TOKEN_LIFETIME_SECONDS = 10 * 365 * 24 * 60 * 60;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_AVATAR_BODY_BYTES = 512 * 1024;
const MAX_STORED_AVATAR_BYTES = 192 * 1024;
const TOKEN_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const HOST_ISSUE_SECRET = process.env.HOST_ISSUE_SECRET || "";
const PUBLIC_FILES = new Set([
  "/index.html",
  "/online.html",
  "/styles.css",
  "/online.css",
  "/app.js",
  "/engine.js",
  "/online.js",
  "/assets/joker-color.svg",
  "/assets/joker-mono.svg",
  "/assets/wildcard.svg",
  "/assets/voice/quick-hurry.mp3",
  "/assets/voice/quick-call.mp3",
  "/assets/voice/quick-think.mp3",
  "/assets/voice/quick-nice.mp3",
  "/assets/voice/quick-close.mp3",
  "/assets/voice/quick-friendly.mp3",
  "/assets/voice/quick-again.mp3",
  "/assets/voice/quick-wow.mp3"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};
const QUICK_PHRASES = Object.freeze({
  hurry: "快点儿吧，我等的花儿都谢了",
  call: "我跟了",
  think: "让我想想",
  nice: "你这牌打得可以啊",
  close: "就差一点",
  friendly: "交个朋友，别加啦",
  again: "再来一局",
  wow: "这手牌有点东西"
});
const EMOTE_ITEMS = new Set(["egg", "tomato", "flower"]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += ROOM_CODE_ALPHABET[bytes[index] % ROOM_CODE_ALPHABET.length];
  }
  return result;
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signTokenPayload(payload) {
  return crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
}

function issueRoomToken(roomCode, userId) {
  const payload = base64url(
    JSON.stringify({
      r: roomCode,
      u: userId,
      e: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS
    })
  );
  return `${payload}.${signTokenPayload(payload)}`;
}

function verifyRoomToken(token, roomCode) {
  if (typeof token !== "string" || token.length > 1024) {
    return null;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = signTokenPayload(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      parsed.r !== roomCode ||
      typeof parsed.u !== "string" ||
      !Number.isFinite(parsed.e) ||
      parsed.e < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function issueHostToken(ownerId) {
  const payload = base64url(
    JSON.stringify({
      k: "host",
      o: ownerId,
      e: Math.floor(Date.now() / 1000) + HOST_TOKEN_LIFETIME_SECONDS
    })
  );
  return `${payload}.${signTokenPayload(payload)}`;
}

function verifyHostToken(token) {
  if (typeof token !== "string" || token.length > 2048) {
    return null;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = signTokenPayload(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      parsed.k !== "host" ||
      typeof parsed.o !== "string" ||
      !Number.isFinite(parsed.e) ||
      parsed.e < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function verifyHostIssueSecret(value) {
  if (!HOST_ISSUE_SECRET || typeof value !== "string") {
    return false;
  }
  const expected = Buffer.from(HOST_ISSUE_SECRET);
  const supplied = Buffer.from(value);
  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

function normalizeName(value) {
  if (typeof value !== "string") {
    throw new RequestError(400, "请输入昵称。");
  }
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const length = Array.from(name).length;
  if (length < 1 || length > 12) {
    throw new RequestError(400, "昵称长度需要为 1–12 个字符。");
  }
  if (/[\u0000-\u001f\u007f<>]/u.test(name)) {
    throw new RequestError(400, "昵称包含不可用字符。");
  }
  return name;
}

function normalizeChatText(value) {
  if (typeof value !== "string") {
    throw new RequestError(400, "请输入聊天内容。");
  }
  const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const length = Array.from(text).length;
  if (length < 1 || length > 60) {
    throw new RequestError(400, "聊天内容需要为 1–60 个字符。");
  }
  if (/[\u0000-\u001f\u007f]/u.test(text)) {
    throw new RequestError(400, "聊天内容包含不可用字符。");
  }
  return text;
}

function decodeAvatar(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  if (/^preset:[a-z0-9-]{1,32}$/.test(value)) {
    return { url: value, bytes: null };
  }
  const match = value.match(
    /^data:([^,]*?)(?:;base64),([A-Za-z0-9+/=]+)$/
  );
  if (!match) {
    throw new RequestError(400, "头像格式不受支持。");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_STORED_AVATAR_BYTES) {
    throw new RequestError(413, "头像文件过大。");
  }
  const validPng =
    bytes.length > 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const validJpeg =
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const validWebp =
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!validPng && !validJpeg && !validWebp) {
    throw new RequestError(400, "头像内容不是有效图片。");
  }
  return {
    mimeType: validPng
      ? "image/png"
      : validJpeg
        ? "image/jpeg"
        : "image/webp",
    bytes
  };
}

function seatCapFromValue(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2 || number > 10) {
    throw new RequestError(400, "房间座位需要设置为 2–10 人。");
  }
  return number;
}

function normalizeStakeSettings(
  anteValue,
  capValue,
  startingChipsValue = 1000
) {
  const ante = Number(anteValue);
  const betCap = Number(capValue);
  const startingChips = Number(startingChipsValue);
  if (
    !Number.isInteger(startingChips) ||
    startingChips < 100 ||
    startingChips > 100000 ||
    startingChips % 100 !== 0
  ) {
    throw new RequestError(
      400,
      "每人本钱需要设置为 100–100000，且为 100 的倍数。"
    );
  }
  if (!Number.isInteger(ante) || ante < 5 || ante > 100 || ante % 5 !== 0) {
    throw new RequestError(400, "底注需要设置为 5–100，且为 5 的倍数。");
  }
  if (
    !Number.isInteger(betCap) ||
    betCap < 0 ||
    betCap > startingChips ||
    betCap % 10 !== 0 ||
    (betCap > 0 && betCap < ante)
  ) {
    throw new RequestError(
      400,
      `单注上限需要为 0–${startingChips}，且为 10 的倍数；0 表示无上限。`
    );
  }
  return { ante, betCap, startingChips };
}

function ensureUniqueName(room, name, exceptUserId) {
  const lowered = name.toLocaleLowerCase("zh-CN");
  for (const participant of room.users.values()) {
    if (
      participant.id !== exceptUserId &&
      participant.name.toLocaleLowerCase("zh-CN") === lowered
    ) {
      throw new RequestError(409, "这个昵称已经有人使用，请换一个。");
    }
  }
}

function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new RequestError(413, "请求内容过大。"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new RequestError(400, "请求格式不正确。"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function shareOrigin(request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = forwardedProto ? String(forwardedProto).split(",")[0] : "http";
  return `${protocol}://${request.headers.host || "localhost"}`;
}

function createUserId() {
  return randomId("u");
}

function createParticipant(room, name, joinedAt, avatarUrl) {
  return {
    id: createUserId(),
    name,
    avatarUrl: avatarUrl || "preset:jester",
    joinedAt: joinedAt ?? Date.now(),
    seat: null,
    connected: false,
    socket: null,
    pendingRemoval: false,
    blockedFromSeat: false,
    leaving: false,
    chatMuted: false,
    lastChatAt: 0,
    chatTimes: [],
    lastEmoteAt: 0,
    rewindEligible: false,
    rewindStage: 0,
    revivalsUsed: 0
  };
}

function findOpenSeat(room) {
  return room.seats.findIndex((userId) => !userId);
}

function seatParticipant(room, participant) {
  if (participant.seat !== null) {
    return true;
  }
  const index = findOpenSeat(room);
  if (index < 0) {
    return false;
  }
  room.seats[index] = participant.id;
  participant.seat = index;
  return true;
}

function seatWaitingParticipants(room) {
  const waiting = Array.from(room.users.values())
    .filter(
      (participant) =>
        participant.seat === null &&
        !participant.leaving &&
        !participant.pendingRemoval &&
        !participant.pendingSeatRelease &&
        !participant.blockedFromSeat &&
        !participant.eliminated
    )
    .sort((left, right) => left.joinedAt - right.joinedAt);
  for (const participant of waiting) {
    if (!seatParticipant(room, participant)) {
      break;
    }
  }
}

function releasePendingSeats(room) {
  for (const participant of Array.from(room.users.values())) {
    const gamePlayer =
      room.game && participant.seat !== null
        ? room.game.players[participant.seat]
        : null;
    const eliminated =
      gamePlayer &&
      gamePlayer.id === participant.id &&
      gamePlayer.eliminated;
    const preservedRewind = eliminated && participant.rewindEligible;
    if ((participant.pendingRemoval || eliminated) && !preservedRewind) {
      if (participant.seat !== null) {
        room.seats[participant.seat] = null;
        participant.seat = null;
      }
      participant.pendingRemoval = false;
      participant.pendingSeatRelease = false;
    }
    if (participant.leaving) {
      room.users.delete(participant.id);
      if (room.hostId === participant.id) {
        transferHost(room, participant.id);
      }
    }
  }
}

function chooseNextHost(room, excludingUserId) {
  const seatedConnected = Array.from(room.users.values())
    .filter(
      (participant) =>
        participant.id !== excludingUserId &&
        participant.connected &&
        participant.seat !== null
    )
    .sort((left, right) => left.joinedAt - right.joinedAt);
  if (seatedConnected.length) {
    return seatedConnected[0].id;
  }
  const connected = Array.from(room.users.values())
    .filter(
      (participant) =>
        participant.id !== excludingUserId && participant.connected
    )
    .sort((left, right) => left.joinedAt - right.joinedAt);
  return connected[0]?.id ?? null;
}

function transferHost(room, excludingUserId) {
  room.hostId = chooseNextHost(room, excludingUserId);
}

function roomSeatDescriptors(room) {
  return room.seats.map((userId) => {
    if (!userId) {
      return null;
    }
    const participant = room.users.get(userId);
    if (!participant || participant.pendingRemoval || participant.leaving) {
      return null;
    }
    if (participant.eliminated && participant.rewindEligible) {
      return null;
    }
    return {
      id: participant.id,
      name: participant.name,
      stack: participant.stack
    };
  });
}

function seatedCount(room) {
  return room.seats.filter(Boolean).length;
}

function activeGameCount(room) {
  if (!room.game) {
    return seatedCount(room);
  }
  return room.game.players.filter((player) => !player.eliminated).length;
}

function cancelAutoNext(room) {
  if (room.autoTimer) {
    clearTimeout(room.autoTimer);
    room.autoTimer = null;
  }
  room.nextHandAt = null;
}

function cancelPresentation(room) {
  if (room.presentationTimer) {
    clearTimeout(room.presentationTimer);
    room.presentationTimer = null;
  }
  room.presentation = null;
}

function presentationEvent(room) {
  if (!room.presentation) {
    return null;
  }
  return {
    type: "room:presentation",
    presentation: {
      kind: room.presentation.kind,
      stage: room.presentation.stage,
      sequence: room.presentation.sequence,
      last: room.presentation.last || null
    }
  };
}

function clearRewindWindow(room) {
  if (room.rewindTimer) {
    clearTimeout(room.rewindTimer);
    room.rewindTimer = null;
  }
  room.rewindWindow = null;
}

function finalizeRewindWindow(room, broadcast) {
  if (!room.rewindWindow) {
    return;
  }
  const window = room.rewindWindow;
  window.requests.forEach((request, rewinderId) => {
    if (request.status === "accepted") {
      room.rewindViewers.set(rewinderId, request.targetId);
    }
  });
  clearRewindWindow(room);
  cancelPresentation(room);
  if (room.game.phase === "bet2" && room.game.players.some((player) => player.drawCard)) {
    startDrawPresentation(room, broadcast);
    return;
  }
  if (room.game.phase === "complete") {
    handleCompletedHand(room);
    scheduleAutoNext(room, broadcast);
    broadcast(room);
    return;
  }
  room.status = "playing";
  broadcast(room);
}

function startRewindWindow(room, broadcast) {
  const rewinders = Array.from(room.users.values()).filter(
    (participant) => participant.rewindEligible && participant.connected
  );
  if (!rewinders.length) {
    cancelPresentation(room);
    if (
      room.game.phase === "bet2" &&
      room.game.players.some((player) => player.drawCard)
    ) {
      startDrawPresentation(room, broadcast);
      return;
    }
    if (room.game.phase === "complete") {
      handleCompletedHand(room);
      scheduleAutoNext(room, broadcast);
      broadcast(room);
      return;
    }
    room.status = "playing";
    broadcast(room);
    return;
  }
  clearRewindWindow(room);
  room.rewindWindow = {
    handNo: room.game.handNo,
    deadline: Date.now() + 10_000,
    requests: new Map()
  };
  room.status = "rewind";
  room.lastActiveAt = Date.now();
  broadcast(room);
  room.rewindTimer = setTimeout(() => {
    if (room.rewindWindow) {
      finalizeRewindWindow(room, broadcast);
    }
  }, 10_000);
  room.rewindTimer.unref?.();
}

function maybeFinalizeRewindWindow(room, broadcast) {
  if (!room.rewindWindow) {
    return false;
  }
  const pending = Array.from(room.rewindWindow.requests.values()).some(
    (request) => request.status === "pending"
  );
  if (pending) {
    return false;
  }
  const rewinders = Array.from(room.users.values()).filter(
    (participant) => participant.rewindEligible && participant.connected
  );
  const resolved = rewinders.every((participant) =>
    room.rewindWindow.requests.has(participant.id)
  );
  if (resolved) {
    finalizeRewindWindow(room, broadcast);
    return true;
  }
  return false;
}

function startInitialPresentation(room, broadcast) {
  cancelPresentation(room);
  clearRewindWindow(room);
  room.rewindViewers.clear();
  const order = room.game.dealOrder.filter(
    (index) => !room.game.players[index].eliminated
  );
  room.presentation = {
    kind: "initial",
    stage: "hole",
    sequence: 0,
    index: -1,
    order,
    revealedHoles: [],
    revealedUps: [],
    revealedDraws: [],
    last: null
  };
  room.status = "dealing";
  broadcast(room, presentationEvent(room));
  const stepMs = room.dealTimings?.stepMs || 220;
  const roundGapMs = room.dealTimings?.roundGapMs || 350;
  const openingPauseMs = room.dealTimings?.openingPauseMs || 450;

  const revealHole = () => {
    const presentation = room.presentation;
    if (!presentation) {
      return;
    }
    presentation.index += 1;
    if (presentation.index < presentation.order.length) {
      const seat = presentation.order[presentation.index];
      presentation.revealedHoles.push(seat);
      presentation.sequence += 1;
      presentation.last = { seat, slot: "hole", sequence: presentation.sequence };
      broadcast(room, presentationEvent(room));
      room.presentationTimer = setTimeout(revealHole, stepMs);
      return;
    }
    presentation.stage = "up";
    presentation.index = -1;
    room.presentationTimer = setTimeout(revealUp, roundGapMs);
  };

  const revealUp = () => {
    const presentation = room.presentation;
    if (!presentation) {
      return;
    }
    presentation.index += 1;
    if (presentation.index < presentation.order.length) {
      const seat = presentation.order[presentation.index];
      presentation.revealedUps.push(seat);
      presentation.sequence += 1;
      presentation.last = { seat, slot: "up", sequence: presentation.sequence };
      broadcast(room, presentationEvent(room));
      room.presentationTimer = setTimeout(revealUp, stepMs);
      return;
    }
    presentation.stage = "opening";
    broadcast(room, presentationEvent(room));
    room.presentationTimer = setTimeout(() => {
      if (!room.presentation) {
        return;
      }
        startRewindWindow(room, broadcast);
    }, openingPauseMs);
  };

  room.presentationTimer = setTimeout(revealHole, roundGapMs);
}

function startDrawPresentation(room, broadcast) {
  cancelPresentation(room);
  const alive = room.game.players.filter(
    (player) => !player.eliminated && !player.folded
  );
  const startIndex = alive.some(
    (player) => player.seat === room.game.openerIndex
  )
    ? room.game.openerIndex
    : alive[0]?.seat;
  const baseOrder = alive.map((player) => player.seat);
  const offset = baseOrder.indexOf(startIndex);
  const order =
    offset >= 0
      ? baseOrder.slice(offset).concat(baseOrder.slice(0, offset))
      : baseOrder;
  room.presentation = {
    kind: "draw",
    stage: room.game.midHandReshuffle ? "reshuffle" : "discard",
    sequence: 0,
    index: -1,
    order,
    revealedHoles: [],
    revealedUps: [],
    revealedDraws: [],
    last: null
  };
  room.status = "dealing";
  const discardMs = room.dealTimings?.discardMs || 450;
  const drawStepMs = room.dealTimings?.drawStepMs || 250;
  const drawFinishMs = room.dealTimings?.drawFinishMs || 500;
  broadcast(room, presentationEvent(room));

  const beginDraw = () => {
    if (!room.presentation) {
      return;
    }
    room.presentation.stage = "draw";
    room.presentation.index = -1;
    broadcast(room);
    revealDraw();
  };

  const revealDraw = () => {
    const presentation = room.presentation;
    if (!presentation) {
      return;
    }
    presentation.index += 1;
    if (presentation.index < presentation.order.length) {
      const seat = presentation.order[presentation.index];
      presentation.revealedDraws.push(seat);
      presentation.sequence += 1;
      presentation.last = {
        seat,
        slot: "draw",
        sequence: presentation.sequence
      };
      broadcast(room, presentationEvent(room));
      room.presentationTimer = setTimeout(revealDraw, drawStepMs);
      return;
    }
    presentation.stage = "opening2";
    broadcast(room, presentationEvent(room));
    room.presentationTimer = setTimeout(() => {
      if (!room.presentation) {
        return;
      }
      cancelPresentation(room);
      room.status = "playing";
      broadcast(room);
      if (room.game.phase === "complete") {
        handleCompletedHand(room);
        scheduleAutoNext(room, broadcast);
      }
    }, drawFinishMs);
  };

  room.presentationTimer = setTimeout(
    beginDraw,
    room.game.midHandReshuffle ? 900 : discardMs
  );
}

function scheduleAutoNext(room, broadcast) {
  cancelAutoNext(room);
  if (
    room.status !== "playing" ||
    !room.game ||
    room.game.phase !== "complete" ||
    room.game.tableOver ||
    room.paused ||
    activeGameCount(room) < 2
  ) {
    return;
  }
  room.nextHandAt = Date.now() + (room.autoNextMs || AUTO_NEXT_MS);
  room.autoTimer = setTimeout(() => {
    room.autoTimer = null;
    room.nextHandAt = null;
    try {
      beginNextHand(room, broadcast);
    } catch (error) {
      room.paused = true;
      broadcast(room, { type: "error", message: error.message });
    }
  }, room.autoNextMs || AUTO_NEXT_MS);
  room.autoTimer.unref?.();
}

function beginNextHand(room, broadcast) {
  if (!room.game || room.game.phase !== "complete" || room.game.tableOver) {
    throw new RequestError(409, "当前不能开始下一手。");
  }
  releasePendingSeats(room);
  seatWaitingParticipants(room);
  const seats = roomSeatDescriptors(room);
  Engine.syncOnlineSeats(room.game, seats);
  const active = room.game.players.filter((player) => !player.eliminated).length;
  if (active < 2) {
    room.paused = true;
    throw new RequestError(409, "至少需要两名有筹码的在座玩家。");
  }
  Engine.startNextHand(room.game);
  room.paused = false;
  cancelAutoNext(room);
  startInitialPresentation(room, broadcast);
}

function startNewMatch(room, broadcast) {
  releasePendingSeats(room);
  for (const participant of room.users.values()) {
    participant.eliminated = false;
    participant.blockedFromSeat = false;
    participant.pendingSeatRelease = false;
    participant.rewindEligible = false;
    participant.rewindStage = 0;
    participant.revivalsUsed = 0;
    participant.stack = room.startingChips;
  }
  seatWaitingParticipants(room);
  const onlinePlayers = roomSeatDescriptors(room);
  if (onlinePlayers.filter(Boolean).length < 2) {
    throw new RequestError(409, "至少需要两名玩家入座才能开局。");
  }
  room.game = Engine.createGame({
    mode: "online",
    playerCount: room.seatCap,
    onlinePlayers,
    startingChips: room.startingChips,
    ante: room.ante,
    minBet: room.ante,
    betCap: room.betCap
  });
  Engine.startNextHand(room.game);
  room.paused = false;
  room.matchStartedAt = Date.now();
  clearRewindWindow(room);
  room.rewindViewers.clear();
  cancelAutoNext(room);
  startInitialPresentation(room, broadcast);
}

function handleCompletedHand(room) {
  if (!room.game || room.game.phase !== "complete") {
    return;
  }
  const outrightWinnerIndex = room.game.summary?.outrightWinner;
  const outrightWinner =
    Number.isInteger(outrightWinnerIndex)
      ? room.game.players[outrightWinnerIndex]
      : null;
  for (const participant of room.users.values()) {
    if (participant.seat === null) {
      continue;
    }
    const gamePlayer = room.game.players[participant.seat];
    if (!gamePlayer || gamePlayer.id !== participant.id) {
      continue;
    }
    if (gamePlayer && gamePlayer.eliminated) {
      participant.eliminated = true;
      participant.stack = 0;
      if (participant.revivalsUsed < 3) {
        participant.rewindEligible = true;
        participant.rewindStage = participant.revivalsUsed + 1;
        appendSystemChat(
          room,
          `${participant.name} 已成为${participant.rewindStage}转回溯者。`
        );
      } else {
        participant.rewindEligible = false;
        participant.rewindStage = 0;
        participant.pendingSeatRelease = true;
        appendSystemChat(room, `${participant.name} 已用完三次回溯，正式出局。`);
      }
    } else if (gamePlayer) {
      participant.stack = gamePlayer.stack;
      participant.eliminated = false;
    }
    if (participant.pendingRemoval || participant.leaving) {
      participant.pendingSeatRelease = true;
    }
  }
  if (
    outrightWinner &&
    !room.game.tableOver
  ) {
    const acceptedRewinders = Array.from(room.rewindViewers.entries()).filter(
      ([rewinderId, targetId]) => {
        const rewinder = room.users.get(rewinderId);
        return (
          targetId === outrightWinner.id &&
          rewinder?.rewindEligible &&
          rewinder.revivalsUsed < 3
        );
      }
    );
    acceptedRewinders.forEach(([rewinderId]) => {
      const rewinder = room.users.get(rewinderId);
      rewinder.revivalsUsed += 1;
      rewinder.stack = Math.max(1, Math.floor(room.startingChips / 2));
      rewinder.eliminated = false;
      rewinder.rewindEligible = false;
      rewinder.pendingSeatRelease = false;
      rewinder.blockedFromSeat = false;
      appendSystemChat(
        room,
        `${rewinder.name} 因见证 ${outrightWinner.name} 获胜而复活，并获得 ${
          room.startingChips / 2
        } 筹码。`
      );
    });
  }
  room.rewindViewers.clear();
  if (room.game.tableOver) {
    room.status = "matchOver";
    cancelAutoNext(room);
  } else {
    room.status = "playing";
  }
}

function makePublicGame(room, viewerId) {
  if (!room.game) {
    return null;
  }
  const game = Engine.clone(room.game);
  game.deckCount = game.deck.length;
  game.deck = [];
  game.hasDiscard = Boolean(game.discardCard);
  game.discardCard = null;
  delete game.seed;
  delete game.rngState;
  delete game.aiRngState;
  const viewerIndex = game.players.findIndex(
    (player) => player.id === viewerId
  );
  const actualPhase = game.phase;
  let equity = null;
  if (
    viewerIndex >= 0 &&
    !game.players[viewerIndex].eliminated &&
    !game.players[viewerIndex].folded &&
    ["bet1", "bet2"].includes(game.phase) &&
    !room.presentation
  ) {
    const signature = [
      game.handNo,
      game.phase,
      ...game.players
        .filter((player) => !player.eliminated && !player.folded)
        .map((player) => {
          return [
            player.seat,
            player.upCard?.id || "",
            player.drawCard?.id || ""
          ].join(":");
        })
    ].join("|");
    if (!room.equityCache || room.equityCache.signature !== signature) {
      room.equityCache = { signature, byViewer: new Map() };
    }
    if (!room.equityCache.byViewer.has(viewerId)) {
      room.equityCache.byViewer.set(
        viewerId,
        Engine.estimateEquityByPlayer(game, viewerIndex, 400)
      );
    }
    equity = room.equityCache.byViewer.get(viewerId);
  }
  if (room.presentation) {
    const presentation = room.presentation;
    game.presentation = {
      kind: presentation.kind,
      stage: presentation.stage,
      sequence: presentation.sequence,
      last: presentation.last
    };
    game.phase =
      presentation.kind === "initial" ? "dealing" : "drawing";
    game.actorIndex = null;
    game.summary = null;
    game.tableOver = null;
    game.openingIndex = null;
    game.openerIndex = null;
    if (
      presentation.kind === "draw" &&
      presentation.stage !== "opening2"
    ) {
      game.secondOpenerIndex = null;
      game.secondOpeningFallback = false;
    }
    game.logs = game.logs.filter(
      (entry) =>
        entry.hand !== game.handNo ||
        (entry.type === "phase" && presentation.stage !== "opening")
    );
    game.players.forEach((player) => {
      const seat = player.seat;
      if (presentation.kind === "initial") {
        if (!presentation.revealedHoles.includes(seat)) {
          player.hasHiddenHole = false;
          player.holeCard = null;
        }
        if (!presentation.revealedUps.includes(seat)) {
          player.upCard = null;
        }
        player.drawCard = null;
      } else if (!presentation.revealedDraws.includes(seat)) {
        player.drawCard = null;
      }
    });
  }
  const rewindTargetId = room.rewindViewers.get(viewerId) || null;
  game.players.forEach((player) => {
    const isSelf = player.id === viewerId;
    const rewindRevealed =
      Boolean(rewindTargetId) &&
      player.id === rewindTargetId &&
      Boolean(player.holeCard);
    const revealed =
      !room.presentation && actualPhase === "complete" && player.revealed;
    player.rewindRevealed = rewindRevealed;
    if (!isSelf && !revealed && !rewindRevealed) {
      player.hasHiddenHole = Boolean(player.holeCard);
      player.holeCard = null;
    }
  });
  game.equity = equity;
  return game;
}

function makeRewindView(room, participant) {
  const window = room.rewindWindow;
  if (!window || window.handNo !== room.game?.handNo) {
    return {
      active: false,
      selfEligible: Boolean(participant.rewindEligible),
      targets: [],
      outgoing: null,
      incoming: [],
      acceptedTargetId: room.rewindViewers.get(participant.id) || null,
      deadline: null
    };
  }
  const targets = Array.from(room.users.values())
    .filter(
      (entry) =>
        entry.seat !== null &&
        !entry.eliminated &&
        room.game &&
        !room.game.players[entry.seat]?.eliminated
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      avatarUrl: entry.avatarUrl || "preset:jester",
      seat: entry.seat
    }));
  const outgoing = window.requests.get(participant.id) || null;
  const incoming = Array.from(window.requests.values())
    .filter(
      (request) =>
        request.targetId === participant.id && request.status === "pending"
    )
    .map((request) => {
      const rewinder = room.users.get(request.rewinderId);
      return {
        rewinderId: request.rewinderId,
        rewinderName: rewinder?.name || "回溯者",
        avatarUrl: rewinder?.avatarUrl || "preset:jester",
        deadline: request.deadline
      };
    });
  return {
    active: true,
    selfEligible: Boolean(participant.rewindEligible),
    targets,
    outgoing,
    incoming,
    acceptedTargetId: room.rewindViewers.get(participant.id) || null,
    deadline: window.deadline
  };
}

function appendSystemChat(room, text) {
  const message = {
    id: `chat_${++room.chatSequence}`,
    kind: "system",
    text,
    userId: null,
    name: "系统",
    avatarUrl: "preset:jester",
    createdAt: Date.now()
  };
  room.chatMessages.push(message);
  if (room.chatMessages.length > 50) {
    room.chatMessages.splice(0, room.chatMessages.length - 50);
  }
  return message;
}

function makeRoomView(room, participant) {
  const users = Array.from(room.users.values())
    .sort((left, right) => left.joinedAt - right.joinedAt)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      avatarUrl: entry.avatarUrl || "preset:jester",
      seat: entry.seat,
      connected: entry.connected,
      isHost: entry.id === room.hostId,
      isSelf: entry.id === participant.id,
      eliminated: Boolean(entry.eliminated),
      rewindEligible: Boolean(entry.rewindEligible),
      rewindStage: entry.rewindStage || 0,
      revivalsUsed: entry.revivalsUsed || 0,
      pendingSeatRelease: Boolean(entry.pendingSeatRelease),
      chatMuted: Boolean(entry.chatMuted)
    }));
  return {
    type: "room:state",
    room: {
      code: room.code,
      seatCap: room.seatCap,
      ante: room.ante,
      betCap: room.betCap,
      startingChips: room.startingChips,
      status: room.status,
      hostId: room.hostId,
      paused: room.paused,
      nextHandAt: room.nextHandAt,
      autoNextMs: room.autoNextMs || AUTO_NEXT_MS,
      users,
      seats: room.seats.map((userId) => {
        if (!userId) {
          return null;
        }
        const entry = room.users.get(userId);
        return entry
          ? {
              userId: entry.id,
              name: entry.name,
              avatarUrl: entry.avatarUrl || "preset:jester",
              connected: entry.connected,
              eliminated: Boolean(entry.eliminated),
              rewindEligible: Boolean(entry.rewindEligible),
              rewindStage: entry.rewindStage || 0,
              stack: Number.isFinite(entry.stack) ? entry.stack : null
            }
          : null;
      }),
      spectators: users.filter((entry) => entry.seat === null),
      rewinders: users.filter((entry) => entry.rewindEligible),
      self: users.find((entry) => entry.id === participant.id),
      rewind: makeRewindView(room, participant),
      chat: {
        enabled: room.chatEnabled,
        messages: room.chatMessages.slice(),
        quickPhrases: Object.entries(QUICK_PHRASES).map(([id, text]) => ({
          id,
          text
        })),
        emoteItems: Array.from(EMOTE_ITEMS),
        muted: Boolean(participant.chatMuted)
      },
      game: makePublicGame(room, participant.id)
    }
  };
}

function sendSocket(socket, payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function createGameServer(options = {}) {
  const rooms = new Map();
  const avatars = new Map();
  const requestBuckets = new Map();
  const defaultAutoNextMs = Number(options.autoNextMs) || AUTO_NEXT_MS;
  const defaultDealTimings = Object.assign(
    {
      stepMs: 220,
      roundGapMs: 350,
      openingPauseMs: 450,
      discardMs: 450,
      drawStepMs: 250,
      drawFinishMs: 500
    },
    options.dealTimings || {}
  );
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_BODY_BYTES
  });
  const httpServer = http.createServer(handleHttp);

  function allowRequest(request, bucketName, limit, windowMs) {
    const address =
      request.socket.remoteAddress ||
      request.headers["x-forwarded-for"] ||
      "unknown";
    const key = `${bucketName}:${address}`;
    const now = Date.now();
    const bucket = requestBuckets.get(key) || { start: now, count: 0 };
    if (now - bucket.start > windowMs) {
      bucket.start = now;
      bucket.count = 0;
    }
    bucket.count += 1;
    requestBuckets.set(key, bucket);
    return bucket.count <= limit;
  }

  function touchRoom(room) {
    room.lastActiveAt = Date.now();
  }

  function deleteRoom(room) {
    cancelAutoNext(room);
    if (room.rewindTimer) {
      clearTimeout(room.rewindTimer);
      room.rewindTimer = null;
    }
    if (room.presentationTimer) {
      clearTimeout(room.presentationTimer);
      room.presentationTimer = null;
    }
    for (const avatarId of room.avatarIds || []) {
      avatars.delete(avatarId);
    }
    rooms.delete(room.code);
  }

  function storeAvatar(room, input) {
    const decoded = decodeAvatar(input);
    if (!decoded) {
      return "preset:jester";
    }
    if (!decoded.bytes) {
      return decoded.url;
    }
    const avatarId = randomId("avatar");
    avatars.set(avatarId, {
      bytes: decoded.bytes,
      mimeType: decoded.mimeType,
      roomCode: room.code
    });
    room.avatarIds.add(avatarId);
    return `/api/avatars/${avatarId}`;
  }

  function broadcast(room, directMessage) {
    touchRoom(room);
    for (const participant of room.users.values()) {
      if (participant.connected && participant.socket) {
        sendSocket(participant.socket, makeRoomView(room, participant));
      }
    }
    if (directMessage) {
      for (const participant of room.users.values()) {
        if (participant.connected && participant.socket) {
          sendSocket(participant.socket, directMessage);
        }
      }
    }
  }

  function broadcastEvent(room, payload) {
    for (const participant of room.users.values()) {
      if (participant.connected && participant.socket) {
        sendSocket(participant.socket, payload);
      }
    }
  }

  function appendChat(room, message) {
    room.chatMessages.push(message);
    if (room.chatMessages.length > 50) {
      room.chatMessages.splice(0, room.chatMessages.length - 50);
    }
    return message;
  }

  function nextChatId(room) {
    room.chatSequence = (room.chatSequence || 0) + 1;
    return `chat_${room.chatSequence}`;
  }

  function checkChatRate(participant) {
    const now = Date.now();
    if (now - participant.lastChatAt < 1500) {
      throw new RequestError(429, "发送太快，请稍等一下。");
    }
    participant.chatTimes = participant.chatTimes.filter(
      (timestamp) => now - timestamp < 60_000
    );
    if (participant.chatTimes.length >= 10) {
      throw new RequestError(429, "一分钟内发送的消息太多了。");
    }
    participant.lastChatAt = now;
    participant.chatTimes.push(now);
  }

  function handleChatMessage(room, participant, message) {
    if (!room.chatEnabled) {
      throw new RequestError(403, "房主已经关闭聊天。");
    }
    if (participant.chatMuted) {
      throw new RequestError(403, "你已被房主禁言。");
    }
    checkChatRate(participant);
    let kind = "text";
    let text;
    if (message.kind === "quick") {
      text = QUICK_PHRASES[message.phraseId];
      if (!text) {
        throw new RequestError(400, "快捷语不存在。");
      }
      kind = "quick";
    } else {
      text = normalizeChatText(message.text);
    }
    const chatMessage = appendChat(room, {
      id: nextChatId(room),
      kind,
      text,
      ...(kind === "quick" ? { phraseId: message.phraseId } : {}),
      userId: participant.id,
      name: participant.name,
      avatarUrl: participant.avatarUrl,
      createdAt: Date.now()
    });
    broadcastEvent(room, { type: "room:chat", message: chatMessage });
  }

  function handleEmote(room, participant, message) {
    if (!room.chatEnabled) {
      throw new RequestError(403, "房主已经关闭互动。");
    }
    if (participant.chatMuted) {
      throw new RequestError(403, "你已被房主禁言。");
    }
    const target = room.users.get(message.targetId);
    if (!target || target.id === participant.id) {
      throw new RequestError(400, "请选择其他玩家作为投掷目标。");
    }
    if (!EMOTE_ITEMS.has(message.item)) {
      throw new RequestError(400, "未知投掷道具。");
    }
    const now = Date.now();
    if (now - participant.lastEmoteAt < 3000) {
      throw new RequestError(429, "投掷太快，请稍等一下。");
    }
    participant.lastEmoteAt = now;
    const chatMessage = appendChat(room, {
      id: nextChatId(room),
      kind: "emote",
      item: message.item,
      targetId: target.id,
      text: "",
      userId: participant.id,
      name: participant.name,
      avatarUrl: participant.avatarUrl,
      createdAt: now
    });
    broadcastEvent(room, {
      type: "room:emote",
      message: chatMessage
    });
  }

  function getRoom(code) {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) {
      throw new RequestError(404, "房间不存在或已经关闭。");
    }
    return room;
  }

  function participantForToken(room, token) {
    const payload = verifyRoomToken(token, room.code);
    if (!payload) {
      return null;
    }
    return room.users.get(payload.u) || null;
  }

  function participantForAnyToken(token) {
    for (const room of rooms.values()) {
      const participant = participantForToken(room, token);
      if (participant) {
        return { room, participant };
      }
    }
    return null;
  }

  function renameParticipant(room, participant, value) {
    const name = normalizeName(value);
    ensureUniqueName(room, name, participant.id);
    const oldName = participant.name;
    participant.name = name;
    if (room.game && participant.seat !== null) {
      const player = room.game.players[participant.seat];
      if (player) {
        player.name = name;
      }
      room.game.logs.forEach((log) => {
        log.text = log.text.split(oldName).join(name);
      });
      if (room.game.summary) {
        room.game.summary.reason = room.game.summary.reason
          .split(oldName)
          .join(name);
        room.game.summary.awards.forEach((award) => {
          if (award.playerIndex === participant.seat) {
            award.name = name;
          }
        });
        room.game.summary.evaluations.forEach((evaluation) => {
          if (evaluation.playerIndex === participant.seat) {
            evaluation.name = name;
          }
        });
      }
      if (room.game.tableOver) {
        room.game.tableOver.reason = room.game.tableOver.reason
          .split(oldName)
          .join(name);
        if (room.game.tableOver.winnerId === participant.id) {
          room.game.tableOver.winnerName = name;
        }
      }
    }
  }

  function markSeatRelease(room, participant) {
    participant.pendingRemoval = true;
    participant.pendingSeatRelease = true;
    participant.blockedFromSeat = true;
    if (
      room.game &&
      ["bet1", "bet2"].includes(room.game.phase) &&
      participant.seat !== null &&
      room.game.actorIndex === participant.seat
    ) {
      const phaseBefore = room.game.phase;
      Engine.performAction(room.game, { type: "fold" });
      const drawStarted =
        phaseBefore === "bet1" &&
        room.game.phase !== "bet1" &&
        room.game.players.some((player) => Boolean(player.drawCard));
      if (drawStarted) {
        startDrawPresentation(room, broadcast);
      } else if (room.game.phase === "complete") {
        handleCompletedHand(room);
        scheduleAutoNext(room, broadcast);
      }
    }
  }

  function removeParticipant(room, participant) {
    if (participant.socket) {
      participant.socket.close(4003, "left room");
      participant.socket = null;
    }
    if (participant.seat !== null) {
      room.seats[participant.seat] = null;
      participant.seat = null;
    }
    room.users.delete(participant.id);
    if (room.hostId === participant.id) {
      transferHost(room, participant.id);
    }
  }

  function leaveParticipant(room, participant) {
    if (room.hostId === participant.id) {
      transferHost(room, participant.id);
    }
    if (
      room.game &&
      ["bet1", "bet2"].includes(room.game.phase) &&
      participant.seat !== null
    ) {
      participant.leaving = true;
      markSeatRelease(room, participant);
      return;
    }
    removeParticipant(room, participant);
  }

  function handleHostCommand(room, participant, message) {
    if (room.hostId !== participant.id) {
      throw new RequestError(403, "只有房主可以执行这个操作。");
    }
    if (message.type === "host:start") {
      cancelAutoNext(room);
      if (
        room.status === "lobby" ||
        room.status === "matchOver" ||
        !room.game
      ) {
        if (
          Number.isFinite(Number(message.ante)) ||
          Number.isFinite(Number(message.betCap)) ||
          Number.isFinite(Number(message.startingChips))
        ) {
          const stakes = normalizeStakeSettings(
            message.ante ?? room.ante,
            message.betCap ?? room.betCap,
            message.startingChips ?? room.startingChips
          );
          room.ante = stakes.ante;
          room.betCap = stakes.betCap;
          room.startingChips = stakes.startingChips;
        }
        startNewMatch(room, broadcast);
      } else if (room.game.phase === "complete") {
        beginNextHand(room, broadcast);
      }
      return;
    }
    if (message.type === "host:settings") {
      if (!room.game || room.status === "lobby" || room.status === "matchOver") {
        const stakes = normalizeStakeSettings(
          message.ante,
          message.betCap,
          message.startingChips ?? room.startingChips
        );
        room.ante = stakes.ante;
        room.betCap = stakes.betCap;
        room.startingChips = stakes.startingChips;
        return;
      }
      throw new RequestError(409, "牌局进行中不能修改底注和上限。");
    }
    if (message.type === "host:pause") {
      room.paused = true;
      cancelAutoNext(room);
      return;
    }
    if (message.type === "host:resume") {
      room.paused = false;
      scheduleAutoNext(room, broadcast);
      return;
    }
    if (message.type === "host:skip") {
      const target = room.users.get(message.targetId);
      if (!target || target.seat === null) {
        throw new RequestError(404, "找不到该玩家。");
      }
      if (target.id === participant.id) {
        throw new RequestError(400, "房主不能跳过自己的回合。");
      }
      if (!room.game || room.game.actorIndex !== target.seat) {
        throw new RequestError(409, "该玩家当前没有行动权。");
      }
      markSeatRelease(room, target);
      return;
    }
    if (message.type === "host:remove") {
      const target = room.users.get(message.targetId);
      if (!target || target.id === participant.id) {
        throw new RequestError(400, "无效的移座目标。");
      }
      if (target.seat === null) {
        throw new RequestError(409, "该玩家已经在旁观。");
      }
      if (!room.game || room.game.phase === "complete") {
        room.seats[target.seat] = null;
        target.seat = null;
        target.pendingRemoval = false;
        target.blockedFromSeat = true;
        return;
      }
      markSeatRelease(room, target);
      return;
    }
    if (message.type === "host:transfer") {
      const target = room.users.get(message.targetId);
      if (!target || !target.connected) {
        throw new RequestError(404, "找不到该在线玩家。");
      }
      room.hostId = target.id;
      return;
    }
    if (message.type === "host:chat:mute") {
      const target = room.users.get(message.targetId);
      if (!target || target.id === participant.id) {
        throw new RequestError(400, "无效的禁言目标。");
      }
      target.chatMuted = Boolean(message.muted);
      return;
    }
    if (message.type === "host:chat:clear") {
      room.chatMessages = [];
      broadcastEvent(room, {
        type: "room:chat-history",
        messages: room.chatMessages
      });
      return;
    }
    if (message.type === "host:chat:enable") {
      room.chatEnabled = Boolean(message.enabled);
      return;
    }
    throw new RequestError(400, "未知的房主操作。");
  }

  function handleAction(room, participant, message) {
    if (room.presentation) {
      throw new RequestError(409, "正在发牌，请稍候。");
    }
    if (!room.game || room.status !== "playing") {
      throw new RequestError(409, "牌局尚未开始。");
    }
    if (participant.seat === null) {
      throw new RequestError(403, "旁观者不能下注。");
    }
    if (participant.pendingRemoval || participant.leaving) {
      throw new RequestError(403, "该座位正在等待本手结束后释放。");
    }
    if (room.game.phase !== "bet1" && room.game.phase !== "bet2") {
      throw new RequestError(409, "当前不在下注阶段。");
    }
    if (message.handNo !== room.game.handNo) {
      throw new RequestError(409, "这手牌已经结束，请等待最新状态。");
    }
    const requestId = String(message.requestId || "");
    const requestKey = `${message.handNo}:${requestId}`;
    if (requestId) {
      room.processedRequests ||= new Map();
      const seen = room.processedRequests.get(participant.id) || [];
      if (seen.includes(requestKey)) {
        return;
      }
    }
    if (room.game.actorIndex !== participant.seat) {
      throw new RequestError(409, "还没有轮到你。");
    }
    const action = message.action || {};
    const phaseBefore = room.game.phase;
    Engine.performAction(room.game, {
      type: action.type,
      amount: action.amount
    });
    if (requestId) {
      const seen = room.processedRequests.get(participant.id) || [];
      seen.push(requestKey);
      if (seen.length > 40) {
        seen.splice(0, seen.length - 40);
      }
      room.processedRequests.set(participant.id, seen);
    }
    const drawStarted =
      phaseBefore === "bet1" &&
      room.game.phase !== "bet1" &&
      room.game.players.some((player) => Boolean(player.drawCard));
    if (drawStarted) {
      startDrawPresentation(room, broadcast);
    } else if (room.game.phase === "complete") {
      handleCompletedHand(room);
      scheduleAutoNext(room, broadcast);
    }
  }

  function handleEarlyFold(room, participant, message) {
    if (room.presentation) {
      throw new RequestError(409, "正在发牌，请稍候。");
    }
    if (!room.game || room.status !== "playing") {
      throw new RequestError(409, "牌局尚未开始。");
    }
    if (participant.seat === null) {
      throw new RequestError(403, "旁观者不能弃牌。");
    }
    if (message.handNo !== room.game.handNo) {
      throw new RequestError(409, "这手牌已经结束。");
    }
    const requestId = String(message.requestId || "");
    const requestKey = `${message.handNo}:early:${requestId}`;
    room.processedRequests ||= new Map();
    const seen = room.processedRequests.get(participant.id) || [];
    if (requestId && seen.includes(requestKey)) {
      return;
    }
    if (!Engine.getEarlyFoldEligibility(room.game, participant.seat)) {
      throw new RequestError(409, "当前不能提前弃牌。");
    }
    Engine.performEarlyFold(room.game, participant.seat);
    if (requestId) {
      seen.push(requestKey);
      if (seen.length > 40) {
        seen.splice(0, seen.length - 40);
      }
      room.processedRequests.set(participant.id, seen);
    }
    if (room.game.phase === "complete") {
      handleCompletedHand(room);
      scheduleAutoNext(room, broadcast);
    }
  }

  function handleRewindSelect(room, participant, message) {
    if (!room.rewindWindow || room.rewindWindow.handNo !== room.game?.handNo) {
      throw new RequestError(409, "当前不在回溯选择阶段。");
    }
    if (!participant.rewindEligible) {
      throw new RequestError(403, "只有回溯者可以发起查看请求。");
    }
    if (room.rewindWindow.requests.has(participant.id)) {
      throw new RequestError(409, "本手已经提交过回溯选择。");
    }
    if (!message.targetId) {
      room.rewindWindow.requests.set(participant.id, {
        rewinderId: participant.id,
        targetId: null,
        status: "skipped",
        createdAt: Date.now(),
        deadline: room.rewindWindow.deadline
      });
      maybeFinalizeRewindWindow(room, broadcast);
      return;
    }
    const target = room.users.get(String(message.targetId));
    if (
      !target ||
      target.id === participant.id ||
      target.seat === null ||
      target.eliminated ||
      target.rewindEligible ||
      !room.game ||
      room.game.players[target.seat]?.eliminated
    ) {
      throw new RequestError(400, "请选择一名当前在座玩家。");
    }
    room.rewindWindow.requests.set(participant.id, {
      rewinderId: participant.id,
      targetId: target.id,
      status: "pending",
      createdAt: Date.now(),
      deadline: Math.min(Date.now() + 10_000, room.rewindWindow.deadline)
    });
    broadcast(room);
  }

  function handleRewindRespond(room, participant, message) {
    if (!room.rewindWindow) {
      throw new RequestError(409, "回溯请求已经结束。");
    }
    const request = room.rewindWindow.requests.get(
      String(message.rewinderId || "")
    );
    if (!request || request.targetId !== participant.id) {
      throw new RequestError(404, "找不到发给你的回溯请求。");
    }
    if (request.status !== "pending" || request.deadline < Date.now()) {
      throw new RequestError(409, "这个回溯请求已经过期。");
    }
    request.status = message.accepted ? "accepted" : "declined";
    request.respondedAt = Date.now();
    if (message.accepted) {
      room.rewindViewers.set(request.rewinderId, participant.id);
    }
    if (maybeFinalizeRewindWindow(room, broadcast)) {
      return;
    }
    broadcast(room);
  }

  function handleSocketMessage(socket, raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      sendSocket(socket, { type: "error", message: "消息格式不正确。" });
      return;
    }
    if (!socket.auth && message.type !== "auth") {
      sendSocket(socket, { type: "error", message: "请先完成房间认证。" });
      return;
    }
    try {
      if (message.type === "auth") {
        const room = getRoom(message.roomCode);
        const participant = participantForToken(room, message.token);
        if (!participant) {
          throw new RequestError(401, "房间凭证已失效，请重新加入。");
        }
        if (participant.leaving) {
          throw new RequestError(403, "你已离开这个房间。");
        }
        if (participant.socket && participant.socket !== socket) {
          participant.socket.close(4001, "session replaced");
        }
        participant.socket = socket;
        participant.connected = true;
        if (!room.hostId) {
          room.hostId = participant.id;
        }
        socket.auth = {
          roomCode: room.code,
          userId: participant.id
        };
        clearTimeout(socket.authTimer);
        touchRoom(room);
        sendSocket(socket, makeRoomView(room, participant));
        broadcast(room);
        return;
      }

      const room = getRoom(socket.auth.roomCode);
      const participant = room.users.get(socket.auth.userId);
      if (!participant || participant.socket !== socket) {
        throw new RequestError(401, "当前连接已经失效。");
      }
      if (participant.leaving) {
        throw new RequestError(403, "你已离开这个房间。");
      }
      if (message.type === "rename") {
        renameParticipant(room, participant, message.name);
      } else if (message.type === "early-fold") {
        handleEarlyFold(room, participant, message);
      } else if (message.type === "rewind:select") {
        handleRewindSelect(room, participant, message);
      } else if (message.type === "rewind:respond") {
        handleRewindRespond(room, participant, message);
      } else if (message.type === "chat:send") {
        handleChatMessage(room, participant, message);
      } else if (message.type === "emote:throw") {
        handleEmote(room, participant, message);
      } else if (message.type === "action") {
        handleAction(room, participant, message);
      } else if (message.type === "host:start") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:settings") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:pause") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:resume") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:skip") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:remove") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:transfer") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:chat:mute") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:chat:clear") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "host:chat:enable") {
        handleHostCommand(room, participant, message);
      } else if (message.type === "leave") {
        leaveParticipant(room, participant);
        if (!room.users.size) {
          deleteRoom(room);
        }
        broadcast(room);
        return;
      } else {
        throw new RequestError(400, "未知操作。");
      }
      touchRoom(room);
      broadcast(room);
    } catch (error) {
      sendSocket(socket, {
        type: "error",
        message: error.message || "操作失败。"
      });
      if (!socket.auth) {
        socket.close(4004, "authentication failed");
      }
    }
  }

  wss.on("connection", (socket, request) => {
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          socket.close(4003, "origin rejected");
          return;
        }
      } catch {
        socket.close(4003, "origin rejected");
        return;
      }
    }
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    socket.authTimer = setTimeout(() => {
      if (!socket.auth) {
        socket.close(4008, "authentication timeout");
      }
    }, 5000);
    socket.on("message", (raw) => handleSocketMessage(socket, raw));
    socket.on("close", () => {
      clearTimeout(socket.authTimer);
      if (!socket.auth) {
        return;
      }
      const room = rooms.get(socket.auth.roomCode);
      const participant = room?.users.get(socket.auth.userId);
      if (participant && participant.socket === socket) {
        participant.socket = null;
        participant.connected = false;
        touchRoom(room);
        broadcast(room);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  heartbeat.unref?.();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const room of Array.from(rooms.values())) {
      const hasConnections = Array.from(room.users.values()).some(
        (participant) => participant.connected
      );
      if (!hasConnections && now - room.lastActiveAt > ROOM_IDLE_MS) {
        deleteRoom(room);
      }
    }
  }, 60000);
  cleanup.unref?.();

  async function handleHttp(request, response) {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    try {
      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          rooms: rooms.size,
          uptimeSeconds: Math.round(process.uptime())
        });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/api/host-links"
      ) {
        if (!verifyHostIssueSecret(request.headers["x-host-issue-secret"])) {
          throw new RequestError(401, "房主链接维护接口未授权。");
        }
        if (!allowRequest(request, "host-link", 6, 60_000)) {
          throw new RequestError(429, "操作过于频繁，请稍后再试。");
        }
        const ownerId = randomId("host");
        const token = issueHostToken(ownerId);
        sendJson(response, 201, {
          ownerId,
          token,
          hostUrl: `${shareOrigin(request)}/host#owner=${token}`
        });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/api/host/verify"
      ) {
        const body = await readJsonBody(request);
        const payload = verifyHostToken(body.token);
        if (!payload) {
          throw new RequestError(401, "永久房主链接无效或已过期。");
        }
        sendJson(response, 200, {
          valid: true,
          ownerId: payload.o,
          expiresAt: payload.e * 1000
        });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/api/rooms"
      ) {
        if (!allowRequest(request, "create", 12, 60_000)) {
          throw new RequestError(429, "创建房间过于频繁，请稍后再试。");
        }
        if (rooms.size >= 500) {
          throw new RequestError(503, "当前房间数量已满，请稍后再试。");
        }
        const body = await readJsonBody(request, MAX_AVATAR_BODY_BYTES);
        const hostPayload = body.ownerToken
          ? verifyHostToken(body.ownerToken)
          : null;
        if (body.ownerToken && !hostPayload) {
          throw new RequestError(401, "永久房主链接无效或已过期。");
        }
        const name = normalizeName(body.name);
        const seatCap = seatCapFromValue(body.seatCap);
        let code = randomCode(ROOM_CODE_LENGTH);
        while (rooms.has(code)) {
          code = randomCode(ROOM_CODE_LENGTH);
        }
        const now = Date.now();
        const room = {
          code,
          seatCap,
          ownerId: hostPayload?.o || null,
          ante: 10,
          betCap: 0,
          startingChips: 1000,
          hostId: null,
          status: "lobby",
          paused: false,
          autoNextMs: defaultAutoNextMs,
          dealTimings: defaultDealTimings,
          nextHandAt: null,
          autoTimer: null,
          users: new Map(),
          seats: Array(seatCap).fill(null),
          game: null,
          presentation: null,
          presentationTimer: null,
          equityCache: null,
          chatEnabled: true,
          chatMessages: [],
          chatSequence: 0,
      rewindWindow: null,
      rewindTimer: null,
      rewindViewers: new Map(),
          avatarIds: new Set(),
          createdAt: now,
          lastActiveAt: now,
          processedRequests: new Map()
        };
        const avatarUrl = storeAvatar(room, body.avatar);
        const participant = createParticipant(room, name, now, avatarUrl);
        room.hostId = participant.id;
        room.users.set(participant.id, participant);
        seatParticipant(room, participant);
        rooms.set(room.code, room);
        sendJson(response, 201, {
          roomCode: room.code,
          token: issueRoomToken(room.code, participant.id),
          userId: participant.id,
          shareUrl: `${shareOrigin(request)}/room/${room.code}`
        });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/api/profile/avatar"
      ) {
        const authorization = request.headers.authorization || "";
        const token = authorization.startsWith("Bearer ")
          ? authorization.slice(7)
          : "";
        const session = participantForAnyToken(token);
        if (!session) {
          throw new RequestError(401, "登录凭证无效。");
        }
        const body = await readJsonBody(request, MAX_AVATAR_BODY_BYTES);
        const avatarUrl = storeAvatar(session.room, body.avatar);
        session.participant.avatarUrl = avatarUrl;
        touchRoom(session.room);
        broadcast(session.room);
        sendJson(response, 200, { avatarUrl });
        return;
      }

      const joinMatch = requestUrl.pathname.match(
        /^\/api\/rooms\/([A-Z0-9]{6})\/join$/
      );
      if (request.method === "POST" && joinMatch) {
        if (!allowRequest(request, "join", 30, 60_000)) {
          throw new RequestError(429, "加入操作过于频繁，请稍后再试。");
        }
        const room = getRoom(joinMatch[1]);
        const body = await readJsonBody(request, MAX_AVATAR_BODY_BYTES);
        const existing = body.token
          ? participantForToken(room, body.token)
          : null;
        if (existing) {
          if (existing.leaving) {
            throw new RequestError(403, "你已离开这个房间。");
          }
          sendJson(response, 200, {
            roomCode: room.code,
            token: issueRoomToken(room.code, existing.id),
            userId: existing.id,
            shareUrl: `${shareOrigin(request)}/room/${room.code}`
          });
          return;
        }
        if (room.users.size >= MAX_ROOM_PEOPLE) {
          throw new RequestError(409, "房间已满（最多 10 人）。");
        }
        const name = normalizeName(body.name);
        ensureUniqueName(room, name);
        const avatarUrl = storeAvatar(room, body.avatar);
        const participant = createParticipant(room, name, null, avatarUrl);
        room.users.set(participant.id, participant);
        if (!room.hostId) {
          room.hostId = participant.id;
        }
        if (room.status === "lobby" || room.status === "matchOver") {
          seatParticipant(room, participant);
        }
        touchRoom(room);
        broadcast(room);
        sendJson(response, 201, {
          roomCode: room.code,
          token: issueRoomToken(room.code, participant.id),
          userId: participant.id,
          shareUrl: `${shareOrigin(request)}/room/${room.code}`
        });
        return;
      }

      if (request.method === "GET") {
        const avatarMatch = requestUrl.pathname.match(
          /^\/api\/avatars\/(avatar_[A-Za-z0-9_-]+)$/
        );
        if (avatarMatch) {
          const avatar = avatars.get(avatarMatch[1]);
          if (!avatar) {
            throw new RequestError(404, "头像不存在。");
          }
          response.writeHead(200, {
            ...SECURITY_HEADERS,
            "content-type": avatar.mimeType,
            "cache-control": "private, max-age=3600",
            "content-length": avatar.bytes.length
          });
          response.end(avatar.bytes);
          return;
        }
        if (
          requestUrl.pathname === "/" ||
          requestUrl.pathname === "/index.html"
        ) {
          serveFile(response, path.join(ROOT, "index.html"));
          return;
        }
        if (
          requestUrl.pathname === "/online" ||
          requestUrl.pathname === "/online.html" ||
          requestUrl.pathname === "/host" ||
          requestUrl.pathname === "/host/" ||
          /^\/room\/[A-Z0-9]{6}\/?$/.test(requestUrl.pathname)
        ) {
          serveFile(response, path.join(ROOT, "online.html"));
          return;
        }
        if (requestUrl.pathname === "/favicon.ico") {
          response.writeHead(204);
          response.end();
          return;
        }
        const requestedPath = decodeURIComponent(requestUrl.pathname);
        const staticPath = path.normalize(path.join(ROOT, requestedPath));
        const relativePath = path.relative(ROOT, staticPath);
        const safePath =
          relativePath &&
          !relativePath.startsWith("..") &&
          !path.isAbsolute(relativePath) &&
          PUBLIC_FILES.has(`/${relativePath.split(path.sep).join("/")}`);
        if (safePath && fs.existsSync(staticPath)) {
          const stats = fs.statSync(staticPath);
          if (stats.isFile()) {
            serveFile(response, staticPath);
            return;
          }
        }
      }
      throw new RequestError(404, "页面不存在。");
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: error.message || "服务器内部错误。"
      });
    }
  }

  server_upgrade: {
    httpServer.on("upgrade", (request, socket, head) => {
      const requestUrl = new URL(request.url, `http://${request.headers.host}`);
      if (requestUrl.pathname !== "/ws") {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (webSocket) => {
        wss.emit("connection", webSocket, request);
      });
    });
  }

  function serveFile(response, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const data = fs.readFileSync(filePath);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "content-type": MIME_TYPES[extension] || "application/octet-stream",
      "cache-control":
        extension === ".html" || extension === ".js" || extension === ".css"
          ? "no-cache"
          : "public, max-age=300",
      "content-length": data.length
    });
    response.end(data);
  }

  function close() {
    clearInterval(heartbeat);
    clearInterval(cleanup);
    for (const room of rooms.values()) {
      cancelAutoNext(room);
    }
    for (const socket of wss.clients) {
      socket.terminate();
    }
    return new Promise((resolve) => {
      wss.close(() => {
        if (httpServer.listening) {
          httpServer.close(resolve);
        } else {
          resolve();
        }
      });
    });
  }

  return {
    httpServer,
    rooms,
    start(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => {
          httpServer.off("error", reject);
          resolve(httpServer.address());
        });
      });
    },
    close
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";
  const app = createGameServer();
  app.start(port, host).then(() => {
    console.log(`三皮牌局服务已启动：http://${host}:${port}`);
  }).catch((error) => {
    console.error("服务启动失败", error);
    process.exitCode = 1;
  });
}

module.exports = {
  createGameServer,
  handleCompletedHand,
  makePublicGame,
  normalizeName,
  seatCapFromValue,
  normalizeStakeSettings,
  ROOM_CODE_ALPHABET,
  MAX_ROOM_PEOPLE
};
