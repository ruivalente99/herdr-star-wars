import { DEFAULT_CONFIG } from "./config.js";

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

export const BUFFS = DEFAULT_CONFIG.buffs;

export function normalizeProfile(value) {
  return {
    xp: Number.isFinite(value?.xp) ? Math.min(1e9, Math.max(0, Math.floor(value.xp))) : 0,
    level: Number.isFinite(value?.level) ? Math.min(9999, Math.max(1, Math.floor(value.level))) : 1,
  };
}

export function trainingFor(xp, cfg = DEFAULT_CONFIG) {
  const ranks = cfg.ranks;
  xp = normalizeProfile({ xp }).xp;
  let index = 0;
  while (index + 1 < ranks.length && xp >= ranks[index + 1].xp) index++;
  const nextXP = ranks[index + 1]?.xp ?? null;
  return {
    rank: index + 1,
    title: ranks[index].title,
    xp,
    nextXP,
    progress: nextXP == null ? 1 : (xp - ranks[index].xp) / (nextXP - ranks[index].xp),
  };
}

export function powerFor(game, cfg = DEFAULT_CONFIG) {
  const buffs = cfg.buffs;
  const rank = trainingFor(game.xp, cfg);
  const level = normalizeProfile(game).level;
  const unlocks = Object.fromEntries(Object.entries(buffs).map(([id, buff]) => [id, level >= buff.level && rank.xp >= buff.xp]));
  const advanced = level >= 5 && rank.xp >= 1200;
  const elite = level >= 8 && rank.xp >= 2200;
  const payload = (game.payload === "nova" && unlocks.nova) || (game.payload === "echo" && unlocks.echo) ? game.payload : "standard";
  return {
    ...rank,
    unlocks,
    payload,
    range: 2 + Number(unlocks.range) + Number(advanced) + Number(elite),
    capacity: 1 + Number(unlocks.rack) + Number(elite),
    wide: payload === "nova",
    echo: payload === "echo",
    line: unlocks.line,
    stepMs: unlocks.speed ? 120 : STEP_MS,
  };
}

export function cyclePayload(game, cfg = DEFAULT_CONFIG) {
  if (game.status !== "playing") return false;
  const power = powerFor(game, cfg);
  const choices = ["standard", ...["nova", "echo"].filter((id) => power.unlocks[id])];
  if (choices.length === 1) return false;
  game.payload = choices[(choices.indexOf(power.payload) + 1) % choices.length];
  game.notice = {
    message: `${game.payload[0].toUpperCase()}${game.payload.slice(1)} ${cfg.labels.payloadNoun} selected`,
    until: game.elapsed + 2000,
  };
  return true;
}

function upgradeNotice(game, before, cfg = DEFAULT_CONFIG) {
  const buffs = cfg.buffs;
  const power = powerFor(game, cfg);
  const unlocked = Object.keys(buffs).find((id) => power.unlocks[id] && !before.unlocks[id]);
  const message = unlocked ? `${buffs[unlocked].name} unlocked` : power.range > before.range || power.capacity > before.capacity
    ? cfg.labels.payloadUpgradeMsg : power.rank > before.rank ? `Promoted to ${power.title}` : null;
  if (message) game.notice = { message, until: game.elapsed + 2400 };
}

export function deckFor(level, cfg = DEFAULT_CONFIG) {
  const decks = cfg.decks;
  return decks[(normalizeProfile({ level }).level - 1) % decks.length];
}

// The pilot counts toward uniqueness. Only the repeatable character may repeat.
export function enemyRoster(hero, count, level = 1, cfg = DEFAULT_CONFIG) {
  const hostiles = cfg.hostiles;
  const repeatable = cfg.repeatable;
  const offset = ((normalizeProfile({ level }).level - 1) * 3) % hostiles.length;
  const candidates = hostiles.map((_, index) => hostiles[(index + offset) % hostiles.length])
    .filter((candidate) => candidate !== hero || candidate === repeatable);
  return Array.from({ length: count }, (_, index) => candidates[index] ?? repeatable);
}

const inside = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const same = (a, b) => a.x === b.x && a.y === b.y;
const onFlame = (game, point) => game.flames.some((flame) => same(flame, point) && flame.until > game.elapsed);

export function newGame(options = {}, cfg = DEFAULT_CONFIG) {
  const { level, xp } = normalizeProfile(options);
  const deck = deckFor(level, cfg);
  const hero = cfg.hostiles.includes(options.hero) ? options.hero : cfg.defaultHero;
  const enemyTotal = Math.min(SPAWNS.length, 4 + Math.floor((level - 1) / 2));
  const roster = enemyRoster(hero, enemyTotal, level, cfg);
  const spawns = SPAWNS.slice(0, enemyTotal);
  const elapsed = options.elapsed ?? 0;
  const board = deck.layout.map((row, y) => [...row].map((kind, x) => {
    if (kind === "#") return kind;
    const safeCorner = (x <= 3 && y <= 3) || (x >= 8 && y <= 3) || (x <= 3 && y >= 7) || (x >= 8 && y >= 7);
    const safeSpawn = spawns.some((point) => Math.abs(point.x - x) + Math.abs(point.y - y) <= 1);
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

export function nextLevel(game, cfg = DEFAULT_CONFIG) {
  if (game.status !== "won") return game;
  const next = newGame({ hero: game.hero, level: game.level + 1, xp: game.xp, score: game.score, elapsed: game.elapsed, payload: game.payload }, cfg);
  upgradeNotice(next, powerFor(game, cfg), cfg);
  return next;
}

export function movePlayer(game, dx, dy, cfg = DEFAULT_CONFIG) {
  if (game.status !== "playing" || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const next = { x: game.player.x + dx, y: game.player.y + dy };
  if (!inside(next.x, next.y) || game.board[next.y][next.x] !== ".") return false;
  if (game.bombs.some((bomb) => same(bomb, next)) || game.enemies.some((enemy) => same(enemy, next))) return false;
  game.player = {
    ...game.player, ...next, facing: dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down",
    moving: true, movedAt: game.elapsed, step: (game.player.step ?? 0) + 1, moveMs: powerFor(game, cfg).stepMs,
  };
  if (onFlame(game, next)) { game.status = "lost"; game.reason = "blast"; }
  return true;
}

function plant(game, point, power) {
  if (!inside(point.x, point.y) || game.board[point.y][point.x] !== "." || onFlame(game, point)
    || game.bombs.some((bomb) => same(bomb, point)) || game.enemies.some((enemy) => same(enemy, point))) return false;
  game.bombs.push({ x: point.x, y: point.y, fuse: FUSE_MS, range: power.range, wide: power.wide, echo: power.echo });
  return true;
}

export function placeBomb(game, cfg = DEFAULT_CONFIG) {
  const power = powerFor(game, cfg);
  return game.status === "playing" && game.bombs.length < power.capacity && plant(game, game.player, power);
}

export function placeLine(game, cfg = DEFAULT_CONFIG) {
  const power = powerFor(game, cfg);
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
    const sideBlocked = [-1, 1].map((side) => {
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
    const existing = game.flames.find((flame) => flame.x === x && flame.y === y);
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
  game.enemies = game.enemies.filter((enemy) => {
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
      if (game.bombs.some((bomb) => same(bomb, next)) || game.enemies.some((other) => other !== enemy && same(other, next))) continue;
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

export function tick(game, delta = TICK_MS, cfg = DEFAULT_CONFIG) {
  if (game.status !== "playing") return;
  const before = powerFor(game, cfg);
  delta = Math.max(0, delta);
  game.elapsed += delta;
  for (const actor of [game.player, ...game.enemies]) actor.moving = game.elapsed - actor.movedAt < (actor.moveMs ?? STEP_MS);
  game.flames = game.flames.filter((flame) => flame.until > game.elapsed);
  for (const bomb of game.bombs) bomb.fuse -= delta;
  for (const echo of game.echoes) echo.fuse -= delta;
  const echoes = game.echoes.filter((echo) => echo.fuse <= 0);
  game.echoes = game.echoes.filter((echo) => echo.fuse > 0);
  for (const echo of echoes) blast(game, echo);
  // Resolve chain reactions, but an echo pulse always waits out its own timer.
  while (true) {
    const ready = game.bombs.filter((bomb) => bomb.fuse <= 0 || onFlame(game, bomb));
    if (!ready.length) break;
    game.bombs = game.bombs.filter((bomb) => !ready.includes(bomb));
    for (const bomb of ready) blast(game, bomb);
  }
  resolveFlames(game);
  upgradeNotice(game, before, cfg);
  if (game.status !== "playing") return;
  game.enemyClock += delta;
  while (game.enemyClock >= game.enemyStepMs && game.status === "playing") {
    game.enemyClock -= game.enemyStepMs;
    moveEnemies(game);
  }
}
