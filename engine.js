(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.SanpiEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const SUITS = [
    { code: "S", symbol: "♠", name: "黑桃", color: "black", value: 4 },
    { code: "H", symbol: "♥", name: "红桃", color: "red", value: 3 },
    { code: "C", symbol: "♣", name: "梅花", color: "black", value: 2 },
    { code: "D", symbol: "♦", name: "方块", color: "red", value: 1 }
  ];
  const REGULAR_RANKS = [
    { rank: "5", label: "5", value: 5, short: "5" },
    { rank: "6", label: "6", value: 6, short: "6" },
    { rank: "7", label: "7", value: 7, short: "7" },
    { rank: "8", label: "8", value: 8, short: "8" },
    { rank: "9", label: "9", value: 9, short: "9" },
    { rank: "10", label: "10", value: 10, short: "10" },
    { rank: "J", label: "J", value: 11, short: "J" },
    { rank: "Q", label: "Q", value: 12, short: "Q" },
    { rank: "K", label: "K", value: 13, short: "K" },
    { rank: "A", label: "A", value: 14, short: "A" },
    { rank: "2", label: "2", value: 15, short: "2" }
  ];
  const SPECIAL_RANKS = {
    SJ: { rank: "SJ", label: "小王", value: 16, short: "小", kind: "joker", order: 1 },
    BJ: { rank: "BJ", label: "大王", value: 17, short: "大", kind: "joker", order: 2 },
    L: { rank: "L", label: "赖子", value: 18, short: "赖", kind: "wild", order: 3 }
  };
  const AI_NAMES = ["阿青", "老K", "梅姐", "阿虎", "小七", "琪琪"];
  const PLAYER_STYLES = [
    { label: "稳健", aggression: 0.96, caution: 1.04 },
    { label: "激进", aggression: 1.18, caution: 0.88 },
    { label: "平衡", aggression: 1.02, caution: 1.0 },
    { label: "压迫", aggression: 1.24, caution: 0.84 },
    { label: "细腻", aggression: 0.94, caution: 1.08 },
    { label: "灵动", aggression: 1.08, caution: 0.94 }
  ];

  const DEFAULTS = Object.freeze({
    playerCount: 6,
    difficulty: "standard",
    startingChips: 1000,
    ante: 10,
    minBet: 10,
    betCap: 0
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeSeed(seed) {
    if (Number.isFinite(Number(seed))) {
      return Number(seed) >>> 0;
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function nextRandom(state) {
    state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
    let t = state.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randomAt(rngState) {
    rngState.value = (rngState.value + 0x6d2b79f5) >>> 0;
    let t = rngState.value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randomInt(rngState, maxExclusive) {
    return Math.floor(randomAt(rngState) * maxExclusive);
  }

  function buildDeck() {
    const cards = [];
    ["A", "B"].forEach((deckCode) => {
      REGULAR_RANKS.forEach((rank) => {
        SUITS.forEach((suit) => {
          cards.push({
            id: `${deckCode}-${rank.rank}-${suit.code}`,
            deck: deckCode,
            rank: rank.rank,
            label: rank.label,
            short: rank.short,
            value: rank.value,
            kind: "normal",
            suit: suit.code,
            suitName: suit.name,
            suitSymbol: suit.symbol,
            suitValue: suit.value,
            color: suit.color
          });
        });
      });
      Object.values(SPECIAL_RANKS).forEach((rank) => {
        cards.push({
          id: `${deckCode}-${rank.rank}`,
          deck: deckCode,
          rank: rank.rank,
          label: rank.label,
          short: rank.short,
          value: rank.value,
          kind: rank.kind,
          suit: null,
          suitName: "",
          suitSymbol: "",
          suitValue: 0,
          color: rank.kind === "wild" ? "wild" : "joker"
        });
      });
    });
    return cards;
  }

  function shuffleInPlace(cards, state) {
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(nextRandom(state) * (i + 1));
      const temp = cards[i];
      cards[i] = cards[j];
      cards[j] = temp;
    }
    return cards;
  }

  function orderFromClockwise(indices, startIndex) {
    const list = Array.isArray(indices) ? indices : indices.slice();
    if (!list.length) {
      return [];
    }
    const index = list.indexOf(startIndex);
    if (index < 0) {
      return list.slice();
    }
    return list.slice(index).concat(list.slice(0, index));
  }

  function seatOrder(playerCount, startIndex) {
    const result = [];
    for (let offset = 0; offset < playerCount; offset += 1) {
      result.push((startIndex + offset) % playerCount);
    }
    return result;
  }

  function createOnlineEmptyPlayer(index, startingChips) {
    return {
      id: `empty-${index}`,
      seat: index,
      name: "空座",
      isHuman: false,
      onlineParticipant: true,
      style: "空座",
      styleKey: `online-style-${index % 6}`,
      aggression: 1,
      caution: 1,
      stack: 0,
      rebuys: 0,
      holeCard: null,
      upCard: null,
      drawCard: null,
      folded: false,
      allIn: false,
      handContribution: 0,
      roundContribution: 0,
      lastAction: "",
      revealed: false,
      eliminated: true
    };
  }

  function createOnlinePlayer(index, participant, startingChips) {
    return {
      id: participant.id,
      seat: index,
      name: participant.name,
      isHuman: true,
      onlineParticipant: true,
      style: "玩家",
      styleKey: `online-style-${index % 6}`,
      aggression: 1,
      caution: 1,
      stack: Number.isFinite(participant.stack)
        ? participant.stack
        : startingChips,
      rebuys: 0,
      holeCard: null,
      upCard: null,
      drawCard: null,
      folded: false,
      allIn: false,
      handContribution: 0,
      roundContribution: 0,
      lastAction: "",
      revealed: false,
      eliminated: false
    };
  }

  function createPlayers(playerCount, startingChips, onlinePlayers) {
    return Array.from({ length: playerCount }, (_, index) => {
      if (Array.isArray(onlinePlayers)) {
        const participant = onlinePlayers[index];
        if (!participant) {
          return createOnlineEmptyPlayer(index, startingChips);
        }
        return createOnlinePlayer(index, participant, startingChips);
      }
      if (index === 0) {
        return {
          id: "p0",
          seat: 0,
          name: "你",
          isHuman: true,
          style: "玩家",
          styleKey: "human",
          aggression: 1,
          caution: 1,
          stack: startingChips,
          rebuys: 0,
          holeCard: null,
          upCard: null,
          drawCard: null,
          folded: false,
          allIn: false,
          handContribution: 0,
          roundContribution: 0,
          lastAction: "",
          revealed: false,
          eliminated: false
        };
      }
      const styleIndex = index - 1;
      const style = PLAYER_STYLES[styleIndex % PLAYER_STYLES.length];
      return {
        id: `p${index}`,
        seat: index,
        name: AI_NAMES[styleIndex % AI_NAMES.length],
        isHuman: false,
        style: style.label,
        styleKey: `style-${styleIndex % PLAYER_STYLES.length}`,
        aggression: style.aggression,
        caution: style.caution,
        stack: startingChips,
        rebuys: 0,
        holeCard: null,
        upCard: null,
        drawCard: null,
        folded: false,
        allIn: false,
        handContribution: 0,
        roundContribution: 0,
        lastAction: "",
        revealed: false,
        eliminated: false
      };
    });
  }

  function createGame(options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const mode = opts.mode === "online" ? "online" : "local";
    const minimumPlayers = mode === "online" ? 2 : 4;
    const maximumPlayers = mode === "online" ? 10 : 7;
    const playerCount = Math.max(
      minimumPlayers,
      Math.min(
        maximumPlayers,
        Number(opts.playerCount) || DEFAULTS.playerCount
      )
    );
    if (!["casual", "standard", "expert"].includes(opts.difficulty)) {
      opts.difficulty = DEFAULTS.difficulty;
    }
    const startingChips = Math.max(100, Number(opts.startingChips) || DEFAULTS.startingChips);
    const seed = safeSeed(opts.seed);
    const dealerRng = { value: seed };
    let dealerIndex = Math.floor(randomAt(dealerRng) * playerCount);
    if (mode === "online" && Array.isArray(opts.onlinePlayers)) {
      dealerIndex = seatOrder(playerCount, dealerIndex).find(
        (index) => Boolean(opts.onlinePlayers[index])
      ) ?? 0;
    }
    const state = {
      version: VERSION,
      mode,
      gameId: `game-${seed.toString(36)}-${Date.now().toString(36)}`,
      seed,
      rngState: dealerRng.value >>> 0,
      aiRngState: (seed ^ 0xa5a5a5a5) >>> 0,
      config: {
        playerCount,
        difficulty: opts.difficulty,
        startingChips,
        ante: Math.max(1, Number(opts.ante) || DEFAULTS.ante),
        minBet: Math.max(1, Number(opts.minBet) || DEFAULTS.minBet),
        betCap: Math.max(0, Number(opts.betCap) || 0)
      },
      phase: "ready",
      handNo: 0,
      dealerIndex,
      players: createPlayers(
        playerCount,
        startingChips,
        mode === "online" ? opts.onlinePlayers || [] : null
      ),
      deck: [],
      deckCycle: 0,
      lastReshuffleHand: null,
      reshuffledThisHand: false,
      discardCard: null,
      openerIndex: null,
      openingFallback: false,
      dealOrder: [],
      actorIndex: null,
      currentBet: 0,
      minRaise: Math.max(1, Number(opts.minBet) || DEFAULTS.minBet),
      actedThisRound: [],
      logs: [],
      summary: null,
      tableOver: null,
      startingStacks: [],
      totalBetsThisHand: 0
    };
    state.logs.push({
      hand: 0,
      type: "system",
      text: "牌桌已准备，等待开局。"
    });
    return state;
  }

  function addLog(state, type, playerIndex, text) {
    state.logs.push({
      hand: state.handNo,
      type,
      playerIndex: Number.isInteger(playerIndex) ? playerIndex : null,
      text
    });
    if (state.logs.length > 240) {
      state.logs.splice(0, state.logs.length - 240);
    }
  }

  function payChips(player, amount) {
    const paid = Math.max(0, Math.min(player.stack, Math.round(amount)));
    player.stack -= paid;
    player.handContribution += paid;
    player.roundContribution += paid;
    if (player.stack === 0) {
      player.allIn = true;
    }
    return paid;
  }

  function resetPlayerForHand(player) {
    player.holeCard = null;
    player.upCard = null;
    player.drawCard = null;
    player.folded = false;
    player.allIn = false;
    player.handContribution = 0;
    player.roundContribution = 0;
    player.lastAction = "";
    player.revealed = false;
  }

  function openingCardKey(card) {
    return [card ? card.value : -1, card ? card.suitValue : -1];
  }

  function compareOpeningCards(a, b) {
    const left = openingCardKey(a);
    const right = openingCardKey(b);
    if (left[0] !== right[0]) {
      return left[0] - right[0];
    }
    return left[1] - right[1];
  }

  function findOpeningPlayer(state, order) {
    const eligible = order.filter(
      (index) =>
        state.players[index].upCard &&
        state.players[index].upCard.kind !== "wild"
    );
    if (eligible.length === 0) {
      const fallback = seatOrder(
        state.players.length,
        (state.dealerIndex + 1) % state.players.length
      ).find((index) => !state.players[index].eliminated);
      state.openingFallback = true;
      return fallback;
    }
    state.openingFallback = false;
    let best = eligible[0];
    for (let i = 1; i < eligible.length; i += 1) {
      const candidate = eligible[i];
      if (
        compareOpeningCards(
          state.players[candidate].upCard,
          state.players[best].upCard
        ) > 0
      ) {
        best = candidate;
      }
    }
    return best;
  }

  function aliveIndices(players) {
    return players
      .filter((player) => !player.eliminated && !player.folded)
      .map((player) => player.seat);
  }

  function actionableIndices(players) {
    return players
      .filter(
        (player) =>
          !player.eliminated &&
          !player.folded &&
          !player.allIn &&
          player.stack > 0
      )
      .map((player) => player.seat);
  }

  function firstAliveFrom(state, startIndex) {
    const order = seatOrder(state.players.length, startIndex).filter(
      (index) => !state.players[index].eliminated
    );
    return order.find((index) => !state.players[index].folded) ?? null;
  }

  function startNextHand(state) {
    if (!state || !["ready", "complete"].includes(state.phase)) {
      throw new Error("当前牌局不能开始下一手。");
    }
    if (state.tableOver) {
      throw new Error("本桌牌局已经结束，请重新开局。");
    }
    state.players.forEach((player) => {
      if (player.stack <= 0) {
        player.eliminated = true;
      }
    });
    const remainingBeforeDeal = state.players.filter(
      (player) => !player.eliminated
    );
    const localHumanLost =
      state.mode !== "online" && state.players[0].eliminated;
    if (remainingBeforeDeal.length < 2 || localHumanLost) {
      state.tableOver = {
        status: localHumanLost
          ? "lost"
          : remainingBeforeDeal.length === 1
            ? "won"
            : "ended",
        reason: localHumanLost
          ? "筹码耗尽，本局结束"
          : remainingBeforeDeal.length === 1
            ? "其他玩家已全部淘汰"
            : "当前没有足够的在座玩家"
      };
      return state;
    }
    state.handNo += 1;
    if (state.handNo > 1) {
      const nextDealer = seatOrder(
        state.players.length,
        (state.dealerIndex + 1) % state.players.length
      ).find((index) => !state.players[index].eliminated);
      if (nextDealer !== undefined) {
        state.dealerIndex = nextDealer;
      }
    }
    state.phase = "dealing";
    state.summary = null;
    state.openerIndex = null;
    state.actorIndex = null;
    state.currentBet = 0;
    state.minRaise = state.config.minBet;
    state.actedThisRound = [];
    state.discardCard = null;
    state.totalBetsThisHand = 0;
    state.startingStacks = state.players.map((player) => player.stack);
    state.players.forEach((player) => {
      resetPlayerForHand(player);
      if (player.eliminated) {
        return;
      }
      const ante = Math.min(player.stack, state.config.ante);
      player.stack -= ante;
      player.handContribution += ante;
      if (player.stack === 0) {
        player.allIn = true;
      }
    });
    state.startingStacks = state.players.map(
      (player) => player.stack + state.config.ante
    );
    state.totalBetsThisHand = state.players.reduce(
      (sum, player) => sum + player.handContribution,
      0
    );
    addLog(
      state,
      "phase",
      null,
      `第 ${state.handNo} 手开始，每人投入底注 ${state.config.ante}。`
    );

    const requiredCards = remainingBeforeDeal.length * 3 + 1;
    state.reshuffledThisHand =
      !Array.isArray(state.deck) || state.deck.length < requiredCards;
    if (state.reshuffledThisHand) {
      state.deck = shuffleInPlace(buildDeck(), state);
      state.deckCycle = (state.deckCycle || 0) + 1;
      state.lastReshuffleHand = state.handNo;
      addLog(
        state,
        "phase",
        null,
        `剩余牌堆不足 ${requiredCards} 张，统一收回两副牌并重新洗牌。`
      );
    }
    const dealOrder = seatOrder(
      state.players.length,
      (state.dealerIndex + 1) % state.players.length
    ).filter((index) => !state.players[index].eliminated);
    state.dealOrder = dealOrder.slice();
    dealOrder.forEach((index) => {
      state.players[index].holeCard = state.deck.shift();
    });
    dealOrder.forEach((index) => {
      state.players[index].upCard = state.deck.shift();
    });

    state.openerIndex = findOpeningPlayer(state, dealOrder);
    state.phase = "bet1";
    const firstOrder = seatOrder(
      state.players.length,
      state.openerIndex
    ).filter((index) => !state.players[index].eliminated);
    state.actorIndex =
      firstOrder.find((index) => {
        const player = state.players[index];
        return !player.folded && !player.allIn && player.stack > 0;
      }) ?? null;
    const opener = state.players[state.openerIndex];
    addLog(
      state,
      "opening",
      state.openerIndex,
      state.openingFallback
        ? `明牌均为赖子，按庄家顺序由 ${opener.name} 先下注。`
        : `${opener.name} 以明牌 ${cardText(opener.upCard)} 取得先手。`
    );
    if (
      actionableIndices(state.players).length <= 1 ||
      state.actorIndex === null
    ) {
      finishBettingRound(state);
    }
    return state;
  }

  function cardText(card) {
    if (!card) {
      return "无牌";
    }
    return card.kind === "normal"
      ? `${card.suitSymbol}${card.label}`
      : card.label;
  }

  function roundPot(players) {
    return players.reduce((sum, player) => sum + player.handContribution, 0);
  }

  function getLegalActions(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player || player.eliminated || state.actorIndex !== playerIndex) {
      return { fold: null, call: null, raise: null, allIn: null };
    }
    if (!["bet1", "bet2"].includes(state.phase) || player.folded || player.allIn) {
      return { fold: null, call: null, raise: null, allIn: null };
    }
    const need = Math.max(0, state.currentBet - player.roundContribution);
    const tableMax = player.roundContribution + player.stack;
    const maxTo =
      state.config.betCap > 0
        ? Math.min(tableMax, state.config.betCap)
        : tableMax;
    const actions = {
      fold: { type: "fold", label: "弃牌" },
      call: null,
      raise: null,
      allIn: null
    };

    if (need > 0) {
      if (player.stack > need) {
        actions.call = {
          type: "call",
          amount: need,
          label: "跟注"
        };
      } else {
        actions.allIn = {
          type: "all_in",
          amount: player.stack,
          label: player.stack === need ? "跟注全下" : "全下跟注",
          shortCall: player.stack < need
        };
      }
    }

    const minTarget =
      state.currentBet === 0
        ? state.config.minBet
        : state.currentBet + state.minRaise;
    if (maxTo >= minTarget) {
      actions.raise = {
        type: "raise",
        min: minTarget,
        max: maxTo,
        step: Math.max(1, state.config.minBet),
        label: state.currentBet === 0 ? "下注" : "加注"
      };
    }

    if (
      player.stack > 0 &&
      maxTo > state.currentBet &&
      maxTo === tableMax
    ) {
      actions.allIn = {
        type: "all_in",
        amount: player.stack,
        label: "全下",
        shortCall: false
      };
    }

    return actions;
  }

  function contributionAction(state, text) {
    state.totalBetsThisHand = roundPot(state.players);
    return text;
  }

  function performAction(state, action) {
    if (!state || !["bet1", "bet2"].includes(state.phase)) {
      throw new Error("当前不在下注阶段。");
    }
    const playerIndex = state.actorIndex;
    const player = state.players[playerIndex];
    const legal = getLegalActions(state, playerIndex);
    if (!action || !action.type) {
      throw new Error("缺少玩家操作。");
    }
    if (action.type === "fold") {
      if (!legal.fold) {
        throw new Error("当前不能弃牌。");
      }
      player.folded = true;
      player.lastAction = "弃牌";
      addLog(state, "action", playerIndex, `${player.name} 弃牌。`);
    } else if (action.type === "call") {
      if (!legal.call) {
        throw new Error("当前不能跟注。");
      }
      const paid = payChips(player, legal.call.amount);
      player.lastAction = paid > 0 ? `跟注 ${paid}` : "过牌";
      addLog(
        state,
        "action",
        playerIndex,
        `${player.name} ${paid > 0 ? `跟注 ${paid}` : "过牌"}。`
      );
    } else if (action.type === "raise") {
      if (!legal.raise) {
        throw new Error("当前不能加注。");
      }
      const target = Math.round(Number(action.amount));
      if (
        !Number.isFinite(target) ||
        target < legal.raise.min ||
        target > legal.raise.max
      ) {
        throw new Error("加注金额不合法。");
      }
      const previousBet = state.currentBet;
      const added = target - player.roundContribution;
      payChips(player, added);
      state.currentBet = target;
      state.minRaise = state.config.minBet;
      player.lastAction =
        previousBet === 0 ? `下注 ${target}` : `加注到 ${target}`;
      addLog(state, "action", playerIndex, `${player.name} ${player.lastAction}。`);
    } else if (action.type === "all_in") {
      if (!legal.allIn) {
        throw new Error("当前不能全下。");
      }
      const before = player.roundContribution;
      const paid = payChips(player, player.stack);
      player.allIn = true;
      if (player.roundContribution > state.currentBet) {
        state.currentBet = player.roundContribution;
        state.minRaise = state.config.minBet;
      }
      player.lastAction = `全下 ${paid}`;
      addLog(
        state,
        "action",
        playerIndex,
        `${player.name} 全下 ${paid}（本轮投入 ${before}→${player.roundContribution}）。`
      );
    } else {
      throw new Error("未知操作。");
    }

    if (!player.allIn && !player.folded) {
      if (!state.actedThisRound.includes(playerIndex)) {
        state.actedThisRound.push(playerIndex);
      }
    }
    contributionAction(state, "");
    settleAfterAction(state, playerIndex);
    return state;
  }

  function getEarlyFoldEligibility(state, playerIndex) {
    const player = state.players[playerIndex];
    if (
      !player ||
      !["bet1", "bet2"].includes(state.phase) ||
      player.eliminated ||
      player.folded ||
      player.allIn ||
      !player.holeCard ||
      !player.upCard
    ) {
      return false;
    }
    if (state.phase === "bet2" && !player.drawCard) {
      return false;
    }
    return !state.actedThisRound.includes(playerIndex);
  }

  function performEarlyFold(state, playerIndex) {
    if (!getEarlyFoldEligibility(state, playerIndex)) {
      throw new Error("当前不能提前弃牌。");
    }
    if (state.actorIndex === playerIndex) {
      return performAction(state, { type: "fold" });
    }
    const player = state.players[playerIndex];
    player.folded = true;
    player.lastAction = "提前弃牌";
    addLog(state, "action", playerIndex, `${player.name} 提前弃牌。`);
    if (aliveIndices(state.players).length <= 1) {
      completeHand(state, "其他玩家均已弃牌");
    }
    return state;
  }

  function needsAction(state, index) {
    const player = state.players[index];
    return (
      !player.eliminated &&
      !player.folded &&
      !player.allIn &&
      player.stack > 0 &&
      (!state.actedThisRound.includes(index) ||
        player.roundContribution < state.currentBet)
    );
  }

  function nextNeedingAction(state, afterIndex) {
    const order = seatOrder(
      state.players.length,
      (afterIndex + 1) % state.players.length
    ).filter((index) => !state.players[index].eliminated);
    return order.find((index) => needsAction(state, index)) ?? null;
  }

  function settleAfterAction(state, previousActor) {
    const alive = aliveIndices(state.players);
    if (alive.length <= 1) {
      completeHand(state, "其他玩家均已弃牌");
      return;
    }
    const waiting = alive.filter((index) => needsAction(state, index));
    if (waiting.length === 0) {
      finishBettingRound(state);
      return;
    }
    state.actorIndex = nextNeedingAction(state, previousActor);
    if (state.actorIndex === null) {
      finishBettingRound(state);
    }
  }

  function resetRoundContributions(state) {
    state.players.forEach((player) => {
      player.roundContribution = 0;
    });
    state.currentBet = 0;
    state.minRaise = state.config.minBet;
    state.actedThisRound = [];
  }

  function finishBettingRound(state) {
    if (state.phase === "bet1") {
      state.discardCard = state.deck.shift();
      const alive = aliveIndices(state.players);
      const start = alive.includes(state.openerIndex)
        ? state.openerIndex
        : firstAliveFrom(state, state.openerIndex);
      const drawOrder = orderFromClockwise(alive, start);
      drawOrder.forEach((index) => {
        state.players[index].drawCard = state.deck.shift();
      });
      resetRoundContributions(state);
      state.phase = "bet2";
      addLog(
        state,
        "phase",
        null,
        `第一轮下注结束，暗弃一张牌后，按 ${drawOrder
          .map((index) => state.players[index].name)
          .join("、")} 的顺序公开摸牌。`
      );
      const actionable = actionableIndices(state.players);
      if (actionable.length <= 1) {
        completeHand(state, "无人可继续下注");
        return;
      }
      state.actorIndex =
        alive.includes(state.openerIndex)
          ? state.openerIndex
          : firstAliveFrom(state, state.openerIndex);
      if (!needsAction(state, state.actorIndex)) {
        state.actorIndex = nextNeedingAction(state, state.actorIndex);
      }
      return;
    }
    if (state.phase === "bet2") {
      completeHand(state, "双方开牌");
    }
  }

  function sortedCards(cards) {
    return cards.slice().sort((a, b) => {
      if (a.value !== b.value) {
        return b.value - a.value;
      }
      return b.suitValue - a.suitValue;
    });
  }

  function compareNumberArrays(a, b) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const left = a[i] ?? 0;
      const right = b[i] ?? 0;
      if (left !== right) {
        return left - right;
      }
    }
    return 0;
  }

  function makeTriple(cards, tier, naturalCards, targetRank) {
    const naturalSuits = naturalCards
      .slice()
      .sort((a, b) => b.suitValue - a.suitValue)
      .map((card) => card.suitValue);
    const tierLabels = {
      3: "三张相同",
      2: "对子 + 赖子",
      1: "单牌 + 双赖子"
    };
    return {
      kind: "triple",
      tier,
      tierLabel: tierLabels[tier],
      target: {
        rank: targetRank.rank,
        label: targetRank.label,
        value: targetRank.value
      },
      description: `三皮·${targetRank.label}（${tierLabels[tier]}）`,
      cards: cards.slice(),
      naturalCards: naturalCards.slice(),
      score: null,
      key: [2, tier, -targetRank.value].concat(naturalSuits)
    };
  }

  function evaluateHand(cards) {
    if (!Array.isArray(cards) || cards.length !== 3) {
      throw new Error("必须用三张牌进行结算。");
    }
    const wildCards = cards.filter((card) => card.kind === "wild");
    const naturalCards = cards.filter((card) => card.kind !== "wild");
    let triple = null;

    if (wildCards.length === 0) {
      if (naturalCards.every((card) => card.rank === naturalCards[0].rank)) {
        const target = {
          rank: naturalCards[0].rank,
          label: naturalCards[0].label,
          value: naturalCards[0].value
        };
        triple = makeTriple(cards, 3, naturalCards, target);
      }
    } else if (wildCards.length === 1 && naturalCards.length === 2) {
      if (naturalCards[0].rank === naturalCards[1].rank) {
        const target = {
          rank: naturalCards[0].rank,
          label: naturalCards[0].label,
          value: naturalCards[0].value
        };
        triple = makeTriple(cards, 2, naturalCards, target);
      }
    } else if (wildCards.length === 2 && naturalCards.length === 1) {
      const target = {
        rank: naturalCards[0].rank,
        label: naturalCards[0].label,
        value: naturalCards[0].value
      };
      triple = makeTriple(cards, 1, naturalCards, target);
    }

    if (triple) {
      return triple;
    }

    const ordered = sortedCards(cards);
    const sum = cards.reduce((total, card) => total + card.value, 0);
    const tiebreak = ordered.flatMap((card) => [card.value, card.suitValue]);
    return {
      kind: "sum",
      tier: 0,
      tierLabel: "点数总和",
      description: `点数和 ${sum}`,
      cards: cards.slice(),
      naturalCards: naturalCards.slice(),
      score: sum,
      key: [1, sum].concat(tiebreak)
    };
  }

  function compareEvaluations(a, b) {
    return compareNumberArrays(a.key, b.key);
  }

  function winnerClubhouseOrder(state, indices) {
    const distance = seatOrder(
      state.players.length,
      (state.dealerIndex + 1) % state.players.length
    );
    return indices.slice().sort(
      (left, right) => distance.indexOf(left) - distance.indexOf(right)
    );
  }

  function createPotLayers(state) {
    const contributions = state.players.map(
      (player) => player.handContribution
    );
    const levels = Array.from(new Set(contributions.filter((amount) => amount > 0)))
      .sort((a, b) => a - b);
    let previous = 0;
    return levels.map((level) => {
      const contributors = state.players
        .map((player, index) => ({ player, index }))
        .filter((entry) => entry.player.handContribution >= level);
      const amount = contributors.length * (level - previous);
      previous = level;
      return {
        level,
        amount,
        eligible: contributors
          .filter((entry) => !entry.player.folded)
          .map((entry) => entry.index)
      };
    });
  }

  function settlePots(state, evaluationsByPlayer, forcedWinners) {
    const layers = createPotLayers(state);
    const awards = new Map();
    const settlements = [];

    layers.forEach((layer, layerIndex) => {
      let winners = [];
      if (layer.eligible.length === 1) {
        winners = layer.eligible.slice();
      } else if (layer.eligible.length > 1) {
        let bestKey = null;
        layer.eligible.forEach((index) => {
          const evaluation =
            evaluationsByPlayer[index] ||
            evaluateHand([
              state.players[index].holeCard,
              state.players[index].upCard,
              state.players[index].drawCard
            ]);
          if (!bestKey || compareNumberArrays(evaluation.key, bestKey) > 0) {
            bestKey = evaluation.key;
            winners = [index];
          } else if (compareNumberArrays(evaluation.key, bestKey) === 0) {
            winners.push(index);
          }
        });
      }
      if (forcedWinners && forcedWinners.length) {
        winners = layer.eligible.filter((index) => forcedWinners.includes(index));
      }
      if (!winners.length) {
        return;
      }
      winners = winnerClubhouseOrder(state, winners);
      const share = Math.floor(layer.amount / winners.length);
      const remainder = layer.amount - share * winners.length;
      winners.forEach((index, winnerOffset) => {
        const amount = share + (winnerOffset < remainder ? 1 : 0);
        state.players[index].stack += amount;
        awards.set(index, (awards.get(index) || 0) + amount);
      });
      settlements.push({
        index: layerIndex,
        level: layer.level,
        amount: layer.amount,
        eligible: layer.eligible.slice(),
        winners: winners.slice()
      });
    });

    return {
      settlements,
      awards: Array.from(awards.entries()).map(([index, amount]) => ({
        playerIndex: index,
        playerId: state.players[index].id,
        name: state.players[index].name,
        amount
      }))
    };
  }

  function updateEliminations(state) {
    state.players.forEach((player) => {
      if (player.stack <= 0 && !player.eliminated) {
        player.eliminated = true;
        player.lastAction = "筹码耗尽";
        addLog(
          state,
          "eliminated",
          player.seat,
          `${player.name} 筹码耗尽，退出牌桌。`
        );
      }
    });
    const remaining = state.players.filter((player) => !player.eliminated);
    if (state.mode === "online") {
      if (remaining.length === 1) {
        state.tableOver = {
          status: "won",
          winnerId: remaining[0].id,
          winnerName: remaining[0].name,
          reason: `${remaining[0].name} 成为最后的赢家`
        };
        addLog(state, "gameover", null, state.tableOver.reason);
      } else if (remaining.length === 0) {
        state.tableOver = {
          status: "ended",
          reason: "所有玩家都已淘汰"
        };
        addLog(state, "gameover", null, state.tableOver.reason);
      } else {
        state.tableOver = null;
      }
    } else if (state.players[0].eliminated) {
      state.tableOver = {
        status: "lost",
        reason: "你的筹码已经耗尽，本局结束"
      };
      addLog(state, "gameover", 0, state.tableOver.reason);
    } else if (remaining.length <= 1) {
      state.tableOver = {
        status: "won",
        reason: "其他玩家已全部淘汰，你赢下牌桌"
      };
      addLog(state, "gameover", null, state.tableOver.reason);
    } else {
      state.tableOver = null;
    }
    return state.tableOver;
  }

  function completeHand(state, reason) {
    if (state.phase === "complete") {
      return state;
    }
    const alive = aliveIndices(state.players);
    const showdown = alive.length > 1;
    const evaluations = [];
    const evaluationsByPlayer = {};
    if (showdown) {
      alive.forEach((index) => {
        const player = state.players[index];
        const hand = [player.holeCard, player.upCard, player.drawCard];
        if (hand.some((card) => !card)) {
          throw new Error("开牌时仍有玩家不足三张牌。");
        }
        const evaluation = evaluateHand(hand);
        player.revealed = true;
        evaluationsByPlayer[index] = evaluation;
        evaluations.push({
          playerIndex: index,
          playerId: player.id,
          name: player.name,
          cards: hand,
          evaluation
        });
      });
      evaluations.sort((a, b) => compareEvaluations(b.evaluation, a.evaluation));
    }

    const potTotal = roundPot(state.players);
    const payout = settlePots(
      state,
      evaluationsByPlayer,
      showdown ? null : alive
    );
    const tableOver = updateEliminations(state);
    state.phase = "complete";
    state.actorIndex = null;
    state.currentBet = 0;
    state.actedThisRound = [];
    state.summary = {
      handNo: state.handNo,
      reason,
      showdown,
      potTotal,
      evaluations,
      settlements: payout.settlements,
      awards: payout.awards,
      winners: payout.awards.map((award) => award.playerIndex),
      startingStacks: state.startingStacks.slice(),
      tableOver: tableOver ? clone(tableOver) : null
    };
    const awardText = payout.awards
      .map((award) => `${award.name} +${award.amount}`)
      .join("，");
    addLog(
      state,
      "result",
      null,
      `第 ${state.handNo} 手结束，${reason}。${awardText || "底池为空"}。`
    );
    return state;
  }

  function syncOnlineSeats(state, seats) {
    if (!state || state.mode !== "online") {
      throw new Error("只有联机牌局可以同步真人座位。");
    }
    if (!Array.isArray(seats) || seats.length !== state.players.length) {
      throw new Error("联机座位数量与牌局不一致。");
    }
    seats.forEach((participant, index) => {
      const current = state.players[index];
      if (!participant) {
        state.players[index] = createOnlineEmptyPlayer(
          index,
          state.config.startingChips
        );
        return;
      }
      if (current.id !== participant.id) {
        state.players[index] = createOnlinePlayer(
          index,
          participant,
          state.config.startingChips
        );
        return;
      }
      current.name = participant.name;
      current.isHuman = true;
      current.onlineParticipant = true;
      current.eliminated = false;
    });
  }

  function aiRandom(state) {
    const holder = { value: state.aiRngState >>> 0 };
    const value = randomAt(holder);
    state.aiRngState = holder.value >>> 0;
    return value;
  }

  function observedKnownCardIds(state, playerIndex) {
    const known = new Set();
    const player = state.players[playerIndex];
    if (player.holeCard) {
      known.add(player.holeCard.id);
    }
    state.players.forEach((entry) => {
      if (entry.upCard) {
        known.add(entry.upCard.id);
      }
      if (entry.drawCard) {
        known.add(entry.drawCard.id);
      }
    });
    return known;
  }

  function shuffleForSampling(cards, rng) {
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = randomInt(rng, i + 1);
      const temp = cards[i];
      cards[i] = cards[j];
      cards[j] = temp;
    }
    return cards;
  }

  function estimateEquity(state, playerIndex, trials) {
    const player = state.players[playerIndex];
    const alive = aliveIndices(state.players);
    if (alive.length <= 1) {
      return 1;
    }
    const known = observedKnownCardIds(state, playerIndex);
    const unknown = buildDeck().filter((card) => !known.has(card.id));
    const rng = { value: (state.aiRngState ^ 0x9e3779b9 ^ (trials << 3)) >>> 0 };
    let equity = 0;
    const phaseNeedsDraw = state.phase === "bet1";

    for (let trial = 0; trial < trials; trial += 1) {
      const pool = unknown.slice();
      shuffleForSampling(pool, rng);
      let cursor = 0;
      const simulated = {};
      alive.forEach((index) => {
        const entry = state.players[index];
        if (index === playerIndex) {
          simulated[index] = [
            entry.holeCard,
            entry.upCard,
            entry.drawCard || pool[cursor++]
          ].filter(Boolean);
        } else {
          simulated[index] = [
            pool[cursor++],
            entry.upCard,
            entry.drawCard || pool[cursor++]
          ].filter(Boolean);
        }
      });
      const ownEval = evaluateHand(simulated[playerIndex]);
      let ties = 1;
      let beaten = false;
      alive.forEach((index) => {
        if (index === playerIndex) {
          return;
        }
        const otherEval = evaluateHand(simulated[index]);
        const compare = compareEvaluations(ownEval, otherEval);
        if (compare < 0) {
          beaten = true;
        } else if (compare === 0) {
          ties += 1;
        }
      });
      if (!beaten) {
        equity += 1 / ties;
      }
    }
    return equity / trials;
  }

  function estimateEquityByPlayer(state, viewerIndex, trials) {
    const sampleCount = Math.max(40, Math.min(1000, Number(trials) || 400));
    const viewer = state.players[viewerIndex];
    const active = state.players
      .filter((player) => !player.eliminated && !player.folded)
      .map((player) => player.seat);
    if (!viewer || viewer.folded || active.length === 0) {
      return null;
    }
    if (active.length === 1) {
      return {
        sampleCount,
        players: active.map((index) => ({
          playerIndex: index,
          playerId: state.players[index].id,
          name: state.players[index].name,
          equity: 100
        }))
      };
    }

    const knownIds = new Set();
    state.players.forEach((player) => {
      if (player.upCard) {
        knownIds.add(player.upCard.id);
      }
      if (player.drawCard) {
        knownIds.add(player.drawCard.id);
      }
    });
    if (viewer.holeCard) {
      knownIds.add(viewer.holeCard.id);
    }
    const unknown = buildDeck().filter((card) => !knownIds.has(card.id));
    let seed = state.seed >>> 0;
    seed ^= Math.imul(state.handNo + 1, 0x9e3779b1);
    seed ^= Math.imul(viewerIndex + 1, 0x85ebca6b);
    Array.from(viewer.id).forEach((character) => {
      seed ^= Math.imul(character.charCodeAt(0), 0xc2b2ae35);
    });
    const rng = { value: seed >>> 0 };
    const equity = new Map(active.map((index) => [index, 0]));

    for (let trial = 0; trial < sampleCount; trial += 1) {
      const pool = shuffleForSampling(unknown.slice(), rng);
      let cursor = 0;
      const evaluations = new Map();
      active.forEach((index) => {
        const player = state.players[index];
        const cards = [];
        if (index === viewerIndex && player.holeCard) {
          cards.push(player.holeCard);
        }
        if (player.upCard) {
          cards.push(player.upCard);
        }
        if (player.drawCard) {
          cards.push(player.drawCard);
        }
        while (cards.length < 3) {
          cards.push(pool[cursor]);
          cursor += 1;
        }
        evaluations.set(index, evaluateHand(cards.slice(0, 3)));
      });
      let bestKey = null;
      let winners = [];
      active.forEach((index) => {
        const key = evaluations.get(index).key;
        if (!bestKey || compareNumberArrays(key, bestKey) > 0) {
          bestKey = key;
          winners = [index];
        } else if (compareNumberArrays(key, bestKey) === 0) {
          winners.push(index);
        }
      });
      const share = 1 / winners.length;
      winners.forEach((index) => {
        equity.set(index, equity.get(index) + share);
      });
    }

    const exact = active.map((index) => ({
      playerIndex: index,
      playerId: state.players[index].id,
      name: state.players[index].name,
      exact: (equity.get(index) / sampleCount) * 100
    }));
    const rounded = exact.map((entry) => ({
      ...entry,
      equity: Math.floor(entry.exact),
      fraction: entry.exact - Math.floor(entry.exact)
    }));
    let remainder = 100 - rounded.reduce((sum, entry) => sum + entry.equity, 0);
    rounded
      .slice()
      .sort((left, right) => right.fraction - left.fraction)
      .forEach((entry) => {
        if (remainder > 0) {
          entry.equity += 1;
          remainder -= 1;
        }
      });
    return {
      sampleCount,
      players: rounded
        .map(({ fraction, ...entry }) => entry)
        .sort((left, right) => right.equity - left.equity)
    };
  }

  function quickHandStrength(state, playerIndex) {
    const player = state.players[playerIndex];
    const cards = [player.holeCard, player.upCard, player.drawCard].filter(Boolean);
    const current = evaluateHandForPartial(cards);
    const visibleHigh =
      Math.max(...cards.map((card) => card.value)) / 18;
    return Math.min(1, current * 0.72 + visibleHigh * 0.28);
  }

  function evaluateHandForPartial(cards) {
    if (cards.length === 3) {
      const evaluated = evaluateHand(cards);
      if (evaluated.kind === "triple") {
        return Math.max(0.45, 1 - evaluated.target.value / 36);
      }
      return Math.min(1, Math.max(0, (evaluated.score - 27) / 27));
    }
    const sum = cards.reduce((total, card) => total + card.value, 0);
    const expectedThird = 11.5;
    const normalized = (sum + expectedThird - 21) / 33;
    return Math.min(1, Math.max(0, normalized));
  }

  function roundedChipAmount(amount, unit) {
    return Math.max(unit, Math.round(amount / unit) * unit);
  }

  function chooseAiAction(state, playerIndex, difficulty) {
    const player = state.players[playerIndex];
    if (
      !player ||
      state.mode === "online" ||
      player.isHuman ||
      state.actorIndex !== playerIndex
    ) {
      throw new Error("不是 AI 的合法行动位置。");
    }
    const legal = getLegalActions(state, playerIndex);
    const level = ["casual", "standard", "expert"].includes(difficulty)
      ? difficulty
      : state.config.difficulty;
    const trials = level === "casual" ? 24 : level === "standard" ? 72 : 150;
    let equity = estimateEquity(state, playerIndex, trials);
    const noise = level === "casual" ? 0.14 : level === "standard" ? 0.055 : 0.025;
    equity += (aiRandom(state) * 2 - 1) * noise;
    equity *= player.aggression;
    equity = Math.min(1, Math.max(0, equity));
    const quick = quickHandStrength(state, playerIndex);
    equity = equity * 0.78 + quick * 0.22;

    const callAmount = legal.call ? legal.call.amount : 0;
    const pot = roundPot(state.players);
    const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0;
    const foldMargin =
      level === "casual" ? 0.1 : level === "standard" ? 0.035 : 0.015;
    const bluffChance =
      level === "casual" ? 0.12 : level === "standard" ? 0.075 : 0.1;

    if (legal.call && equity + foldMargin < potOdds) {
      return { type: "fold", source: "ai" };
    }
    if (!legal.call && !legal.raise && !legal.allIn) {
      return { type: "fold", source: "ai" };
    }

    if (equity < 0.24 && aiRandom(state) < 0.74 - potOdds) {
      return { type: "fold", source: "ai" };
    }

    const wantsValueRaise =
      equity >
      (level === "casual" ? 0.7 : level === "standard" ? 0.63 : 0.59) *
        player.caution;
    const wantsBluff = aiRandom(state) < bluffChance;
    if (legal.raise && (wantsValueRaise || wantsBluff)) {
      const sizing =
        wantsValueRaise
          ? Math.max(0.52, Math.min(1, equity))
          : 0.34 + aiRandom(state) * 0.28;
      const desired =
        state.currentBet +
        roundedChipAmount(
          Math.max(
            state.config.minBet,
            (pot + callAmount) * sizing * player.aggression
          ),
          legal.raise.step
        );
      const target = Math.min(legal.raise.max, Math.max(legal.raise.min, desired));
      if (legal.allIn && equity > 0.9 && aiRandom(state) < 0.2) {
        return { type: "all_in", source: "ai" };
      }
      return { type: "raise", amount: target, source: "ai" };
    }

    if (legal.call) {
      return { type: "call", source: "ai" };
    }

    if (legal.raise) {
      const target = legal.raise.min;
      return { type: "raise", amount: target, source: "ai" };
    }

    if (legal.allIn) {
      return { type: "all_in", source: "ai" };
    }
    return { type: "fold", source: "ai" };
  }

  function currentActor(state) {
    return Number.isInteger(state.actorIndex)
      ? state.players[state.actorIndex]
      : null;
  }

  function phaseLabel(state) {
    const labels = {
      ready: "等待开局",
      dealing: "正在发牌",
      bet1: "第一轮下注",
      bet2: "第二轮下注",
      complete: "本手结束"
    };
    return labels[state.phase] || state.phase;
  }

  function publicSnapshot(state) {
    return clone(state);
  }

  return {
    VERSION,
    DEFAULTS,
    SUITS,
    REGULAR_RANKS,
    SPECIAL_RANKS,
    buildDeck,
    createGame,
    startNextHand,
    getLegalActions,
    performAction,
    getEarlyFoldEligibility,
    performEarlyFold,
    evaluateHand,
    compareEvaluations,
    findOpeningPlayer,
    settlePots,
    updateEliminations,
    syncOnlineSeats,
    chooseAiAction,
    estimateEquity,
    estimateEquityByPlayer,
    currentActor,
    phaseLabel,
    aliveIndices,
    roundPot,
    cardText,
    clone
  };
});
