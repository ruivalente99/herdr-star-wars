// Standard-library regression checks: node --test tools/themes.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const json = path => JSON.parse(read(path));
const sides = ["light-side", "dark-side"];
const palettes = sides.map(side => json(`themes/${side}.json`));
const fleetSource = read("mods/star-wars-systems/fleet.js").replace(/^export /gm, "");
const { FLEET, shipBackground } = new Function(`${fleetSource}; return { FLEET, shipBackground };`)();
const castingSource = read("mods/star-wars-agents/casting.js").replace(/^export function /gm, "function ");
const { pickHero, repairCast } = new Function(`${castingSource}; return { pickHero, repairCast };`)();
const stripImports = source => source.replace(/^import .*;\n/gm, "");
const findLayoutNode = (node, id) => node.id === id ? node
  : (node.children ?? []).map(child => findLayoutNode(child, id)).find(Boolean);

function contrast(a, b) {
  const luminance = hex => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

function ui() {
  const nodes = [];
  function element(asset) {
    const node = { asset, calls: [] };
    const proxy = new Proxy(node, { get(target, key) {
      if (key in target) return target[key];
      if (key === "when") return (condition, fn) => condition ? fn(proxy) : proxy;
      return (...args) => { target.calls.push([key, ...args]); return proxy; };
    } });
    nodes.push(node);
    return proxy;
  }
  return { nodes, View: class {}, div: () => element(), image: element, svg: element,
    h_flex: () => element(), v_flex: () => element() };
}

function nativeTheme(palette) {
  return { ...palette, ...palette.colors,
    ...Object.fromEntries(palette.ansi.map((color, i) => [`ansi${i}`, color])) };
}

function checkColors(nodes, palette) {
  const allowed = new Set([palette.background, palette.foreground, ...palette.ansi,
    ...Object.values(palette.colors), `${palette.colors.done}1f`, "#fff3cf"]);
  for (const node of nodes) {
    for (const [method, color] of node.calls) {
      if (["bg", "text_color", "border_color"].includes(method)) {
        assert(allowed.has(color), `Unscoped ${method} color: ${color}`);
      }
    }
  }
}

test("one Star Wars layout, exactly two theme palettes with identical roles", () => {
  assert.deepEqual(readdirSync(resolve(root, "themes")).filter(p => p.endsWith(".json")).sort(), sides.map(side => `${side}.json`).sort());
  assert.deepEqual(readdirSync(resolve(root, "layouts")).filter(p => p.endsWith(".json")), ["star-wars.json"]);
  const layout = json("layouts/star-wars.json");
  const panel = findLayoutNode(layout, "panel-body");
  assert.deepEqual(panel.children.map(child => child.id), ["files", "changes", "bomb-run"]);
  assert.deepEqual(panel.children.map(child => child.title), ["Files", "Changes", "Bomb Run"]);
  assert.equal(panel.active, "files");
  assert.equal(panel.header, undefined, "Panels open from the top bar like Herdr's Files/Changes");
  assert.equal(findLayoutNode(layout, "tabs").content.mod, "star-wars-tabs");
  assert.match(read("mods/star-wars-tabs/main.js"), /panelButton\("bomb-run", "Bomb Run"/);
  assert.match(read("mods/star-wars-tabs/main.js"), /enabled\.includes\("bomb-run"\)/, "Bomb Run button must respect the toggle");
  assert(json("mods/star-wars-tabs/mod.json").palette.some(entry => entry.command === "star-wars-tabs.toggle-bomb-run"));
  assert.deepEqual(layout.theme, { light: "light-side", dark: "dark-side" });
  assert(layout.terminal_opacity >= 0.85 && layout.terminal_opacity < 1);
  assert(existsSync(resolve(root, layout.preview)));
  assert(!/undefined|NaN|fill="null"/.test(read("layouts/star-wars.svg")));
  assert.deepEqual(Object.keys(palettes[0].colors).sort(), Object.keys(palettes[1].colors).sort());
  for (const palette of palettes) {
    assert.equal(palette.ansi.length, 16);
    for (const value of [palette.background, palette.foreground, palette.selection, palette.cursor,
      ...palette.ansi, ...Object.values(palette.colors)]) assert.match(value, /^#[0-9a-f]{6}$/);
    assert(contrast(palette.colors.solid, palette.colors.solid_foreground) >= 4.5);
  }
});

test("interface text and semantic states meet 4.5:1 on all main surfaces", () => {
  for (const palette of palettes) {
    for (const role of ["foreground", "muted", "dim", "accent", "working", "blocked", "done"]) {
      for (const surface of ["chrome", "surface", "popover", "raised", "selected"]) {
        const foreground = palette[role] ?? palette.colors[role];
        const ratio = contrast(foreground, palette.colors[surface]);
        assert(ratio >= 4.5, `${role}/${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("all ship backgrounds have both appearances; unknown ships have no path", () => {
  assert.equal(FLEET.length, 7);
  for (const dark of [true, false]) {
    for (const ship of FLEET) {
      const path = shipBackground(ship, dark).image;
      assert(existsSync(resolve(root, path)), path);
      const png = readFileSync(resolve(root, path));
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.equal(png.readUInt32BE(16), 640);
      assert.equal(png.readUInt32BE(20), 360);
    }
  }
  assert.equal(shipBackground("missing"), null);
});

test("character roster has all generated sprites and only Stormtroopers repeat", () => {
  const heroes = ["luke", "leia", "han", "chewbacca", "stormtrooper", "r2d2", "obi-wan", "yoda",
    "boba-fett", "c3po", "padme", "ahsoka", "mace-windu", "emperor-palpatine", "vader"];
  assert.equal(heroes.length, 15);
  for (const hero of heroes) {
    assert(existsSync(resolve(root, `mods/star-wars-agents/sprites/star-wars/${hero}.svg`)), hero);
  }

  const pool = ["luke", "leia", "stormtrooper"];
  const roster = [];
  for (let i = 0; i < pool.length + 4; i++) roster.push(pickHero(pool, roster, () => 0.5));
  const repeats = roster.filter((hero, index) => roster.indexOf(hero) !== index);
  assert(repeats.length > 0);
  assert(repeats.every(hero => hero === "stormtrooper"));

  const saved = { first: "luke", duplicate: "luke", trooperA: "stormtrooper", trooperB: "stormtrooper", removed: "vader" };
  assert(repairCast(pool, saved));
  assert.deepEqual(saved, { first: "luke", trooperA: "stormtrooper", trooperB: "stormtrooper" });
});

test("character artwork preserves the transparent pixel grid and display size", () => {
  const directory = "mods/star-wars-agents/sprites/star-wars";
  const characters = readdirSync(resolve(root, directory)).filter(name => name.endsWith(".svg"));
  assert.equal(characters.length, 15);
  for (const name of characters) {
    const source = read(`${directory}/${name}`);
    assert.match(source, /viewBox="0 0 32 32" width="36" height="36" shape-rendering="crispEdges"/);
    assert.match(source, /<title>[^<]+ — pixel art<\/title>/);
    const pixels = [...source.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/g)];
    assert(pixels.length > 0, name);
    assert.equal(pixels.length, (source.match(/<rect\b/g) ?? []).length, name);
    assert(pixels.some(pixel => pixel[5] === "#11151f"), `${name}: missing shared outline`);
    let coverage = 0;
    for (const [, sx, sy, sw, sh] of pixels) {
      const [x, y, width, height] = [sx, sy, sw, sh].map(Number);
      assert(width > 0 && x + width <= 32 && y < 32, `${name}: outside pixel grid`);
      assert.equal(height, 1, `${name}: expected horizontal pixel runs`);
      coverage += width;
    }
    assert(coverage < 32 * 32, `${name}: transparent background required`);
  }
});

test("arena follows both palettes, renders four fronts and preserves pause/close controls", () => {
  const modelSource = stripImports(read("mods/star-wars-arena/choreography.js")).replace(/^export /gm, "");
  const sceneSource = stripImports(read("mods/star-wars-arena/scene.js")).replace(/^export /gm, "");
  const source = `${modelSource}\n${sceneSource}\n${stripImports(read("mods/star-wars-arena/main.js"))}`
    .replace("export default class Arena", "return class Arena");
  for (const [index, palette] of palettes.entries()) {
    const host = ui();
    let closed = null;
    const Arena = new Function("host", `const { View, div, image, h_flex, v_flex, theme, spaces, shared, settings, closeOverlay, props, checking, window } = host;\n${source}`)({
      ...host, theme: () => nativeTheme(palette), settings: () => ({ dark: index === 1 }),
      spaces: () => [{ id: "one", name: "Test", active: true }],
      shared: () => ({ one: "x-wing" }), props: () => ({ overlay: "arena-test" }),
      closeOverlay: id => closed = id, checking: () => true, window: () => ({ visible: true }),
    });
    const arena = new Arena();
    arena.init();
    arena.render();
    const expected = `backgrounds/ships/${sides[index]}/x-wing.png`;
    assert(host.nodes.some(n => n.asset === expected));
    assert.equal(host.nodes.filter(n => n.calls.some(c => c[0] === "id" && /^arena-fighter-\d-\d$/.test(c[1]))).length, 8);
    checkColors(host.nodes, palette);
    const click = id => host.nodes.find(n => n.calls.some(c => c[0] === "id" && c[1] === id))
      .calls.find(c => c[0] === "on_click")[1]({}, { notify() {} });
    click("arena-close");
    assert.equal(closed, "arena-test");
    click("arena-pause");
    host.nodes.length = 0;
    arena.render();
    assert(!host.nodes.some(n => n.calls.some(c => c[0] === "loop")));
    checkColors(host.nodes, palette);
  }
});

test("mini battles use their own ship and palette, not the active space's backdrop", () => {
  const source = stripImports(read("mods/star-wars-agents/battle.js"))
    .replace(/^export (function|const) /gm, "$1 ");
  for (const [index, palette] of palettes.entries()) {
    const host = ui();
    const battle = new Function("host", `const { div, image, h_flex, shared, settings, layout } = host;\n${source}\nreturn battleScene;`)({
      ...host, shared: () => ({ active: "millennium-falcon", other: "tie-fighter" }),
      settings: () => ({ dark: index === 1 }), layout: () => ({ id: "sidebar", size: { px: 360 } }),
    });
    battle("other", [{ address: "a" }, { address: "b" }], { a: "luke", b: "vader" }, nativeTheme(palette));
    assert(host.nodes.some(n => n.asset === `backgrounds/ships/${sides[index]}/tie-fighter.png`));
    assert(host.nodes.some(n => n.calls.some(c => c[0] === "child" && c[1] === "I am your father.")));
    checkColors(host.nodes, palette);

    for (const [first, second, quote] of [
      ["luke", "yoda", "Do. Or do not. There is no try."],
      ["han", "chewbacca", "Chewie, we're home."],
      ["leia", "r2d2", "Help me, Obi-Wan Kenobi."],
    ]) {
      host.nodes.length = 0;
      battle("other", [{ address: "a" }, { address: "b" }], { a: first, b: second }, nativeTheme(palette));
      assert(host.nodes.some(n => n.calls.some(c => c[0] === "child" && c[1] === quote)));
    }

    host.nodes.length = 0;
    battle("other", [{ address: "a" }, { address: "b" }], { a: "luke", b: "leia" }, nativeTheme(palette));
    assert(!host.nodes.some(n => n.calls.some(c => c[0] === "child" && c[1] === "I am your father.")));
  }
});

function fleetFixture() {
  const state = {
    name: "star-wars", dark: true, checking: false,
    spaces: [{ id: "one", active: true }, { id: "two", active: false }],
    ships: { one: "millennium-falcon", two: "x-wing" },
    layout: { id: "root", background: { image: "old.png" }, children: [{ id: "sidebar", size: { px: 360 } }] },
    settingsFile: JSON.stringify({ zoom: 1.2, sounds: { enabled: false } }), commands: [], tasks: [],
  };
  const source = stripImports(read("mods/star-wars-systems/main.js"))
    .replace(/^export function /gm, "function ").replace("export default class Spaces", "return class Spaces");
  const Spaces = new Function("host", `const { View, shared, setShared, spaces, layout, checking, settings, run, appHome, readTextFile, writeTextFile } = host;\n${fleetSource}\n${source}`)({
    View: class {}, spaces: () => state.spaces, layout: () => state.layout,
    checking: () => state.checking, settings: () => ({ dark: state.dark }),
    shared: key => key === "layout" ? state.name : state.ships,
    setShared: (_key, value) => state.ships = value,
    appHome: () => "/herdr-test", readTextFile: async () => state.settingsFile,
    writeTextFile: async (path, text, expected) => {
      assert.equal(path, "/herdr-test/settings.json");
      assert.equal(expected, state.settingsFile, "settings update must use a fresh expected snapshot");
      state.settingsFile = text;
    },
    run: (command, args) => {
      state.commands.push([command, args]);
      if (command === "layout.set") state.layout = args.layout;
    },
  });
  return { state, view: new Spaces(), cx: { spawn(fn) { state.tasks.push(fn); } },
    async flush() { while (state.tasks.length) await state.tasks.shift()({ sleep: async () => {} }); } };
}

test("side commands change appearance and palette without dropping unrelated settings", async () => {
  const { state, view } = fleetFixture();
  for (const side of ["light", "dark"]) {
    await view.setSide(side);
    assert.deepEqual(JSON.parse(state.settingsFile), { zoom: 1.2, sounds: { enabled: false }, appearance: side });
    assert.deepEqual(state.commands.at(-1), ["app.theme", { name: `${side}-side` }]);
  }
  state.commands.length = 0;
  await view.setSide("missing");
  state.checking = true;
  await view.setSide("light");
  assert.equal(state.commands.length, 0);
});

test("background updates are deferred, fresh, idempotent and limited to Star Wars", async () => {
  const { state, view, cx, flush } = fleetFixture();
  view.syncBackground(state.spaces, cx);
  view.syncBackground(state.spaces, cx);
  assert.equal(state.tasks.length, 1);
  state.spaces[0].active = false;
  state.spaces[1].active = true;
  state.dark = false;
  state.layout.children[0].size.px = 400;
  await flush();
  assert.equal(state.layout.background.image, "backgrounds/ships/light-side/x-wing.png");
  assert.equal(state.layout.children[0].size.px, 400);
  view.syncBackground(state.spaces, cx);
  await flush();
  assert.equal(state.commands.length, 1, "must not loop on its own layout update");
  state.layout.background.image = "custom.png";
  view.syncBackground(state.spaces, cx);
  state.name = "main";
  await flush();
  assert.equal(state.layout.background.image, "custom.png", "must not touch unrelated layouts");
});
