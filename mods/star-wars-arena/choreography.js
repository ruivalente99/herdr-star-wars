// Pure training data: no host calls, real agent commands or random render-time state.
export const HEROES = {
  luke: { name: "Luke", weapon: "saber-green", style: "duelist", line: "I am ready. Let's try that again." },
  vader: { name: "Vader", weapon: "saber-red", style: "heavy", line: "Your training is not yet complete." },
  leia: { name: "Leia", weapon: "blaster", style: "shooter", line: "Somebody has to keep this squad together." },
  han: { name: "Han", weapon: "blaster", style: "shooter", line: "It's a training exercise. What could go wrong?" },
  chewbacca: { name: "Chewbacca", weapon: "bowcaster", style: "heavy", line: "Rrrrwwwwrr!" },
  stormtrooper: { name: "Stormtrooper", weapon: "blaster", style: "shooter", line: "Target acquired. Probably." },
  r2d2: { name: "R2-D2", weapon: "droid-zap", style: "droid", line: "Bweep! Dwooo-weet!" },
  "obi-wan": { name: "Obi-Wan", weapon: "saber-blue", style: "duelist", line: "Patience. Watch your opponent's next move." },
  yoda: { name: "Yoda", weapon: "saber-green", style: "acrobat", line: "Small steps, great progress make." },
  "boba-fett": { name: "Boba Fett", weapon: "blaster", style: "jetpack", line: "No bounty. Just practice." },
  c3po: { name: "C-3PO", weapon: null, style: "support", line: "I was not informed there would be blaster fire!" },
  padme: { name: "Padmé", weapon: null, style: "support", line: "Perhaps we should try negotiations first." },
  ahsoka: { name: "Ahsoka", weapon: "saber-white", style: "dual", line: "Two blades. Twice the homework." },
  "mace-windu": { name: "Mace Windu", weapon: "saber-purple", style: "duelist", line: "Focus. Discipline. Again." },
  "emperor-palpatine": { name: "Palpatine", weapon: "force-lightning", style: "force", line: "Let us test the limits of this simulator." },
};

export const PRESETS = {
  classic: { name: "Classic", heroes: ["luke", "vader", "han", "boba-fett", "leia", "stormtrooper", "chewbacca", "r2d2"] },
  jedi: { name: "Jedi", heroes: ["obi-wan", "vader", "ahsoka", "mace-windu", "yoda", "emperor-palpatine"] },
  hunters: { name: "Hunters", heroes: ["han", "boba-fett", "chewbacca", "stormtrooper", "leia", "r2d2"] },
  senate: { name: "Senate", heroes: ["padme", "emperor-palpatine", "mace-windu", "vader", "c3po", "r2d2", "yoda", "boba-fett"] },
};

// Film quotes and clearly playful, original training banter. Each line names its speaker.
const CONVERSATIONS = [
  { pair: ["vader", "luke"], lines: [["vader", "I am your father."], ["luke", "No. That's not true. That's impossible!"], ["vader", "Search your feelings. You know it to be true."]] },
  { pair: ["luke", "yoda"], lines: [["yoda", "Do. Or do not. There is no try."], ["luke", "All right. I'll give it everything I've got."]] },
  { pair: ["han", "chewbacca"], lines: [["han", "Chewie, we're home."], ["chewbacca", "Rrrrwwwwrr!"], ["han", "Fine. You take the next shot."]] },
  { pair: ["leia", "r2d2"], lines: [["leia", "Help me, Obi-Wan Kenobi."], ["r2d2", "Bweep! Recording saved."], ["leia", "And this time, keep the transmission encrypted."]] },
  { pair: ["obi-wan", "vader"], lines: [["obi-wan", "You were my brother, Anakin."], ["vader", "That name no longer has any meaning for me."], ["obi-wan", "Then let the simulator do the talking."]] },
  { pair: ["obi-wan", "ahsoka"], lines: [["obi-wan", "I see Anakin taught you the dramatic entrance."], ["ahsoka", "And you taught him the lecture afterwards."]] },
  { pair: ["yoda", "emperor-palpatine"], lines: [["yoda", "At an end your rule is."], ["emperor-palpatine", "The simulator is merely warming up."]] },
  { pair: ["mace-windu", "emperor-palpatine"], lines: [["mace-windu", "The Senate will decide your fate."], ["emperor-palpatine", "I am the Senate!"], ["mace-windu", "Not in this training room."]] },
  { pair: ["han", "boba-fett"], lines: [["boba-fett", "Solo. We meet again."], ["han", "Send the training bill to Jabba."]] },
  { pair: ["ahsoka", "vader"], lines: [["ahsoka", "I am no Jedi."], ["vader", "Then this should be an interesting exercise."]] },
  { pair: ["padme", "c3po"], lines: [["padme", "Threepio, open a diplomatic channel."], ["c3po", "At last! A task with a reasonable survival rate."]] },
  { pair: ["c3po", "r2d2"], lines: [["c3po", "R2-D2, you know better than to trust a strange computer!"], ["r2d2", "Beep boop. Training override accepted."], ["c3po", "Oh, we're doomed."]] },
  { pair: ["padme", "emperor-palpatine"], lines: [["padme", "We are here to find a peaceful solution."], ["emperor-palpatine", "Of course, Senator. A perfectly peaceful simulation."]] },
  { pair: ["ahsoka", "mace-windu"], lines: [["mace-windu", "Show me your guard, citizen."], ["ahsoka", "Try to keep up, Master Windu."]] },
  { pair: ["boba-fett", "stormtrooper"], lines: [["boba-fett", "Aim first. Then fire."], ["stormtrooper", "That explains a great deal."]] },
  { pair: ["obi-wan", "luke"], lines: [["obi-wan", "The Force will be with you. Always."], ["luke", "Then let's take another pass."]] },
];

export function normalizeRoster(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(hero => {
    if (typeof hero !== "string" || !Object.hasOwn(HEROES, hero)) return false;
    if (seen.has(hero) && hero !== "stormtrooper") return false;
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
  const lines = CONVERSATIONS.filter(({ pair }) => pair.every(hero => present.has(hero)))
    .flatMap(({ pair, lines }) => lines.map(([speaker, text]) => ({ speaker, text, pair })));
  return lines.length ? lines : heroes.map(speaker => ({ speaker, text: HEROES[speaker].line, pair: heroes.slice(0, 2) }));
}

export function exchange(roster, turn = 0) {
  const lines = dialogueLines(roster);
  return lines.length ? lines[((turn % lines.length) + lines.length) % lines.length] : null;
}

export function frontStyle(pair) {
  if (pair.length < 2) return "STANDBY";
  const weapons = pair.map(hero => HEROES[hero].weapon);
  if (weapons.includes(null)) return "ESCORT / SUPPORT";
  if (weapons.every(weapon => weapon.startsWith("saber-"))) return "SABER DUEL";
  if (weapons.includes("force-lightning") || weapons.includes("droid-zap")) return "FORCE / TECH";
  if (weapons.some(weapon => weapon.startsWith("saber-"))) return "DEFLECT / COUNTER";
  return "CROSS-FIRE";
}
