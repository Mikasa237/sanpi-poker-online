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
const MAX_BODY_BYTES = 16 * 1024;
const TOKEN_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
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
  "/assets/wildcard.svg"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
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

function seatCapFromValue(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2 || number > 10) {
    throw new RequestError(400, "房间座位需要设置为 2–10 人。");
  }
  return number;
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

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
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

function createParticipant(room, name, joinedAt) {
  return {
    id: createUserId(),
    name,
    joinedAt: joinedAt ?? Date.now(),
    seat: null,
    connected: false,
    socket: null,
    pendingRemoval: false,
    blockedFromSeat: false,
    leaving: false
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
    if (participant.pendingRemoval || eliminated) {
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
    return {
      id: participant.id,
      name: participant.name
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
      beginNextHand(room);
      broadcast(room);
    } catch (error) {
      room.paused = true;
      broadcast(room, { type: "error", message: error.message });
    }
  }, room.autoNextMs || AUTO_NEXT_MS);
  room.autoTimer.unref?.();
}

function beginNextHand(room) {
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
  room.status = "playing";
  room.paused = false;
  cancelAutoNext(room);
}

function startNewMatch(room) {
  releasePendingSeats(room);
  for (const participant of room.users.values()) {
    participant.eliminated = false;
    participant.blockedFromSeat = false;
    participant.pendingSeatRelease = false;
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
    startingChips: 1000,
    ante: 10,
    minBet: 10
  });
  Engine.startNextHand(room.game);
  room.status = "playing";
  room.paused = false;
  room.matchStartedAt = Date.now();
  cancelAutoNext(room);
}

function handleCompletedHand(room) {
  if (!room.game || room.game.phase !== "complete") {
    return;
  }
  for (const participant of room.users.values()) {
    if (participant.seat === null) {
      continue;
    }
    const gamePlayer = room.game.players[participant.seat];
    if (gamePlayer && gamePlayer.eliminated) {
      participant.eliminated = true;
    }
    if (participant.pendingRemoval || participant.leaving) {
      participant.pendingSeatRelease = true;
    }
  }
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
  game.players.forEach((player) => {
    const isSelf = player.id === viewerId;
    const revealed = game.phase === "complete" && player.revealed;
    if (!isSelf && !revealed) {
      player.hasHiddenHole = Boolean(player.holeCard);
      player.holeCard = null;
    }
  });
  return game;
}

function makeRoomView(room, participant) {
  const users = Array.from(room.users.values())
    .sort((left, right) => left.joinedAt - right.joinedAt)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      seat: entry.seat,
      connected: entry.connected,
      isHost: entry.id === room.hostId,
      isSelf: entry.id === participant.id,
      eliminated: Boolean(entry.eliminated),
      pendingSeatRelease: Boolean(entry.pendingSeatRelease)
    }));
  return {
    type: "room:state",
    room: {
      code: room.code,
      seatCap: room.seatCap,
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
              connected: entry.connected,
              eliminated: Boolean(entry.eliminated)
            }
          : null;
      }),
      spectators: users.filter((entry) => entry.seat === null),
      self: users.find((entry) => entry.id === participant.id),
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
  const requestBuckets = new Map();
  const defaultAutoNextMs = Number(options.autoNextMs) || AUTO_NEXT_MS;
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
      Engine.performAction(room.game, { type: "fold" });
      handleCompletedHand(room);
      scheduleAutoNext(room, broadcast);
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
        startNewMatch(room);
      } else if (room.game.phase === "complete") {
        beginNextHand(room);
      }
      return;
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
    throw new RequestError(400, "未知的房主操作。");
  }

  function handleAction(room, participant, message) {
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
    if (room.game.actorIndex !== participant.seat) {
      throw new RequestError(409, "还没有轮到你。");
    }
    const requestId = String(message.requestId || "");
    if (requestId) {
      room.processedRequests ||= new Map();
      const seen = room.processedRequests.get(participant.id) || [];
      if (seen.includes(requestId)) {
        return;
      }
      seen.push(requestId);
      if (seen.length > 40) {
        seen.splice(0, seen.length - 40);
      }
      room.processedRequests.set(participant.id, seen);
    }
    const action = message.action || {};
    Engine.performAction(room.game, {
      type: action.type,
      amount: action.amount
    });
    if (room.game.phase === "complete") {
      handleCompletedHand(room);
      scheduleAutoNext(room, broadcast);
    }
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
      } else if (message.type === "action") {
        handleAction(room, participant, message);
      } else if (message.type === "host:start") {
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
      } else if (message.type === "leave") {
        leaveParticipant(room, participant);
        if (!room.users.size) {
          cancelAutoNext(room);
          rooms.delete(room.code);
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
        cancelAutoNext(room);
        rooms.delete(room.code);
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
        requestUrl.pathname === "/api/rooms"
      ) {
        if (!allowRequest(request, "create", 12, 60_000)) {
          throw new RequestError(429, "创建房间过于频繁，请稍后再试。");
        }
        if (rooms.size >= 500) {
          throw new RequestError(503, "当前房间数量已满，请稍后再试。");
        }
        const body = await readJsonBody(request);
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
          hostId: null,
          status: "lobby",
          paused: false,
          autoNextMs: defaultAutoNextMs,
          nextHandAt: null,
          autoTimer: null,
          users: new Map(),
          seats: Array(seatCap).fill(null),
          game: null,
          createdAt: now,
          lastActiveAt: now,
          processedRequests: new Map()
        };
        const participant = createParticipant(room, name, now);
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

      const joinMatch = requestUrl.pathname.match(
        /^\/api\/rooms\/([A-Z0-9]{6})\/join$/
      );
      if (request.method === "POST" && joinMatch) {
        if (!allowRequest(request, "join", 30, 60_000)) {
          throw new RequestError(429, "加入操作过于频繁，请稍后再试。");
        }
        const room = getRoom(joinMatch[1]);
        const body = await readJsonBody(request);
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
        const participant = createParticipant(room, name);
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
  normalizeName,
  seatCapFromValue,
  ROOM_CODE_ALPHABET,
  MAX_ROOM_PEOPLE
};
