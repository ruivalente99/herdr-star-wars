// Synced from herdr-common (mods/arena/choreography.js). Do not edit directly; edit pack.config.mjs and run sync.
// Pure training data & choreography: no host calls, real agent commands or random render-time state.
import { ARENA_CONFIG } from "./config.js";

export const HEROES = ARENA_CONFIG.heroes;
export const PRESETS = ARENA_CONFIG.presets;
export const MELEE_WEAPONS = new Set(Object.values(HEROES).filter((h) => h.weapon && h.weaponKind === "melee").map((h) => h.weapon));
export const ARCANE_WEAPONS = new Set(Object.values(HEROES).filter((h) => h.weapon && h.weaponKind === "arcane").map((h) => h.weapon));

const REPEATABLE = ARENA_CONFIG.repeatable;
const CONVERSATIONS = ARENA_CONFIG.conversations;
const FRONT_STYLES = ARENA_CONFIG.frontStyles;

export function normalizeRoster(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter((hero) => {
    if (typeof hero !== "string" || !Object.hasOwn(HEROES, hero)) return false;
    if (seen.has(hero) && hero !== REPEATABLE) return false;
    seen.add(hero);
    return true;
  }).slice(0, 8);
}

export function frontsFor(roster) {
  const heroes = normalizeRoster(roster);
  return Array.from({ length: Math.ceil(heroes.length / 2) }, (_, index) => heroes.slice(index * 2, index * 2 + 2));
}

export function dialogueLines(roster) {
  const heroes = normalizeRoster(roster);
  const present = new Set(heroes);
  const lines = CONVERSATIONS.filter(({ pair }) => pair.every((hero) => present.has(hero)))
    .flatMap(({ pair, lines: pairLines }) => pairLines.map(([speaker, text]) => ({ speaker, text, pair })));
  return lines.length ? lines : heroes.map((speaker) => ({ speaker, text: HEROES[speaker].line, pair: heroes.slice(0, 2) }));
}

export function exchange(roster, turn = 0) {
  const lines = dialogueLines(roster);
  return lines.length ? lines[((turn % lines.length) + lines.length) % lines.length] : null;
}

export function frontStyle(pair) {
  if (pair.length < 2) return FRONT_STYLES.standby;
  const profiles = pair.map((hero) => HEROES[hero]);
  if (profiles.some((p) => !p.weapon)) return FRONT_STYLES.support;
  if (profiles.every((p) => p.weaponKind === "melee")) return FRONT_STYLES.melee;
  if (profiles.some((p) => p.weaponKind === "arcane")) return FRONT_STYLES.arcane;
  if (profiles.some((p) => p.weaponKind === "melee")) return FRONT_STYLES.counter;
  return FRONT_STYLES.ranged;
}
