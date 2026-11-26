import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");
const strip = source => source.replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
const modelSource = `${strip(read("mods/star-wars-bomb-run/decks.js"))}\n${strip(read("mods/star-wars-bomb-run/game.js"))}`;
const model = new Function(`${modelSource}\nreturn { DECKS, BUFFS, HEIGHT, WIDTH, STEP_MS, TICK_MS, cyclePayload, deckFor, powerFor, blastCells, placeLine, enemyRoster, trainingFor, normalizeProfile, nextLevel, movePlayer, newGame, placeBomb, tick };`)();
const { DECKS, BUFFS, HEIGHT, WIDTH, STEP_MS, TICK_MS, cyclePayload, deckFor, powerFor, blastCells, placeLine, enemyRoster, trainingFor, normalizeProfile, nextLevel, movePlayer, newGame, placeBomb, tick } = model;
const sceneSource = strip(read("mods/star-wars-bomb-run/scene.js"));
const uiSource = strip(read("mods/star-wars-bomb-run/ui.js"));
const mainSource = strip(read("mods/star-wars-bomb-run/main.js")).replace("default class BombRun", "class BombRun");
const { fitTile, walkFrame } = new Function(`${modelSource}\n${sceneSource}\nreturn { fitTile, walkFrame };`)();

function files(path) {
  return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? files(`${path}/${item.name}`) : [`${path}/${item.name}`]);
}

function harness({ overlay = false, focus = false, storage = new Map(), checkingRun = false } = {}) {
  const state = {
    storage, writes: 0, reads: 0,
    nodes: [], timers: [], focused: focus, visible: true, closed: [], commands: [], opened: [],
    ownProps: overlay ? { overlay: "game-overlay" } : { panel: "panel", stack: "panel-body", child: "bomb-run" },
    tree: { id: "root", children: [{ id: "panel", hidden: false, children: [{ id: "panel-body", active: "bomb-run" }] }] },
    cast: { first: "mace-windu", second: "ahsoka" },
    agents: [{ address: "first", space: "space-1", focused: true, status: "working", program: { name: "Pi" } },
      { address: "second", space: "space-1", focused: false, status: "idle", program: { name: "Claude Code" } }],
  };
  function element(asset) {
    const node = { asset, calls: [], kids: [] };
    const proxy = new Proxy(node, { get(target, key) {
      if (key in target) return target[key];
      if (key === "when") return (condition, fn) => condition ? fn(proxy) : proxy;
      if (key === "child") return child => { target.kids.push(child); return proxy; };
      if (key === "children") return children => { target.kids.push(...children); return proxy; };
      return (...args) => { target.calls.push([key, ...args]); return proxy; };
    } });
    state.nodes.push(node);
    return proxy;
  }
  const t = new Proxy({}, { get: () => "#abcdef" });
  const cx = {
    notify() {}, stop_propagation() {},
    focus_handle: () => ({ focus() { state.focused = true; }, is_focused: () => state.focused }),
    timer: { every(ms, callback) { state.timers.push({ ms, callback }); } },
  };
  const host = {
    View: class {}, div: () => element(), image: element, h_flex: () => element(), v_flex: () => element(),
    agents: () => state.agents, spaces: () => [{ id: "space-1", active: true }],
    shared: key => key === "star-wars-agents.cast" ? state.cast : { "space-1": "x-wing" },
    theme: () => t, checking: () => checkingRun, props: () => state.ownProps,
    settings: () => ({ zoom: 1.2 }), window: () => ({ visible: state.visible }), layout: () => state.tree,
    closeOverlay: id => state.closed.push(id), run: (...args) => state.commands.push(args), openOverlay: args => state.opened.push(args),
    localStorage: {
      getItem: key => { state.reads++; return state.storage.get(key) ?? null; },
      setItem: (key, value) => { state.writes++; state.storage.set(key, value); },
    },
  };
  const BombRun = new Function("host", `const { ${Object.keys(host).join(", ")} } = host;\n${modelSource}\n${sceneSource}\n${uiSource}\n${mainSource}\nreturn BombRun;`)(host);
  const view = new BombRun();
  view.init({}, cx);
  const render = () => { state.nodes = []; return view.render(); };
  const node = id => state.nodes.find(node => node.calls.some(call => call[0] === "id" && call[1] === id));
  const handler = (id, method) => {
    const found = node(id);
    assert(found, `Missing node: ${id}`);
    const call = found.calls.find(call => call[0] === method);
    assert(call, `Missing ${method} on ${id}`);
    return call.at(-1);
  };
  const click = id => handler(id, "on_click")({}, cx);
  const key = (key, extra = {}) => view.keyDown({ key, modifiers: {}, ...extra }, cx);
  const advanceMs = ms => { for (let i = 0; i < ms; i += state.timers[0].ms) state.timers[0].callback(cx); };
  const advance = (count = 1) => advanceMs(count * 80);
  return { state, view, cx, render, node, handler, click, key, advance, advanceMs };
}

test("shared package exports the same mod, scene, assets and palette command", () => {
  const runtime = files("mods/star-wars-bomb-run").filter(path => !path.endsWith(".d.ts"));
  for (const path of runtime) assert.equal(read(`share/star-wars/${path}`), read(path), path);
  const metadata = JSON.parse(read("mods/star-wars-bomb-run/mod.json"));
  assert.equal(metadata.palette[0].args.name, "star-wars-bomb-run");
  const tree = JSON.parse(read("layouts/star-wars.json"));
  const game = tree.children[1].children[1].children[1].children[0].children.find(node => node.id === "bomb-run");
  assert.deepEqual(game.content.props, { panel: "panel", stack: "panel-body", child: "bomb-run" });
});

test("art is reproducible local pixel geometry, without external images or fonts", () => {
  const paths = files("mods/star-wars-bomb-run/art");
  const destination = mkdtempSync(resolve(tmpdir(), "bomb-run-art-"));
  try {
    const built = spawnSync("python3", [resolve(root, "tools/build-bomb-run-art.py"), "--output", destination], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
    const relative = path => path.slice("mods/star-wars-bomb-run/art/".length);
    assert.deepEqual(files(destination).map(path => path.slice(destination.length + 1)), paths.map(relative));
    for (const path of paths) assert.equal(read(resolve(destination, relative(path))), read(path), path);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
  for (const path of paths) {
    const svg = read(path);
    assert.match(svg, /shape-rendering="crispEdges"/);
    assert.doesNotMatch(svg, /<image|<script|<foreignObject|<filter|<text/);
    assert.match(svg, /<rect/);
  }
});

test("all fifteen pilots have distinct gait frames in four directions", () => {
  const actors = files("mods/star-wars-bomb-run/art/actors");
  assert.equal(actors.length, 60);
  for (const path of actors) {
    const source = read(path);
    assert.match(source, /viewBox="0 0 96 32"/);
    const frames = [[], [], []];
    for (const [, sx, sy, sw, sh, color] of source.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="([^"]+)"/g)) {
      const x = Number(sx), width = Number(sw);
      assert(x >= 0 && x + width <= 96);
      for (let dx = 0; dx < width; dx++) frames[Math.floor((x + dx) / 32)].push([((x + dx) % 32), +sy, +sh, color]);
    }
    assert.notDeepEqual(frames[0], frames[1], path);
    assert.notDeepEqual(frames[1], frames[2], path);
  }
});

test("the viewport fits narrow/wide panels at Herdr zoom without clipping", () => {
  for (const zoom of [0.8, 1, 1.2, 1.5, 2]) {
    for (const [width, height] of [[256, 300], [344, 440], [600, 500]]) {
      const tile = fitTile(width * zoom, height * zoom, zoom);
      assert(WIDTH * tile <= width);
      assert((HEIGHT + 3) * tile <= height);
      assert.equal(tile % 2, 0, "Use even pixel scales");
    }
  }
});

test("new board has hard borders and safe open spawn areas", () => {
  const game = newGame();
  assert.equal(game.board.length, HEIGHT);
  assert(game.board.every(row => row.length === WIDTH));
  assert(game.board.every(row => row[0] === "#" && row[WIDTH - 1] === "#"));
  assert(game.board[0].every(tile => tile === "#"));
  assert.equal(game.board[1][1], ".");
  for (const enemy of game.enemies) assert.equal(game.board[enemy.y][enemy.x], ".");
});

test("walking uses two foot poses then returns to rest; vertical movement changes facing", () => {
  const game = newGame();
  assert.equal(movePlayer(game, 1, 0), true);
  assert.equal(game.player.facing, "right");
  const firstFrame = walkFrame(game.player, game.elapsed, false);
  tick(game, STEP_MS / 2);
  assert.notEqual(walkFrame(game.player, game.elapsed, false), firstFrame);
  assert.equal(walkFrame(game.player, game.elapsed, true), 0);
  tick(game, STEP_MS / 2);
  assert.equal(game.player.moving, false);
  assert.equal(walkFrame(game.player, game.elapsed, false), 0);
  movePlayer(game, -1, 0);
  movePlayer(game, 0, 1);
  assert.equal(game.player.facing, "down");
  movePlayer(game, 0, -1);
  assert.equal(game.player.facing, "up");
});

test("scene is a pixel deck, not a cockpit photo, emoji bomb or whole-body bob", () => {
  const app = harness();
  app.render();
  assert(app.state.nodes.some(node => node.asset?.endsWith("art/deck-reactor.svg")));
  assert(!app.state.nodes.some(node => node.asset?.includes("backgrounds/ships")));
  assert(!app.state.nodes.some(node => node.calls.some(call => call[0] === "loop" && call[1] === "top")));
  for (const node of app.state.nodes.filter(node => node.asset)) assert(existsSync(resolve(root, node.asset)), node.asset);
  assert(app.node("bomb-run-start"));
  assert.doesNotMatch(read("mods/star-wars-bomb-run/main.js") + read("mods/star-wars-bomb-run/scene.js"), /💣|Sem agente|Bomba|Fechar|Pausa|Reiniciar|Setas\/WASD|Cosmético/);
});

test("a mission waits for Start, does not steal focus, and holds movement at a fixed pace", () => {
  const app = harness();
  app.advance(10);
  assert.equal(app.view.game.elapsed, 0);
  assert.equal(app.state.focused, false);
  app.render();
  app.click("bomb-run-start");
  assert.equal(app.view.started, true);
  assert.equal(app.state.focused, true);
  app.key("right");
  assert.equal(app.view.game.player.x, 2);
  app.key("right", { is_held: true });
  assert.equal(app.view.game.player.x, 2);
  app.advance(2);
  assert.equal(app.view.game.player.x, 3);
  app.render();
  app.handler("bomb-run-root", "on_key_up")({ key: "right" }, app.cx);
  app.advance(2);
  assert.equal(app.view.game.player.x, 3);
});

test("focus loss, hidden window and other panel tabs pause without advancing the run", () => {
  for (const hide of [app => { app.state.focused = false; }, app => { app.state.visible = false; },
    app => { app.state.tree.children[0].children[0].active = "files"; }, app => { app.state.tree.children[0].hidden = true; }]) {
    const app = harness();
    app.view.play(app.cx);
    app.key("right");
    hide(app);
    app.advance(5);
    assert.equal(app.view.paused, true);
    assert.equal(app.view.game.elapsed, 0);
    assert.equal(app.view.held, null);
  }
});

test("pause blocks bombs and movement; Enter resumes, R resets, Escape pauses before closing", () => {
  const app = harness();
  app.key("enter");
  app.key("escape");
  app.key("right");
  app.key("space");
  assert.equal(app.view.game.player.x, 1);
  assert.equal(app.view.game.bombs.length, 0);
  app.key("enter");
  app.key("space");
  assert.equal(app.view.game.bombs.length, 1);
  app.key("r");
  assert.equal(app.view.started, false);
  assert.equal(app.view.game.bombs.length, 0);
  app.key("escape");
  assert.deepEqual(app.state.commands, [["layout.hide", { id: "panel" }]]);
  const overlay = harness({ overlay: true });
  overlay.key("escape");
  assert.deepEqual(overlay.state.closed, ["game-overlay"]);
});

test("pilot selection uses the real cast and safely resets the run", () => {
  const app = harness();
  app.render();
  app.click("bomb-run-next-agent");
  assert.equal(app.view.selectedAddress, "second");
  app.render();
  assert(app.state.nodes.some(node => node.asset?.includes("actors/ahsoka-down")));
  app.state.cast.second = "not-a-character";
  app.key("enter");
  app.render();
  assert(app.state.nodes.some(node => node.asset?.includes("actors/luke-down")));
});

test("thermal charges and plasma use local artwork and movement keeps stable actor identities", () => {
  const app = harness();
  app.view.play(app.cx);
  app.key("space");
  app.render();
  assert(app.state.nodes.some(node => node.asset?.includes("detonator-")));
  const player = app.node("player-0");
  assert(player.calls.some(call => call[0] === "transition" && call[1] === "left"));
  app.view.game.player = { x: 3, y: 3, facing: "down" };
  app.view.game.bombs[0].fuse = 1;
  app.advance();
  app.render();
  assert(app.state.nodes.some(node => node.asset?.includes("blast-h-")));
  assert(app.state.nodes.some(node => node.asset?.includes("blast-v-")));
});

test("player moves through floor but not through walls, coolant cells or charges", () => {
  const game = newGame();
  assert.equal(movePlayer(game, -1, 0), false);
  assert.equal(movePlayer(game, 1, 1), false);
  game.board[1][2] = "+";
  assert.equal(movePlayer(game, 1, 0), false);
  game.board[1][2] = ".";
  assert.equal(movePlayer(game, 1, 0), true);
  assert.equal(placeBomb(game), true);
  assert.equal(movePlayer(game, -1, 0), true);
  assert.equal(movePlayer(game, 1, 0), false);
});

test("a charge destroys a coolant cell and its blast stops there", () => {
  const game = newGame();
  game.enemies = [];
  game.board[1][2] = "+";
  game.board[1][3] = ".";
  assert.equal(placeBomb(game), true);
  tick(game, 1800);
  assert.equal(game.board[1][2], ".");
  assert.equal(game.flames.some(flame => flame.x === 2 && flame.y === 1), true);
  assert.equal(game.flames.some(flame => flame.x === 3 && flame.y === 1), false);
  assert.equal(game.score, 10);
});

test("a blast defeats enemies and awards points", () => {
  const game = newGame();
  game.enemies = [{ id: 0, hero: "stormtrooper", x: 3, y: 1 }];
  placeBomb(game);
  game.player = { x: 3, y: 3 };
  tick(game, 1800);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.status, "won");
  assert.equal(game.score, 350);
  assert.equal(game.xp, 115);
  tick(game, 1000);
  assert.equal(game.xp, 115, "Deck clear XP is awarded only once");
});

test("the player's own explosion ends the run", () => {
  const game = newGame();
  placeBomb(game);
  tick(game, 1800);
  assert.equal(game.status, "lost");
  assert.equal(game.reason, "blast");
});

test("pilot and enemies never repeat named characters, even across crowded waves", () => {
  const heroes = ["vader", "boba-fett", "emperor-palpatine", "luke", "leia", "mace-windu", "stormtrooper",
    "han", "chewbacca", "r2d2", "obi-wan", "yoda", "c3po", "padme", "ahsoka"];
  for (const hero of heroes) {
    for (let level = 1; level <= 20; level++) {
      const cast = [hero, ...enemyRoster(hero, 30, level)];
      const named = cast.filter(id => id !== "stormtrooper");
      assert.equal(new Set(named).size, named.length, `${hero} on deck ${level}`);
      assert(cast.every(id => heroes.includes(id)), "No missing sprites");
      const game = newGame({ hero, level });
      assert.equal(game.hero, hero);
      assert.deepEqual(game.enemies.map(enemy => enemy.hero), enemyRoster(hero, game.enemyTotal, level));
    }
  }
});

test("decks change their layout and roster, grow harder, and keep spawn points reachable", () => {
  const first = newGame({ hero: "vader" });
  const second = newGame({ hero: "vader", level: 2 });
  assert.notDeepEqual(first.board, second.board);
  assert.notDeepEqual(first.enemies.map(enemy => enemy.hero), second.enemies.map(enemy => enemy.hero));
  for (const level of [1, 2, 3, 5, 9, 20, 9999]) {
    const game = newGame({ level });
    assert(game.enemyTotal >= first.enemyTotal && game.enemyTotal <= 8);
    assert(game.enemyStepMs <= first.enemyStepMs && game.enemyStepMs >= 420);
    const visited = new Set(["1,1"]), queue = [{ x: 1, y: 1 }];
    for (let index = 0; index < queue.length; index++) {
      const point = queue[index];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = point.x + dx, y = point.y + dy, key = `${x},${y}`;
        if (game.board[y]?.[x] == null || game.board[y][x] === "#" || visited.has(key)) continue;
        visited.add(key); queue.push({ x, y });
      }
    }
    const spawns = new Set();
    for (const enemy of game.enemies) {
      const key = `${enemy.x},${enemy.y}`;
      assert(!spawns.has(key)); spawns.add(key);
      assert.equal(game.board[enemy.y][enemy.x], ".");
      assert(visited.has(key), "Spawn remains reachable after coolant is destroyed");
      assert(Math.abs(enemy.x - game.player.x) + Math.abs(enemy.y - game.player.y) >= 7);
    }
  }
});

test("next deck preserves pilot, XP, score and time but clears hazards and positions", () => {
  const game = newGame({ hero: "vader", xp: 600, score: 900, elapsed: 12345 });
  assert.equal(nextLevel(game), game, "Cannot skip a live deck");
  placeBomb(game);
  game.status = "won";
  game.flames.push({ x: 3, y: 3, until: 99999 });
  const next = nextLevel(game);
  assert.equal(next.level, 2);
  assert.equal(next.hero, "vader");
  assert.equal(next.xp, 600);
  assert.equal(next.score, 900);
  assert.equal(next.elapsed, 12345);
  assert.equal(next.player.x, 1);
  assert.equal(next.bombs.length, 0);
  assert.equal(next.flames.length, 0);
});

test("promotions upgrade real blast range and charge capacity with safe upper bounds", () => {
  const powers = [[0, 1], [200, 2], [600, 3], [1200, 5], [2200, 8]]
    .map(([xp, level]) => powerFor(newGame({ xp, level })));
  assert.deepEqual(powers.map(power => power.title), ["Cadet", "Scout", "Veteran", "Commander", "Legend"]);
  assert.deepEqual(powers.map(power => power.range), [2, 3, 3, 4, 5]);
  assert.deepEqual(powers.map(power => power.capacity), [1, 1, 2, 2, 3]);
  assert.equal(trainingFor(199).rank, 1);
  assert.equal(trainingFor(200).rank, 2);
  assert.equal(trainingFor(1e9).rank, 5);
  assert.equal(trainingFor(1e9).progress, 1);
  const game = newGame({ xp: 2200, level: 8 });
  game.board[1].fill(".", 1, WIDTH - 1);
  assert(placeBomb(game));
  assert.equal(placeBomb(game), false, "Do not stack charges on one tile");
  movePlayer(game, 1, 0); assert(placeBomb(game));
  movePlayer(game, 1, 0); assert(placeBomb(game));
  movePlayer(game, 1, 0); assert.equal(placeBomb(game), false, "Respect three-charge limit");
  assert(game.bombs.every(bomb => bomb.range === 5));
});

test("planted charges retain their tier and stronger charges really reach farther", () => {
  for (const [xp, range] of [[0, 2], [2200, 5]]) {
    const game = newGame({ xp, level: 8 });
    game.board[1].fill(".", 1, WIDTH - 1);
    placeBomb(game);
    game.xp = 2200;
    game.player = { x: 3, y: 3 };
    tick(game, 1800);
    assert(game.flames.some(flame => flame.x === 1 + range && flame.y === 1));
    assert(!game.flames.some(flame => flame.x === 2 + range && flame.y === 1));
  }
});

test("saved progress is per agent, survives retries and reopening, and unlocks the next deck", () => {
  const storage = new Map();
  const app = harness({ storage });
  app.view.play(app.cx);
  app.view.game.xp = 195;
  app.view.game.enemies = [{ id: 0, hero: "stormtrooper", x: 3, y: 1 }];
  placeBomb(app.view.game);
  app.view.game.player = { x: 3, y: 3 };
  app.view.game.bombs[0].fuse = 1;
  app.advance();
  assert.equal(app.view.game.status, "won");
  assert.equal(app.view.game.xp, 310);
  assert.deepEqual(JSON.parse(storage.get("pilot-progress")).first, { xp: 310, level: 2 });
  app.render();
  assert(app.node("bomb-run-start").kids.includes("Next deck"));
  app.click("bomb-run-start");
  assert.equal(app.view.game.level, 2);
  assert.equal(app.view.game.xp, 310);
  app.key("r");
  assert.equal(app.view.game.level, 2);
  assert.equal(app.view.game.xp, 310);
  app.render(); app.click("bomb-run-next-agent");
  assert.equal(app.view.game.level, 1);
  assert.equal(app.view.game.xp, 0);
  app.render(); app.click("bomb-run-prev-agent");
  assert.equal(app.view.game.level, 2);
  assert.equal(app.view.game.xp, 310);
  const reopened = harness({ storage });
  assert.equal(reopened.view.game.level, 2);
  assert.equal(reopened.view.game.xp, 310);
});

test("XP earned before defeat is retained when retrying the same deck", () => {
  const app = harness();
  app.view.play(app.cx);
  app.view.game.xp = 205;
  app.view.game.status = "lost";
  app.key("enter");
  assert.equal(app.view.game.status, "playing");
  assert.equal(app.view.game.level, 1);
  assert.equal(app.view.game.xp, 205);
  assert.equal(trainingFor(app.view.game.xp).title, "Scout");
  assert.equal(powerFor(app.view.game).range, 2, "Deck 1 does not unlock combat upgrades just by farming XP");
  assert.deepEqual(JSON.parse(app.state.storage.get("pilot-progress")).first, { xp: 205, level: 1 });
});

test("persistence merges other pilot saves and does not write every game tick", () => {
  const storage = new Map();
  const first = harness({ storage }), second = harness({ storage });
  second.view.selectAgent(1, second.cx);
  first.view.game.xp = 200; first.view.persist();
  second.view.game.xp = 650; second.view.persist();
  const saved = JSON.parse(storage.get("pilot-progress"));
  assert.equal(saved.first.xp, 200);
  assert.equal(saved.second.xp, 650);
  first.view.play(first.cx);
  first.advance(5);
  assert.equal(first.state.writes, 1, "Idle ticks do not flush storage");
});

test("expanding retains the selected pilot and resuming picks up saved XP", () => {
  const app = harness();
  app.view.selectAgent(1, app.cx);
  app.render(); app.click("bomb-run-expand");
  assert.equal(app.state.opened[0].props.pilot, "second");
  app.state.storage.set("pilot-progress", JSON.stringify({ second: { xp: 650, level: 2 } }));
  app.view.play(app.cx);
  assert.equal(app.view.game.xp, 650);
  assert.equal(powerFor(app.view.game).capacity, 1, "A stale open copy does not skip the displayed deck");
});

test("corrupt or invalid saved profiles cannot poison a new mission", () => {
  assert.deepEqual(normalizeProfile({ xp: -50, level: -3 }), { xp: 0, level: 1 });
  assert.deepEqual(normalizeProfile({ xp: Infinity, level: "oops" }), { xp: 0, level: 1 });
  assert.deepEqual(normalizeProfile({ xp: 1e20, level: 1e20 }), { xp: 1e9, level: 9999 });
  for (const raw of ["{broken", "[]", "null", '{"first":{"xp":"nope","level":-100}}']) {
    const app = harness({ storage: new Map([["pilot-progress", raw]]) });
    assert.equal(app.view.game.level, 1);
    assert.equal(app.view.game.xp, 0);
  }
});

test("a cast change cannot create a duplicate while a mission is already running", () => {
  const app = harness();
  app.view.play(app.cx);
  app.state.cast.first = app.view.game.enemies[1].hero;
  app.render();
  assert.equal(app.view.game.hero, "mace-windu", "In-flight pilot is stable");
  app.key("r"); app.key("enter");
  assert.equal(app.view.game.hero, app.state.cast.first);
  assert(!app.view.game.enemies.some(enemy => enemy.hero === app.view.game.hero));
});

test("eight deck identities have different architecture, collision maps and local props", () => {
  assert.equal(DECKS.length, 8);
  assert.equal(new Set(DECKS.map(deck => deck.layout.join(""))).size, 8);
  assert.equal(new Set(DECKS.map(deck => deck.prop)).size, 8);
  assert.equal(new Set(DECKS.map(deck => read(`mods/star-wars-bomb-run/art/deck-${deck.id}.svg`))).size, 8);
  for (let index = 0; index < DECKS.length; index++) {
    const deck = deckFor(index + 1);
    assert.equal(deck.layout.length, HEIGHT);
    assert(deck.layout.every(row => row.length === WIDTH));
    const app = harness({ storage: new Map([["pilot-progress", JSON.stringify({ first: { xp: 0, level: index + 1 } })]]) });
    app.render();
    assert(app.state.nodes.some(node => node.asset?.endsWith(`deck-${deck.id}.svg`)));
    assert(app.state.nodes.some(node => node.asset?.endsWith(`${deck.prop}.svg`)));
    for (const node of app.state.nodes.filter(node => node.asset)) assert(existsSync(resolve(root, node.asset)), node.asset);
    const game = app.view.game;
    assert(!Object.hasOwn(game, "pickups"), "No free floor buffs");
    const seen = new Set(["1,1"]), queue = [{ x: 1, y: 1 }];
    for (const point of queue) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = point.x + dx, y = point.y + dy, key = `${x},${y}`;
      if (game.board[y]?.[x] == null || game.board[y][x] === "#" || seen.has(key)) continue;
      seen.add(key); queue.push({ x, y });
    }
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      if (game.board[y][x] !== "#") assert(seen.has(`${x},${y}`), `${deck.id}: sealed pocket at ${x},${y}`);
    }
  }
  assert.equal(deckFor(9).id, deckFor(1).id, "Later sectors cycle themes, not just one scene");
});

test("upgrades require BOTH deck progression and XP, and cannot be stacked from legacy loot", () => {
  for (const [id, upgrade] of Object.entries(BUFFS)) {
    assert.equal(powerFor(newGame({ level: upgrade.level, xp: upgrade.xp - 1 })).unlocks[id], false, id);
    assert.equal(powerFor(newGame({ level: upgrade.level - 1, xp: upgrade.xp })).unlocks[id], false, id);
    assert.equal(powerFor(newGame({ level: upgrade.level, xp: upgrade.xp })).unlocks[id], true, id);
  }
  const early = newGame({ xp: 1e9, level: 1, buffs: { range: 999, nova: 1, echo: 1, rack: 999, speed: 2 } });
  assert.equal(powerFor(early).range, 2);
  assert.equal(powerFor(early).capacity, 1);
  assert.equal(powerFor(early).stepMs, 160);
  assert.equal(powerFor(early).wide, false);
  assert.equal(powerFor(early).echo, false);
  const late = newGame({ xp: 1e9, level: 9999 });
  const power = powerFor(late);
  assert.equal(power.range, 5);
  assert.equal(power.capacity, 3);
  assert.equal(power.stepMs, 120);
  assert.equal(power.wide, false, "Special payloads must be selected");
  assert.equal(power.echo, false);
});

test("coolant awards XP without dropping loot; walking cannot grant free upgrades", () => {
  const game = newGame();
  const before = powerFor(game);
  movePlayer(game, 1, 0); movePlayer(game, 1, 0);
  assert.deepEqual(powerFor(game), before);
  game.player = { x: 1, y: 1 };
  game.board[5][3] = "+";
  game.bombs = [{ x: 3, y: 3, range: 2, fuse: 1 }];
  tick(game, 1);
  assert.equal(game.board[5][3], ".");
  assert(game.xp >= 5);
  assert(!Object.hasOwn(game, "pickups"));
  assert(!Object.hasOwn(game, "buffs"));
  assert.equal(powerFor(game).range, 2);
});

test("deck clears and XP milestones unlock upgrades without losing them on retry", () => {
  const game = newGame({ level: 1, xp: 200 });
  assert.equal(powerFor(game).unlocks.range, false);
  game.status = "won";
  const next = nextLevel(game);
  assert.equal(powerFor(next).unlocks.range, true);
  assert.match(next.notice.message, /Blast extender unlocked/);
  const app = harness({ storage: new Map([["pilot-progress", JSON.stringify({ first: { xp: 650, level: 3 } })]]) });
  assert.equal(powerFor(app.view.game).capacity, 2);
  app.view.game.echoes = [{ x: 1, y: 1, fuse: 100 }];
  app.view.game.status = "lost";
  app.view.play(app.cx);
  assert.equal(app.view.game.xp, 650);
  assert.equal(app.view.game.level, 3);
  assert.equal(powerFor(app.view.game).capacity, 2);
  assert.equal(app.view.game.echoes.length, 0);
});

test("Nova makes three-tile-wide lanes, but cannot blast through solid consoles or intact cells", () => {
  const game = newGame();
  for (let y = 1; y < HEIGHT - 1; y++) game.board[y].fill(".", 1, WIDTH - 1);
  const normal = blastCells(game, { x: 5, y: 5, range: 2 });
  const nova = blastCells(game, { x: 5, y: 5, range: 2, wide: true });
  assert(nova.length > normal.length);
  assert(nova.some(cell => cell.x === 4 && cell.y === 3));
  assert(nova.some(cell => cell.x === 6 && cell.y === 3));
  game.board[5][6] = "#";
  game.board[4][5] = "+";
  const blocked = blastCells(game, { x: 5, y: 5, range: 2, wide: true });
  assert(!blocked.some(cell => cell.x === 6 && cell.y === 5));
  assert(!blocked.some(cell => cell.x === 7 && cell.y === 5));
  assert(!blocked.some(cell => cell.x === 5 && cell.y === 3));
  game.board[5][6] = ".";
  game.board[4][5] = ".";
  game.board[4][6] = "#";
  const sideWall = blastCells(game, { x: 5, y: 5, range: 3, wide: true });
  assert(!sideWall.some(cell => cell.x === 6 && cell.y === 3), "Nova side lanes cannot reappear behind cover");
});

test("Echo detonates exactly twice, warns during the delay and postpones victory until the second pulse", () => {
  const game = newGame({ xp: 2400, level: 8, payload: "echo" });
  game.board[1].fill(".", 1, WIDTH - 1);
  for (let y = 1; y < HEIGHT - 1; y++) game.board[y][1] = ".";
  game.enemies = [{ id: 0, hero: "stormtrooper", x: 3, y: 1 }];
  assert(placeBomb(game));
  game.bombs[0].fuse = 1;
  game.player = { x: 3, y: 3 };
  tick(game, 1);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.echoes.length, 1);
  assert.equal(game.status, "playing");
  tick(game, 700);
  assert.equal(game.flames.length, 0, "A short safe gap separates the pulses");
  assert.equal(game.echoes[0].fuse, 300);
  tick(game, 300);
  assert(game.flames.some(flame => flame.x === 1 && flame.y === 1));
  assert.equal(game.echoes.length, 0, "No recursive echo");
  assert.equal(game.status, "won");
  assert.equal(game.xp, 2515, "Kills and deck rewards are not duplicated by Echo");
});

test("the echo warning is visually distinct from loot and stops pulsing while paused", () => {
  const app = harness();
  app.view.play(app.cx);
  app.view.game.echoes = [{ x: 1, y: 1, fuse: 500 }];
  app.render();
  assert(app.state.nodes.some(node => node.asset?.endsWith("echo-beacon.svg")));
  assert(app.node("bomb-run-notice").kids.includes("Echo blast incoming — stay clear"));
  assert(app.node("echo-1-1").calls.some(call => call[0] === "loop"));
  app.view.pause(app.cx); app.render();
  assert(!app.node("echo-1-1").calls.some(call => call[0] === "loop"));
});

test("an echo can trigger an ordinary charge without creating recursive pulses", () => {
  const game = newGame();
  game.player = { x: 3, y: 3 };
  game.echoes = [{ x: 1, y: 1, range: 2, fuse: 1, echo: false }];
  game.bombs = [{ x: 2, y: 1, range: 2, fuse: 9999, echo: false }];
  tick(game, 1);
  assert.equal(game.bombs.length, 0);
  assert.equal(game.echoes.length, 0);
  assert(game.flames.some(flame => flame.x === 4 && flame.y === 1));
});

test("Q plants N charges in the facing direction, respecting capacity and obstacles", () => {
  const game = newGame({ xp: 2200, level: 8 });
  game.player.facing = "right";
  game.board[1][4] = "+";
  assert.equal(placeLine(game), 3);
  assert.deepEqual(game.bombs.map(bomb => [bomb.x, bomb.y]), [[1, 1], [2, 1], [3, 1]]);
  assert.equal(game.player.x, 1);
  assert.equal(placeLine(game), 0, "Cannot overlap a charge");
  const empty = newGame({ xp: 2200 });
  assert.equal(placeLine(empty), 0, "Line launcher requires the deck milestone too");
  const app = harness();
  app.view.game = newGame({ xp: 2200, level: 8, hero: "mace-windu" });
  app.view.game.player.facing = "right";
  app.view.play(app.cx); app.key("q");
  assert.equal(app.view.game.bombs.length, 3);
  app.key("p");
  app.view.game.bombs = [];
  app.key("q");
  assert.equal(app.view.game.bombs.length, 0, "Pause blocks launching");
});

test("Sprint milestone changes real held-key cadence and native movement to exactly 120 ms", () => {
  const app = harness();
  app.view.game = newGame({ xp: 1800, level: 7, hero: "mace-windu" });
  app.view.play(app.cx); app.key("right");
  assert.equal(app.view.game.player.moveMs, 120);
  app.advanceMs(80);
  assert.equal(app.view.game.player.x, 2);
  app.advanceMs(40);
  assert.equal(app.view.game.player.x, 3);
  app.render();
  assert.equal(app.node("player-0").calls.find(call => call[0] === "transition")[2].duration, 120);
});

test("Nova and Echo are mutually exclusive payload choices, never an OP combined stack", () => {
  const locked = newGame({ xp: 1e9, level: 1, payload: "nova" });
  assert.equal(powerFor(locked).wide, false);
  assert.equal(cyclePayload(locked), false);
  const game = newGame({ xp: 2400, level: 8 });
  assert.equal(cyclePayload(game), true);
  assert.equal(game.payload, "nova");
  assert.equal(powerFor(game).wide, true);
  assert.equal(powerFor(game).echo, false);
  placeBomb(game);
  assert.equal(game.bombs[0].wide, true);
  assert.equal(game.bombs[0].echo, false);
  cyclePayload(game);
  assert.equal(game.payload, "echo");
  assert.equal(powerFor(game).wide, false);
  assert.equal(powerFor(game).echo, true);
  assert.equal(game.bombs[0].wide, true, "Changing loadout cannot change an already planted charge");
  cyclePayload(game);
  assert.equal(powerFor(game).payload, "standard");
});

test("Thinking only defaults off, so idle agents do not restrict normal training", () => {
  const app = harness();
  app.state.agents[0].status = "idle";
  assert.equal(app.view.thinkingOnly, false);
  app.key("enter"); app.key("space"); app.key("right");
  app.advance();
  assert.equal(app.view.started, true);
  assert.equal(app.view.game.elapsed, 80);
  assert.equal(app.view.game.player.x, 2);
  assert.equal(app.view.game.bombs.length, 1);
});

test("Thinking only freezes the entire game and guards keyboard, buttons and controller entry points", () => {
  const app = harness();
  app.view.game = newGame({ level: 8, xp: 2400, hero: "mace-windu" });
  app.view.play(app.cx); app.key("space"); app.key("right");
  app.view.nextMove = 0;
  app.view.game.echoes = [{ x: 11, y: 9, range: 2, fuse: 500 }];
  app.state.agents[0].status = "idle";
  app.render(); app.click("bomb-run-thinking-only");
  const before = JSON.stringify(app.view.game);
  app.key("right"); app.key("space"); app.key("q"); app.key("e"); app.key("enter");
  app.view.walk(1, 0, app.cx); app.view.drop(app.cx); app.view.launch(app.cx); app.view.choosePayload(app.cx); app.view.play(app.cx);
  app.advance(20);
  assert.equal(JSON.stringify(app.view.game), before, "No fuses, patrols, XP, positions or time advance");
  assert.equal(app.view.held, null);
  app.render();
  assert(app.node("bomb-run-start").kids.includes("Waiting for agent"));
  assert(app.node("bomb-run-start").calls.some(call => call[0] === "disabled" && call[1] === true));
  assert(app.node("bomb-run-thinking-only").calls.some(call => call[0] === "checked" && call[1] === true));
  assert(!app.node("echo-11-9").calls.some(call => call[0] === "loop"), "No hazard pulses while waiting");
  app.view.game.status = "won";
  app.key("enter");
  assert.equal(app.view.game.level, 8, "Idle cannot skip to the next deck either");
});

test("working status resumes a gated run without resetting it or replaying held keys", () => {
  const app = harness({ storage: new Map([["thinking-only", "true"]]) });
  app.key("enter"); app.key("space"); app.key("right");
  const game = app.view.game;
  app.state.agents[0].status = "idle";
  app.advance(5);
  assert.equal(game.elapsed, 0);
  assert.equal(game.bombs[0].fuse, 1800);
  assert.equal(app.view.held, null);
  app.state.agents[0].status = "working";
  app.advance();
  assert.equal(app.view.game, game);
  assert.equal(game.elapsed, 80);
  assert.equal(game.bombs[0].fuse, 1720);
  assert.equal(game.player.x, 2, "Old held movement is not replayed");
});

test("Thinking only follows the selected agent, not another working agent, and blocks disconnected pilots", () => {
  const app = harness({ storage: new Map([["thinking-only", "true"]]) });
  app.state.agents[1].status = "working";
  for (const status of ["idle", "done", "blocked", "error", undefined]) {
    app.state.agents[0].status = status;
    app.key("enter"); app.advance();
    assert.equal(app.view.started, false, `Cannot start for ${status}`);
    assert.equal(app.view.game.elapsed, 0);
  }
  app.state.agents = app.state.agents.slice(1);
  app.key("enter");
  assert.equal(app.view.started, false, "Cannot silently adopt another working agent");
  app.view.selectAgent(1, app.cx);
  app.key("enter"); app.advance();
  assert.equal(app.view.selectedAddress, "second");
  assert.equal(app.view.game.elapsed, 80);
});

test("agent gating never overrides a manual pause or starts a mission by itself", () => {
  const app = harness({ storage: new Map([["thinking-only", "true"]]) });
  app.state.agents[0].status = "idle"; app.advance();
  app.state.agents[0].status = "working"; app.advance();
  assert.equal(app.view.started, false);
  app.key("enter"); app.key("p");
  app.state.agents[0].status = "idle"; app.advance(); app.key("enter");
  assert.equal(app.view.paused, true);
  app.state.agents[0].status = "working"; app.advance();
  assert.equal(app.view.paused, true);
  assert.equal(app.view.game.elapsed, 0);
  app.key("enter"); app.advance();
  assert.equal(app.view.game.elapsed, 80);
});

test("the toggle persists independently of pilot progress and Off allows idle training again", () => {
  const progress = JSON.stringify({ first: { xp: 650, level: 3 } });
  const storage = new Map([["pilot-progress", progress]]);
  const app = harness({ storage });
  app.render(); app.click("bomb-run-thinking-only");
  assert.equal(storage.get("thinking-only"), "true");
  assert.equal(storage.get("pilot-progress"), progress);
  const reopened = harness({ storage });
  assert.equal(reopened.view.thinkingOnly, true);
  reopened.state.agents[0].status = "idle";
  reopened.key("enter");
  assert.equal(reopened.view.started, false);
  reopened.view.toggleThinking(reopened.cx);
  assert.equal(storage.get("thinking-only"), "false");
  reopened.key("enter"); reopened.advance();
  assert.equal(reopened.view.game.elapsed, 80);
  assert.equal(reopened.view.game.xp, 650);
  assert.equal(reopened.view.game.level, 3);
});

test("Herdr checks do not read/write the setting or saved progress", () => {
  const app = harness({ checkingRun: true, storage: new Map([["thinking-only", "true"]]) });
  assert.equal(app.state.reads, 0);
  assert.equal(app.state.writes, 0);
  assert.equal(app.view.thinkingOnly, false);
  assert.equal(app.state.timers.length, 0);
  app.view.toggleThinking(app.cx); app.view.persist();
  assert.equal(app.state.reads, 0);
  assert.equal(app.state.writes, 0);
});

test("compact chrome reserves only 132 px for toolbar, HUD, pilot and command rail", () => {
  const app = harness(); app.render();
  const height = id => app.node(id).calls.find(call => call[0] === "h")[1];
  assert.equal(height("bomb-run-toolbar"), 36);
  assert.equal(height("bomb-run-hud"), 26);
  assert.equal(height("bomb-run-pilot"), 40);
  assert.equal(height("bomb-run-control-rail"), 30);
  assert(!app.node("bomb-run-options-panel"));
  assert(!app.node("bomb-run-restart"), "Secondary controls stay in options");
  assert(!app.node("bomb-run-dpad"), "No permanent button grid");
  assert(!app.node("buff-status-range"), "No permanent upgrades dashboard");
  assert(!app.node("bomb-run-line"), "Locked commands are not shown");
});

test("options pause safely, close with Escape first, and Resume dismisses the drawer", () => {
  const app = harness(); app.key("enter"); app.key("right"); app.render();
  app.click("bomb-run-options"); app.render();
  assert(app.node("bomb-run-options-panel"));
  assert(app.node("bomb-run-restart"));
  assert(app.node("buff-status-range"));
  assert.equal(app.view.paused, true);
  assert.equal(app.view.held, null);
  app.advance(4);
  assert.equal(app.view.game.elapsed, 0);
  app.key("escape"); app.render();
  assert(!app.node("bomb-run-options-panel"));
  assert.equal(app.state.commands.length, 0, "Escape should not hide the whole game from options");
  assert.equal(app.view.paused, true, "Closing options cannot unexpectedly resume the action");
  app.click("bomb-run-options"); app.render();
  app.click("bomb-run-pause"); app.render();
  assert(!app.node("bomb-run-options-panel"));
  app.advance();
  assert.equal(app.view.game.elapsed, 80);
});

test("the header link switch and descriptive options switch control the same setting", () => {
  const app = harness(); app.render(); app.click("bomb-run-options"); app.render();
  app.click("bomb-run-thinking-details"); app.render();
  assert.equal(app.view.thinkingOnly, true);
  assert(app.node("bomb-run-thinking-only").calls.some(call => call[0] === "checked" && call[1] === true));
  app.click("bomb-run-thinking-only"); app.render();
  assert.equal(app.view.thinkingOnly, false);
  assert(app.node("bomb-run-thinking-details").calls.some(call => call[0] === "checked" && call[1] === false));
});

test("optional on-screen controls retain movement and obey agent gating", () => {
  const app = harness(); app.render(); app.click("bomb-run-options"); app.render();
  app.click("bomb-run-touch-controls"); app.render();
  assert(app.node("bomb-run-dpad"));
  assert(!app.node("bomb-run-options-panel"));
  app.key("enter"); app.render(); app.click("bomb-run-right");
  assert.equal(app.view.game.player.x, 2);
  app.state.agents[0].status = "idle";
  app.click("bomb-run-thinking-only"); app.advance(); app.render();
  app.view.nextMove = 0;
  app.click("bomb-run-right");
  assert.equal(app.view.game.player.x, 2);
  assert(app.node("bomb-run-right").calls.some(call => call[0] === "disabled" && call[1] === true));
});

test("end-state ribbons are compact and sit below the action, not in a giant centered modal", () => {
  const app = harness();
  for (const status of ["playing", "lost", "won"]) {
    app.view.game.status = status;
    app.view.started = status !== "playing";
    app.render();
    const card = app.node("bomb-run-state-card");
    assert(card.calls.some(call => call[0] === "bottom" && call[1] >= 10));
    assert.equal(card.kids.length, 3, "Only a bitmap heading, one-line message and action row");
    assert(card.kids[1].calls.some(call => call[0] === "truncate"));
  }
});

test("frame sizing includes compact HUD/pilot overhead at the active Herdr zoom", () => {
  const app = harness(); app.render();
  for (const [width, height] of [[256, 300], [344, 500], [600, 650]]) {
    app.handler("bomb-run-viewport", "on_size_change")({ width: width * 1.2, height: height * 1.2 }, app.cx);
    assert(app.view.tileSize * WIDTH <= width);
    assert(app.view.tileSize * (HEIGHT + 3) + 66 <= height);
    app.render();
  }
});

test("a visible X always closes the panel or overlay, independently of mission state", () => {
  for (const overlay of [false, true]) for (const status of ["playing", "lost", "won"]) {
    const app = harness({ overlay });
    app.view.started = true;
    app.view.game.status = status;
    app.render();
    assert(app.node("bomb-run-close"));
    app.click("bomb-run-close");
    if (overlay) {
      assert.deepEqual(app.state.closed, ["game-overlay"]);
      assert.equal(app.state.commands.length, 0);
      assert(!app.node("bomb-run-expand"));
    } else {
      assert.deepEqual(app.state.commands, [["layout.hide", { id: "panel" }]]);
      assert(app.node("bomb-run-expand"), "Expand and Close remain separate controls");
      assert.equal(app.state.opened.length, 0);
    }
  }
  const app = harness();
  app.view.optionsOpen = true;
  app.view.thinkingOnly = true;
  app.state.agents[0].status = "idle";
  app.render(); app.click("bomb-run-close");
  assert.deepEqual(app.state.commands, [["layout.hide", { id: "panel" }]]);
});

test("charges chain when one blast reaches another", () => {
  const game = newGame();
  game.enemies = [{ id: 0, hero: "stormtrooper", x: 5, y: 1 }];
  game.bombs = [{ x: 1, y: 1, fuse: 1 }, { x: 3, y: 1, fuse: 10000 }];
  tick(game, 1);
  assert.equal(game.bombs.length, 0);
  assert(game.flames.some(flame => flame.x === 3 && flame.y === 1));
});
