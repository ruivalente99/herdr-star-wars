// Synced from herdr-common (mods/arcade/scene.js). Do not edit directly; edit pack.config.mjs and run sync.
import { div, image } from "gpui-kit";
import { v_flex } from "gpui-base";
import { ARCADE_CONFIG } from "./config.js";
import { WIDTH, HEIGHT, STEP_MS, deckFor } from "./game.js";

export const ART = ARCADE_CONFIG.artDir;
export const SCENE_ROWS = HEIGHT + 3;
const PALETTE = ARCADE_CONFIG.art.palette;
const PREFIX = ARCADE_CONFIG.domPrefix;
const L = ARCADE_CONFIG.labels;

// on_size_change reports window pixels; styles use pixels before Herdr's zoom.
export function fitTile(width, height, zoom = 1) {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.max(12, Math.min(40, Math.floor(Math.min(width / scale / WIDTH, height / scale / SCENE_ROWS) / 2) * 2));
}

export function walkFrame(entity, elapsed, still) {
  const duration = entity.moveMs ?? STEP_MS;
  if (still || !entity.moving || elapsed - entity.movedAt >= duration) return 0;
  const half = elapsed - entity.movedAt < duration / 2 ? 0 : 1;
  return 1 + ((half + (entity.step ?? 0)) % 2);
}

function actor(id, hero, entity, game, tile, still, player, epoch) {
  const size = Math.round(tile * 1.2);
  const frame = walkFrame(entity, game.elapsed, still);
  const facing = ["up", "down", "left", "right"].includes(entity.facing) ? entity.facing : "down";
  const node = div().id(`${id}-${epoch}`).absolute()
    .left(Math.round(entity.x * tile + (tile - size) / 2))
    .top(Math.round((entity.y + 2) * tile + tile - size)).w(size).h(size)
    .when(!still, (el) => el.transition("left", { duration: entity.moveMs ?? STEP_MS, easing: "linear" })
      .transition("top", { duration: entity.moveMs ?? STEP_MS, easing: "linear" }))
    .child(image(`${ART}/shadow.svg`).absolute().left(0).top(0).w(size).h(size))
    .child(div().relative().w(size).h(size).overflow_hidden()
      .child(image(`${ART}/actors/${hero}-${facing}.svg`).relative().left(-frame * size).w(size * 3).h(size).flex_none()));
  if (player) node.child(div().absolute().left(Math.floor(size / 2) - 2).top(0).w(4).h(2).bg(PALETTE.mint));
  return node;
}

function action(id, label, onClick, disabled = false) {
  return div().id(id).h(26).px(10).flex_1().min_w(0).rounded(2).bg(PALETTE.buttonBg)
    .text_color(PALETTE.buttonInk).text_size(10).font_semibold().flex().items_center().justify_center()
    .cursor_pointer().role("button").accessibility_label(label).hover((el) => el.bg(PALETTE.buttonHover))
    .disabled(disabled).when(disabled, (el) => el.opacity(0.5)).on_click(onClick).child(label);
}

function screen(state, width, height, game, callbacks, waiting) {
  const art = state === "ready" ? "title" : state === "won" ? "victory" : state === "lost" ? "defeat" : "paused";
  const artWidths = ARCADE_CONFIG.art.artWidths;
  const widthPx = Math.min(width - 24, 260);
  const label = state === "waiting" ? "Selected agent is not working."
    : state === "ready" ? L.readyLine
    : state === "won" ? `${L.unit} ${game.level} secured · +75 XP`
    : state === "lost" ? game.reason === "contact" ? L.lostContact : L.lostBlast : L.pausedLine;
  const button = state === "waiting" ? "Waiting for agent" : state === "ready" ? L.readyButton
    : state === "won" ? L.wonButton : state === "paused" ? L.pausedButton : L.lostButton;
  return div().id(`${PREFIX}-curtain`).absolute().left(0).top(0).w(width).h(height).bg("#08101b33")
    .child(v_flex().id(`${PREFIX}-state-card`).absolute().left(Math.floor((width - widthPx) / 2))
      .bottom(Math.max(10, Math.round((width / WIDTH) * 0.8))).w(widthPx).p(10).gap(8)
      .border(1).border_color(PALETTE.edge).bg(PALETTE.cardBg)
      .accessibility_label(`${state}: ${waiting ?? label}`)
      .child(div().h(12).flex_none()
        .child(image(`${ART}/${art}.svg`).w(artWidths[art] * 2).h(10)))
      .child(div().h(14).text_size(10).text_color(PALETTE.text).truncate().tooltip(waiting ?? label).child(label))
      .child(div().h(26).flex().gap(8).items_center()
        .child(action(`${PREFIX}-start`, button, (_event, cx) => callbacks.play(cx), state === "waiting"))
        .child(div().w(22).h(24).flex_none().flex().items_center().justify_center()
          .text_size(11).text_color(PALETTE.muted).child("↵"))));
}

export function deckScene(game, options, callbacks) {
  const { tile, hero, started, paused, waiting, epoch = 0 } = options;
  const width = tile * WIDTH;
  const height = tile * SCENE_ROWS;
  const still = Boolean(waiting) || paused || !started || game.status !== "playing";
  const deck = deckFor(game.level);
  const board = div().id(`${PREFIX}-deck`).relative().w(width).h(height).flex_none().overflow_hidden().bg(PALETTE.ink)
    .accessibility_label(`${L.boardAriaPrefix} ${deck.name}`)
    .child(image(`${ART}/deck-${deck.id}.svg`).absolute().left(0).top(0).w(width).h(height));
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const kind = game.board[y][x];
      if (kind === ".") continue;
      const prop = kind === "#" ? `${deck.prop}.svg` : ARCADE_CONFIG.art.crate;
      const propHeight = kind === "#" ? tile : (tile * 18) / 16;
      board.child(image(`${ART}/${prop}`).id(`deck-prop-${x}-${y}`).absolute()
        .left(x * tile).top((y + 3) * tile - propHeight).w(tile).h(propHeight));
    }
  }
  for (const echo of game.echoes) {
    board.child(div().id(`echo-${echo.x}-${echo.y}`).absolute()
      .left(echo.x * tile).top((echo.y + 2) * tile).w(tile).h(tile).opacity(0.55)
      .when(!still, (el) => el.loop("opacity", { from: 0.25, to: 0.7, period: 320 }))
      .tooltip(L.echoTooltip)
      .child(image(`${ART}/echo-beacon.svg`).w(tile).h(tile)));
  }
  const bombPrefix = ARCADE_CONFIG.art.bombPrefix;
  for (const bomb of game.bombs) {
    const frame = still ? 0 : bomb.fuse < 600 ? 1 + (Math.floor(bomb.fuse / 80) % 2) : Math.floor(bomb.fuse / 240) % 2;
    const size = Math.round(tile * (1 + Math.min(0.24, ((bomb.range ?? 2) - 2) * 0.04)));
    board.child(image(`${ART}/${bombPrefix}-${frame}.svg`).id(`${bombPrefix}-${bomb.x}-${bomb.y}`).absolute()
      .left(bomb.x * tile + (tile - size) / 2).top((bomb.y + 2) * tile + (tile - size) / 2).w(size).h(size));
  }
  const flames = game.flames.filter((flame) => flame.until > game.elapsed);
  for (const flame of flames) {
    const frame = Math.floor(game.elapsed / 80) % 3;
    if (flame.wide) board.child(div().absolute().left(flame.x * tile).top((flame.y + 2) * tile).size(tile).bg("#f4984633"));
    const vertical = flames.some((other) => other.x === flame.x && Math.abs(other.y - flame.y) === 1);
    const horizontal = flames.some((other) => other.y === flame.y && Math.abs(other.x - flame.x) === 1);
    for (const direction of vertical && horizontal ? ["h", "v"] : [vertical ? "v" : "h"]) {
      board.child(image(`${ART}/blast-${direction}-${frame}.svg`).absolute()
        .left(flame.x * tile).top((flame.y + 2) * tile).w(tile).h(tile));
    }
  }
  const actors = game.enemies.map((enemy) => ({ entity: enemy, hero: enemy.hero, id: `enemy-${enemy.id}`, player: false }));
  actors.push({ entity: game.player, hero, id: "player", player: true });
  actors.sort((a, b) => a.entity.y - b.entity.y);
  for (const item of actors) board.child(actor(item.id, item.hero, item.entity, game, tile, still, item.player, epoch));
  if (game.echoes.length || game.notice?.until > game.elapsed) {
    const warning = game.echoes.length > 0;
    board.child(div().id(`${PREFIX}-notice`).absolute().left(tile).top((SCENE_ROWS - 0.85) * tile)
      .w(width - tile * 2).h(tile * 0.65).bg("#0b1722ed").flex().items_center().justify_center()
      .text_size(9).font_medium().text_color(warning ? "#ef9678" : PALETTE.mint)
      .child(warning ? L.echoBanner : game.notice.message));
  }
  const state = waiting ? "waiting" : !started ? "ready" : game.status !== "playing" ? game.status : paused ? "paused" : null;
  if (state) board.child(screen(state, width, height, game, callbacks, waiting));
  return board;
}
