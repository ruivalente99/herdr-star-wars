// Synced from herdr-common (mods/arena/scene.js). Do not edit directly; edit pack.config.mjs and run sync.
import { div, image } from "gpui-kit";
import { ARENA_CONFIG } from "./config.js";
import { HEROES, frontsFor, frontStyle } from "./choreography.js";

const SPRITES = ARENA_CONFIG.spriteDir;
const UNDIRECTED = new Set(ARENA_CONFIG.undirectedWeapons ?? []);
const STAGE_HEIGHT = 272;

// Native loops stop when not drawn. No per-frame JS, timers or random positions.
function motion(element, still, speed, property, from, to, period) {
  return still || from === to ? element : element.loop(property, { from, to, period: period / speed, easing: "ease-in-out" });
}

function label(text, x, y, width, color, size = 10) {
  return div().absolute().left(x).top(y).w(width).h(18)
    .text_size(size).font_medium().text_center().text_color(color).child(text);
}

function spark(id, x, y, size, color, still, speed, period) {
  return motion(div().id(id).absolute().left(x - size / 2).top(y - size / 2).size(size).opacity(0.7)
    .child(div().absolute().left(size * 0.4).top(0).w(size * 0.2).h(size).bg(color))
    .child(div().absolute().left(0).top(size * 0.4).w(size).h(size * 0.2).bg(color))
    .child(div().absolute().left(size * 0.3).top(size * 0.3).size(size * 0.4).bg("#fff3cf")),
  still, speed, "opacity", 0, 0.95, period);
}

function fighter(hero, id, x, y, size, facing, hasTarget, options, t, onSelect) {
  const profile = HEROES[hero];
  const { paused, reducedMotion, speed } = options;
  const still = paused || reducedMotion;
  const direction = facing === "right" ? 1 : -1;
  const melee = profile.weaponKind === "melee";
  const period = melee ? 1520 : profile.style === "heavy" ? 1800 : 1180;
  const meleeStep = profile.meleeDx ?? (profile.style === "acrobat" && melee ? 22 : ARENA_CONFIG.meleeDx ?? 16);
  const dx = !hasTarget || profile.style === "support" ? 0
    : melee ? direction * meleeStep
    : profile.style === "acrobat" ? direction * 12
    : profile.style === "droid" ? direction * 5 : direction * -3;
  const dy = profile.arenaDy != null ? profile.arenaDy
    : profile.style === "acrobat" ? -10
    : profile.style === "jetpack" ? -7
    : profile.style === "force" ? (ARENA_CONFIG.forceDy ?? -3)
    : profile.style === "droid" ? 0 : -1;
  const body = div().relative().left(0).top(0).w(size).h(size)
    .child(image(`${SPRITES}/${hero}.svg`).w(size).h(size));
  if (profile.weapon && hasTarget) {
    const path = UNDIRECTED.has(profile.weapon) ? profile.weapon : `${profile.weapon}-${facing}`;
    const weapon = image(`${SPRITES}/weapons/${path}.svg`).relative().top(0).w(46).h(23);
    body.child(div().absolute().left(facing === "right" ? size - 16 : -30).top(size * 0.48)
      .child(motion(weapon, still, speed, "top", 0, melee ? (ARENA_CONFIG.meleeLift ?? -6) : -1, period)));
    if (profile.style === "dual") {
      body.child(image(`${SPRITES}/weapons/${path}.svg`).absolute()
        .left(facing === "right" ? size - 20 : -26).top(size * 0.7).w(38).h(19));
    }
  }
  if (profile.style === "jetpack" && hasTarget) {
    body.child(motion(div().absolute().left(size * 0.32).top(size * 0.83).w(size * 0.36).h(6)
      .bg(t.working).opacity(0.6), still, speed, "height", 2, 9, 590));
  }
  return div().id(id).absolute().left(x).top(y).w(size).h(size)
    .cursor_pointer().tooltip(`${profile.name} · ${profile.style} · click to tune in to this ${ARENA_CONFIG.frontTooltipNoun}`)
    .accessibility_label(`Listen to ${profile.name}'s ${ARENA_CONFIG.frontAriaNoun}`)
    .on_click(onSelect)
    .child(motion(motion(body, still, speed, "left", 0, dx, period), still, speed, "top", 0, dy, period));
}

function fire(id, hero, x, target, y, options, t) {
  const profile = HEROES[hero];
  const weapon = profile.weapon;
  const still = options.paused || options.reducedMotion;
  const direction = target > x ? "right" : "left";
  const distance = Math.abs(target - x);
  const color = t[profile.beamColorRole ?? "accent"] ?? t.accent;
  const period = profile.slowPeriod ? 1800 : 1180;
  if (profile.weaponKind === "arcane") {
    const asset = UNDIRECTED.has(weapon) ? weapon : `${weapon}-${direction}`;
    return motion(image(`${SPRITES}/weapons/${asset}.svg`).id(id).absolute()
      .left(Math.min(x, target)).top(y - 6).w(distance).h(18).opacity(ARENA_CONFIG.arcaneOpacity ?? 0.85),
    still, options.speed, "opacity", 0.05, 0.95, period);
  }
  const beam = div().absolute().top(0).w(distance).h(3).bg(color)
    .when(direction === "right", (el) => el.left(0))
    .when(direction === "left", (el) => el.right(0))
    .child(div().h(1).w_full().bg("#fff3cf"));
  return div().id(id).absolute().left(Math.min(x, target)).top(y).w(distance).h(3)
    .child(motion(motion(beam, still, options.speed, "width", 0, distance, period),
      still, options.speed, "opacity", 0.15, 0.9, period));
}

export function arena(options, location, t, dark, locationNames, onFront = () => {}) {
  const fronts = frontsFor(options.roster);
  const stage = div().id("arena-stage").relative().w(640).h(STAGE_HEIGHT).flex_none()
    .overflow_hidden().rounded(8).border(1).border_color(t.border).bg(t.background);
  if (location) {
    const side = dark ? ARENA_CONFIG.themes.dark : ARENA_CONFIG.themes.light;
    stage.child(image(`${ARENA_CONFIG.backgroundDir}/${side}/${location}.png`)
      .absolute().left(0).top((STAGE_HEIGHT - 360) / 2).w(640).h(360).opacity(0.5));
  }
  if (options.roster.length < 2) {
    return stage.child(label(ARENA_CONFIG.emptyMessage, 40, STAGE_HEIGHT / 2 - 9, 560, t.muted, 12));
  }
  const columns = fronts.length === 1 ? 1 : 2;
  const rows = Math.ceil(fronts.length / columns);
  const width = 640 / columns;
  const height = STAGE_HEIGHT / rows;
  const size = rows === 1 ? 80 : 60;
  for (const [index, pair] of fronts.entries()) {
    const cell = div().id(`arena-front-${index}`).absolute()
      .left((index % columns) * width).top(Math.floor(index / columns) * height).w(width).h(height)
      .overflow_hidden().border(1).border_color(options.focus === index ? t.accent : t.border);
    const floor = Math.round(height * 0.8);
    const top = floor - size;
    const left = width / 2 - size - 34;
    const right = width / 2 + 34;
    const center = width / 2;
    const still = options.paused || options.reducedMotion;
    cell.child(div().absolute().left(0).top(floor).w(width).h(height - floor).bg(t.chrome))
      .child(div().absolute().left(8).top(floor).w(width - 16).h(1).bg(t.border))
      .child(label(`${String(index + 1).padStart(2, "0")} / ${frontStyle(pair)}`, 8, 8, width - 16, t.working))
      .child(label(location ? locationNames[location] ?? location : ARENA_CONFIG.defaultBayLabel, 8, 27, width - 16, t.dim, 9));
    for (const [slot, hero] of pair.entries()) {
      const x = pair.length === 1 ? center - size / 2 : slot === 0 ? left : right;
      const id = `arena-fighter-${index}-${slot}`;
      cell.child(div().absolute().left(x + size * 0.15).top(floor - 3).w(size * 0.7).h(4).rounded_full().bg(t.border))
        .child(fighter(hero, id, x, top, size, slot ? "left" : "right", pair.length === 2, options, t,
          (_event, cx) => onFront(index, cx)))
        .child(label(HEROES[hero].name, x - 15, floor + 7, size + 30, t.foreground));
      const profile = HEROES[hero];
      if (pair.length === 2 && profile.weapon && profile.weaponKind !== "melee") {
        const origin = slot ? right - 4 : left + size + 4;
        const target = slot ? left + size - 10 : right + 10;
        const shotY = top + size * (slot ? 0.64 : 0.56);
        cell.child(fire(`${id}-burst`, hero, origin, target, shotY, options, t))
          .child(spark(`${id}-impact`, target, shotY, 8, t.working, still, options.speed,
            profile.slowImpact ? 1800 : 1180));
      }
    }
    if (pair.length === 2 && pair.some((hero) => HEROES[hero].weaponKind === "melee")) {
      cell.child(spark(`arena-clash-${index}`, center, top + size * 0.52, 14, t.working, still, options.speed, 1520));
    }
    stage.child(cell);
  }
  return stage;
}
