// Synced from herdr-common (mods/systems/locations.js). Do not edit directly; edit pack.config.mjs and run sync.
import { SYSTEMS_CONFIG } from "./config.js";

export const LOCATIONS = SYSTEMS_CONFIG.locations;
export const LOCATION_NAMES = SYSTEMS_CONFIG.locationNames;

export function locationBackground(location, dark = true) {
  if (!LOCATIONS.includes(location)) return null;
  const side = dark ? SYSTEMS_CONFIG.themes.dark : SYSTEMS_CONFIG.themes.light;
  return { image: `${SYSTEMS_CONFIG.backgroundDir}/${side}/${location}.png`, fit: "cover" };
}
