"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("./browser-tools/node_modules/playwright-core");

process.env.SESSION_SECRET = "identity-orientation-test-secret";
process.env.HOST_ISSUE_SECRET = "identity-orientation-host-secret";
const { createGameServer } = require("../outputs/server.js");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let BASE = "";
let runningApp = null;
let runningBrowser = null;

async function createRoom(name, seatCap = 2) {
  const response = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, seatCap, avatar: "preset:jester" })
  });
  const payload = await response.json();
  assert.equal(response.status, 201, payload.error);
  return payload;
}

async function joinRoom(code, name) {
  const response = await fetch(`${BASE}/api/rooms/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, avatar: "preset:jester" })
  });
  const payload = await response.json();
  assert.equal(response.status, 201, payload.error);
  return payload;
}

async function waitForConnected(page) {
  await page.waitForFunction(
    () => document.querySelector("#connectionBadge")?.textContent.includes("已连接"),
    null,
    { timeout: 10000 }
  );
}

async function waitForRoom(page) {
  await page.locator("#roomScreen").waitFor({ state: "visible", timeout: 10000 });
  await waitForConnected(page);
}

async function assertNoHorizontalScroll(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} horizontal overflow: ${JSON.stringify(dimensions)}`
  );
}

async function main() {
  runningApp = createGameServer();
  const address = await runningApp.start(0, "127.0.0.1");
  BASE = `http://127.0.0.1:${address.port}`;
  runningBrowser = await chromium.launch({
    headless: true,
    executablePath: CHROME
  });
  const browser = runningBrowser;
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(`${BASE}/online.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#identityPin").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#identityTitle").textContent(),
    "设置这台设备的身份"
  );
  await page.screenshot({ path: "work/identity-gate.png", fullPage: false });

  await page.locator("#identityPin").fill("052816");
  await page.locator("#createName").fill("本机甲");
  await page.locator('#createPresetAvatars [data-preset="fox"]').click();
  await page.locator("#createSeatCap").selectOption("10");
  assert.equal(await page.locator("#createRoomButton").isEnabled(), true);
  await page.locator("#createRoomButton").click();
  await waitForRoom(page);

  const identity = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sanpi-online-identity-v1"))
  );
  assert.equal(identity.version, 1);
  assert.equal(identity.name, "本机甲");
  assert.equal(identity.avatar, "preset:fox");
  assert.match(identity.pinHash, /^[a-f0-9]{64}$/);
  assert.notEqual(identity.pinHash, "052816");
  assert.equal("pin" in identity, false);

  await page.reload();
  await waitForRoom(page);
  assert.equal(await page.locator("#entryScreen").isHidden(), true);

  const secondRoom = await createRoom("第二桌房主", 2);
  await page.goto(secondRoom.shareUrl);
  await page.locator("#identityTitle").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#identityTitle").textContent(),
    "输入本机身份码"
  );
  assert.equal(await page.locator("#joinProfileFields").isHidden(), true);

  await page.locator("#identityPin").fill("999999");
  await page.waitForFunction(
    () =>
      !document.querySelector("#identityError").hidden &&
      document.querySelector("#identityError").textContent.includes("不正确"),
    null,
    { timeout: 5000 }
  );
  await page.locator("#identityPin").fill("052816");
  await page.waitForFunction(
    () => document.querySelector("#identityTitle").textContent === "本机身份已验证",
    null,
    { timeout: 5000 }
  );
  assert.equal(await page.locator("#joinName").inputValue(), "本机甲");
  await page.locator("#joinRoomButton").click();
  await waitForRoom(page);

  await page.locator("#renameButton").click();
  await page.locator("#renameInput").fill("本机乙");
  await page.locator('#renamePresetAvatars [data-preset="cat"]').click();
  await page.locator("#renameForm button[type=submit]").click();
  await page.waitForFunction(
    () => {
      const stored = JSON.parse(
        localStorage.getItem("sanpi-online-identity-v1") || "{}"
      );
      return stored.name === "本机乙" && stored.avatar === "preset:cat";
    },
    null,
    { timeout: 5000 }
  );

  const thirdRoom = await createRoom("重置测试房主", 2);
  await page.goto(thirdRoom.shareUrl);
  await page.evaluate(() => {
    localStorage.setItem("sanpi-online-host-token", "host-token-sentinel");
  });
  await page.locator("#resetIdentityButton").waitFor({ state: "visible" });
  await page.locator("#resetIdentityButton").click();
  await page.waitForFunction(
    () => localStorage.getItem("sanpi-online-identity-v1") === null
  );
  const resetState = await page.evaluate(() => ({
    identity: localStorage.getItem("sanpi-online-identity-v1"),
    hostToken: localStorage.getItem("sanpi-online-host-token"),
    roomTokens: Object.keys(localStorage).filter((key) =>
      key.startsWith("sanpi-online-token:")
    ).length
  }));
  assert.equal(resetState.identity, null);
  assert.equal(resetState.hostToken, "host-token-sentinel");
  assert.equal(resetState.roomTokens, 0);

  await page.goto(`${BASE}/online.html`);
  await page.locator("#identityPin").fill("123456");
  await page.locator("#createName").fill("横屏测试");
  await page.locator("#createSeatCap").selectOption("10");
  await page.locator("#createRoomButton").click();
  await waitForRoom(page);
  const roomCode = page.url().split("/").pop();
  for (let index = 1; index <= 9; index += 1) {
    await joinRoom(roomCode, `横屏玩家${index}`);
  }
  await page.locator("#lobbyStartButton").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector("#lobbyStartButton").disabled,
    null,
    { timeout: 10000 }
  );
  await page.locator("#lobbyStartButton").click();
  await page.locator("#onlineGameArea").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelectorAll("#onlineSeatLayer .seat").length === 9,
    null,
    { timeout: 10000 }
  );

  await assertNoHorizontalScroll(page, "390x844 portrait");
  assert.equal(
    await page.locator("#mobileOrientationButton").isVisible(),
    true
  );
  await page.locator("#mobileOrientationButton").click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("sanpi-online-orientation")
    ),
    "portrait"
  );
  await page.locator("#mobileOrientationButton").click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("sanpi-online-orientation")
    ),
    "landscape"
  );
  await page.locator("#orientationPrompt").waitFor({ state: "visible" });
  await page.screenshot({
    path: "work/orientation-prompt.png",
    fullPage: false
  });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator("#orientationPrompt").waitFor({ state: "hidden" });
  await assertNoHorizontalScroll(page, "844x390 landscape");
  const landscape = await page.evaluate(() => ({
    layout: document.body.dataset.screenLayout,
    seats: document.querySelectorAll("#onlineSeatLayer .seat").length,
    tableHeight: document.querySelector("#onlineTableShell").getBoundingClientRect()
      .height,
    actionVisible: Boolean(
      document.querySelector("#onlineActionDock").getBoundingClientRect().height
    )
  }));
  assert.equal(landscape.layout, "landscape");
  assert.equal(landscape.seats, 9);
  assert.ok(landscape.tableHeight > 250);
  assert.equal(landscape.actionVisible, true);
  await page.screenshot({
    path: "work/identity-orientation-landscape.png",
    fullPage: false
  });

  await page.locator("#mobileToolsButton").click();
  await page.locator("#orientationModeSelect").waitFor({ state: "visible" });
  await page.locator("#orientationModeSelect").selectOption("portrait");
  await page.locator("#orientationPrompt").waitFor({ state: "visible" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#orientationPrompt").waitFor({ state: "hidden" });
  await assertNoHorizontalScroll(page, "390x844 restored portrait");
  await page.setViewportSize({ width: 320, height: 700 });
  await assertNoHorizontalScroll(page, "320x700 portrait");
  assert.equal(await page.locator("#onlineHumanHandZone").isVisible(), true);
  await page.setViewportSize({ width: 768, height: 320 });
  await assertNoHorizontalScroll(page, "768x320 landscape");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator("#orientationPrompt").waitFor({ state: "hidden" });
  assert.equal(
    await page.locator("#mobileOrientationButton").isHidden(),
    true
  );
  await assertNoHorizontalScroll(page, "1366x768 desktop");

  const legacyContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(`${BASE}/online.html`);
  await legacyPage.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("sanpi-online-name", "旧昵称");
    localStorage.setItem("sanpi-online-avatar", "preset:owl");
  });
  await legacyPage.reload();
  assert.equal(await legacyPage.locator("#createName").inputValue(), "旧昵称");
  assert.equal(await legacyPage.locator("#createProfileFields").isVisible(), true);
  assert.equal(
    await legacyPage.evaluate(
      () => localStorage.getItem("sanpi-online-identity-v1")
    ),
    null
  );
  await legacyPage.setViewportSize({ width: 320, height: 700 });
  await assertNoHorizontalScroll(legacyPage, "320x700 identity entry");
  await legacyContext.close();

  assert.deepEqual(errors, []);
  await browser.close();
  runningBrowser = null;
  await runningApp.close();
  runningApp = null;
  console.log(
    JSON.stringify({
      identityPin: "persisted and verified",
      sessionRefresh: "reconnected without PIN",
      identityReset: "room sessions cleared, host token preserved",
      legacyProfileMigration: "name and avatar prefilled",
      orientations: ["auto", "portrait", "landscape"],
      landscapeSeats: 9,
      errors
    })
  );
}

main().catch(async (error) => {
  console.error(error);
  if (runningBrowser) {
    await runningBrowser.close().catch(() => {});
  }
  if (runningApp) {
    await runningApp.close().catch(() => {});
  }
  process.exitCode = 1;
});
