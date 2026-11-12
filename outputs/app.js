(function () {
  "use strict";

  const Engine = window.SanpiEngine;
  const SAVE_KEY = "sanpi-poker-save-v1";
  const SAVE_VERSION = 1;
  const DIFFICULTY_LABELS = {
    casual: "休闲",
    standard: "标准",
    expert: "高手"
  };
  const SPEED_DELAYS = {
    normal: [760, 1180],
    fast: [380, 650],
    instant: [120, 220]
  };
  const SPEED_ORDER = ["normal", "fast", "instant"];
  const SPEED_LABELS = {
    normal: { short: "1×", label: "正常速度" },
    fast: { short: "2×", label: "快速行动" },
    instant: { short: "↯", label: "极速行动" }
  };

  const defaultPrefs = {
    playerCount: 6,
    difficulty: "standard",
    sound: true,
    motion: true,
    speed: "normal"
  };

  const emptyStats = {
    hands: 0,
    wins: 0,
    net: 0,
    largestPot: 0,
    lastRecorded: null
  };

  let prefs = Object.assign({}, defaultPrefs);
  let stats = Object.assign({}, emptyStats);
  let game = null;
  let selectedPlayerCount = prefs.playerCount;
  let selectedDifficulty = prefs.difficulty;
  let currentScreen = "lobby";
  let aiTimer = null;
  let toastTimer = null;
  let audioContext = null;
  let lastRenderedPhase = "";
  let savedPayloadExists = false;
  let localPresentation = null;
  let localPresentationTimers = [];
  let localEquityCache = null;
  let lastTurnAlertSignature = "";

  const el = {};
  const ids = [
    "lobbyScreen",
    "gameScreen",
    "startForm",
    "playerCountGroup",
    "difficultyGroup",
    "startGameButton",
    "resumeGameButton",
    "resumeMeta",
    "resetSaveButton",
    "lobbyRulesButton",
    "lobbyStats",
    "tableMeta",
    "speedToggle",
    "speedIcon",
    "soundToggle",
    "motionToggle",
    "gameRulesButton",
    "leaveTableButton",
    "seatLayer",
    "humanHandZone",
    "tableShell",
    "turnAlert",
    "turnAlertText",
    "goToActionButton",
    "phaseDot",
    "phaseText",
    "potAmount",
    "deckPile",
    "deckCount",
    "discardPile",
    "tableHint",
    "miniLog",
    "turnPanel",
    "turnEyebrow",
    "turnTitle",
    "turnDescription",
    "readyArea",
    "dealButton",
    "bettingControls",
    "callNeed",
    "potOdds",
    "currentBet",
    "raiseControl",
    "raiseLabel",
    "raiseValue",
    "raiseSlider",
    "raiseInput",
    "raiseButton",
    "quickRaises",
    "foldButton",
    "callButton",
    "allInButton",
    "waitingControls",
    "waitingTitle",
    "waitingDescription",
    "localEarlyFoldButton",
    "localEquityPanel",
    "localEquityHand",
    "localEquityBars",
    "resultPanel",
    "resultEyebrow",
    "resultTitle",
    "resultPot",
    "resultAwards",
    "resultDetails",
    "resultDetailBody",
    "nextHandButton",
    "difficultyFootnote",
    "rulesDialog",
    "closeRulesButton",
    "toast"
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
    return new Intl.NumberFormat("zh-CN").format(Math.round(value));
  }

  function formatSigned(value) {
    const rounded = Math.round(value);
    if (rounded > 0) {
      return `+${formatNumber(rounded)}`;
    }
    return formatNumber(rounded);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        return;
      }
      const payload = JSON.parse(raw);
      if (!payload || payload.version !== SAVE_VERSION) {
        return;
      }
      prefs = Object.assign({}, defaultPrefs, payload.prefs || {});
      stats = Object.assign({}, emptyStats, payload.stats || {});
      if (
        payload.game &&
        payload.game.version === Engine.VERSION &&
        Array.isArray(payload.game.players)
      ) {
        game = payload.game;
        savedPayloadExists = true;
      }
    } catch (error) {
      console.warn("未能读取本地牌局存档。", error);
    }
    selectedPlayerCount = clamp(Number(prefs.playerCount) || 6, 4, 7);
    selectedDifficulty = DIFFICULTY_LABELS[prefs.difficulty]
      ? prefs.difficulty
      : "standard";
  }

  function persist() {
    if (!game) {
      return;
    }
    prefs.playerCount = game.config.playerCount;
    prefs.difficulty = game.config.difficulty;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: SAVE_VERSION,
          savedAt: new Date().toISOString(),
          prefs,
          stats,
          game
        })
      );
      savedPayloadExists = true;
    } catch (error) {
      console.warn("未能保存牌局。", error);
      showToast("浏览器存储不可用，本手进度无法自动保存。");
    }
  }

  function applyPreferenceUi() {
    document.body.classList.toggle("no-motion", !prefs.motion);
    el.soundToggle.setAttribute("aria-pressed", String(Boolean(prefs.sound)));
    el.soundToggle.querySelector(".button-icon").textContent = prefs.sound ? "♪" : "×";
    el.soundToggle.title = prefs.sound ? "关闭声音" : "开启声音";
    el.motionToggle.setAttribute("aria-pressed", String(Boolean(prefs.motion)));
    el.motionToggle.querySelector(".button-icon").textContent = prefs.motion ? "◌" : "—";
    el.motionToggle.title = prefs.motion ? "关闭动画" : "开启动画";
    const speed = SPEED_LABELS[prefs.speed] || SPEED_LABELS.normal;
    el.speedIcon.textContent = speed.short;
    el.speedToggle.title = `行动速度：${speed.label}`;
  }

  function renderLobby() {
    currentScreen = "lobby";
    el.lobbyScreen.hidden = false;
    el.gameScreen.hidden = true;
    el.turnAlert.hidden = true;
    document.body.classList.remove("is-my-turn");
    if (document.title.startsWith("●")) {
      document.title = "三皮牌局";
    }
    clearAiTimer();
    setSelectedValues();
    renderLobbyStats();
    if (game) {
      el.resumeGameButton.hidden = false;
      const stateText =
        game.tableOver
          ? "本局已结束"
          : game.phase === "complete"
          ? `第 ${game.handNo} 手已结算`
          : game.phase === "ready"
            ? "尚未开始"
            : `第 ${game.handNo} 手进行中`;
      const remaining = game.players.filter((player) => !player.eliminated).length;
      el.resumeMeta.textContent = `剩余 ${remaining} 人 · ${DIFFICULTY_LABELS[game.config.difficulty]} · ${stateText}`;
    } else {
      el.resumeGameButton.hidden = true;
    }
  }

  function renderLobbyStats() {
    if (!stats.hands) {
      el.lobbyStats.innerHTML =
        savedPayloadExists && game
          ? `<span>当前牌桌：<strong>${formatNumber(game.players[0].stack)}</strong> 筹码</span>`
          : "<span>还没有战绩，第一手会从这里开始。</span>";
      return;
    }
    el.lobbyStats.innerHTML = `
      <span>累计 <strong>${formatNumber(stats.hands)}</strong> 手</span>
      <span>胜手 <strong>${formatNumber(stats.wins)}</strong></span>
      <span>净收益 <strong>${formatSigned(stats.net)}</strong></span>
      <span>最大底池 <strong>${formatNumber(stats.largestPot)}</strong></span>
    `;
  }

  function setSelectedValues() {
    Array.from(el.playerCountGroup.querySelectorAll("[data-count]")).forEach((button) => {
      const selected = Number(button.dataset.count) === selectedPlayerCount;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    Array.from(
      el.difficultyGroup.querySelectorAll("[data-difficulty]")
    ).forEach((button) => {
      const selected = button.dataset.difficulty === selectedDifficulty;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
  }

  function showGame() {
    currentScreen = "game";
    el.lobbyScreen.hidden = true;
    el.gameScreen.hidden = false;
    applyPreferenceUi();
    renderAll();
  }

  function startNewGame() {
    if (
      game &&
      ["bet1", "bet2"].includes(game.phase) &&
      !window.confirm("当前还有一手牌未结束，确定重新开桌吗？")
    ) {
      return;
    }
    clearAiTimer();
    game = Engine.createGame({
      playerCount: selectedPlayerCount,
      difficulty: selectedDifficulty
    });
    Engine.startNextHand(game);
    prefs.playerCount = selectedPlayerCount;
    prefs.difficulty = selectedDifficulty;
    lastRenderedPhase = "";
    persist();
    showGame();
    startLocalInitialPresentation(() => renderAll());
    showToast(`第 1 手开始，底注 ${game.config.ante}`);
  }

  function resumeSavedGame() {
    if (!game) {
      return;
    }
    showGame();
    showToast("已恢复上次牌局");
  }

  function clearLocalPresentation() {
    localPresentationTimers.forEach((timer) => window.clearTimeout(timer));
    localPresentationTimers = [];
    localPresentation = null;
  }

  function localMotionEnabled() {
    return (
      prefs.motion &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function presentationHas(index, slot) {
    if (!localPresentation) {
      return true;
    }
    return localPresentation[slot].includes(index);
  }

  function cardForPresentation(index, slot, card) {
    if (!localPresentation) {
      return card;
    }
    return presentationHas(index, slot) ? card : null;
  }

  function localPresentationDelay(callback, duration) {
    const timer = window.setTimeout(callback, duration);
    localPresentationTimers.push(timer);
  }

  function startLocalInitialPresentation(onComplete) {
    clearAiTimer();
    clearLocalPresentation();
    if (!localMotionEnabled() || !game?.dealOrder?.length) {
      renderAll();
      onComplete();
      return;
    }
    const order = game.dealOrder.slice();
    localPresentation = {
      kind: "initial",
      stage: "hole",
      order,
      index: -1,
      hole: [],
      up: [],
      draw: [],
      last: null
    };
    renderAll();
    const revealHole = () => {
      localPresentation.index += 1;
      if (localPresentation.index < order.length) {
        const index = order[localPresentation.index];
        localPresentation.hole.push(index);
        localPresentation.last = { seat: index, slot: "hole" };
        renderAll();
        animateLocalPresentationCard(index, "hole");
        localPresentationDelay(revealHole, 220);
        return;
      }
      localPresentation.stage = "up";
      localPresentation.index = -1;
      localPresentationDelay(revealUp, 350);
    };
    const revealUp = () => {
      localPresentation.index += 1;
      if (localPresentation.index < order.length) {
        const index = order[localPresentation.index];
        localPresentation.up.push(index);
        localPresentation.last = { seat: index, slot: "up" };
        renderAll();
        animateLocalPresentationCard(index, "up");
        localPresentationDelay(revealUp, 220);
        return;
      }
      localPresentation.stage = "opening";
      renderAll();
      localPresentationDelay(() => {
        clearLocalPresentation();
        renderAll();
        onComplete?.();
      }, 450);
    };
    localPresentationDelay(revealHole, 350);
  }

  function startLocalDrawPresentation(onComplete) {
    clearAiTimer();
    clearLocalPresentation();
    if (!localMotionEnabled()) {
      renderAll();
      onComplete();
      return;
    }
    const alive = game.players
      .filter((player) => !player.eliminated && !player.folded)
      .map((player) => player.seat);
    const opener = alive.includes(game.openerIndex)
      ? game.openerIndex
      : alive[0];
    const offset = alive.indexOf(opener);
    const order =
      offset >= 0 ? alive.slice(offset).concat(alive.slice(0, offset)) : alive;
    localPresentation = {
      kind: "draw",
      stage: game.midHandReshuffle ? "reshuffle" : "discard",
      order,
      index: -1,
      hole: game.players.map((player) => player.seat),
      up: game.players.map((player) => player.seat),
      draw: [],
      last: null
    };
    renderAll();
    if (game.midHandReshuffle) {
      el.deckPile.classList.add("ritual-shuffle");
      playSound("shuffle");
    }
    localPresentationDelay(() => {
      el.deckPile.classList.remove("ritual-shuffle");
      localPresentation.stage = "draw";
      renderAll();
      revealDraw();
    }, game.midHandReshuffle ? 900 : 450);
    const revealDraw = () => {
      localPresentation.index += 1;
      if (localPresentation.index < order.length) {
        const index = order[localPresentation.index];
        localPresentation.draw.push(index);
        localPresentation.last = { seat: index, slot: "draw" };
        renderAll();
        animateLocalPresentationCard(index, "draw");
        localPresentationDelay(revealDraw, 250);
        return;
      }
      localPresentationDelay(() => {
        clearLocalPresentation();
        renderAll();
        onComplete?.();
      }, 500);
    };
  }

  function animateLocalPresentationCard(seat, slot) {
    if (!localMotionEnabled()) {
      return;
    }
    const target =
      document.querySelector(
        `.seat[data-seat-index="${seat}"] .role-${slot} .playing-card`
      ) ||
      (seat === 0
        ? document.querySelector(
            `.human-hand-card .role-${slot} .playing-card`
          )
        : null);
    const deck = el.deckPile;
    if (!target || !deck) {
      return;
    }
    const targetRect = target.getBoundingClientRect();
    const deckRect = deck.getBoundingClientRect();
    const clone = document.createElement("div");
    clone.className = "playing-card card-back dealing-flight-card";
    clone.style.left = `${deckRect.left}px`;
    clone.style.top = `${deckRect.top}px`;
    clone.style.width = `${targetRect.width}px`;
    clone.style.height = `${targetRect.height}px`;
    document.body.appendChild(clone);
    target.style.visibility = "hidden";
    const deltaX = targetRect.left - deckRect.left;
    const deltaY = targetRect.top - deckRect.top;
    const animation = clone.animate(
      [
        { transform: "translate(0,0) rotate(-8deg) scale(.8)", opacity: 0.35 },
        {
          transform: `translate(${deltaX * 0.52}px, ${deltaY * 0.52 - 38}px) rotate(5deg) scale(1.03)`,
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
    playSound("chip");
    animation.finished
      .catch(() => {})
      .finally(() => {
        clone.remove();
        target.style.visibility = "";
        target.classList.add("card-flip-in");
      });
  }

  function opponentPosition(ordinal, count) {
    const layouts = {
      3: [
        { x: 14, y: 45 },
        { x: 50, y: 18 },
        { x: 86, y: 45 }
      ],
      4: [
        { x: 11, y: 57 },
        { x: 26, y: 21 },
        { x: 74, y: 21 },
        { x: 89, y: 57 }
      ],
      5: [
        { x: 10, y: 60 },
        { x: 15, y: 34 },
        { x: 50, y: 16 },
        { x: 85, y: 34 },
        { x: 90, y: 60 }
      ],
      6: [
        { x: 10, y: 61 },
        { x: 13, y: 34 },
        { x: 31, y: 15 },
        { x: 69, y: 15 },
        { x: 87, y: 34 },
        { x: 90, y: 61 }
      ]
    };
    return layouts[count]?.[ordinal] || { x: 50, y: 18 };
  }

  function cardMarkup(card, options) {
    const opts = options || {};
    if (!card) {
      return `<div class="playing-card is-empty" aria-label="${opts.label || "空牌位"}"></div>`;
    }
    if (opts.hidden) {
      return '<div class="playing-card card-back" aria-label="暗牌"></div>';
    }
    const red = card.color === "red";
    const special = card.kind !== "normal";
    const classes = [
      "playing-card",
      red ? "is-red" : "",
      special ? "is-special" : "",
      card.kind === "wild" ? "is-wild" : "",
      opts.humanCard ? "is-human-card" : "",
      opts.publicCard ? "is-public-card" : "",
      opts.extraClass || ""
    ]
      .filter(Boolean)
      .join(" ");
    const aria =
      card.kind === "normal"
        ? `${card.suitName}${card.label}`
        : card.label;
    if (special) {
      const art =
        card.kind === "wild"
          ? "assets/wildcard.svg"
          : card.rank === "BJ"
            ? "assets/joker-color.svg"
            : "assets/joker-mono.svg";
      const englishLabel = card.kind === "wild" ? "WILD" : "JOKER";
      return `
        <div class="${classes}" aria-label="${escapeHtml(aria)}">
          <img class="joker-art" src="${art}" alt="" draggable="false" />
          <span class="special-tag">${escapeHtml(card.label)}</span>
          <span class="special-caption">${englishLabel}</span>
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
    const roleLabel =
      role === "up" ? "明" : role === "draw" && card ? "摸" : "";
    return `
      <div class="mini-card-slot role-${role} ${publicCard && card ? "is-face-up" : ""}">
        ${roleLabel ? `<span class="mini-card-label" aria-hidden="true">${roleLabel}</span>` : ""}
        ${cardMarkup(
          card,
          Object.assign({}, opts, {
            hidden: Boolean(opts.hidden),
            publicCard,
            label: opts.label || (role === "draw" ? "待摸牌" : "空牌位")
          })
        )}
      </div>
    `;
  }

  function seatMarkup(player, index, ordinal, opponentCount) {
    const position = opponentPosition(ordinal, opponentCount);
    const isCurrent =
      ["bet1", "bet2"].includes(game.phase) && game.actorIndex === index;
    const isWinner = Boolean(
      game.summary && game.summary.winners.includes(index)
    );
    const status = player.eliminated
      ? "筹码耗尽 · 已退出"
      : player.folded
        ? "已弃牌"
        : player.allIn
          ? "已全下"
          : player.lastAction || "等待";
    const classes = [
      "seat",
      player.styleKey || "",
      isCurrent ? "is-current" : "",
      player.folded ? "is-folded" : "",
      player.eliminated ? "is-eliminated" : "",
      isWinner ? "is-winner" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const cards = [
      miniCardSlot(cardForPresentation(index, "hole", player.holeCard), "hole", {
        hidden:
          presentationHas(index, "hole") &&
          Boolean(player.holeCard) &&
          !player.revealed
      }),
      miniCardSlot(cardForPresentation(index, "up", player.upCard), "up"),
      miniCardSlot(cardForPresentation(index, "draw", player.drawCard), "draw", {
        label: "待摸牌"
      })
    ].join("");
    const dealerBadge =
      game.dealerIndex === index
        ? '<span class="seat-badge" aria-label="庄家">庄</span>'
        : "";
    const turnBadge = isCurrent
      ? '<span class="seat-badge turn-badge" aria-label="当前行动">行动</span>'
      : "";
    const contribution = player.roundContribution
      ? `本轮 +${formatNumber(player.roundContribution)}`
      : `本手 ${formatNumber(player.handContribution)}`;
    return `
      <article
        class="${classes}"
        data-seat-index="${index}"
        style="--seat-x:${position.x.toFixed(3)}%;--seat-y:${position.y.toFixed(3)}%"
        aria-label="${escapeHtml(player.name)}，${formatNumber(player.stack)} 筹码，${escapeHtml(status)}"
      >
        <div class="seat-badge-row">${dealerBadge}${turnBadge}</div>
        <div class="seat-topline">
          <div class="avatar" aria-hidden="true">${escapeHtml(player.name.slice(0, 1))}</div>
          <div class="seat-identity">
            <strong>${escapeHtml(player.name)}</strong>
            <span>${escapeHtml(`${player.style}型`)} · 座位 ${index + 1}</span>
          </div>
          <div class="seat-stack">
            <strong>${formatNumber(player.stack)}</strong>
            <span>筹码</span>
          </div>
        </div>
        <div class="seat-cards">${cards}</div>
        <div class="seat-meta">
          <span class="seat-action">${escapeHtml(status)}</span>
          <span class="seat-contribution">${contribution}</span>
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
      ["bet1", "bet2"].includes(game.phase) && game.actorIndex === 0;
    const isWinner = Boolean(
      game.summary && game.summary.winners.includes(0)
    );
    const status = player.eliminated
      ? "已出局"
      : player.folded
        ? "已弃牌"
        : player.allIn
          ? "已全下"
          : player.lastAction || (isCurrent ? "轮到你" : "等待行动");
    const contribution = player.roundContribution
      ? `本轮投入 ${formatNumber(player.roundContribution)}`
      : `本手投入 ${formatNumber(player.handContribution)}`;
    const dealerBadge =
      game.dealerIndex === 0
        ? '<span class="hero-badge dealer">庄</span>'
        : "";
    const turnBadge = isCurrent
      ? '<span class="hero-badge turn">你的回合</span>'
      : "";
    return `
      <article
        class="human-hand-card ${isCurrent ? "is-current" : ""} ${
          player.folded ? "is-folded" : ""
        } ${player.eliminated ? "is-eliminated" : ""} ${
          isWinner ? "is-winner" : ""
        }" data-seat-index="0"
        aria-label="你的手牌，${formatNumber(player.stack)} 筹码，${escapeHtml(status)}"
      >
        <div class="human-hand-identity">
          <div class="human-avatar avatar" aria-hidden="true">你</div>
          <div>
            <strong>你的手牌</strong>
            <span>${
              player.eliminated
                ? "本局已结束"
                : player.folded
                  ? "本手已弃牌"
                  : "底牌仅你可见"
            }</span>
          </div>
          <div class="human-stack">
            <strong>${formatNumber(player.stack)}</strong>
            <span>筹码</span>
          </div>
        </div>
        <div class="hero-hand-cards">
          ${heroCardSlot(
            cardForPresentation(0, "hole", player.holeCard),
            "hole",
            "底牌",
            player.folded ? "已盖牌" : "仅你可见"
          )}
          ${heroCardSlot(
            cardForPresentation(0, "up", player.upCard),
            "up",
            "明牌",
            "桌面公开"
          )}
          ${heroCardSlot(
            cardForPresentation(0, "draw", player.drawCard),
            "draw",
            "摸牌",
            player.drawCard ? "桌面公开" : "第一轮后"
          )}
        </div>
        <div class="human-hand-state">
          <div class="hero-badge-row">${dealerBadge}${turnBadge}</div>
          <strong>${escapeHtml(status)}</strong>
          <span>${contribution}</span>
        </div>
      </article>
    `;
  }

  function renderSeats() {
    const opponents = game.players
      .map((player, index) => ({ player, index }))
      .filter(
        (entry) =>
          !entry.player.isHuman &&
          (!entry.player.eliminated || game.phase === "complete")
      );
    el.seatLayer.innerHTML = opponents
      .map((entry, ordinal) =>
        seatMarkup(entry.player, entry.index, ordinal, opponents.length)
      )
      .join("");
    el.humanHandZone.innerHTML = humanHandMarkup(game.players[0]);
  }

  function phaseText() {
    if (localPresentation) {
      return localPresentation.kind === "initial"
        ? localPresentation.stage === "hole" &&
          localPresentation.index < 0 &&
          game.reshuffledThisHand
          ? "正在重新洗牌"
          : localPresentation.stage === "hole"
          ? "正在发暗牌"
          : localPresentation.stage === "up"
            ? "正在发明牌"
            : "正在确定先手"
        : localPresentation.stage === "reshuffle"
          ? "正在重新洗牌"
          : localPresentation.stage === "discard"
            ? "正在暗弃"
            : "正在摸牌";
    }
    if (game.tableOver) {
      return "本局结束";
    }
    if (game.phase === "bet1") {
      return "第一轮下注";
    }
    if (game.phase === "bet2") {
      return "第二轮下注";
    }
    if (localPresentation) {
      el.tableHint.textContent =
        localPresentation.kind === "initial"
          ? localPresentation.stage === "hole" &&
            localPresentation.index < 0 &&
            game.reshuffledThisHand
            ? "剩余牌堆不足，正在收回 94 张牌统一重洗。"
            : "牌正从牌堆发往每位玩家。"
          : localPresentation.stage === "reshuffle"
            ? "第一轮出现加注，正在庄重地重新洗牌。"
            : "第三张牌正在依次公开。";
    } else if (game.phase === "complete") {
      return "本手结束";
    }
    if (game.phase === "dealing") {
      return "正在发牌";
    }
    return "等待开局";
  }

  function renderCenter() {
    const actor = Engine.currentActor(game);
    el.phaseText.textContent = phaseText();
    el.phaseDot.classList.toggle("is-complete", game.phase === "complete");
    el.potAmount.textContent = formatNumber(Engine.totalPot(game));
    el.deckCount.textContent = `${game.deck.length} 张`;
    el.discardPile.classList.toggle("has-card", Boolean(game.discardCard));
    el.discardPile.setAttribute(
      "aria-label",
      game.discardCard ? "已暗弃一张牌" : "弃牌堆为空"
    );

    if (game.tableOver) {
      el.tableHint.textContent = game.tableOver.reason;
    } else if (game.phase === "complete") {
      el.tableHint.textContent = game.summary.reason;
    } else if (actor) {
      el.tableHint.textContent = actor.isHuman
        ? "轮到你行动，选择跟注、加注、全下或弃牌。"
        : `${actor.name} 正在评估牌力与底池。`;
    } else {
      el.tableHint.textContent = "准备开始";
    }

    const latest = game.logs
      .filter(
        (entry) =>
          entry.hand === game.handNo &&
          (!localPresentation ||
            (entry.type === "phase" && localPresentation.stage !== "opening"))
      )
      .slice(-2)
      .map((entry) => entry.text);
    el.miniLog.textContent = latest.join(" ");
  }

  function humanTurn() {
    return (
      !localPresentation &&
      ["bet1", "bet2"].includes(game.phase) &&
      game.actorIndex === 0 &&
      !game.players[0].eliminated &&
      !game.players[0].folded &&
      !game.players[0].allIn
    );
  }

  function renderTurnAlert() {
    const active = humanTurn();
    if (!active) {
      el.turnAlert.hidden = true;
      document.body.classList.remove("is-my-turn");
      if (document.title.startsWith("●")) {
        document.title = "三皮牌局";
      }
      return;
    }
    el.turnAlert.hidden = false;
    document.body.classList.add("is-my-turn");
    const signature = `${game.handNo}:${game.phase}:${game.actorIndex}:${game.currentBet}:${game.actedThisRound.join(",")}`;
    if (signature !== lastTurnAlertSignature) {
      lastTurnAlertSignature = signature;
      el.turnAlertText.textContent =
        game.phase === "bet1"
          ? "第一轮下注轮到你"
          : "第二轮下注轮到你";
      document.title = "● 轮到你 · 三皮牌局";
      playSound("turn");
      if ("vibrate" in navigator && prefs.sound) {
        navigator.vibrate([120, 70, 120]);
      }
    }
  }

  function actorName() {
    const actor = Engine.currentActor(game);
    return actor ? actor.name : "";
  }

  function renderTurnPanel() {
    const human = game.players[0];
    const isHumanTurn = humanTurn();
    el.bettingControls.hidden = !isHumanTurn;
    el.waitingControls.hidden = true;
    el.resultPanel.hidden = Boolean(localPresentation) || game.phase !== "complete";
    el.readyArea.hidden = game.phase !== "ready";
    el.localEarlyFoldButton.hidden = true;

    if (game.phase === "ready") {
      el.turnEyebrow.textContent = "等待开局";
      el.turnTitle.textContent = "牌桌已就绪";
      el.turnDescription.textContent =
        "开始后，你会看到自己的暗牌与所有明牌。";
      return;
    }

    if (localPresentation) {
      el.localEquityPanel.hidden = true;
      el.waitingControls.hidden = false;
      el.turnEyebrow.textContent =
        localPresentation.kind === "initial" ? "发牌阶段" : "摸牌阶段";
      el.turnTitle.textContent =
        localPresentation.kind === "initial"
          ? localPresentation.stage === "hole"
            ? "正在发暗牌"
            : localPresentation.stage === "up"
              ? "正在发明牌"
              : "正在确定先手"
          : localPresentation.stage === "discard"
            ? "正在暗弃一张牌"
            : "正在依次摸牌";
      el.turnDescription.textContent = "发牌完成后才开放本轮下注。";
      el.waitingTitle.textContent = "牌正在从牌堆发出";
      el.waitingDescription.textContent = "按住节奏观察每位玩家的牌。";
      return;
    }

    if (game.phase === "complete") {
      el.turnEyebrow.textContent = game.tableOver ? "本桌结束" : "本手结算";
      el.turnTitle.textContent = game.tableOver
        ? game.tableOver.status === "lost"
          ? "你的筹码已经耗尽"
          : "你赢下了整桌"
        : "牌局已结束";
      el.turnDescription.textContent = game.tableOver
        ? game.tableOver.reason
        : "查看右侧结算明细，然后开始下一手。";
      return;
    }

    if (isHumanTurn) {
      el.turnEyebrow.textContent =
        game.phase === "bet1" ? "第一轮 · 轮到你" : "第二轮 · 轮到你";
      el.turnTitle.textContent = "选择你的行动";
      el.turnDescription.textContent =
        "跟注可留在牌局；加注会提高本轮目标额度。";
      renderBetControls();
      return;
    }

    el.waitingControls.hidden = false;
    el.localEarlyFoldButton.hidden = !Engine.getEarlyFoldEligibility(game, 0);
    if (human.folded) {
      el.turnEyebrow.textContent = "旁观本手";
      el.turnTitle.textContent = "你已弃牌";
      el.turnDescription.textContent = "其他玩家会继续完成摸牌与下注。";
      el.waitingTitle.textContent = "等待本手结束";
      el.waitingDescription.textContent = "弃牌投入仍留在底池中。";
    } else {
      el.turnEyebrow.textContent =
        game.phase === "bet2" ? "第二轮下注" : "第一轮下注";
      el.turnTitle.textContent = `${actorName() || "其他玩家"} 正在行动`;
      el.turnDescription.textContent = "AI 只会使用公开信息和自己的手牌。";
      el.waitingTitle.textContent = "正在思考";
      el.waitingDescription.textContent = "评估点数、三皮机会与底池赔率。";
    }
  }

  function roundToStep(value, step) {
    return Math.round(value / step) * step;
  }

  function renderBetControls() {
    const legal = Engine.getLegalActions(game, 0);
    const player = game.players[0];
    const need = Math.max(0, game.currentBet - player.roundContribution);
    const pot = Engine.totalPot(game);
    const callAmount = legal.call ? legal.call.amount : need;
    el.callNeed.textContent = formatNumber(callAmount);
    el.currentBet.textContent = formatNumber(game.currentBet);
    el.potOdds.textContent =
      callAmount > 0 ? `${Math.round((callAmount / (pot + callAmount)) * 100)}%` : "—";

    el.foldButton.hidden = !legal.fold;
    el.callButton.hidden = !legal.call;
    if (legal.call) {
      el.callButton.textContent =
        legal.call.amount === 0
          ? "过牌"
          : `${legal.call.label} ${formatNumber(legal.call.amount)}`;
      el.callButton.dataset.action = "call";
    }
    el.allInButton.hidden = !legal.allIn;
    if (legal.allIn) {
      el.allInButton.textContent = legal.allIn.shortCall
        ? `全下 ${formatNumber(legal.allIn.amount)}`
        : "全下";
    }

    el.raiseControl.hidden = !legal.raise;
    if (legal.raise) {
      const slider = el.raiseSlider;
      slider.min = String(legal.raise.min);
      slider.max = String(legal.raise.max);
      slider.step = String(legal.raise.step);
        el.raiseInput.min = String(legal.raise.min);
        el.raiseInput.max = String(legal.raise.max);
        el.raiseInput.step = String(legal.raise.step);
      const current = Number(slider.value);
      const clamped = Number.isFinite(current)
        ? clamp(current, legal.raise.min, legal.raise.max)
        : legal.raise.min;
      if (
        !Number.isFinite(current) ||
        current < legal.raise.min ||
        current > legal.raise.max
      ) {
        slider.value = String(legal.raise.min);
      } else {
        slider.value = String(clamped);
      }
      if (document.activeElement !== el.raiseInput) {
        el.raiseInput.value = slider.value;
      }
      el.raiseLabel.textContent = `${legal.raise.label}到`;
      el.raiseButton.textContent = legal.raise.label;
      updateRaiseDisplay();
    }
  }

  function updateRaiseDisplay() {
    const value = Number(el.raiseSlider.value);
    el.raiseValue.textContent = formatNumber(value);
    if (document.activeElement !== el.raiseInput) {
      el.raiseInput.value = el.raiseSlider.value;
    }
  }

  function commitRaiseInput() {
    const slider = el.raiseSlider;
    const min = Number(slider.min);
    const max = Number(slider.max);
    const step = Math.max(1, Number(slider.step) || 1);
    const raw = Number(el.raiseInput.value);
    const safe = Number.isFinite(raw) ? raw : min;
    slider.value = String(
      clamp(roundToStep(clamp(safe, min, max), step), min, max)
    );
    el.raiseInput.value = slider.value;
    updateRaiseDisplay();
  }

  function setRaisePreset(kind) {
    const legal = Engine.getLegalActions(game, 0);
    if (!legal.raise) {
      return;
    }
    const step = legal.raise.step;
    const pot = Engine.totalPot(game);
    const player = game.players[0];
    const need = Math.max(0, game.currentBet - player.roundContribution);
    let value = legal.raise.min;
    if (kind === "half") {
      value = game.currentBet + roundToStep((pot + need) * 0.5, step);
    } else if (kind === "pot") {
      value = game.currentBet + roundToStep(pot + need, step);
    } else if (kind === "max") {
      value = legal.raise.max;
    }
    const rounded = roundToStep(value, step);
    el.raiseSlider.value = String(
      clamp(rounded, legal.raise.min, legal.raise.max)
    );
    updateRaiseDisplay();
  }

  function renderLocalEquity() {
    const human = game.players[0];
    if (
      localPresentation ||
      !["bet1", "bet2"].includes(game.phase) ||
      human.folded ||
      human.eliminated
    ) {
      el.localEquityPanel.hidden = true;
      return;
    }
    const signature = [
      game.handNo,
      game.phase,
      ...game.players
        .filter((player) => !player.eliminated && !player.folded)
        .map(
          (player) =>
            `${player.seat}:${player.upCard?.id || ""}:${
              player.drawCard?.id || ""
            }`
        ),
      human.holeCard?.id || ""
    ].join("|");
    if (!localEquityCache || localEquityCache.signature !== signature) {
      localEquityCache = {
        signature,
        result: Engine.estimateEquityByPlayer(game, 0, 400)
      };
    }
    const equity = localEquityCache.result;
    if (!equity) {
      el.localEquityPanel.hidden = true;
      return;
    }
    const cards = [human.holeCard, human.upCard, human.drawCard].filter(Boolean);
    el.localEquityHand.textContent =
      cards.length === 3
        ? Engine.evaluateHand(cards).description
        : `${cards.length} 张已知牌`;
    el.localEquityBars.innerHTML = equity.players
      .map((entry) => {
        const player = game.players[entry.playerIndex];
        return `
          <div class="equity-row">
            <span class="equity-name ${player.isHuman ? "is-self" : ""}">${escapeHtml(
              player.isHuman ? "你" : player.name
            )}</span>
            <span class="equity-track"><span class="equity-fill" style="width:${entry.equity}%"></span></span>
            <span class="equity-value">${entry.equity}%</span>
          </div>
        `;
      })
      .join("");
    el.localEquityPanel.hidden = false;
  }

  function renderResults() {
    if (localPresentation || game.phase !== "complete" || !game.summary) {
      return;
    }
    const summary = game.summary;
    const humanAward = summary.awards.find((award) => award.playerIndex === 0);
    el.resultEyebrow.textContent = game.tableOver ? "本桌结束" : "本手结算";
    if (game.tableOver?.status === "lost") {
      el.resultTitle.textContent = "筹码耗尽，本局失败";
    } else if (game.tableOver?.status === "won") {
      el.resultTitle.textContent = "你赢下了整桌";
    } else if (humanAward && summary.tiedShowdown) {
      el.resultTitle.textContent = `平局分池，你获得 ${formatNumber(
        humanAward.amount
      )} 筹码`;
    } else if (humanAward) {
      el.resultTitle.textContent = `你赢得 ${formatNumber(humanAward.amount)} 筹码`;
    } else if (summary.tiedShowdown) {
      el.resultTitle.textContent = "并列最大，底池已平均分池";
    } else if (summary.awards.length === 1) {
      el.resultTitle.textContent = `${summary.awards[0].name} 收下底池`;
    } else {
      el.resultTitle.textContent = "底池已按边池结算";
    }
    el.resultPot.textContent = formatNumber(summary.potTotal);
    el.resultAwards.innerHTML = summary.awards.length
      ? summary.awards
          .map(
            (award) =>
              `<span class="award-chip">${escapeHtml(award.name)} <strong>+${formatNumber(
                award.amount
              )}</strong></span>`
          )
          .join("")
      : '<span class="award-chip">底池为空</span>';

    const evaluationLines = summary.evaluations.length
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
    const potLines = summary.settlements
      .map((pot) => {
        const winnerNames = pot.winners
          .map((index) => game.players[index].name)
          .join("、");
        return `<div class="result-detail-line"><span>${
          pot.index === 0 ? "主池" : `边池 ${pot.index}`
        } · ${
          pot.tiedShowdown
            ? "并列最大，平均分池"
            : escapeHtml(winnerNames)
        }</span><span>${formatNumber(
          pot.amount
        )}</span></div>`;
      })
      .join("");
    el.resultDetailBody.innerHTML = evaluationLines + potLines;
    el.nextHandButton.textContent = game.tableOver
      ? "重新开始"
      : "开始下一手";
    el.resultPanel.classList.toggle(
      "is-loss",
      game.tableOver?.status === "lost"
    );
    el.resultPanel.classList.toggle(
      "is-victory",
      game.tableOver?.status === "won"
    );
  }

  function renderTopbar() {
    el.tableMeta.textContent = `第 ${game.handNo} 手 · ${
      DIFFICULTY_LABELS[game.config.difficulty]
    }`;
    const remaining = game.players.filter((player) => !player.eliminated).length;
    el.difficultyFootnote.textContent = `${DIFFICULTY_LABELS[game.config.difficulty]} AI · 剩余 ${remaining} 人`;
  }

  function renderAll() {
    if (!game) {
      renderLobby();
      return;
    }
    renderTopbar();
    el.gameScreen.classList.toggle(
      "is-game-over",
      Boolean(game.tableOver)
    );
    renderSeats();
    renderCenter();
    renderTurnPanel();
    renderTurnAlert();
    renderResults();
    renderLocalEquity();
    applyPreferenceUi();
    recordCompletedHand();
    scheduleAiTurn();
    lastRenderedPhase = game.phase;
  }

  function recordCompletedHand() {
    if (localPresentation || game.phase !== "complete" || !game.summary) {
      return;
    }
    const recordKey = `${game.gameId}:${game.handNo}`;
    if (
      stats.lastRecorded &&
      stats.lastRecorded.gameId === game.gameId &&
      stats.lastRecorded.handNo >= game.handNo
    ) {
      return;
    }
    const humanAward = game.summary.awards.find(
      (award) => award.playerIndex === 0
    );
    const startStack = game.summary.startingStacks[0] ?? game.players[0].stack;
    stats.hands += 1;
    if (humanAward) {
      stats.wins += 1;
    }
    stats.net += game.players[0].stack - startStack;
    stats.largestPot = Math.max(stats.largestPot, game.summary.potTotal);
    stats.lastRecorded = {
      gameId: game.gameId,
      handNo: game.handNo,
      key: recordKey
    };
    persist();
  }

  function clearAiTimer() {
    if (aiTimer) {
      window.clearTimeout(aiTimer);
      aiTimer = null;
    }
  }

  function scheduleAiTurn() {
    clearAiTimer();
    if (
      currentScreen !== "game" ||
      !game ||
      localPresentation ||
      !["bet1", "bet2"].includes(game.phase) ||
      game.actorIndex === null ||
      game.players[game.actorIndex].isHuman
    ) {
      return;
    }
    const delays = SPEED_DELAYS[prefs.speed] || SPEED_DELAYS.normal;
    const delay =
      delays[0] + Math.random() * Math.max(1, delays[1] - delays[0]);
    const actorAtSchedule = game.actorIndex;
    aiTimer = window.setTimeout(() => {
      aiTimer = null;
      if (
        currentScreen !== "game" ||
        !game ||
        localPresentation ||
        game.actorIndex !== actorAtSchedule ||
        !["bet1", "bet2"].includes(game.phase)
      ) {
        return;
      }
      try {
        const phaseBefore = game.phase;
        const action = Engine.chooseAiAction(
          game,
          game.actorIndex,
          game.config.difficulty
        );
        Engine.performAction(game, action);
        persist();
        if (
          action.type === "fold" ||
          action.type === "raise" ||
          action.type === "call" ||
          action.type === "all_in"
        ) {
          playSound("chip");
        }
        const drawStarted =
          phaseBefore === "bet1" &&
          game.phase !== "bet1" &&
          game.players.some((player) => Boolean(player.drawCard));
        if (drawStarted) {
          startLocalDrawPresentation(() => {
            if (game.phase === "complete") {
              playResultSound();
            }
          });
        } else {
          renderAll();
          if (game.phase === "complete") {
            playResultSound();
          }
        }
      } catch (error) {
        console.error("AI 行动失败", error);
        showToast("AI 行动出现异常，已暂停本手。");
      }
    }, delay);
  }

  function performHumanAction(action) {
    if (!humanTurn()) {
      return;
    }
    try {
      const phaseBefore = game.phase;
      Engine.performAction(game, action);
      persist();
      playSound("chip");
      const drawStarted =
        phaseBefore === "bet1" &&
        game.phase !== "bet1" &&
        game.players.some((player) => Boolean(player.drawCard));
      if (drawStarted) {
        startLocalDrawPresentation(() => {
          if (game.phase === "complete") {
            playResultSound();
          }
        });
      } else {
        renderAll();
        if (game.phase === "complete") {
          playResultSound();
        }
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "该操作无法完成。");
    }
  }

  function nextHand() {
    if (!game || game.phase !== "complete") {
      return;
    }
    if (game.tableOver) {
      const playerCount = game.config.playerCount;
      const difficulty = game.config.difficulty;
      clearAiTimer();
      game = Engine.createGame({ playerCount, difficulty });
      Engine.startNextHand(game);
      prefs.playerCount = playerCount;
      prefs.difficulty = difficulty;
      selectedPlayerCount = playerCount;
      selectedDifficulty = difficulty;
      lastRenderedPhase = "";
      el.resultDetails.open = false;
      persist();
      startLocalInitialPresentation(() => renderAll());
      showToast("新牌局开始，祝你这次赢到最后");
      return;
    }
    Engine.startNextHand(game);
    persist();
    el.resultDetails.open = false;
    startLocalInitialPresentation(() => renderAll());
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      el.toast.hidden = true;
    }, 2600);
  }

  function ensureAudio() {
    if (!prefs.sound) {
      return null;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return null;
    }
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function playTone(frequency, duration, volume, type) {
    const context = ensureAudio();
    if (!context) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type || "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume || 0.025),
      context.currentTime + 0.012
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

  function playSound(kind) {
    if (!prefs.sound) {
      return;
    }
    if (kind === "deal") {
      playTone(240, 0.055, 0.018, "triangle");
      window.setTimeout(() => playTone(320, 0.055, 0.015, "triangle"), 75);
    } else if (kind === "shuffle") {
      [0, 120, 240, 360].forEach((delay, index) => {
        window.setTimeout(
          () => playTone(180 + index * 70, 0.1, 0.012, "triangle"),
          delay
        );
      });
    } else if (kind === "chip") {
      playTone(620, 0.045, 0.017, "square");
      window.setTimeout(() => playTone(520, 0.035, 0.012, "square"), 38);
    } else if (kind === "result") {
      playTone(392, 0.15, 0.017, "sine");
      window.setTimeout(() => playTone(523, 0.18, 0.018, "sine"), 120);
    } else if (kind === "turn") {
      playTone(523, 0.1, 0.02, "triangle");
      window.setTimeout(() => playTone(659, 0.13, 0.018, "triangle"), 90);
      window.setTimeout(() => playTone(784, 0.16, 0.014, "triangle"), 180);
    }
  }

  function playResultSound() {
    const humanAward = game.summary.awards.find(
      (award) => award.playerIndex === 0
    );
    if (humanAward) {
      playSound("result");
    } else {
      playSound("chip");
    }
  }

  function openRules() {
    if (typeof el.rulesDialog.showModal === "function") {
      el.rulesDialog.showModal();
    } else {
      el.rulesDialog.setAttribute("open", "");
    }
  }

  function closeRules() {
    if (typeof el.rulesDialog.close === "function") {
      el.rulesDialog.close();
    } else {
      el.rulesDialog.removeAttribute("open");
    }
  }

  function leaveTable() {
    clearAiTimer();
    clearLocalPresentation();
    persist();
    renderLobby();
  }

  function resetData() {
    if (
      !window.confirm(
        "这会删除当前牌局、累计战绩和所有本地设置。确定要重置吗？"
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      console.warn("清除本地存档失败", error);
    }
    game = null;
    clearLocalPresentation();
    stats = Object.assign({}, emptyStats);
    prefs = Object.assign({}, defaultPrefs);
    selectedPlayerCount = 6;
    selectedDifficulty = "standard";
    savedPayloadExists = false;
    renderLobby();
    showToast("本地数据已重置");
  }

  function toggleSound() {
    prefs.sound = !prefs.sound;
    applyPreferenceUi();
    if (game) {
      persist();
    }
    showToast(prefs.sound ? "声音已开启" : "声音已关闭");
    if (prefs.sound) {
      playSound("chip");
    }
  }

  function toggleMotion() {
    prefs.motion = !prefs.motion;
    if (!prefs.motion && localPresentation) {
      clearLocalPresentation();
      renderAll();
    }
    applyPreferenceUi();
    if (game) {
      persist();
    }
    showToast(prefs.motion ? "动画已开启" : "动画已关闭");
  }

  function toggleSpeed() {
    const currentIndex = SPEED_ORDER.indexOf(prefs.speed);
    prefs.speed = SPEED_ORDER[(currentIndex + 1) % SPEED_ORDER.length];
    applyPreferenceUi();
    if (game) {
      persist();
      scheduleAiTurn();
    }
    showToast(`行动速度：${SPEED_LABELS[prefs.speed].label}`);
  }

  function bindEvents() {
    el.playerCountGroup.addEventListener("click", (event) => {
      const button = event.target.closest("[data-count]");
      if (!button) {
        return;
      }
      selectedPlayerCount = Number(button.dataset.count);
      setSelectedValues();
    });

    el.difficultyGroup.addEventListener("click", (event) => {
      const button = event.target.closest("[data-difficulty]");
      if (!button) {
        return;
      }
      selectedDifficulty = button.dataset.difficulty;
      setSelectedValues();
    });

    el.startForm.addEventListener("submit", (event) => {
      event.preventDefault();
      startNewGame();
    });
    el.resumeGameButton.addEventListener("click", resumeSavedGame);
    el.resetSaveButton.addEventListener("click", resetData);
    el.lobbyRulesButton.addEventListener("click", openRules);
    el.gameRulesButton.addEventListener("click", openRules);
    el.closeRulesButton.addEventListener("click", closeRules);
    el.rulesDialog.addEventListener("click", (event) => {
      if (event.target === el.rulesDialog) {
        closeRules();
      }
    });
    el.leaveTableButton.addEventListener("click", leaveTable);
    el.dealButton.addEventListener("click", () => {
      if (game && game.phase === "ready") {
        Engine.startNextHand(game);
        persist();
        startLocalInitialPresentation(() => renderAll());
      }
    });
    el.nextHandButton.addEventListener("click", nextHand);
    el.soundToggle.addEventListener("click", toggleSound);
    el.motionToggle.addEventListener("click", toggleMotion);
    el.speedToggle.addEventListener("click", toggleSpeed);
    el.goToActionButton.addEventListener("click", () => {
      document
        .querySelector(".action-dock")
        ?.scrollIntoView({ behavior: prefs.motion ? "smooth" : "auto", block: "center" });
    });
    el.localEarlyFoldButton.addEventListener("click", () => {
      if (
        !window.confirm("确定提前弃牌吗？弃牌后不能撤回。") ||
        !Engine.getEarlyFoldEligibility(game, 0)
      ) {
        return;
      }
      try {
        Engine.performEarlyFold(game, 0);
        persist();
        renderAll();
        if (game.phase === "complete") {
          playResultSound();
        }
      } catch (error) {
        showToast(error.message || "当前不能提前弃牌。");
      }
    });

    el.foldButton.addEventListener("click", () => {
      performHumanAction({ type: "fold" });
    });
    el.callButton.addEventListener("click", () => {
      performHumanAction({ type: "call" });
    });
    el.allInButton.addEventListener("click", () => {
      performHumanAction({ type: "all_in" });
    });
    el.raiseButton.addEventListener("click", () => {
      commitRaiseInput();
      performHumanAction({
        type: "raise",
        amount: Number(el.raiseSlider.value)
      });
    });
    el.raiseSlider.addEventListener("input", updateRaiseDisplay);
    el.raiseInput.addEventListener("change", commitRaiseInput);
    el.raiseInput.addEventListener("blur", commitRaiseInput);
    el.raiseInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitRaiseInput();
      }
    });
    el.quickRaises.addEventListener("click", (event) => {
      const button = event.target.closest("[data-raise]");
      if (button) {
        setRaisePreset(button.dataset.raise);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearAiTimer();
      } else if (currentScreen === "game") {
        scheduleAiTurn();
      }
    });
  }

  function init() {
    cacheElements();
    loadStorage();
    bindEvents();
    applyPreferenceUi();
    renderLobby();
    lastRenderedPhase = game ? game.phase : "";
  }

  init();
})();
