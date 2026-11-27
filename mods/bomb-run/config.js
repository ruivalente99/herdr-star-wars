import { DEFAULT_DECKS } from "./decks.js";

export const DEFAULT_CONFIG = {
  id: "default",
  modName: "bomb-run",
  domPrefix: "bomb-run",
  title: "Bomb Run",
  artDir: "mods/bomb-run/art",
  actorsDir: null,
  spriteDir: "mods/bomb-run/sprites",
  castKey: "bomb-run.cast",
  locationsSharedKey: null,
  progressKey: "bomb-run-progress",
  defaultHero: "sapper",
  repeatable: "bot",
  defaultLocationName: "Arcade Sector",
  heroNames: {
    sapper: "Sapper",
    bot: "Patrol Bot",
    spark: "Spark",
    ember: "Ember",
    frost: "Frost",
    volt: "Volt",
    shade: "Shade",
    titan: "Titan",
  },
  locationNames: {},
  hostiles: ["bot", "ember", "shade", "titan", "volt", "frost", "spark", "sapper"],
  ranks: [
    { xp: 0, title: "Cadet" },
    { xp: 200, title: "Scout" },
    { xp: 600, title: "Veteran" },
    { xp: 1200, title: "Commander" },
    { xp: 2200, title: "Legend" },
  ],
  buffs: {
    range: { name: "Blast extender", short: "Range", level: 2, xp: 200, color: "#f2bd66", hint: "Reach grows to 3 tiles; 4 at deck 5 / 1200 XP, 5 at deck 8 / 2200 XP." },
    nova: { name: "Nova payload", short: "Nova", level: 6, xp: 1400, color: "#ef9678", hint: "Optional wide blast. Choose with E; cannot combine with Echo." },
    echo: { name: "Echo charge", short: "Echo", level: 8, xp: 2400, color: "#c2b0ef", hint: "Optional second pulse after 1 second. Choose with E; cannot combine with Nova." },
    rack: { name: "Extra magazine", short: "Rack", level: 3, xp: 600, color: "#9ccc8e", hint: "2 active bombs; 3 at deck 8 / 2200 XP. No stacking." },
    line: { name: "Line launcher", short: "Line", level: 5, xp: 900, color: "#78ced1", hint: "Q plants a facing row using your existing bomb capacity." },
    speed: { name: "Sprint boots", short: "Speed", level: 7, xp: 1800, color: "#8fbaf2", hint: "One speed upgrade: 160 to 120 ms per tile (1.33×)." },
  },
  decks: DEFAULT_DECKS,
  art: {
    crate: "crate-0.svg",
    bombPrefix: "bomb",
    artWidths: { title: 33, victory: 46, defeat: 43, paused: 40 },
    palette: {
      ink: "#09131f",
      text: "#d8dfce",
      muted: "#92a7b3",
      mint: "#91bdb4",
      edge: "#415563",
      cardBg: "#101e2bf5",
      buttonBg: "#90b8ac",
      buttonHover: "#b0d1bf",
      buttonInk: "#0b1a24",
    },
    files: {},
    actors: {},
    portraits: {},
  },
  labels: {
    unit: "Deck",
    unitShort: "D",
    payloadNoun: "payload",
    payloadUpgradeMsg: "Bomb strength upgraded",
    payloadNames: { standard: "Standard payload", nova: "Nova payload", echo: "Echo payload" },
    readyLine: "Clear the deck. Stay clear of the blast.",
    readyButton: "Start run",
    wonButton: "Next deck",
    lostContact: "Intercepted · XP saved",
    lostBlast: "Caught in the blast · XP saved",
    lostButton: "Retry deck",
    pausedLine: "Your run is paused and safe.",
    pausedButton: "Resume run",
    echoTooltip: "Second explosion incoming — clear this lane",
    echoBanner: "Echo blast incoming — stay clear",
    boardAriaPrefix: "Pixel-art arcade deck",
    panelAria: "Bomb Run — pixel-art arcade game",
    optionsTitle: "Mission options",
    optionsButtonTip: "Mission options & upgrades",
    practiceRole: "Training pilot",
    linkedHint: "When linked, idle agents freeze the run — including every fuse.",
    loadoutHeader: "LOADOUT",
    bombPlural: "bombs",
    restartLabel: "Restart this deck",
    restartTip: "Restart deck — keep XP and unlocks [R]",
    keysHint: "WASD / arrows · Space bomb · Q line · E payload",
    scoreLabel: "Score",
    hostilesLabel: "Hostiles",
    bombCapAria: "Bombs",
    prevPilotTip: "Previous pilot — load their progress",
    nextPilotTip: "Next pilot — load their progress",
    railHint: "WASD move · Space bomb",
    payloadTipPrefix: "Payload",
    lineTip: "Plant facing line [Q]",
    dropLabel: "Bomb",
    dropTip: "Place a bomb [Space]",
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeRecord(base, override) {
  if (!isPlainObject(override)) return { ...base };
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (value === undefined) continue;
    result[key] = value;
  }
  return result;
}

function mergeNested(base, override) {
  if (!isPlainObject(override)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (value === undefined) continue;
    result[key] = isPlainObject(base[key]) && isPlainObject(value) ? mergeNested(base[key], value) : value;
  }
  return result;
}

function validDeck(deck) {
  return isPlainObject(deck)
    && typeof deck.id === "string" && deck.id.length > 0
    && typeof deck.name === "string" && deck.name.length > 0
    && typeof deck.prop === "string" && deck.prop.length > 0
    && Array.isArray(deck.layout) && deck.layout.length === 11
    && deck.layout.every((row) => typeof row === "string" && row.length === 13);
}

/**
 * Merges one or more partial or full override layers onto DEFAULT_CONFIG.
 * Safe against untrusted/malformed overrides: invalid decks, empty hero lists,
 * or prototype-pollution keys are ignored while valid partial overrides apply.
 */
export function resolveConfig(...layers) {
  let cfg = {
    ...DEFAULT_CONFIG,
    heroNames: { ...DEFAULT_CONFIG.heroNames },
    locationNames: { ...DEFAULT_CONFIG.locationNames },
    hostiles: [...DEFAULT_CONFIG.hostiles],
    ranks: DEFAULT_CONFIG.ranks.map((r) => ({ ...r })),
    buffs: mergeNested({}, DEFAULT_CONFIG.buffs),
    decks: DEFAULT_CONFIG.decks,
    art: mergeNested({}, DEFAULT_CONFIG.art),
    labels: mergeNested({}, DEFAULT_CONFIG.labels),
  };

  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    for (const key of [
      "id", "modName", "domPrefix", "title", "artDir", "actorsDir", "spriteDir",
      "castKey", "locationsSharedKey", "progressKey", "defaultHero", "repeatable", "defaultLocationName",
    ]) {
      if (typeof layer[key] === "string" && layer[key].length) cfg[key] = layer[key];
      else if (layer[key] === null && (key === "actorsDir" || key === "locationsSharedKey")) cfg[key] = null;
    }

    if (isPlainObject(layer.heroNames) && Object.keys(layer.heroNames).length) {
      const replace = layer.replaceHeroNames === true
        || (layer.replaceHeroNames !== false && Boolean(layer.spriteDir || layer.actorsDir || layer.hostiles));
      cfg.heroNames = replace ? mergeRecord({}, layer.heroNames) : mergeRecord(cfg.heroNames, layer.heroNames);
    }
    if (isPlainObject(layer.locationNames)) {
      cfg.locationNames = mergeRecord(cfg.locationNames, layer.locationNames);
    }
    if (Array.isArray(layer.hostiles) && layer.hostiles.length) {
      const valid = layer.hostiles.filter((id) => typeof id === "string" && id.length);
      if (valid.length) cfg.hostiles = valid;
    }
    if (Array.isArray(layer.ranks) && layer.ranks.length) {
      const valid = layer.ranks.filter((r) => isPlainObject(r) && Number.isFinite(r.xp) && typeof r.title === "string");
      if (valid.length) cfg.ranks = valid.map((r) => ({ xp: r.xp, title: r.title }));
    }
    if (isPlainObject(layer.buffs)) {
      cfg.buffs = mergeNested(cfg.buffs, layer.buffs);
    }
    if (Array.isArray(layer.decks) && layer.decks.length) {
      const valid = layer.decks.filter(validDeck);
      if (valid.length) cfg.decks = valid;
    }
    if (isPlainObject(layer.art)) {
      cfg.art = mergeNested(cfg.art, layer.art);
    }
    if (isPlainObject(layer.labels)) {
      cfg.labels = mergeNested(cfg.labels, layer.labels);
    }
  }

  // Ensure defaultHero and repeatable are always valid against heroNames/hostiles.
  if (!Object.hasOwn(cfg.heroNames, cfg.defaultHero)) {
    const fallback = Object.hasOwn(cfg.heroNames, DEFAULT_CONFIG.defaultHero)
      ? DEFAULT_CONFIG.defaultHero
      : Object.keys(cfg.heroNames)[0] ?? cfg.hostiles.find((id) => Object.hasOwn(cfg.heroNames, id));
    if (fallback) cfg.defaultHero = fallback;
  }
  if (!cfg.hostiles.includes(cfg.defaultHero)) {
    cfg.hostiles = [...cfg.hostiles, cfg.defaultHero];
  }
  if (!cfg.hostiles.includes(cfg.repeatable)) {
    cfg.repeatable = cfg.hostiles[0];
  }

  return cfg;
}

export function resolveAsset(cfg, filename) {
  const custom = cfg?.art?.files?.[filename];
  if (typeof custom === "string" && custom.length) {
    return custom.includes("/") ? custom : `${cfg.artDir}/${custom}`;
  }
  return `${cfg.artDir}/${filename}`;
}

export function resolveActorAtlas(cfg, hero, facing) {
  const perActor = cfg?.art?.actors?.[hero]?.[facing];
  if (typeof perActor === "string" && perActor.length) return perActor;
  const rel = `actors/${hero}-${facing}.svg`;
  const perFile = cfg?.art?.files?.[rel];
  if (typeof perFile === "string" && perFile.length) {
    return perFile.includes("/") ? perFile : `${cfg.artDir}/${perFile}`;
  }
  const base = cfg.actorsDir ?? `${cfg.artDir}/actors`;
  return `${base}/${hero}-${facing}.svg`;
}

export function resolvePortrait(cfg, hero) {
  const perHero = cfg?.art?.portraits?.[hero];
  if (typeof perHero === "string" && perHero.length) return perHero;
  return `${cfg.spriteDir}/${hero}.svg`;
}

export function configSignature(cfg) {
  return JSON.stringify([
    cfg.id,
    cfg.artDir,
    cfg.actorsDir,
    cfg.spriteDir,
    cfg.castKey,
    cfg.progressKey,
    cfg.defaultHero,
    cfg.repeatable,
    cfg.decks.map((d) => d.id),
  ]);
}
