"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../outputs/engine.js");

function card(rank, suit, deck) {
  const result = Engine.buildDeck().find(
    (entry) =>
      entry.rank === rank &&
      (suit ? entry.suit === suit : entry.suit === null) &&
      (!deck || entry.deck === deck)
  );
  assert.ok(result, `missing card ${rank}/${suit}/${deck}`);
  return result;
}

function chooseSimpleAction(state) {
  const legal = Engine.getLegalActions(state, state.actorIndex);
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

function playHandToCompletion(state) {
  let actions = 0;
  while (["bet1", "bet2"].includes(state.phase)) {
    assert.ok(state.actorIndex !== null, "betting phase must have an actor");
    Engine.performAction(state, chooseSimpleAction(state));
    actions += 1;
    assert.ok(actions < 200, "hand should terminate");
  }
  assert.equal(state.phase, "complete");
}

test("two decks contain exactly 94 unique cards with the required specials", () => {
  const deck = Engine.buildDeck();
  assert.equal(deck.length, 94);
  assert.equal(new Set(deck.map((entry) => entry.id)).size, 94);
  assert.equal(deck.filter((entry) => entry.kind === "normal").length, 88);
  assert.equal(deck.filter((entry) => entry.kind === "wild").length, 2);
  assert.equal(deck.filter((entry) => entry.rank === "SJ").length, 2);
  assert.equal(deck.filter((entry) => entry.rank === "BJ").length, 2);
  assert.equal(deck.filter((entry) => entry.rank === "A").length, 8);
  assert.equal(deck.filter((entry) => entry.rank === "2").length, 8);
});

test("dealing gives every player one hidden and one public card", () => {
  const state = Engine.createGame({ seed: 101, playerCount: 7 });
  Engine.startNextHand(state);
  assert.equal(state.players.length, 7);
  assert.equal(state.players.every((player) => player.holeCard), true);
  assert.equal(state.players.every((player) => player.upCard), true);
  assert.equal(state.deck.length, 80);
  assert.equal(
    state.players.every(
      (player) => player.handContribution === 10 && player.roundContribution === 0
    ),
    true
  );
  const allCardIds = [
    ...state.players.flatMap((player) => [player.holeCard.id, player.upCard.id]),
    ...state.deck.map((entry) => entry.id)
  ];
  assert.equal(allCardIds.length, 94);
  assert.equal(new Set(allCardIds).size, 94);
  assert.equal(
    state.players[state.actorIndex].upCard.id,
    state.players
      .slice()
      .sort((left, right) => {
        if (left.upCard.value !== right.upCard.value) {
          return right.upCard.value - left.upCard.value;
        }
        return right.upCard.suitValue - left.upCard.suitValue;
      })[0].upCard.id
  );
});

test("ante is separate from the betting target and all-in remains available", () => {
  const state = Engine.createGame({ seed: 111, playerCount: 4 });
  Engine.startNextHand(state);
  const legal = Engine.getLegalActions(state, state.actorIndex);
  assert.equal(state.currentBet, 0);
  assert.ok(legal.raise);
  assert.ok(legal.allIn);
  Engine.performAction(state, { type: "raise", amount: legal.raise.min });
  assert.equal(state.currentBet, 10);
  const nextLegal = Engine.getLegalActions(state, state.actorIndex);
  assert.equal(nextLegal.call.amount, 10);
  assert.ok(nextLegal.allIn);
});

test("a player whose whole stack is the ante is handled as all-in", () => {
  const state = Engine.createGame({ seed: 112, playerCount: 4 });
  state.players[0].stack = state.config.ante;
  Engine.startNextHand(state);
  assert.equal(state.players[0].stack, 0);
  assert.equal(state.players[0].allIn, true);
  if (state.phase !== "complete") {
    assert.notEqual(state.actorIndex, 0);
    assert.ok(["bet1", "bet2"].includes(state.phase));
  }
});

test("triple tiers override target rank and lower target rank wins inside a tier", () => {
  const naturalFive = Engine.evaluateHand([
    card("5", "S", "A"),
    card("5", "H", "A"),
    card("5", "C", "A")
  ]);
  const pairAceWithWild = Engine.evaluateHand([
    card("A", "S", "A"),
    card("A", "H", "B"),
    card("L", null, "A")
  ]);
  assert.equal(naturalFive.tier, 3);
  assert.equal(pairAceWithWild.tier, 2);
  assert.ok(Engine.compareEvaluations(naturalFive, pairAceWithWild) > 0);

  const pairSixWithWild = Engine.evaluateHand([
    card("6", "S", "A"),
    card("6", "H", "B"),
    card("L", null, "A")
  ]);
  const singleFiveWithTwoWild = Engine.evaluateHand([
    card("5", "S", "A"),
    card("L", null, "A"),
    card("L", null, "B")
  ]);
  assert.equal(singleFiveWithTwoWild.tier, 1);
  assert.ok(Engine.compareEvaluations(pairSixWithWild, singleFiveWithTwoWild) > 0);

  const naturalAce = Engine.evaluateHand([
    card("A", "S", "A"),
    card("A", "H", "A"),
    card("A", "C", "B")
  ]);
  const naturalKing = Engine.evaluateHand([
    card("K", "S", "A"),
    card("K", "H", "A"),
    card("K", "C", "B")
  ]);
  assert.ok(Engine.compareEvaluations(naturalKing, naturalAce) > 0);
});

test("normal hands use rank sum, wildcard as 18, then rank and suit tiebreaks", () => {
  const wildHand = Engine.evaluateHand([
    card("5", "D", "A"),
    card("6", "D", "A"),
    card("L", null, "A")
  ]);
  assert.equal(wildHand.kind, "sum");
  assert.equal(wildHand.score, 29);

  const aceJokerHand = Engine.evaluateHand([
    card("A", "D", "A"),
    card("7", "D", "A"),
    card("8", "S", "A")
  ]);
  assert.equal(aceJokerHand.score, 29);
  assert.ok(Engine.compareEvaluations(wildHand, aceJokerHand) > 0);

  const spadeAce = Engine.evaluateHand([
    card("A", "S", "A"),
    card("7", "D", "A"),
    card("8", "D", "A")
  ]);
  const heartAce = Engine.evaluateHand([
    card("A", "H", "A"),
    card("7", "D", "A"),
    card("8", "D", "A")
  ]);
  assert.ok(Engine.compareEvaluations(spadeAce, heartAce) > 0);
});

test("identical two-deck cards produce a complete tie", () => {
  const first = Engine.evaluateHand([
    card("A", "S", "A"),
    card("7", "D", "B"),
    card("8", "C", "A")
  ]);
  const second = Engine.evaluateHand([
    card("A", "S", "B"),
    card("7", "D", "A"),
    card("8", "C", "B")
  ]);
  assert.equal(Engine.compareEvaluations(first, second), 0);
});

test("a complete hand passes both betting rounds and conserves chips", () => {
  const state = Engine.createGame({ seed: 202, playerCount: 5 });
  Engine.startNextHand(state);
  const startingTotal = state.startingStacks.reduce((sum, value) => sum + value, 0);
  playHandToCompletion(state);
  const endingTotal = state.players.reduce((sum, player) => sum + player.stack, 0);
  assert.equal(endingTotal, startingTotal);
  assert.ok(state.players.every((player) => player.stack >= 0));
  assert.ok(state.summary);
  assert.equal(state.summary.showdown, true);
  const ids = [
    ...state.players.flatMap((player) =>
      [player.holeCard, player.upCard, player.drawCard]
        .filter(Boolean)
        .map((entry) => entry.id)
    ),
    state.discardCard.id,
    ...state.deck.map((entry) => entry.id)
  ];
  assert.equal(ids.length, 94);
  assert.equal(new Set(ids).size, 94);
});

test("folding all opponents ends the hand without drawing a third card", () => {
  const state = Engine.createGame({ seed: 303, playerCount: 4 });
  Engine.startNextHand(state);
  const opener = state.actorIndex;
  let safety = 0;
  while (state.phase === "bet1" && safety < 20) {
    if (state.actorIndex === opener) {
      const legal = Engine.getLegalActions(state, state.actorIndex);
      Engine.performAction(state, { type: "raise", amount: legal.raise.min });
    } else {
      Engine.performAction(state, { type: "fold" });
    }
    safety += 1;
  }
  assert.equal(state.phase, "complete");
  assert.equal(state.summary.showdown, false);
  assert.equal(state.players[opener].drawCard, null);
  assert.equal(state.summary.winners.includes(opener), true);
});

test("side pots use eligibility layers and return uncalled excess", () => {
  const state = Engine.createGame({ seed: 404, playerCount: 4 });
  Engine.startNextHand(state);
  state.players.forEach((player) => {
    player.stack = 0;
    player.folded = false;
    player.handContribution = 0;
  });
  state.players[0].handContribution = 100;
  state.players[1].handContribution = 200;
  state.players[2].handContribution = 200;
  state.players[3].handContribution = 50;
  state.players[3].folded = true;
  const strong = { key: [1, 40] };
  const middle = { key: [1, 30] };
  const weak = { key: [1, 20] };
  const result = Engine.settlePots(
    state,
    { 0: strong, 1: middle, 2: weak },
    null
  );
  assert.equal(state.players[0].stack, 350);
  assert.equal(state.players[1].stack, 200);
  assert.equal(state.players[2].stack, 0);
  assert.equal(state.players[3].stack, 0);
  assert.equal(
    result.awards.reduce((sum, award) => sum + award.amount, 0),
    550
  );
});

test("equal winners split a pot and odd chips go clockwise from the dealer", () => {
  const state = Engine.createGame({ seed: 505, playerCount: 4 });
  state.dealerIndex = 0;
  state.players.forEach((player) => {
    player.stack = 0;
    player.folded = false;
    player.handContribution = 0;
  });
  state.players[0].handContribution = 55;
  state.players[2].handContribution = 55;
  const tied = { key: [1, 50] };
  const result = Engine.settlePots(
    state,
    { 0: tied, 2: tied },
    null
  );
  assert.deepEqual(
    result.awards.map((award) => award.amount),
    [55, 55]
  );
  assert.equal(state.players[0].stack + state.players[2].stack, 110);
});

test("1000 automated hands always terminate with legal cards and chips", () => {
  const state = Engine.createGame({
    seed: 606,
    playerCount: 7,
    difficulty: "casual",
    startingChips: 1000000
  });
  for (let hand = 0; hand < 1000; hand += 1) {
    Engine.startNextHand(state);
    const startingTotal = state.startingStacks.reduce(
      (sum, value) => sum + value,
      0
    );
    let actions = 0;
    while (["bet1", "bet2"].includes(state.phase)) {
      assert.ok(state.actorIndex !== null);
      Engine.performAction(state, chooseSimpleAction(state));
      actions += 1;
      assert.ok(actions < 200, `hand ${hand + 1} did not terminate`);
    }
    const endingTotal = state.players.reduce(
      (sum, player) => sum + player.stack,
      0
    );
    assert.equal(endingTotal, startingTotal, `chip leak in hand ${hand + 1}`);
    assert.ok(state.players.every((player) => player.stack >= 0));
    if (state.summary.showdown) {
      const observed = state.players.flatMap((player) =>
        [player.holeCard, player.upCard, player.drawCard]
          .filter(Boolean)
          .map((entry) => entry.id)
      );
      observed.push(state.discardCard.id);
      observed.push(...state.deck.map((entry) => entry.id));
      assert.equal(new Set(observed).size, observed.length);
      assert.equal(observed.length, 94);
    }
  }
});

test("zero-chip AI players are excluded from the next hand without rebuying", () => {
  const state = Engine.createGame({ seed: 707, playerCount: 4 });
  state.players[1].stack = 0;
  Engine.startNextHand(state);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.players[1].stack, 0);
  assert.equal(state.players[1].holeCard, null);
  assert.equal(state.players[1].upCard, null);
  assert.equal(state.players[1].rebuys, 0);
  assert.equal(
    state.players.filter((player) => !player.eliminated).length,
    3
  );
  assert.equal(state.deck.length, 88);
});

test("human bust ends the table while AI bust does not", () => {
  const state = Engine.createGame({ seed: 808, playerCount: 4 });
  state.handNo = 1;
  state.players[1].stack = 0;
  assert.equal(Engine.updateEliminations(state), null);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.tableOver, null);

  state.players[0].stack = 0;
  const over = Engine.updateEliminations(state);
  assert.equal(over.status, "lost");
  assert.equal(state.players[0].eliminated, true);
});

test("if every opponent is eliminated the human wins the table", () => {
  const state = Engine.createGame({ seed: 909, playerCount: 4 });
  state.handNo = 1;
  state.players.slice(1).forEach((player) => {
    player.stack = 0;
  });
  const over = Engine.updateEliminations(state);
  assert.equal(over.status, "won");
  assert.equal(state.players[0].eliminated, false);
});

test("online mode supports ten players and empty room seats", () => {
  const onlinePlayers = Array.from({ length: 10 }, (_, index) => ({
    id: `user-${index}`,
    name: `玩家${index + 1}`
  }));
  const tenPlayerState = Engine.createGame({
    seed: 1001,
    mode: "online",
    playerCount: 10,
    onlinePlayers
  });
  Engine.startNextHand(tenPlayerState);
  assert.equal(tenPlayerState.players.length, 10);
  assert.equal(tenPlayerState.deck.length, 74);
  assert.equal(tenPlayerState.players.every((player) => player.isHuman), true);

  const partialState = Engine.createGame({
    seed: 1002,
    mode: "online",
    playerCount: 4,
    onlinePlayers: [
      { id: "a", name: "甲" },
      null,
      { id: "b", name: "乙" },
      null
    ]
  });
  Engine.startNextHand(partialState);
  assert.equal(partialState.deck.length, 90);
  assert.equal(partialState.players[1].eliminated, true);
  assert.equal(partialState.players[2].upCard !== null, true);
});

test("online seat synchronization preserves chips and seats new players fresh", () => {
  const state = Engine.createGame({
    seed: 1003,
    mode: "online",
    playerCount: 4,
    onlinePlayers: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
      null,
      null
    ]
  });
  Engine.startNextHand(state);
  state.players[0].stack = 777;
  state.phase = "complete";
  Engine.syncOnlineSeats(state, [
    { id: "a", name: "甲改名" },
    { id: "b", name: "乙" },
    { id: "c", name: "丙" },
    null
  ]);
  assert.equal(state.players[0].name, "甲改名");
  assert.equal(state.players[0].stack, 777);
  assert.equal(state.players[2].id, "c");
  assert.equal(state.players[2].stack, 1000);
  assert.equal(state.players[3].eliminated, true);
});

test("wildcards are skipped when choosing the first bettor", () => {
  const state = Engine.createGame({ seed: 1101, playerCount: 4 });
  const wild = card("L", null, "A");
  const ace = card("A", "D", "A");
  state.dealerIndex = 0;
  state.players.forEach((player) => {
    player.upCard = card("5", "D", "A");
  });
  state.players[1].upCard = wild;
  state.players[2].upCard = ace;
  state.players[3].upCard = card("K", "S", "A");
  assert.equal(Engine.findOpeningPlayer(state, [1, 2, 3, 0]), 2);
  assert.equal(state.openingFallback, false);
});

test("all-wild opening falls back to the player after the dealer", () => {
  const state = Engine.createGame({
    seed: 1102,
    mode: "online",
    playerCount: 2,
    onlinePlayers: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" }
    ]
  });
  state.dealerIndex = 0;
  state.players.forEach((player) => {
    player.upCard = card("5", "D", "A");
  });
  state.players[0].upCard = card("L", null, "A");
  state.players[1].upCard = card("L", null, "B");
  assert.equal(Engine.findOpeningPlayer(state, [1, 0]), 1);
  assert.equal(state.openingFallback, true);
});

test("public-information equity sums to 100 without peeking at opponent holes", () => {
  const state = Engine.createGame({
    seed: 1103,
    mode: "online",
    playerCount: 4,
    onlinePlayers: [
      { id: "self", name: "我" },
      { id: "b", name: "乙" },
      { id: "c", name: "丙" },
      { id: "d", name: "丁" }
    ]
  });
  Engine.startNextHand(state);
  const equity = Engine.estimateEquityByPlayer(state, 0, 180);
  assert.ok(equity);
  assert.equal(
    equity.players.reduce((sum, player) => sum + player.equity, 0),
    100
  );

  const swapped = Engine.clone(state);
  const firstOpponentHole = swapped.players[1].holeCard;
  swapped.players[1].holeCard = swapped.players[2].holeCard;
  swapped.players[2].holeCard = firstOpponentHole;
  const equityAfterSwap = Engine.estimateEquityByPlayer(swapped, 0, 180);
  assert.deepEqual(
    equityAfterSwap.players.map((entry) => [entry.playerId, entry.equity]),
    equity.players.map((entry) => [entry.playerId, entry.equity])
  );
});

test("configured bet cap limits raises without forcing an invalid all-in", () => {
  const state = Engine.createGame({
    seed: 1201,
    playerCount: 4,
    ante: 20,
    betCap: 60
  });
  Engine.startNextHand(state);
  const opener = state.actorIndex;
  const legal = Engine.getLegalActions(state, opener);
  assert.ok(legal.raise);
  assert.equal(legal.raise.max, 60);
  assert.equal(legal.allIn, null);
  Engine.performAction(state, { type: "raise", amount: 60 });
  const responder = state.actorIndex;
  const response = Engine.getLegalActions(state, responder);
  assert.equal(response.call.amount, 60);
  assert.equal(response.raise, null);
  assert.equal(response.allIn, null);
});
