"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "outputs");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const onlineHtml = fs.readFileSync(path.join(root, "online.html"), "utf8");
const onlineApp = fs.readFileSync(path.join(root, "online.js"), "utf8");

test("all DOM IDs referenced by the UI controller exist exactly once", () => {
  const htmlIds = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(htmlIds).size, htmlIds.length, "duplicate HTML ids");
  const idBlock = app.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(idBlock, "app id list should exist");
  const appIds = Array.from(idBlock[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  appIds.forEach((id) => {
    assert.ok(htmlIds.includes(id), `missing DOM element #${id}`);
  });
});

test("local game references only its own static files", () => {
  const remoteReferences = Array.from(
    html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g),
    (match) => match[1]
  );
  assert.deepEqual(remoteReferences, []);
  assert.match(html, /<script src="engine\.js"><\/script>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="styles\.css" \/>/);
});

test("all online DOM IDs referenced by the controller exist exactly once", () => {
  const htmlIds = Array.from(
    onlineHtml.matchAll(/\bid="([^"]+)"/g),
    (match) => match[1]
  );
  assert.equal(new Set(htmlIds).size, htmlIds.length, "duplicate online ids");
  const idBlock = onlineApp.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(idBlock, "online id list should exist");
  const appIds = Array.from(idBlock[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  appIds.forEach((id) => {
    assert.ok(htmlIds.includes(id), `missing online DOM element #${id}`);
  });
});

test("required output files are present and non-empty", () => {
  [
    "index.html",
    "styles.css",
    "engine.js",
    "app.js",
    "README.md",
    "online.html",
    "online.css",
    "online.js",
    "server.js",
    "package.json",
    "package-lock.json",
    "assets/joker-color.svg",
    "assets/joker-mono.svg",
    "assets/wildcard.svg"
  ].forEach(
    (filename) => {
      const stats = fs.statSync(path.join(root, filename));
      assert.ok(stats.size > 100, `${filename} should not be empty`);
    }
  );
});

test("special card illustrations are referenced by the renderer", () => {
  assert.match(app, /assets\/joker-color\.svg/);
  assert.match(app, /assets\/joker-mono\.svg/);
  assert.match(app, /assets\/wildcard\.svg/);
});
