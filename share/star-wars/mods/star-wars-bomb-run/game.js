import { DECKS } from "./decks.js";

export const WIDTH = 13;
export const HEIGHT = 11;
export const STEP_MS = 160;
export const TICK_MS = 40;
const FUSE_MS = 1800;
const FLAME_MS = 700;
const ECHO_MS = 1000;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const SPAWNS = [
  { x: 11, y: 9 }, { x: 11, y: 1 }, { x: 1, y: 9 }, { x: 9, y: 9 },
  { x: 9, y: 1 }, { x: 11, y: 7 }, { x: 3, y: 9 }, { x: 7, y: 9 },
];
const HOSTILES = [
  "stormtrooper", "boba-fett", "vader", "emperor-palpatine", "chewbacca", "ahsoka", "han",
  "obi-wan", "luke", "leia", "yoda", "mace-windu", "padme", "r2d2", "c3po",
];
const RANKS = [
  { xp: 0, title: "Cadet" }, { xp: 200, title: "Scout" }, { xp: 600, title: "Veteran" },
  { xp: 1200, title: "Commander" }, { xp: 2200, title: "Legend" },
];
export const BUFFS = {
  range: { name: "Blast extender", short: "Range", level: 2, xp: 200, color: "#f2bd66", hint: "Reach grows to 3 tiles; 4 at deck 5 / 1200 XP, 5 at deck 8 / 2200 XP." },
  nova: { name: "Nova payload", short: "Nova", level: 6, xp: 1400, color: "#ef9678", hint: "Optional wide blast. Choose with E; cannot combine with Echo." },
  echo: { name: "Echo charge", short: "Echo", level: 8, xp: 2400, color: "#c2b0ef", hint: "Optional second pulse after 1 second. Choose with E; cannot combine with Nova." },
  rack: { name: "Extra magazine", short: "Rack", level: 3, xp: 600, color: "#9ccc8e", hint: "2 active charges; 3 at deck 8 / 2200 XP. No stacking." },
  line: { name: "Line launcher", short: "Line", level: 5, xp: 900, color: "#78ced1", hint: "Q plants a facing row using your existing charge capacity." },
  speed: { name: "Sprint boots", short: "Speed", level: 7, xp: 1800, color: "#8fbaf2", hint: "One speed upgrade: 160 to 120 ms per tile (1.33×)." },
};

export function normalizeProfile(value) {
  return {
    xp: Number.isFinite(value?.xp) ? Math.min(1e9, Math.max(0, Math.floor(value.xp))) : 0,
    level: Number.isFinite(value?.level) ? Math.min(9999, Math.max(1, Math.floor(value.level))) : 1,
  };
}

export function trainingFor(xp) {
  xp = normalizeProfile({ xp }).xp;
  let index = 0;
  while (index + 1 < RANKS.length && xp >= RANKS[index + 1].xp) index++;
  const nextXP = RANKS[index + 1]?.xp ?? null;
  return {
    rank: index + 1, title: RANKS[index].title, xp, nextXP,
    progress: nextXP == null ? 1 : (xp - RANKS[index].xp) / (nextXP - RANKS[index].xp),
  };
}

export function powerFor(game) {
  const rank = trainingFor(game.xp);
  const level = normalizeProfile(game).level;
  const unlocks = Object.fromEntries(Object.entries(BUFFS).map(([id, buff]) => [id, level >= buff.level && rank.xp >= buff.xp]));
  const advanced = level >= 5 && rank.xp >= 1200;
  const elite = level >= 8 && rank.xp >= 2200;
  const payload = (game.payload === "nova" && unlocks.nova) || (game.payload === "echo" && unlocks.echo) ? game.payload : "standard";
  return {
    ...rank, unlocks, payload, range: 2 + Number(unlocks.range) + Number(advanced) + Number(elite),
    capacity: 1 + Number(unlocks.rack) + Number(elite), wide: payload === "nova", echo: payload === "echo",
    line: unlocks.line, stepMs: unlocks.speed ? 120 : STEP_MS,
  };
}

export function cyclePayload(game) {
  if (game.status !== "playing") return false;
  const power = powerFor(game);
  const choices = ["standard", ...["nova", "echo"].filter(id => power.unlocks[id])];
  if (choices.length === 1) return false;
  game.payload = choices[(choices.indexOf(power.payload) + 1) % choices.length];
  game.notice = { message: `${game.payload[0].toUpperCase()}${game.payload.slice(1)} payload selected`, until: game.elapsed + 2000 };
  return true;
}

function upgradeNotice(game, before) {
  const power = powerFor(game);
  const unlocked = Object.keys(BUFFS).find(id => power.unlocks[id] && !before.unlocks[id]);
  const message = unlocked ? `${BUFFS[unlocked].name} unlocked` : power.range > before.range || power.capacity > before.capacity
    ? "Charge strength upgraded" : power.rank > before.rank ? `Promoted to ${power.title}` : null;
  if (message) game.notice = { message, until: game.elapsed + 2400 };
}

export function deckFor(level) {
  return DECKS[(normalizeProfile({ level }).level - 1) % DECKS.length];
}

// The pilot counts toward uniqueness. Only unnamed Stormtroopers may repeat.
export function enemyRoster(hero, count, level = 1) {
  const offset = (normalizeProfile({ level }).level - 1) * 3 % HOSTILES.length;
  const candidates = HOSTILES.map((_, index) => HOSTILES[(index + offset) % HOSTILES.length])
    .filter(candidate => candidate !== hero || candidate === "stormtrooper");
  return Array.from({ length: count }, (_, index) => candidates[index] ?? "stormtrooper");
}

const inside = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const same = (a, b) => a.x === b.x && a.y === b.y;
const onFlame = (game, point) => game.flames.some(flame => same(flame, point) && flame.until > game.elapsed);

export function newGame(options = {}) {
  const { level, xp } = normalizeProfile(options);
  const deck = deckFor(level);
  const hero = HOSTILES.includes(options.hero) ? options.hero : "luke";
  const enemyTotal = Math.min(SPAWNS.length, 4 + Math.floor((level - 1) / 2));
  const roster = enemyRoster(hero, enemyTotal, level);
  const spawns = SPAWNS.slice(0, enemyTotal);
  const elapsed = options.elapsed ?? 0;
  const board = deck.layout.map((row, y) => [...row].map((kind, x) => {
    if (kind === "#") return kind;
    const safeCorner = (x <= 3 && y <= 3) || (x >= 8 && y <= 3) || (x <= 3 && y >= 7) || (x >= 8 && y >= 7);
    const safeSpawn = spawns.some(point => Math.abs(point.x - x) + Math.abs(point.y - y) <= 1);
    const density = Math.min(7, 4 + Math.floor((level - 1) / 4));
    return !safeCorner && !safeSpawn && (x * 17 + y * 31 + x * y * 7 + (level - 1) * 19) % 11 < density ? "+" : ".";
  }));
  return {
    board, hero, level, xp, enemyTotal, payload: options.payload ?? "standard",
    enemyStepMs: Math.max(420, 900 - (level - 1) * 60),
    player: { x: 1, y: 1, facing: "down", moving: false, movedAt: elapsed - STEP_MS, step: 0, moveMs: STEP_MS },
    enemies: spawns.map((enemy, index) => ({ ...enemy, hero: roster[index], id: index, facing: "down", moving: false, movedAt: elapsed - STEP_MS, step: 0 })),
    bombs: [], flames: [], echoes: [], notice: null,
    status: "playing", reason: null, score: options.score ?? 0, elapsed, enemyClock: 0, enemyStep: 0,
  };
}

export function nextLevel(game) {
  if (game.status !== "won") return game;
  const next = newGame({ hero: game.hero, level: game.level + 1, xp: game.xp, score: game.score, elapsed: game.elapsed, payload: game.payload });
  upgradeNotice(next, powerFor(game));
  return next;
}

export function movePlayer(game, dx, dy) {
  if (game.status !== "playing" || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const next = { x: game.player.x + dx, y: game.player.y + dy };
  if (!inside(next.x, next.y) || game.board[next.y][next.x] !== ".") return false;
  if (game.bombs.some(bomb => same(bomb, next)) || game.enemies.some(enemy => same(enemy, next))) return false;
  game.player = {
    ...game.player, ...next, facing: dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down",
    moving: true, movedAt: game.elapsed, step: (game.player.step ?? 0) + 1, moveMs: powerFor(game).stepMs,
  };
  if (onFlame(game, next)) { game.status = "lost"; game.reason = "blast"; }
  return true;
}

function plant(game, point, power) {
  if (!inside(point.x, point.y) || game.board[point.y][point.x] !== "." || onFlame(game, point)
    || game.bombs.some(bomb => same(bomb, point)) || game.enemies.some(enemy => same(enemy, point))) return false;
  game.bombs.push({ x: point.x, y: point.y, fuse: FUSE_MS, range: power.range, wide: power.wide, echo: power.echo });
  return true;
}

export function placeBomb(game) {
  const power = powerFor(game);
  return game.status === "playing" && game.bombs.length < power.capacity && plant(game, game.player, power);
}

export function placeLine(game) {
  const power = powerFor(game);
  if (game.status !== "playing" || !power.line) return 0;
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[game.player.facing] ?? [0, 1];
  const count = power.capacity - game.bombs.length;
  let planted = 0;
  for (let distance = 0; distance < count; distance++) {
    if (!plant(game, { x: game.player.x + distance * dx, y: game.player.y + distance * dy }, power)) break;
    planted++;
  }
  return planted;
}

// Compute against the intact board so a Nova cannot tunnel through a wall/cell
// it destroys earlier in the very same pulse.
export function blastCells(game, bomb) {
  const cells = new Map();
  const add = (x, y) => {
    if (!inside(x, y) || game.board[y][x] === "#") return;
    cells.set(`${x},${y}`, { x, y });
  };
  add(bomb.x, bomb.y);
  for (const [dx, dy] of DIRECTIONS) {
    const sideBlocked = [-1, 1].map(side => {
      const x = bomb.x - dy * side, y = bomb.y + dx * side;
      return !inside(x, y) || game.board[y][x] !== ".";
    });
    for (let distance = 1; distance <= (bomb.range ?? 2); distance++) {
      const x = bomb.x + dx * distance, y = bomb.y + dy * distance;
      if (!inside(x, y) || game.board[y][x] === "#") break;
      add(x, y);
      if (game.board[y][x] === "+") break;
      if (!bomb.wide) continue;
      for (const [index, side] of [-1, 1].entries()) {
        if (sideBlocked[index]) continue;
        const sx = x - dy * side, sy = y + dx * side;
        add(sx, sy);
        sideBlocked[index] = !inside(sx, sy) || game.board[sy][sx] !== ".";
      }
    }
  }
  return [...cells.values()];
}

function blast(game, bomb) {
  for (const { x, y } of blastCells(game, bomb)) {
    const existing = game.flames.find(flame => flame.x === x && flame.y === y);
    if (existing) {
      existing.until = Math.max(existing.until, game.elapsed + FLAME_MS);
      existing.wide ||= Boolean(bomb.wide);
    } else game.flames.push({ x, y, until: game.elapsed + FLAME_MS, wide: Boolean(bomb.wide) });
    if (game.board[y][x] !== "+") continue;
    game.board[y][x] = ".";
    game.score += 10;
    game.xp += 5;
  }
  if (bomb.echo) game.echoes.push({ ...bomb, echo: false, fuse: ECHO_MS });
}

function resolveFlames(game) {
  game.enemies = game.enemies.filter(enemy => {
    if (!onFlame(game, enemy)) return true;
    game.score += 100;
    game.xp += 40;
    return false;
  });
  if (onFlame(game, game.player)) { game.status = "lost"; game.reason = "blast"; }
  else if (!game.enemies.length && !game.echoes.length && !game.bombs.length) {
    game.status = "won";
    game.score += 250;
    game.xp += 75;
  }
}

function moveEnemies(game) {
  game.enemyStep++;
  for (const enemy of game.enemies) {
    const directions = DIRECTIONS.map((_, index) => DIRECTIONS[(index + game.enemyStep + enemy.id) % DIRECTIONS.length]);
    for (const [dx, dy] of directions) {
      const next = { x: enemy.x + dx, y: enemy.y + dy };
      if (!inside(next.x, next.y) || game.board[next.y][next.x] !== ".") continue;
      if (game.bombs.some(bomb => same(bomb, next)) || game.enemies.some(other => other !== enemy && same(other, next))) continue;
      if (onFlame(game, next)) continue;
      if (same(next, game.player)) { game.status = "lost"; game.reason = "contact"; return; }
      Object.assign(enemy, next, {
        facing: dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down",
        moving: true, movedAt: game.elapsed, step: (enemy.step ?? 0) + 1,
      });
      break;
    }
  }
}

export function tick(game, delta = TICK_MS) {
  if (game.status !== "playing") return;
  const before = powerFor(game);
  delta = Math.max(0, delta);
  game.elapsed += delta;
  for (const actor of [game.player, ...game.enemies]) actor.moving = game.elapsed - actor.movedAt < (actor.moveMs ?? STEP_MS);
  game.flames = game.flames.filter(flame => flame.until > game.elapsed);
  for (const bomb of game.bombs) bomb.fuse -= delta;
  for (const echo of game.echoes) echo.fuse -= delta;
  const echoes = game.echoes.filter(echo => echo.fuse <= 0);
  game.echoes = game.echoes.filter(echo => echo.fuse > 0);
  for (const echo of echoes) blast(game, echo);
  // Resolve chain reactions, but an echo pulse always waits out its own timer.
  while (true) {
    const ready = game.bombs.filter(bomb => bomb.fuse <= 0 || onFlame(game, bomb));
    if (!ready.length) break;
    game.bombs = game.bombs.filter(bomb => !ready.includes(bomb));
    for (const bomb of ready) blast(game, bomb);
  }
  resolveFlames(game);
  upgradeNotice(game, before);
  if (game.status !== "playing") return;
  game.enemyClock += delta;
  while (game.enemyClock >= game.enemyStepMs && game.status === "playing") {
    game.enemyClock -= game.enemyStepMs;
    moveEnemies(game);
  }
}
