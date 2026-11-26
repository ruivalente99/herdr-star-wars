// Dependency-free behavior tests: node --test tools/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const source = path => read(path).replace(/^import .*;\n/gm, "").replace(/^export (const|function) /gm, "$1 ");
const modelSource = source("mods/star-wars-arena/choreography.js");
const model = new Function(`${modelSource}; return { HEROES, PRESETS, normalizeRoster, frontsFor, dialogueLines, exchange, frontStyle };`)();
const arenaSource = `${modelSource}\n${source("mods/star-wars-arena/scene.js")}\n${source("mods/star-wars-arena/main.js")}`
  .replace("export default class Arena", "return class Arena");
const miniSource = source("mods/star-wars-agents/battle.js");

function ui() {
  const nodes = [];
  const element = asset => {
    const node = { asset, calls: [] };
    const proxy = new Proxy(node, { get(target, key) {
      if (key in target) return target[key];
      if (key === "when") return (condition, fn) => condition ? fn(proxy) : proxy;
      return (...args) => { target.calls.push([key, ...args]); return proxy; };
    } });
    nodes.push(node);
    return proxy;
  };
  return { nodes, View: class {}, div: () => element(), image: element, h_flex: () => element(), v_flex: () => element() };
}

const calls = (nodes, method) => nodes.flatMap(node => node.calls.filter(call => call[0] === method));
const hasText = (nodes, text) => calls(nodes, "child").some(call => call[1] === text);
const byId = (nodes, id) => nodes.find(node => node.calls.some(call => call[0] === "id" && call[1] === id));
const actors = nodes => nodes.filter(node => node.calls.some(call => call[0] === "id" && /^arena-fighter-\d-\d$/.test(call[1])));
const theme = () => {
  const palette = JSON.parse(read("themes/dark-side.json"));
  return { ...palette, ...palette.colors };
};

function arenaFixture(properties = {}, check = false) {
  const host = ui();
  const state = { visible: true, notifications: 0, closed: null, timers: [] };
  const cx = { notify() { state.notifications++; }, timer: { every(ms, callback) { state.timers.push({ ms, callback }); } } };
  const Arena = new Function("host", `const { View, div, image, h_flex, v_flex, theme, spaces, shared, settings, closeOverlay, props, checking, window } = host;\n${arenaSource}`)({
    ...host, theme, settings: () => ({ dark: true }),
    spaces: () => [{ id: "active", active: true, name: "Active space" }],
    shared: () => ({ active: "x-wing", other: "y-wing" }),
    props: () => ({ overlay: "test-overlay", ...properties }), checking: () => check,
    window: () => ({ visible: state.visible }), closeOverlay: id => state.closed = id,
  });
  const view = new Arena();
  view.init(properties, cx);
  const render = () => { host.nodes.length = 0; view.render(); return host.nodes; };
  const click = id => {
    const node = byId(host.nodes, id);
    assert(node, `Missing control ${id}`);
    const handler = node.calls.find(call => call[0] === "on_click")?.[1];
    assert(handler, `Missing click handler ${id}`);
    handler({}, cx);
    return render();
  };
  const tick = () => state.timers.forEach(timer => timer.callback(cx));
  return { ...host, state, view, render, click, tick };
}

function miniFixture(width = 268) {
  const host = ui();
  const api = new Function("host", `const { div, image, h_flex, shared, settings, layout } = host;\n${miniSource}\nreturn { battleScene, battleSquad, battleDialogue };`)({
    ...host, shared: () => ({ one: "y-wing" }), settings: () => ({ dark: false }),
    layout: () => ({ id: "sidebar", size: { px: width } }),
  });
  return { ...host, ...api };
}

function assertAssets(nodes) {
  for (const { asset } of nodes) if (asset) assert(existsSync(resolve(root, asset)), `Missing asset: ${asset}`);
}

test("Battle Simulator command ships the Arena palette entry and required sprite assets", () => {
  for (const folder of ["mods/star-wars-agents/sprites/star-wars", "mods/star-wars-agents/sprites/star-wars/weapons"]) {
    assert(readdirSync(resolve(root, folder)).some(name => name.endsWith(".svg")), `Missing sprites in ${folder}`);
  }
  const metadata = JSON.parse(read("mods/star-wars-arena/mod.json"));
  const command = metadata.palette.find(entry => entry.title === "Star Wars: Battle Simulator");
  assert(command);
  assert.equal(command.command, "mod.open");
  assert.deepEqual(command.args, { name: "star-wars-arena" });
  assert.equal(metadata.overlay.height, 560);
});

test("custom rosters reject unknown data, cap at eight and only allow repeated Stormtroopers", () => {
  assert.deepEqual(model.normalizeRoster(null), []);
  assert.deepEqual(model.normalizeRoster({ heroes: ["luke"] }), []);
  assert.deepEqual(model.normalizeRoster(["luke", "missing", "__proto__", {}, null, "luke", "stormtrooper", "stormtrooper"]),
    ["luke", "stormtrooper", "stormtrooper"]);
  assert.equal(model.normalizeRoster(Object.keys(model.HEROES)).length, 8);
  assert.deepEqual(model.frontsFor(["han", "boba-fett", "c3po"]), [["han", "boba-fett"], ["c3po"]]);
  assert.equal(model.frontStyle(["c3po"]), "STANDBY");
  assert.equal(model.frontStyle(["c3po", "padme"]), "ESCORT / SUPPORT");
  assert.equal(model.frontStyle(["luke", "vader"]), "SABER DUEL");
  assert.equal(model.frontStyle(["han", "boba-fett"]), "CROSS-FIRE");
});

test("every preset has valid fronts, attributed dialogue and real local assets", () => {
  const fixture = arenaFixture();
  for (const id of Object.keys(model.PRESETS)) {
    fixture.render();
    fixture.click(`arena-mode-${id}`);
    const roster = fixture.view.roster();
    assert(roster.length >= 2 && roster.length <= 8);
    assert.equal(actors(fixture.nodes).length, roster.length);
    assert.equal(calls(fixture.nodes, "id").filter(call => /^arena-front-\d$/.test(call[1])).length, Math.ceil(roster.length / 2));
    assertAssets(fixture.nodes);
    const lines = model.dialogueLines(roster);
    assert(lines.length >= 2);
    for (const { speaker, pair, text } of lines) {
      assert(roster.includes(speaker));
      assert(pair.every(hero => roster.includes(hero)));
      assert(text.length > 0);
    }
  }
});

test("dialogue alternates speakers, wraps and excludes characters not in the squad", () => {
  const roster = ["luke", "vader"];
  const first = model.exchange(roster, 0);
  const second = model.exchange(roster, 1);
  assert.equal(first.speaker, "vader");
  assert.equal(first.text, "I am your father.");
  assert.equal(second.speaker, "luke");
  assert.deepEqual(model.exchange(roster, model.dialogueLines(roster).length), first);
  assert.equal(model.exchange([], 1), null);
  assert(model.dialogueLines(["han", "boba-fett"]).every(line => ["han", "boba-fett"].includes(line.speaker)));
});

test("pause and hidden windows stop dialogue; reduced motion removes loops but keeps comms", () => {
  const fixture = arenaFixture();
  fixture.render();
  assert(calls(fixture.nodes, "loop").length > 0);
  assert.equal(fixture.state.timers.length, 1);
  assert.equal(fixture.state.timers[0].ms, 2100);
  fixture.tick();
  assert.equal(fixture.view.turn, 0);
  fixture.tick();
  assert.equal(fixture.view.turn, 1);
  fixture.click("arena-pause");
  const turn = fixture.view.turn;
  assert.equal(calls(fixture.nodes, "loop").length, 0);
  fixture.tick(); fixture.tick();
  assert.equal(fixture.view.turn, turn);
  fixture.click("arena-next");
  assert.equal(fixture.view.turn, turn + 1);
  fixture.click("arena-pause");
  fixture.state.visible = false;
  fixture.tick(); fixture.tick();
  assert.equal(fixture.view.turn, turn + 1);
  fixture.state.visible = true;
  fixture.click("arena-motion");
  assert.equal(calls(fixture.nodes, "loop").length, 0);
  fixture.tick(); fixture.tick();
  assert.equal(fixture.view.turn, turn + 2);
});

test("speed changes native periods and dialogue cadence; replay and close work", () => {
  const fixture = arenaFixture();
  fixture.render();
  const normal = calls(fixture.nodes, "loop")[0][2].period;
  fixture.click("arena-speed-2");
  assert.equal(calls(fixture.nodes, "loop")[0][2].period, normal / 2);
  fixture.tick();
  assert.equal(fixture.view.turn, 1);
  fixture.click("arena-speed-0.5");
  assert.equal(calls(fixture.nodes, "loop")[0][2].period, normal * 2);
  fixture.tick(); fixture.tick(); fixture.tick();
  assert.equal(fixture.view.turn, 1);
  fixture.tick();
  assert.equal(fixture.view.turn, 2);
  fixture.click("arena-restart");
  assert.equal(fixture.view.turn, 0);
  assert.equal(fixture.view.focus, null);
  fixture.click("arena-close");
  assert.equal(fixture.state.closed, "test-overlay");
});

test("custom selection handles full, empty and odd rosters without phantom opponents", () => {
  const fixture = arenaFixture();
  fixture.render();
  fixture.click("arena-mode-custom");
  assert.equal(fixture.view.custom.length, 8);
  fixture.click("arena-pick-padme");
  assert.equal(fixture.view.custom.length, 8);
  fixture.click("arena-pick-luke");
  fixture.click("arena-pick-padme");
  assert.equal(fixture.view.custom.at(-1), "padme");
  assert.equal(fixture.view.custom.length, 8);
  for (const hero of [...fixture.view.custom]) fixture.click(`arena-pick-${hero}`);
  assert.equal(actors(fixture.nodes).length, 0);
  assert(hasText(fixture.nodes, "Choose at least two fighters to start a training simulation."));
  fixture.click("arena-pick-han");
  assert.equal(actors(fixture.nodes).length, 0);
  fixture.click("arena-pick-boba-fett");
  fixture.click("arena-pick-c3po");
  assert.equal(actors(fixture.nodes).length, 3);
  assert(hasText(fixture.nodes, "02 / STANDBY"));
  assert(!byId(fixture.nodes, "arena-fighter-1-0-burst"));
  assertAssets(fixture.nodes);
});

test("all fifteen heroes render; support characters are unarmed and saber colors are correct", () => {
  const heroes = Object.keys(model.HEROES);
  for (let index = 0; index < heroes.length; index += 2) {
    const roster = heroes.slice(index, index + 2);
    if (roster.length === 1) roster.push("han");
    const fixture = arenaFixture({ fighters: roster });
    fixture.render();
    assert.equal(actors(fixture.nodes).length, 2);
    assertAssets(fixture.nodes);
  }
  assert.equal(model.HEROES.c3po.weapon, null);
  assert.equal(model.HEROES.padme.weapon, null);
  assert.equal(model.HEROES["mace-windu"].weapon, "saber-purple");
  assert.equal(model.HEROES.ahsoka.weapon, "saber-white");
  const dual = arenaFixture({ fighters: ["ahsoka", "mace-windu"] });
  dual.render();
  assert.equal(dual.nodes.filter(node => node.asset?.endsWith("saber-white-right.svg")).length, 2);
});

test("expanded battles keep the source ship and front clicks focus only their conversation", () => {
  const fixture = arenaFixture({ space: "other", fighters: ["han", "boba-fett", "luke", "vader"] });
  fixture.render();
  assert.equal(fixture.view.scenario, "custom");
  assert(fixture.nodes.some(node => node.asset === "backgrounds/ships/dark-side/y-wing.png"));
  fixture.click("arena-fighter-0-0");
  assert.equal(fixture.view.focus, 0);
  assert(hasText(fixture.nodes, "Solo. We meet again."));
  fixture.click("arena-next");
  assert(hasText(fixture.nodes, "Send the training bill to Jabba."));
  fixture.click("arena-fighter-0-1");
  assert.equal(fixture.view.focus, null);
  const checked = arenaFixture({}, true);
  assert.equal(checked.state.timers.length, 0);
});

test("mini-battle messages occupy a separate flow row below sprites", () => {
  const path = "mods/star-wars-agents/battle.js";
  for (const width of [180, 268, 360]) {
    for (const count of [2, 4, 8]) {
      const host = ui();
      const battle = new Function("host", `const { div, image, h_flex, shared, settings, layout } = host;\n${source(path)}\nreturn battleScene;`)({
        ...host, shared: () => ({}), settings: () => ({ dark: true }),
        layout: () => ({ id: "sidebar", size: { px: width } }),
      });
      const heroes = ["vader", "luke", "han", "chewbacca", "leia", "r2d2", "yoda", "emperor-palpatine"];
      const members = heroes.slice(0, count).map((hero, index) => ({ address: `a${index}`, status: "working" }));
      const cast = Object.fromEntries(members.map((agent, index) => [agent.address, heroes[index]]));
      const stage = battle("one", members, cast, theme(), { turn: 1 });
      const field = byId(host.nodes, "fight-field-one");
      const comms = byId(host.nodes, "fight-comms-one");
      assert(field && comms, `${path}: missing separate field or comms`);
      assert(stage.calls.some(call => call[0] === "flex_col"), path);
      const children = stage.calls.filter(call => call[0] === "child").map(call => call[1]);
      const fieldIndex = children.findIndex(child => child?.calls === field.calls);
      const commsIndex = children.findIndex(child => child?.calls === comms.calls);
      assert(fieldIndex >= 0 && commsIndex > fieldIndex, `${path}: comms must follow the field`);
      assert(!comms.calls.some(call => ["absolute", "top", "bottom"].includes(call[0])), `${path}: no floating message overlay`);
      assert(comms.calls.some(call => call[0] === "flex_none"), `${path}: comms must reserve height`);
      assert(comms.calls.some(call => call[0] === "overflow_hidden"), `${path}: text must stay inside comms`);
      const height = node => node.calls.find(call => call[0] === "h")?.[1] ?? 0;
      assert(height(stage) >= height(field) + height(comms) + 2, `${path}: both rows must fit inside the border`);
    }
  }
});

test("speech tails follow the speaking character without entering the sprite field", () => {
  const mini = miniFixture();
  const members = [{ address: "a" }, { address: "b" }];
  const cast = { a: "vader", b: "luke" };
  const position = node => node.calls.find(call => call[0] === "left")?.[1];
  mini.battleScene("one", members, cast, theme(), { turn: 0 });
  const first = position(byId(mini.nodes, "fight-tail-one"));
  assert(byId(mini.nodes, "fight-bubble-one"));
  assert(hasText(mini.nodes, "Vader"));
  mini.nodes.length = 0;
  mini.battleScene("one", members, cast, theme(), { turn: 1 });
  const second = position(byId(mini.nodes, "fight-tail-one"));
  assert.equal(second - first, 56);
  assert(hasText(mini.nodes, "Luke"));
  const tail = byId(mini.nodes, "fight-tail-one");
  const bubble = byId(mini.nodes, "fight-bubble-one");
  assert.equal(tail.calls.find(call => call[0] === "top")[1], 0);
  assert.equal(bubble.calls.find(call => call[0] === "top")[1], 6);
  assert.equal(tail.calls.filter(call => call[0] === "child").length, 7);
});

test("Arena current and previous dialogue have separate bubbles, portraits and mirrored tails", () => {
  const fixture = arenaFixture({ fighters: ["luke", "vader"] });
  fixture.render();
  assert(byId(fixture.nodes, "arena-speech-current"));
  assert(!byId(fixture.nodes, "arena-speech-previous"));
  fixture.click("arena-next");
  const current = byId(fixture.nodes, "arena-speech-current");
  const previous = byId(fixture.nodes, "arena-speech-previous");
  assert(current.calls.some(call => call[0] === "accessibility_label" && call[1].startsWith("Luke says:")));
  assert(previous.calls.some(call => call[0] === "accessibility_label" && call[1].startsWith("Previously, Vader said:")));
  assert(byId(fixture.nodes, "arena-tail-current").calls.some(call => call[0] === "left" && call[1] === -7));
  assert(byId(fixture.nodes, "arena-tail-previous").calls.some(call => call[0] === "right" && call[1] === -7));
  assertAssets(fixture.nodes);
});

test("mini bubbles do not attribute lines to fighters hidden on the bench", () => {
  const mini = miniFixture(268);
  const heroes = ["han", "boba-fett", "c3po", "r2d2", "vader", "luke"];
  const members = heroes.map((hero, index) => ({ address: `a${index}` }));
  const cast = Object.fromEntries(members.map((agent, index) => [agent.address, heroes[index]]));
  mini.battleScene("one", members, cast, theme());
  assert(!hasText(mini.nodes, "I am your father."));
  assert(!hasText(mini.nodes, "Vader"));
  assert(!hasText(mini.nodes, "Luke"));
});

test("mini battles paginate every agent, keep duplicates and normalize page after departures", () => {
  const mini = miniFixture();
  const members = Array.from({ length: 11 }, (_, i) => ({ address: `a${i}`, status: "working" }));
  const cast = Object.fromEntries(members.map((agent, i) => [agent.address, i < 2 ? ["han", "boba-fett"][i] : "stormtrooper"]));
  const shown = new Set();
  for (let page = 0; page < 3; page++) {
    const squad = mini.battleSquad(members, cast, page);
    assert.equal(squad.pages, 3);
    squad.fighters.forEach(agent => shown.add(agent.address));
  }
  assert.equal(shown.size, members.length);
  assert.equal(mini.battleSquad(members.slice(0, 3), cast, 2).page, 0);
  assert.equal(mini.battleSquad(members, cast, -1).page, 2);
  assert.equal(mini.battleSquad([{ address: "unknown" }], cast).fighters.length, 0);
  const options = { onPause() {}, onPage() {}, onOpen() {} };
  mini.battleScene("one", members, cast, theme(), options);
  assert(byId(mini.nodes, "fight-squad-one"));
  assert(byId(mini.nodes, "fight-open-one"));
  assertAssets(mini.nodes);
});

test("mini battles respect idle, blocked, done and paused states without arming support", () => {
  const mini = miniFixture(360);
  const members = [
    { address: "a", status: "blocked" }, { address: "b", status: "done" },
    { address: "c", status: "idle" }, { address: "d", status: "working" },
  ];
  const cast = { a: "han", b: "luke", c: "vader", d: "c3po" };
  assert.equal(mini.battleDialogue(members, cast, 0).text, "I need backup. Holding position!");
  mini.battleScene("one", members, cast, theme(), { paused: true });
  assert.equal(calls(mini.nodes, "loop").length, 0);
  assert(!mini.nodes.some(node => node.asset?.includes("/weapons/")));
  assert(hasText(mini.nodes, "!"));
  assert(hasText(mini.nodes, "✦"));
  mini.nodes.length = 0;
  const team = [{ address: "r", status: "working" }, { address: "g", status: "working" }];
  const roles = { r: "han", g: "boba-fett" };
  assert.equal(mini.battleDialogue(team, roles, 0).speaker, "boba-fett");
  assert.equal(mini.battleDialogue(team, roles, 1).speaker, "han");
  mini.battleScene("one", team, roles, theme());
  assert(calls(mini.nodes, "loop").length > 0);
  assertAssets(mini.nodes);
});

test("agent view keeps per-space controls independent, expands the current squad and skips hidden battles", () => {
  const host = ui();
  const state = { width: 268, visible: true, timers: [], opened: [], commands: [] };
  const heroes = ["vader", "luke", "han", "boba-fett", "c3po", "r2d2", "leia", "chewbacca"];
  const list = heroes.map((hero, index) => ({
    address: `a${index}`, status: "working", space: index < 6 ? "one" : "two", space_name: index < 6 ? "One" : "Two",
    tab: `tab${index}`, title: `Task ${index}`, seq: index, pane: `pane${index}`,
  }));
  let live = list;
  const sharedState = {
    "star-wars-agents.cast": Object.fromEntries(list.map((agent, index) => [agent.address, heroes[index]])),
    "star-wars.ships": { one: "x-wing", two: "y-wing" }, "agents.sort": "grouped",
  };
  const cx = { notify() {}, timer: { every(ms, callback) { state.timers.push({ ms, callback }); } } };
  const storage = new Map();
  const casting = source("mods/star-wars-agents/casting.js");
  const agentsSource = source("mods/star-wars-agents/main.js").replace("export default class Agents", "return class Agents");
  const Agents = new Function("host", `const { View, div, image, svg, h_flex, v_flex, agents, settings, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, hc, checking, localStorage } = host;\n${miniSource}\n${casting}\n${agentsSource}`)({
    ...host, svg: host.image, agents: () => live, settings: () => ({ dark: true }),
    terminals: () => live.map(agent => ({ ...agent, state: "live" })), panes: () => [], focused: () => ({}),
    spaces: () => ["one", "two"].map(id => ({ id, tabs: live.filter(agent => agent.space === id)
      .map(agent => ({ id: agent.tab, name: agent.title, named: true })) })),
    run: (...args) => state.commands.push(args), theme, shared: key => sharedState[key],
    setShared: (key, value) => sharedState[key] = value, setAgentOrder() {},
    openOverlay: value => state.opened.push(value), closeOverlay() {}, props: () => ({}),
    window: () => ({ visible: state.visible }), layout: () => ({ id: "sidebar", size: { px: state.width } }),
    hc() { throw new Error("Unexpected real agent operation"); }, checking: () => false,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  const view = new Agents();
  view.readStats = () => {};
  view.init({}, cx);
  const render = () => { host.nodes.length = 0; view.render(cx); };
  const click = id => {
    const node = byId(host.nodes, id);
    assert(node, id);
    node.calls.find(call => call[0] === "on_click")[1]({}, cx);
    render();
  };
  render();
  const tick = state.timers.find(timer => timer.ms === 4800).callback;
  tick(cx);
  assert.equal(view.battleStates.get("one").turn, 1);
  assert.equal(view.battleStates.get("two").turn, 1);
  click("fight-pause-one");
  tick(cx);
  assert.equal(view.battleStates.get("one").turn, 1);
  assert.equal(view.battleStates.get("two").turn, 2);
  click("fight-squad-one");
  click("fight-open-one");
  assert.equal(state.opened[0].mod, "star-wars-arena");
  assert.deepEqual(state.opened[0].props, { space: "one", fighters: ["c3po", "r2d2"] });
  assert.equal(state.commands.length, 0);
  state.visible = false;
  tick(cx);
  assert.equal(view.battleStates.get("two").turn, 2);
  state.visible = true;
  click("sp-two");
  tick(cx);
  assert.equal(view.battleStates.get("two").turn, 2);
  state.width = 76;
  render();
  assert.equal(view.activeBattles.size, 0);
  live = list.filter(agent => agent.space === "two");
  render();
  assert(!view.battleStates.has("one"));
});
