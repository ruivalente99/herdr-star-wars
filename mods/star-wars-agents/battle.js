// Synced from herdr-common (mods/agents/battle.js). Do not edit directly; edit pack.config.mjs and run sync.
import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings, shared, layout } from "herdr";
import { AGENTS_CONFIG } from "./config.js";

const SPRITE_DIR = AGENTS_CONFIG.spriteDir;
const WEAPON_DIR = `${SPRITE_DIR}/weapons`;
export const SPRITE_SIZE = 36;

const HEROES = AGENTS_CONFIG.heroes;
const LOCATIONS = new Set(AGENTS_CONFIG.locations);
const UNDIRECTED = new Set(AGENTS_CONFIG.undirectedWeapons ?? []);
const CONVERSATIONS = AGENTS_CONFIG.battle.conversations;

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export function heroSprite(hero, status, t) {
  const sprite = image(`${SPRITE_DIR}/${hero}.svg`).w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none();
  if (status !== "blocked" && status !== "done") return sprite;

  const blocked = status === "blocked";
  const color = blocked ? t.blocked : t.done;
  return div().relative().w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none().child(sprite)
    .child(div().absolute().left(0).top(0).size(13).rounded(4)
      .bg(t.popover).border(1).border_color(color)
      .flex().items_center().justify_center().text_size(10).font_bold()
      .text_color(color).child(blocked ? "!" : "✦"));
}

export function battleSquad(members, cast, page = 0, capacity = 4) {
  const eligible = members.filter((agent) => Object.hasOwn(HEROES, cast[agent.address]));
  const pages = Math.max(1, Math.ceil(eligible.length / capacity));
  const current = ((page % pages) + pages) % pages;
  return { fighters: eligible.slice(current * capacity, (current + 1) * capacity), page: current, pages, total: eligible.length };
}

export function battleDialogue(fighters, cast, turn = 0) {
  const present = new Set(fighters.map((agent) => cast[agent.address]));
  const lines = [];
  const blocked = fighters.find((agent) => agent.status === "blocked");
  const done = fighters.find((agent) => agent.status === "done");
  if (blocked) lines.push([cast[blocked.address], AGENTS_CONFIG.battle.blockedLine]);
  else if (done) lines.push([cast[done.address], AGENTS_CONFIG.battle.doneLine]);
  lines.push(...CONVERSATIONS.filter(({ pair }) => pair.every((hero) => present.has(hero))).flatMap(({ lines: pairLines }) => pairLines));
  if (!lines.length && fighters.length) {
    lines.push([cast[fighters[0].address], AGENTS_CONFIG.battle.fallbackLines[0]]);
    if (fighters[1]) lines.push([cast[fighters[1].address], AGENTS_CONFIG.battle.fallbackLines[1]]);
  }
  const [speaker, text] = lines[((turn % lines.length) + lines.length) % lines.length] ?? [];
  return { speaker, text };
}

function pulse(element, paused, property, from, to, period) {
  return paused || from === to ? element : element.loop(property, { from, to, period, easing: "ease-in-out" });
}

function miniFighter(agent, hero, x, facing, paused, hasTarget, t) {
  const profile = HEROES[hero];
  const active = hasTarget && (!agent.status || agent.status === "working");
  const weapon = profile.weapon;
  const melee = profile.weaponKind === "melee";
  const period = melee ? 1520 : 1180;
  const direction = facing === "right" ? 1 : -1;
  const body = div().relative().left(0).top(0).w(28).h(28)
    .child(image(`${SPRITE_DIR}/${hero}.svg`).w(28).h(28));
  if (active && weapon) {
    const asset = UNDIRECTED.has(weapon) ? weapon : `${weapon}-${facing}`;
    body.child(image(`${WEAPON_DIR}/${asset}.svg`).w(24).h(12).absolute().top(13)
      .left(facing === "right" ? 16 : -12));
    if (profile.style === "dual") body.child(image(`${WEAPON_DIR}/${asset}.svg`).w(20).h(10)
      .absolute().top(20).left(facing === "right" ? 14 : -6));
  }
  const dx = !active ? 0 : melee ? direction * 5 : profile.style === "droid" ? direction * 2 : direction * -1;
  const dy = active && profile.miniDy != null ? profile.miniDy
    : active && profile.style === "acrobat" ? -5
    : active && profile.style === "jetpack" ? -3
    : agent.status === "done" ? -2 : 0;
  return div().id(`fight-${agent.address}`).absolute().left(x).top(4).w(28).h(28)
    .tooltip(`${profile.battleName} · ${agent.status ?? "working"}`)
    .child(pulse(pulse(body, paused, "left", 0, dx, period), paused, "top", 0, dy, period))
    .when(agent.status === "blocked" || agent.status === "done", (el) => el.child(div().absolute().right(-2).top(0)
      .text_size(9).font_bold().text_color(agent.status === "blocked" ? t.blocked : t.done)
      .child(agent.status === "blocked" ? "!" : "✦")));
}

function miniButton(id, text, t, action) {
  return div().id(id).px(5).h(19).rounded(3).flex().items_center().justify_center()
    .text_size(9).text_color(t.muted).cursor_pointer().role("button")
    .accessibility_label(text).hover((el) => el.bg(t.hover)).on_click(action).child(text);
}

function speechTail(id, center, t) {
  const tail = div().id(id).absolute().left(center - 4).top(0).w(8).h(8);
  for (const [x, y, width, height, color] of [
    [3, 0, 2, 2, t.border], [2, 2, 4, 2, t.border], [1, 4, 6, 2, t.border], [0, 6, 8, 2, t.border],
    [3, 2, 2, 2, t.popover], [2, 4, 4, 2, t.popover], [1, 6, 6, 2, t.popover],
  ]) tail.child(div().absolute().left(x).top(y).w(width).h(height).bg(color));
  return tail;
}

export function battleScene(space, members, cast, t, options = {}) {
  const { paused = false, page = 0, turn = 0, onPause, onPage, onOpen } = options;
  const sidebarWidth = find(layout(), "sidebar")?.size?.px ?? 268;
  const columns = sidebarWidth >= 340 ? 2 : 1;
  const squad = battleSquad(members, cast, page, columns * 4);
  const fronts = Math.ceil(squad.fighters.length / 2);
  const rows = Math.ceil(fronts / columns);
  const width = Math.max(120, sidebarWidth - 46);
  const laneWidth = width / columns;
  const { speaker, text } = battleDialogue(squad.fighters, cast, turn);
  const loc = shared(AGENTS_CONFIG.locationsSharedKey)?.[space];
  const speakerIndex = Math.max(0, squad.fighters.findIndex((agent) => cast[agent.address] === speaker));
  const speakerPair = Math.floor(speakerIndex / 2);
  const solo = speakerPair * 2 + 1 >= squad.fighters.length;
  const tailCenter = Math.max(12, Math.min(width - 12,
    1 + (speakerPair % columns) * laneWidth + laneWidth / 2 + (solo ? 0 : speakerIndex % 2 ? 28 : -28)));
  const height = 20 + rows * 36 + (text ? 42 : 0) + (onOpen ? 21 : 0);
  const stage = div().id(`fight-${space}`).relative().flex().flex_col().overflow_hidden()
    .h(height + 2).mx(5).my(3).flex_none().rounded(6).bg(t.raised).border(1).border_color(t.border);
  const field = div().id(`fight-field-${space}`).relative().h(20 + rows * 36).flex_none().overflow_hidden();
  if (LOCATIONS.has(loc)) {
    const side = settings().dark === false ? AGENTS_CONFIG.themes.light : AGENTS_CONFIG.themes.dark;
    stage.child(image(`${AGENTS_CONFIG.backgroundDir}/${side}/${loc}.png`)
      .absolute().left(0).top(0).w_full().h(Math.max(height, sidebarWidth * 9 / 16)).opacity(0.25));
  }
  field.child(div().absolute().left(6).right(6).top(4).text_size(8).font_semibold().text_color(t.dim)
    .child(`${paused ? AGENTS_CONFIG.battle.pausedLabel : AGENTS_CONFIG.battle.activeLabel} / ${fronts} FRONTS · ${squad.fighters.length}/${squad.total} ${AGENTS_CONFIG.battle.unitPluralUpper}`));
  const boltColor = t[AGENTS_CONFIG.battle.rangedBoltColor] ?? t.accent;
  for (let index = 0; index < fronts; index++) {
    const pair = squad.fighters.slice(index * 2, index * 2 + 2);
    const lane = div().id(`fight-${space}-front-${index}`).absolute()
      .left(6 + (index % columns) * laneWidth).top(20 + Math.floor(index / columns) * 36).w(laneWidth).h(36);
    pair.forEach((agent, slot) => {
      const x = pair.length === 1 ? laneWidth / 2 - 14 : laneWidth / 2 + (slot ? 14 : -42);
      lane.child(miniFighter(agent, cast[agent.address], x, slot ? "left" : "right", paused, pair.length === 2, t));
    });
    const attacking = pair.some((agent) => (!agent.status || agent.status === "working") && HEROES[cast[agent.address]]?.weapon);
    const ranged = pair.some((agent) => (!agent.status || agent.status === "working")
      && HEROES[cast[agent.address]]?.weaponKind === "ranged");
    if (pair.length === 2 && ranged) lane.child(pulse(div().absolute().left(laneWidth / 2 - 9).top(18)
      .w(18).h(2).bg(boltColor), paused, "opacity", 0.1, 0.9, 1180));
    if (pair.length === 2 && attacking) {
      lane.child(pulse(div().absolute().left(laneWidth / 2 - 3).top(15).size(7)
        .text_size(10).text_color(t.working).child("✦"), paused, "opacity", 0, 1, 1520));
    }
    field.child(lane);
  }
  stage.child(field);
  if (text) {
    const speakerName = HEROES[speaker]?.battleName ?? speaker;
    stage.child(div().id(`fight-comms-${space}`).relative().mx(5).mt(2).h(40).flex_none().overflow_hidden()
      .tooltip(`${speakerName}: ${text}`).accessibility_label(`${speakerName} says: ${text}`)
      .child(div().id(`fight-bubble-${space}`).absolute().left(0).right(0).top(6).h(34)
        .px(7).py(2).rounded(8).border(1).border_color(t.border).bg(t.popover)
        .child(div().text_size(8).font_semibold().text_color(t.accent).child(speakerName))
        .child(div().text_size(10).text_color(t.foreground).truncate().child(text)))
      .child(speechTail(`fight-tail-${space}`, tailCenter, t)));
  }
  if (onOpen) stage.child(h_flex().relative().mx(4).mt(1).h(20).flex_none().items_center().gap(2)
    .child(miniButton(`fight-pause-${space}`, paused ? "Resume" : "Pause", t, onPause))
    .when(squad.pages > 1, (el) => el.child(miniButton(`fight-squad-${space}`, `Squad ${squad.page + 1}/${squad.pages} ›`, t, onPage)))
    .child(div().flex_1())
    .child(miniButton(`fight-open-${space}`, "Expand ↗", t, () => onOpen(squad.fighters))));
  return stage;
}
