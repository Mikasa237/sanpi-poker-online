"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { WebSocket } = require("../outputs/node_modules/ws");
const Engine = require("../outputs/engine.js");
process.env.SESSION_SECRET ||= "test-session-secret";
process.env.HOST_ISSUE_SECRET ||= "test-host-issue-secret";
const { createGameServer } = require("../outputs/server.js");

async function startServer(options = {}) {
  const app = createGameServer(
    Object.assign(
      {
        dealTimings: {
          stepMs: 5,
          roundGapMs: 5,
          openingPauseMs: 5,
          discardMs: 5,
          drawStepMs: 5,
          drawFinishMs: 5
        }
      },
      options
    )
  );
  const address = await app.start(0, "127.0.0.1");
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function request(baseUrl, route, body, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body || {})
  });
  const payload = await response.json();
  return { response, payload };
}

async function createRoom(baseUrl, name = "房主", seatCap = 4) {
  const { response, payload } = await request(baseUrl, "/api/rooms", {
    name,
    seatCap
  });
  assert.equal(response.status, 201, payload.error);
  return payload;
}

async function joinRoom(baseUrl, code, name, token) {
  return request(baseUrl, `/api/rooms/${code}/join`, { name, token });
}

async function createClient(baseUrl, roomCode, token) {
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`);
  const messages = [];
  const waiters = [];

  function dispatch(message) {
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const waiter = waiters.splice(waiterIndex, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    messages.push(message);
  }

  socket.on("message", (raw) => {
    try {
      dispatch(JSON.parse(String(raw)));
    } catch {
      // Ignore malformed test messages; the client protocol always uses JSON.
    }
  });

  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  function waitFor(predicate, timeoutMs = 2500) {
    const bufferedIndex = messages.findIndex(predicate);
    if (bufferedIndex >= 0) {
      return Promise.resolve(messages.splice(bufferedIndex, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(new Error("timed out waiting for WebSocket message"));
        }, timeoutMs)
      };
      waiters.push(waiter);
    });
  }

  socket.send(
    JSON.stringify({ type: "auth", roomCode, token })
  );
  const authenticated = await waitFor(
    (message) => message.type === "room:state"
  );
  assert.equal(authenticated.room.code, roomCode);

  return {
    socket,
    waitFor,
    send(message) {
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    }
  };
}

function latestGameFrom(message) {
  return message.room.game;
}

function actorId(game) {
  return game.actorIndex === null ? null : game.players[game.actorIndex].id;
}

function clientForActor(clients, id) {
  return clients.find((entry) => entry.userId === id).client;
}

function simpleAction(game) {
  const legal = Engine.getLegalActions(game, game.actorIndex);
  if (legal.call) {
    return { type: "call" };
  }
  if (legal.raise) {
    return { type: "raise", amount: legal.raise.min };
  }
  if (legal.allIn) {
    return { type: "all_in" };
  }
  return { type: "fold" };
}

test("room codes, nickname uniqueness, capacity and spectators work", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const health = await fetch(`${server.baseUrl}/api/health`);
  assert.equal(health.status, 200);
  const privateFile = await fetch(`${server.baseUrl}/server.js`);
  assert.equal(privateFile.status, 404);

  const host = await createRoom(server.baseUrl, "房主", 10);
  assert.match(host.roomCode, /^[A-Z0-9]{6}$/);
  const joins = [];
  for (let index = 0; index < 9; index += 1) {
    const joined = await joinRoom(
      server.baseUrl,
      host.roomCode,
      `玩家${index + 1}`
    );
    assert.equal(joined.response.status, 201, joined.payload.error);
    joins.push(joined.payload);
  }
  const overflow = await joinRoom(
    server.baseUrl,
    host.roomCode,
    "第十一人"
  );
  assert.equal(overflow.response.status, 409);
  assert.match(overflow.payload.error, /房间已满/);

  const small = await createRoom(server.baseUrl, "小桌房主", 2);
  const firstGuest = await joinRoom(server.baseUrl, small.roomCode, "一号");
  assert.equal(firstGuest.response.status, 201);
  const duplicate = await joinRoom(server.baseUrl, small.roomCode, "一号");
  assert.equal(duplicate.response.status, 409);
  assert.match(duplicate.payload.error, /昵称/);
});

test("WebSocket clients receive only their own hidden card", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 3);
  const guestJoin = await joinRoom(
    server.baseUrl,
    hostRoom.roomCode,
    "访客"
  );
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  const clients = [
    { userId: hostRoom.userId, client: hostClient },
    { userId: guestJoin.payload.userId, client: guestClient }
  ];

  hostClient.send({ type: "host:start" });
  const hostState = await hostClient.waitFor(
    (message) => message.room?.game?.phase === "bet1"
  );
  const guestState = await guestClient.waitFor(
    (message) => message.room?.game?.phase === "bet1"
  );

  [hostState, guestState].forEach((message) => {
    const game = message.room.game;
    assert.equal(game.deck.length, 0);
    assert.equal(game.deckCount, 90);
    assert.equal(game.rngState, undefined);
    assert.equal(game.aiRngState, undefined);
    assert.equal(game.discardCard, null);
    const selfId = message.room.self.id;
    game.players
      .filter((player) => !player.id.startsWith("empty-"))
      .forEach((player) => {
        if (player.id === selfId) {
          assert.ok(player.holeCard);
        } else {
          assert.equal(player.holeCard, null);
          assert.equal(player.hasHiddenHole, true);
        }
      });
  });

  const game = latestGameFrom(hostState);
  const currentActorId = actorId(game);
  const otherClient = clients.find(
    (entry) => entry.userId !== currentActorId
  ).client;
  otherClient.send({
    type: "action",
    handNo: game.handNo,
    requestId: "out-of-turn",
    action: { type: "fold" }
  });
  const error = await otherClient.waitFor(
    (message) => message.type === "error"
  );
  assert.match(error.message, /还没有轮到你/);

  hostClient.close();
  guestClient.close();
});

test("ten WebSocket clients can share a room without hidden-card leaks", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 10);
  const joined = [];
  for (let index = 2; index <= 10; index += 1) {
    joined.push(
      await joinRoom(server.baseUrl, hostRoom.roomCode, `玩家${index}`)
    );
  }
  const clients = await Promise.all(
    [hostRoom, ...joined.map((entry) => entry.payload)].map((entry) =>
      createClient(server.baseUrl, hostRoom.roomCode, entry.token)
    )
  );
  clients[0].send({ type: "host:start" });
  const states = await Promise.all(
    clients.map((client) =>
      client.waitFor((message) => message.room?.game?.phase === "bet1")
    )
  );
  states.forEach((message) => {
    const selfId = message.room.self.id;
    const realPlayers = message.room.game.players.filter(
      (player) => !player.id.startsWith("empty-")
    );
    assert.equal(realPlayers.length, 10);
    realPlayers.forEach((player) => {
      if (player.id === selfId) {
        assert.ok(player.holeCard);
      } else {
        assert.equal(player.holeCard, null);
        assert.equal(player.hasHiddenHole, true);
      }
    });
  });
  clients.forEach((client) => client.close());
});

test("rename updates the room immediately and rejects duplicates", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 3);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "阿青");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  hostClient.send({ type: "host:start" });
  await hostClient.waitFor((message) => message.room?.game?.phase === "bet1");
  await guestClient.waitFor((message) => message.room?.game?.phase === "bet1");

  guestClient.send({ type: "rename", name: "阿青改名" });
  const renamed = await hostClient.waitFor(
    (message) =>
      message.room?.users?.some((user) => user.name === "阿青改名")
  );
  assert.equal(
    renamed.room.game.players.find((player) => player.id === guestJoin.payload.userId)
      .name,
    "阿青改名"
  );

  guestClient.send({ type: "rename", name: "房主" });
  const duplicateError = await guestClient.waitFor(
    (message) => message.type === "error"
  );
  assert.match(duplicateError.message, /昵称/);
  hostClient.send({
    type: "host:transfer",
    targetId: guestJoin.payload.userId
  });
  const transferred = await guestClient.waitFor(
    (message) => message.room?.hostId === guestJoin.payload.userId
  );
  assert.equal(
    transferred.room.users.find((user) => user.isSelf).isHost,
    true
  );
  hostClient.close();
  guestClient.close();
});

test("players can reconnect with their token and late joiners spectate", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 2);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "访客");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  let guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  hostClient.send({ type: "host:start" });
  await hostClient.waitFor((message) => message.room?.game?.phase === "bet1");
  await guestClient.waitFor((message) => message.room?.game?.phase === "bet1");

  guestClient.close();
  guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  const reconnected = await guestClient.waitFor(
    (message) => message.room?.users?.find((user) => user.isSelf)?.connected
  );
  assert.equal(reconnected.room.self.seat, 1);

  const lateJoin = await joinRoom(
    server.baseUrl,
    hostRoom.roomCode,
    "旁观者"
  );
  assert.equal(lateJoin.response.status, 201);
  const spectatorClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    lateJoin.payload.token
  );
  const spectatorState = await spectatorClient.waitFor(
    (message) => message.room?.self?.name === "旁观者"
  );
  assert.equal(spectatorState.room.self.seat, null);
  assert.equal(
    spectatorState.room.game.players.some(
      (player) => player.holeCard !== null && player.id !== spectatorState.room.self.id
    ),
    false
  );

  hostClient.close();
  guestClient.close();
  spectatorClient.close();
});

test("host skip folds the actor and releases the seat after the hand", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 2);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "访客");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  const clients = [
    { userId: hostRoom.userId, client: hostClient },
    { userId: guestJoin.payload.userId, client: guestClient }
  ];

  hostClient.send({ type: "host:start" });
  let state = await hostClient.waitFor(
    (message) => message.room?.game?.phase === "bet1"
  );
  await guestClient.waitFor((message) => message.room?.game?.phase === "bet1");

  let game = latestGameFrom(state);
  if (actorId(game) === hostRoom.userId) {
    const action = simpleAction(game);
    hostClient.send({
      type: "action",
      handNo: game.handNo,
      requestId: "advance-for-skip",
      action
    });
    state = await guestClient.waitFor(
      (message) =>
        message.room?.game &&
        (message.room.game.actorIndex !== game.actorIndex ||
          message.room.game.phase !== game.phase)
    );
    game = latestGameFrom(state);
  }

  if (actorId(game) === guestJoin.payload.userId) {
    hostClient.send({
      type: "host:skip",
      targetId: guestJoin.payload.userId
    });
    state = await hostClient.waitFor(
      (message) =>
        message.room?.game?.players?.find(
          (player) => player.id === guestJoin.payload.userId
        )?.folded === true
    );
    assert.equal(
      state.room.users.find((user) => user.id === guestJoin.payload.userId)
        .pendingSeatRelease,
      true
    );
  }
  hostClient.close();
  guestClient.close();
});

test("completed hands automatically start the next hand", async (t) => {
  const server = await startServer({ autoNextMs: 80 });
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 2);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "访客");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  const clients = [
    { userId: hostRoom.userId, client: hostClient },
    { userId: guestJoin.payload.userId, client: guestClient }
  ];

  hostClient.send({ type: "host:start" });
  let state = await hostClient.waitFor(
    (message) =>
      message.room?.game?.phase === "bet1" &&
      !message.room.game.presentation
  );
  const firstHand = state.room.game.handNo;
  let actionCount = 0;

  while (state.room.game.phase !== "complete") {
    const game = state.room.game;
    const currentId = actorId(game);
    const currentClient = clientForActor(clients, currentId);
    const previousActor = game.actorIndex;
    const previousPhase = game.phase;
    currentClient.send({
      type: "action",
      handNo: game.handNo,
      requestId: `auto-${actionCount}`,
      action: simpleAction(game)
    });
    state = await hostClient.waitFor(
      (message) =>
        message.room?.game &&
        !message.room.game.presentation &&
        (message.room.game.actorIndex !== previousActor ||
          message.room.game.phase !== previousPhase)
    );
    if (state.room.game.phase === "bet2") {
      assert.equal(state.room.game.discardCard, null);
      assert.equal(state.room.game.hasDiscard, true);
    }
    actionCount += 1;
    assert.ok(actionCount < 30);
  }
  assert.equal(state.room.game.phase, "complete");
  assert.ok(state.room.nextHandAt);
  const nextHandState = await hostClient.waitFor(
    (message) =>
      message.room?.game?.handNo === firstHand + 1 &&
      message.room.game.phase === "bet1",
    2500
  );
  assert.equal(nextHandState.room.status, "playing");
  hostClient.close();
  guestClient.close();
});

test("uploaded avatars are validated, served, and broadcast to the room", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const png =
    "data:application/octet-stream;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const created = await request(server.baseUrl, "/api/rooms", {
    name: "头像测试",
    seatCap: 2,
    avatar: png
  });
  assert.equal(created.response.status, 201, created.payload.error);
  const client = await createClient(
    server.baseUrl,
    created.payload.roomCode,
    created.payload.token
  );
  const state = await client.waitFor(
    (message) => message.type === "room:state"
  );
  assert.match(state.room.self.avatarUrl, /^\/api\/avatars\/avatar_/);
  const avatarResponse = await fetch(`${server.baseUrl}${state.room.self.avatarUrl}`);
  assert.equal(avatarResponse.status, 200);
  assert.equal(avatarResponse.headers.get("content-type"), "image/png");
  assert.ok((await avatarResponse.arrayBuffer()).byteLength > 0);

  const jpeg =
    "data:image/x-png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";
  const webp =
    "data:;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+4AAAAA==";
  for (const [name, avatar, expectedType] of [
    ["JPEG 测试", jpeg, "image/jpeg"],
    ["WebP 测试", webp, "image/webp"]
  ]) {
    const room = await request(server.baseUrl, "/api/rooms", {
      name,
      seatCap: 2,
      avatar
    });
    assert.equal(room.response.status, 201, room.payload.error);
    const roomClient = await createClient(
      server.baseUrl,
      room.payload.roomCode,
      room.payload.token
    );
    const roomState = await roomClient.waitFor(
      (message) => message.type === "room:state"
    );
    const image = await fetch(`${server.baseUrl}${roomState.room.self.avatarUrl}`);
    assert.equal(image.headers.get("content-type"), expectedType);
    roomClient.close();
  }

  const update = await fetch(`${server.baseUrl}/api/profile/avatar`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${created.payload.token}`
    },
    body: JSON.stringify({ avatar: "preset:fox" })
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).avatarUrl, "preset:fox");

  const invalid = await request(server.baseUrl, "/api/rooms", {
    name: "非法头像",
    seatCap: 2,
    avatar: "data:image/png;base64,bm90LWFuLWltYWdl"
  });
  assert.equal(invalid.response.status, 400);
  client.close();
});

test("room chat, quick phrases, emotes and host moderation work", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 2);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "访客");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  hostClient.send({ type: "host:start" });
  await hostClient.waitFor(
    (message) =>
      message.room?.game?.phase === "bet1" && !message.room.game.presentation
  );

  guestClient.send({
    type: "chat:send",
    kind: "text",
    text: "大家好"
  });
  const chat = await hostClient.waitFor(
    (message) => message.type === "room:chat"
  );
  assert.equal(chat.message.text, "大家好");
  assert.equal(chat.message.userId, guestJoin.payload.userId);

  guestClient.send({
    type: "chat:send",
    kind: "quick",
    phraseId: "hurry"
  });
  const rateError = await guestClient.waitFor(
    (message) => message.type === "error"
  );
  assert.match(rateError.message, /太快/);

  hostClient.send({
    type: "host:chat:mute",
    targetId: guestJoin.payload.userId,
    muted: true
  });
  await guestClient.waitFor(
    (message) => message.room?.self?.chatMuted === true
  );
  guestClient.send({
    type: "chat:send",
    kind: "text",
    text: "还能说话吗"
  });
  const muteError = await guestClient.waitFor(
    (message) => message.type === "error"
  );
  assert.match(muteError.message, /禁言/);

  hostClient.send({
    type: "host:chat:clear"
  });
  const cleared = await guestClient.waitFor(
    (message) => message.type === "room:chat-history"
  );
  assert.deepEqual(cleared.messages, []);

  hostClient.send({
    type: "host:chat:mute",
    targetId: guestJoin.payload.userId,
    muted: false
  });
  await guestClient.waitFor(
    (message) => message.room?.self?.chatMuted === false
  );
  guestClient.send({
    type: "emote:throw",
    targetId: hostRoom.userId,
    item: "tomato"
  });
  const emote = await hostClient.waitFor(
    (message) => message.type === "room:emote"
  );
  assert.equal(emote.message.item, "tomato");
  assert.equal(emote.message.targetId, hostRoom.userId);

  hostClient.close();
  guestClient.close();
});

test("quick phrase ids and local voice assets are served", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const room = await createRoom(server.baseUrl, "快捷语测试", 2);
  const client = await createClient(
    server.baseUrl,
    room.roomCode,
    room.token
  );
  client.send({
    type: "chat:send",
    kind: "quick",
    phraseId: "hurry"
  });
  const message = await client.waitFor(
    (entry) => entry.type === "room:chat" && entry.message?.kind === "quick"
  );
  assert.equal(message.message.phraseId, "hurry");
  assert.match(message.message.text, /花儿都谢了/);

  for (const phraseId of [
    "hurry",
    "call",
    "think",
    "nice",
    "close",
    "friendly",
    "again",
    "wow"
  ]) {
    const response = await fetch(
      `${server.baseUrl}/assets/voice/quick-${phraseId}.mp3`
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  }
  client.close();
});

test("dealing presentation masks cards and blocks betting until finished", async (t) => {
  const server = await startServer({
    dealTimings: {
      stepMs: 40,
      roundGapMs: 40,
      openingPauseMs: 40,
      discardMs: 40,
      drawStepMs: 40,
      drawFinishMs: 40
    }
  });
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 2);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "访客");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  hostClient.send({ type: "host:start" });
  const dealing = await hostClient.waitFor(
    (message) =>
      message.room?.status === "dealing" &&
      message.room.game?.presentation?.kind === "initial"
  );
  assert.equal(dealing.room.game.phase, "dealing");
  assert.equal(dealing.room.game.actorIndex, null);
  assert.equal(
    dealing.room.game.players.every((player) => player.upCard === null),
    true
  );
  hostClient.send({
    type: "action",
    handNo: dealing.room.game.handNo,
    requestId: "during-deal",
    action: { type: "fold" }
  });
  const error = await hostClient.waitFor(
    (message) => message.type === "error"
  );
  assert.match(error.message, /正在发牌/);

  const ready = await hostClient.waitFor(
    (message) =>
      message.room?.game?.phase === "bet1" &&
      !message.room.game.presentation
  );
  assert.equal(ready.room.status, "playing");
  assert.ok(ready.room.game.players[0].holeCard);
  assert.equal(ready.room.game.players[1].holeCard, null);
  assert.ok(ready.room.game.players.every((player) => player.upCard));
  assert.equal(ready.room.game.equity.players.reduce(
    (sum, player) => sum + player.equity,
    0
  ), 100);

  const firstActorId = actorId(ready.room.game);
  const firstActorClient =
    firstActorId === hostRoom.userId ? hostClient : guestClient;
  const firstLegal = Engine.getLegalActions(
    ready.room.game,
    ready.room.game.actorIndex
  );
  firstActorClient.send({
    type: "action",
    handNo: ready.room.game.handNo,
    requestId: "begin-draw-presentation",
    action: firstLegal.call
      ? { type: "call" }
      : { type: "raise", amount: firstLegal.raise.min }
  });
  const afterFirstAction = await hostClient.waitFor(
    (message) =>
      message.room?.game &&
      !message.room.game.presentation &&
      message.room.game.actorIndex !== ready.room.game.actorIndex
  );
  const secondActorId = actorId(afterFirstAction.room.game);
  const secondActorClient =
    secondActorId === hostRoom.userId ? hostClient : guestClient;
  secondActorClient.send({
    type: "action",
    handNo: afterFirstAction.room.game.handNo,
    requestId: "show-draw-presentation",
    action: { type: "call" }
  });
  const drawing = await hostClient.waitFor(
    (message) =>
      message.room?.game?.presentation?.kind === "draw" &&
      message.room.game.phase === "drawing"
  );
  assert.equal(
    drawing.room.game.players.every((player) => player.drawCard === null),
    true
  );
  assert.equal(drawing.room.game.discardCard, null);
  assert.equal(drawing.room.game.hasDiscard, true);
  hostClient.close();
  guestClient.close();
});

test("host can configure ante and bet cap before starting", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 3);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "访客");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  hostClient.send({
    type: "host:settings",
    ante: 25,
    betCap: 250,
    startingChips: 5000
  });
  const configured = await guestClient.waitFor(
    (message) =>
      message.room?.ante === 25 &&
      message.room?.betCap === 250 &&
      message.room?.startingChips === 5000
  );
  assert.equal(configured.room.game, null);

  hostClient.send({
    type: "host:settings",
    ante: 3,
    betCap: 500,
    startingChips: 2000
  });
  const invalid = await hostClient.waitFor(
    (message) => message.type === "error"
  );
  assert.match(invalid.message, /底注/);
  hostClient.send({
    type: "host:settings",
    ante: 20,
    betCap: 500,
    startingChips: 90
  });
  const invalidStack = await hostClient.waitFor(
    (message) => message.type === "error"
  );
  assert.match(invalidStack.message, /本钱/);

  hostClient.send({
    type: "host:start",
    ante: 20,
    betCap: 120,
    startingChips: 2000
  });
  const started = await hostClient.waitFor(
    (message) =>
      message.room?.game?.phase === "bet1" &&
      !message.room.game.presentation
  );
  assert.equal(started.room.game.config.ante, 20);
  assert.equal(started.room.game.config.betCap, 120);
  assert.equal(started.room.game.config.startingChips, 2000);
  assert.equal(started.room.game.players[0].stack, 1980);

  hostClient.close();
  guestClient.close();
});

test("a player can fold early before their turn", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const hostRoom = await createRoom(server.baseUrl, "房主", 3);
  const guestJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "访客");
  const thirdJoin = await joinRoom(server.baseUrl, hostRoom.roomCode, "第三人");
  const hostClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    hostRoom.token
  );
  const guestClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    guestJoin.payload.token
  );
  const thirdClient = await createClient(
    server.baseUrl,
    hostRoom.roomCode,
    thirdJoin.payload.token
  );
  const clients = [
    { userId: hostRoom.userId, client: hostClient },
    { userId: guestJoin.payload.userId, client: guestClient },
    { userId: thirdJoin.payload.userId, client: thirdClient }
  ];
  hostClient.send({ type: "host:start" });
  const state = await hostClient.waitFor(
    (message) =>
      message.room?.game?.phase === "bet1" &&
      !message.room.game.presentation
  );
  const actor = actorId(state.room.game);
  const early = clients.find((entry) => entry.userId !== actor);
  early.client.send({
    type: "early-fold",
    handNo: state.room.game.handNo,
    requestId: "early-fold-once"
  });
  const folded = await hostClient.waitFor(
    (message) =>
      message.room?.game?.players?.find(
        (player) => player.id === early.userId
      )?.folded === true
  );
  assert.equal(actorId(folded.room.game), actor);
  early.client.send({
    type: "early-fold",
    handNo: state.room.game.handNo,
    requestId: "early-fold-twice"
  });
  const error = await early.client.waitFor(
    (message) => message.type === "error"
  );
  assert.match(error.message, /不能提前弃牌/);
  hostClient.close();
  guestClient.close();
  thirdClient.close();
});

test("permanent host links verify and can create multiple rooms", async (t) => {
  const server = await startServer();
  t.after(() => server.app.close());

  const denied = await request(server.baseUrl, "/api/host-links", {});
  assert.equal(denied.response.status, 401);
  const created = await request(
    server.baseUrl,
    "/api/host-links",
    {},
    { "x-host-issue-secret": "test-host-issue-secret" }
  );
  assert.equal(created.response.status, 201, created.payload.error);
  assert.match(created.payload.hostUrl, /\/host#owner=/);
  const verified = await request(server.baseUrl, "/api/host/verify", {
    token: created.payload.token
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.payload.ownerId, created.payload.ownerId);

  for (let index = 0; index < 2; index += 1) {
    const room = await request(server.baseUrl, "/api/rooms", {
      name: `房主${index + 1}`,
      seatCap: 4,
      avatar: "preset:jester",
      ownerToken: created.payload.token
    });
    assert.equal(room.response.status, 201, room.payload.error);
  }

  const page = await fetch(`${server.baseUrl}/host`);
  assert.equal(page.status, 200);
  const hostPage = await page.text();
  assert.match(hostPage, /私密房主入口/);
  assert.doesNotMatch(hostPage, /href="\/host"/);
  assert.doesNotMatch(hostPage, /#owner=/);

  const restarted = await startServer();
  const afterRestart = await request(restarted.baseUrl, "/api/host/verify", {
    token: created.payload.token
  });
  assert.equal(afterRestart.response.status, 200);
  assert.equal(afterRestart.payload.ownerId, created.payload.ownerId);
  await restarted.app.close();
});
