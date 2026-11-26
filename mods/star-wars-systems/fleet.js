// Ship IDs are shared with the Fleet emblems and the generated background filenames.
export const FLEET = ["millennium-falcon", "x-wing", "tie-fighter", "star-destroyer", "y-wing", "a-wing", "imperial-shuttle"];
export const SHIP_NAMES = {
  "millennium-falcon": "Millennium Falcon", "x-wing": "X-wing", "tie-fighter": "TIE Fighter",
  "star-destroyer": "Star Destroyer", "y-wing": "Y-wing", "a-wing": "A-wing",
  "imperial-shuttle": "Imperial Shuttle",
};

export function shipBackground(ship, dark = true) {
  return FLEET.includes(ship) ? { image: `backgrounds/ships/${dark ? "dark-side" : "light-side"}/${ship}.png`, fit: "cover" } : null;
}
