import { View } from "gpui-kit";
import { agents, appHome, closeOverlay, checking, props, readTextFile, shared, spaces, theme, window, layout, run, openOverlay } from "herdr";
import { configSignature, resolveConfig } from "./config.js";
import { TICK_MS, cyclePayload, deckFor, powerFor, movePlayer, newGame, nextLevel, normalizeProfile, placeBomb, placeLine, tick } from "./game.js";
import { gamePanel } from "./ui.js";

const MOVES = { up: [0, -1], w: [0, -1], down: [0, 1], s: [0, 1], left: [-1, 0], a: [-1, 0], right: [1, 0], d: [1, 0] };
const keyOf = (event) => String(event.key ?? event.keystroke).toLowerCase().replace(/^arrow/, "");

function loadProgress(progressKey) {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export function gameVisible(tree, ownProps) {
  if (ownProps?.overlay || !ownProps?.panel) return true;
  const panel = find(tree, ownProps.panel);
  const stack = find(tree, ownProps.stack);
  return Boolean(panel && !panel.hidden && stack?.active === ownProps.child);
}

export function character(agent, cast, cfg) {
  const assigned = agent && cast && typeof cast === "object" ? cast[agent.address] : null;
  return Object.hasOwn(cfg.heroNames, assigned) ? assigned : cfg.defaultHero;
}

function clock(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

async function readJsonFile(path) {
  try {
    const raw = await readTextFile(path);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default class BombRun extends View {
  init(_props, cx) {
    this.focus = cx.focus_handle();
    this.started = false;
    this.paused = false;
    this.thinkingOnly = false;
    this.fileOverrides = { global: null, layout: null, layoutName: null, prop: null, propPath: null };
    if (!checking()) {
      try { this.thinkingOnly = localStorage.getItem("thinking-only") === "true"; } catch {}
    }
    this.held = null;
    this.nextMove = 0;
    this.tileSize = 24;
    this.epoch = 0;
    this.optionsOpen = false;
    this.showControls = false;
    this.viewWidth = 368;
    this.viewHeight = 640;
    const active = spaces().find((space) => space.active);
    this.selectedAddress = (agents().find((agent) => agent.address === props()?.pilot) ?? agents().find((agent) => agent.focused)
      ?? agents().find((agent) => agent.space === active?.id) ?? agents()[0])?.address ?? null;
    this.progressKey = this.selectedAddress ?? "__training__";
    this.cfg = this.resolveActiveConfig();
    this.skinSig = configSignature(this.cfg);
    this.progress = checking() ? {} : loadProgress(this.cfg.progressKey);
    this.game = this.mission();
    if (checking()) return;
    this.loadFileOverrides(cx);
    // Fixed simulation ticks support the 120 ms speed milestone exactly;
    // position interpolation stays native. Nothing advances while gated/paused.
    cx.timer.every(TICK_MS, (cx) => {
      if (this.waitingForAgent()) { this.held = null; return; }
      if (!this.started || this.paused || this.game.status !== "playing") return;
      if (window()?.visible === false || !gameVisible(layout(), props()) || !this.focus.is_focused()) {
        this.held = null;
        this.paused = true;
        cx.notify();
        return;
      }
      tick(this.game, TICK_MS, this.cfg);
      this.persist();
      if (this.held) this.walk(...MOVES[this.held], cx);
      cx.notify();
    });
  }

  resolveActiveConfig() {
    const activeLayout = typeof shared("layout") === "string" ? shared("layout") : null;
    const sharedMap = shared("bomb-run.overrides");
    const layoutShared = activeLayout && sharedMap && typeof sharedMap === "object" ? sharedMap[activeLayout] : null;
    const globalShared = shared("bomb-run.override");
    const ownOverride = props()?.override ?? props()?.skin ?? null;
    const inlineOverride = ownOverride && typeof ownOverride === "object" && !Array.isArray(ownOverride) ? ownOverride : null;
    const layoutFile = this.fileOverrides.layoutName === activeLayout ? this.fileOverrides.layout : null;
    const propFile = typeof ownOverride === "string" && this.fileOverrides.propPath === ownOverride ? this.fileOverrides.prop : null;
    return resolveConfig(
      this.fileOverrides.global,
      layoutFile,
      globalShared,
      layoutShared,
      propFile,
      inlineOverride,
    );
  }

  loadFileOverrides(cx) {
    if (checking() || typeof readTextFile !== "function" || typeof appHome !== "function") return;
    const home = appHome();
    if (!home) return;
    const activeLayout = typeof shared("layout") === "string" ? shared("layout") : null;
    const ownOverride = props()?.override ?? props()?.skin ?? null;
    const propPath = typeof ownOverride === "string" && ownOverride.length ? ownOverride : null;
    const needGlobal = !this.globalOverrideLoaded;
    const needLayout = Boolean(activeLayout) && this.fileOverrides.layoutName !== activeLayout;
    const needProp = Boolean(propPath) && this.fileOverrides.propPath !== propPath;
    if (!needGlobal && !needLayout && !needProp) return;
    this.globalOverrideLoaded = true;
    if (needLayout) this.fileOverrides.layoutName = activeLayout;
    if (needProp) this.fileOverrides.propPath = propPath;
    cx.spawn(async (cx) => {
      let changed = false;
      if (needGlobal) {
        const data = await readJsonFile(`${home}/mods/bomb-run/override.json`);
        if (data) { this.fileOverrides.global = data; changed = true; }
      }
      if (needLayout) {
        const safeLayout = activeLayout.replace(/[^a-zA-Z0-9._-]/g, "");
        const data = safeLayout ? await readJsonFile(`${home}/mods/bomb-run/overrides/${safeLayout}.json`) : null;
        if (data || this.fileOverrides.layout) {
          this.fileOverrides.layout = data;
          changed = true;
        }
      }
      if (needProp) {
        const full = propPath.startsWith("/") ? propPath : `${home}/${propPath}`;
        const data = await readJsonFile(full);
        if (data) { this.fileOverrides.prop = data; changed = true; }
      }
      if (changed) cx.notify();
    });
  }

  syncSkin() {
    const nextCfg = this.resolveActiveConfig();
    const nextSig = configSignature(nextCfg);
    this.cfg = nextCfg;
    if (nextSig === this.skinSig) return;
    this.skinSig = nextSig;
    this.progress = checking() ? {} : loadProgress(nextCfg.progressKey);
    if (!this.started) {
      this.game = this.mission();
      this.epoch++;
    }
  }

  waitingForAgent() {
    return this.thinkingOnly && agents().find((agent) => agent.address === this.selectedAddress)?.status !== "working";
  }

  toggleThinking(cx) {
    this.thinkingOnly = !this.thinkingOnly;
    this.held = null;
    if (!checking()) {
      try { localStorage.setItem("thinking-only", String(this.thinkingOnly)); }
      catch (error) { console.warn(`${this.cfg.title}: setting could not be saved: ${error}`); }
    }
    cx.notify();
  }

  toggleOptions(cx) {
    this.optionsOpen = !this.optionsOpen;
    this.held = null;
    if (this.optionsOpen && this.started && this.game.status === "playing") this.paused = true;
    cx.notify();
  }

  expand(cx) {
    this.paused = true;
    this.held = null;
    this.optionsOpen = false;
    cx.notify();
    const ownOverride = props()?.override ?? props()?.skin;
    openOverlay({
      mod: this.cfg.modName,
      kind: "dialog",
      width: 640,
      height: 760,
      props: {
        pilot: this.selectedAddress,
        ...(ownOverride ? { override: ownOverride } : {}),
      },
    });
  }

  pilotHero() {
    return character(agents().find((agent) => agent.address === this.selectedAddress), shared(this.cfg.castKey), this.cfg);
  }

  profile() {
    return normalizeProfile(Object.hasOwn(this.progress, this.progressKey) ? this.progress[this.progressKey] : null);
  }

  mission(level = this.profile().level) {
    return newGame({ ...this.profile(), level, hero: this.pilotHero() }, this.cfg);
  }

  persist() {
    if (checking()) return;
    const profile = this.profile();
    const unlocked = Math.min(9999, this.game.level + (this.game.status === "won" ? 1 : 0));
    if (this.game.xp <= profile.xp && unlocked <= profile.level) return;
    const storageKey = this.cfg.progressKey;
    const latest = loadProgress(storageKey);
    const saved = normalizeProfile(Object.hasOwn(latest, this.progressKey) ? latest[this.progressKey] : null);
    this.progress = {
      ...latest,
      [this.progressKey]: {
        xp: Math.max(saved.xp, profile.xp, this.game.xp),
        level: Math.max(saved.level, profile.level, unlocked),
      },
    };
    if (!this.storageFailed) {
      try { localStorage.setItem(storageKey, JSON.stringify(this.progress)); }
      catch (error) { this.storageFailed = true; console.warn(`${this.cfg.title}: progress could not be saved: ${error}`); }
    }
  }

  prepare(cx, level) {
    this.optionsOpen = false;
    this.game = this.mission(level);
    this.started = false;
    this.paused = false;
    this.held = null;
    this.nextMove = 0;
    this.epoch++;
    cx.notify();
  }

  reset(cx) {
    this.persist();
    this.prepare(cx, this.game.level);
  }

  play(cx) {
    if (this.waitingForAgent()) { this.held = null; cx.notify(); return; }
    if (!checking() && !this.storageFailed) this.progress = loadProgress(this.cfg.progressKey);
    this.game.xp = Math.max(this.game.xp, this.profile().xp);
    if (this.game.status === "won") {
      this.persist();
      this.game = nextLevel(this.game, this.cfg);
      this.nextMove = this.game.elapsed;
      this.epoch++;
    } else if (this.game.status === "lost") this.reset(cx);
    else if (!this.started && this.game.hero !== this.pilotHero()) this.game = this.mission(this.game.level);
    this.started = true;
    this.paused = false;
    this.optionsOpen = false;
    this.held = null;
    this.focus.focus();
    cx.notify();
  }

  pause(cx) {
    if (!this.started || this.game.status !== "playing" || (this.paused && this.waitingForAgent())) return;
    this.paused = !this.paused;
    if (!this.paused) this.optionsOpen = false;
    this.held = null;
    this.focus.focus();
    cx.notify();
  }

  close() {
    if (props()?.overlay) closeOverlay(props().overlay);
    else if (props()?.panel) run("layout.hide", { id: props().panel });
  }

  selectAgent(direction, cx) {
    const list = agents();
    if (!list.length) return;
    const current = list.findIndex((agent) => agent.address === this.selectedAddress);
    const index = current < 0 ? (direction > 0 ? -1 : 0) : current;
    this.persist();
    this.selectedAddress = list[(index + direction + list.length) % list.length].address;
    this.progressKey = this.selectedAddress;
    this.progress = checking() ? {} : loadProgress(this.cfg.progressKey);
    this.prepare(cx);
  }

  walk(dx, dy, cx) {
    if (!this.started || this.paused || this.waitingForAgent() || this.game.elapsed < this.nextMove) return;
    this.nextMove = this.game.elapsed + powerFor(this.game, this.cfg).stepMs;
    if (movePlayer(this.game, dx, dy, this.cfg)) cx.notify();
  }

  drop(cx) {
    if (this.started && !this.paused && !this.waitingForAgent() && placeBomb(this.game, this.cfg)) cx.notify();
  }

  launch(cx) {
    if (this.started && !this.paused && !this.waitingForAgent() && placeLine(this.game, this.cfg)) cx.notify();
  }

  choosePayload(cx) {
    if (this.started && !this.paused && !this.waitingForAgent() && cyclePayload(this.game, this.cfg)) cx.notify();
  }

  keyDown(event, cx) {
    if (event.modifiers?.control || event.modifiers?.platform || event.modifiers?.alt) return;
    const key = keyOf(event);
    if (key === "escape" && this.optionsOpen) {
      this.optionsOpen = false;
      this.held = null;
      cx.notify();
      cx.stop_propagation();
      return;
    }
    if (key === "escape") {
      if (this.started && !this.paused && this.game.status === "playing") this.pause(cx);
      else this.close();
    } else if (key === "enter" && (!this.started || this.paused || this.game.status !== "playing")) this.play(cx);
    else if (key === "r" && !event.is_held) this.reset(cx);
    else if (key === "p" && !event.is_held) this.pause(cx);
    else if (key === "e" && !event.is_held) this.choosePayload(cx);
    else if (Object.hasOwn(MOVES, key)) {
      if (this.waitingForAgent()) this.held = null;
      else if (!event.is_held) { this.held = key; this.walk(...MOVES[key], cx); }
    } else if (key === "q" && !event.is_held) this.launch(cx);
    else if ((key === " " || key === "space") && !event.is_held) this.drop(cx);
    else return;
    cx.stop_propagation();
  }

  render(cx) {
    if (cx) this.loadFileOverrides(cx);
    this.syncSkin();
    const cfg = this.cfg;
    const t = theme();
    const list = agents();
    const selected = list.find((agent) => agent.address === this.selectedAddress);
    const hero = this.game.hero;
    const power = powerFor(this.game, cfg);
    const deck = deckFor(this.game.level, cfg);
    const activeSpace = spaces().find((space) => space.active);
    const assignment = cfg.locationsSharedKey ? shared(cfg.locationsSharedKey)?.[activeSpace?.id] : null;
    const locationName = cfg.locationNames[assignment] ?? cfg.defaultLocationName;
    const waiting = this.waitingForAgent();
    const options = {
      tile: this.tileSize,
      hero,
      started: this.started,
      paused: this.paused,
      epoch: this.epoch,
      waiting: waiting ? selected ? `Selected agent is ${selected.status ?? "not working"}. Waiting for working status.`
        : "No selected agent is connected. Disable Thinking only to train." : null,
    };
    return gamePanel(this, {
      t,
      selected,
      heroName: cfg.heroNames[hero] ?? hero,
      power,
      deck,
      locationName,
      waiting,
      options,
      overlay: Boolean(props()?.overlay),
      canSwitch: list.length > 1 || (list.length === 1 && !selected),
      time: clock(this.game.elapsed),
    }, cfg);
  }
}
