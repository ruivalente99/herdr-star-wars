const REPEATABLE_HERO = "stormtrooper";

// Assign every character once before allowing Stormtroopers to repeat.
export function pickHero(pool, heroes, random = Math.random) {
  const available = pool.filter((hero) => !heroes.includes(hero));
  if (!available.length) return REPEATABLE_HERO;
  return available[Math.floor(random() * available.length)];
}

// Remove unavailable or duplicated non-Stormtrooper assignments from saved state.
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
