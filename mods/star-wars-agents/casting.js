// Synced from herdr-common (mods/agents/casting.js). Do not edit directly; edit pack.config.mjs and run sync.
import { AGENTS_CONFIG } from "./config.js";

const REPEATABLE_HERO = AGENTS_CONFIG.repeatable;

// Assign every character once before allowing the repeatable character to repeat.
export function pickHero(pool, heroes, random = Math.random) {
  const available = pool.filter((hero) => !heroes.includes(hero));
  if (!available.length) return REPEATABLE_HERO;
  return available[Math.floor(random() * available.length)];
}

// Remove unavailable or duplicated non-repeatable assignments from saved state.
export function repairCast(pool, cast) {
  const assigned = new Set();
  let changed = false;

  for (const [address, hero] of Object.entries(cast)) {
    if (!pool.includes(hero) || (hero !== REPEATABLE_HERO && assigned.has(hero))) {
      delete cast[address];
      changed = true;
    } else if (hero !== REPEATABLE_HERO) {
      assigned.add(hero);
    }
  }

  return changed;
}
