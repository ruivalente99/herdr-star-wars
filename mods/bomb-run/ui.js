import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { settings } from "herdr";
import { DEFAULT_CONFIG, resolveAsset, resolvePortrait } from "./config.js";
import { WIDTH, STEP_MS } from "./game.js";
import { deckScene, fitTile } from "./scene.js";

// A small pixel icon set, not platform-dependent emoji or another asset package.
const ICONS = {
  pause: [[2, 2, 3, 9], [8, 2, 3, 9]],
  play: [[3, 1, 2, 11], [5, 3, 2, 7], [7, 5, 2, 3]],
  options: [[2, 1, 1, 11], [6, 1, 1, 11], [10, 1, 1, 11], [1, 4, 3, 3], [5, 8, 3, 3], [9, 2, 3, 3]],
  expand: [[7, 1, 5, 2], [10, 1, 2, 5], [8, 3, 2, 2], [6, 5, 2, 2], [4, 7, 2, 2], [1, 7, 2, 5], [1, 10, 5, 2]],
  close: [[2, 2, 2, 2], [4, 4, 2, 2], [6, 6, 2, 2], [8, 8, 2, 2], [10, 10, 2, 2], [10, 2, 2, 2], [8, 4, 2, 2], [4, 8, 2, 2], [2, 10, 2, 2]],
  link: [[1, 2, 6, 2], [1, 2, 2, 6], [1, 6, 4, 2], [6, 5, 6, 2], [10, 5, 2, 6], [6, 9, 6, 2], [4, 5, 4, 2]],
};

function pixelIcon(name, color) {
  const icon = div().relative().w(13).h(13).flex_none();
  for (const [x, y, width, height] of ICONS[name]) {
    icon.child(div().absolute().left(x).top(y).w(width).h(height).bg(color));
  }
  return icon;
}

function tool(id, content, title, t, action, selected = false) {
  return div().id(id).h(24).min_w(24).px(5).flex_none().rounded(4)
    .bg(selected ? t.selected : "#00000000").text_color(selected ? t.accent : t.dim)
    .flex().items_center().justify_center().text_size(10).cursor_pointer().role("button")
    .accessibility_label(title).tooltip(title).hover((el) => el.bg(t.hover).text_color(t.foreground))
    .on_click(action).child(content);
}

function inlineStat(label, value, t, color = t.foreground) {
  return h_flex().items_center().gap(5).accessibility_label(`${label}: ${value}`)
    .child(div().text_size(9).text_color(t.dim).child(label))
    .child(div().text_size(11).font_family("JetBrains Mono").text_color(color).child(value));
}

function optionsPanel(view, c, cfg) {
  const { t, selected, power, heroName } = c;
  const prefix = cfg.domPrefix;
  const L = cfg.labels;
  const panel = v_flex().id(`${prefix}-options-panel`).absolute().right(8).top(36)
    .w(Math.max(240, Math.min(310, view.viewWidth - 16))).max_h(Math.max(160, view.viewHeight - 48))
    .overflow_y_scrollbar().p(12).gap(10)
    .rounded(6).border(1).border_color(t.border).bg(t.popover);
  panel.child(h_flex().items_center().gap(6)
    .child(div().flex_1().font_semibold().text_size(11).child(L.optionsTitle))
    .child(tool(`${prefix}-options-close`, pixelIcon("close", t.dim), "Close options", t, (_event, cx) => view.toggleOptions(cx))));
  panel.child(h_flex().items_center().gap(8)
    .child(image(resolvePortrait(cfg, view.game.hero)).w(28).h(28).flex_none())
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(div().text_size(11).font_medium().truncate().child(heroName))
      .child(div().text_size(9).text_color(t.dim).truncate()
        .child(`${selected?.program?.name ?? L.practiceRole} · ${selected?.status ?? "offline"}`))));
  panel.child(tool(`${prefix}-thinking-details`, `Thinking only: ${view.thinkingOnly ? "On" : "Off"}`,
    "Only play while the selected agent is working", t, (_event, cx) => view.toggleThinking(cx), view.thinkingOnly)
    .role("switch").checked(view.thinkingOnly));
  panel.child(div().text_size(9).text_color(t.dim).child(L.linkedHint));
  panel.child(h_flex().items_center().gap(8)
    .child(div().flex_1().text_size(9).text_color(t.dim).child(L.loadoutHeader))
    .child(div().text_size(10).text_color(t.foreground)
      .child(`${power.range} range · ${power.capacity} ${L.bombPlural} · ${(STEP_MS / power.stepMs).toFixed(1)}× speed`)));
  for (const [id, upgrade] of Object.entries(cfg.buffs)) panel.child(h_flex().id(`buff-status-${id}`).gap(7).items_center()
    .tooltip(upgrade.hint).opacity(power.unlocks[id] ? 1 : 0.55)
    .child(image(resolveAsset(cfg, `buff-${id}.svg`)).w(14).h(14))
    .child(div().flex_1().text_size(10).child(upgrade.name))
    .child(div().text_size(9).text_color(power.unlocks[id] ? t.done : t.dim)
      .child(power.unlocks[id] ? "Unlocked" : `${L.unitShort}${upgrade.level} · ${upgrade.xp} XP`)));
  panel.child(tool(`${prefix}-touch-controls`, `On-screen controls: ${view.showControls ? "On" : "Off"}`,
    "Show or hide directional controls", t, (_event, cx) => {
      view.showControls = !view.showControls;
      view.toggleOptions(cx);
    }, view.showControls).role("switch").checked(view.showControls));
  panel.child(tool(`${prefix}-restart`, L.restartLabel, L.restartTip, t, (_event, cx) => {
    view.optionsOpen = false;
    view.reset(cx);
  }));
  panel.child(div().text_size(9).text_color(t.dim).child(L.keysHint));
  return panel;
}

export function gamePanel(view, c, cfg = DEFAULT_CONFIG) {
  const { t, selected, heroName, power, deck, locationName, waiting, options, overlay, canSwitch, time } = c;
  const prefix = cfg.domPrefix;
  const L = cfg.labels;
  const stopped = view.game.status !== "playing";
  const statusColor = waiting ? t.working : view.game.status === "lost" ? t.blocked
    : view.game.status === "won" ? t.done : !view.started || view.paused ? t.dim : t.accent;
  const frameWidth = WIDTH * view.tileSize;
  const panel = v_flex().id(`${prefix}-root`).relative().size_full().min_w(0).bg(t.surface).text_color(t.foreground)
    .track_focus(view.focus).accessibility_label(L.panelAria)
    .on_mouse_down("left", () => view.focus.focus())
    .on_key_down((event, cx) => view.keyDown(event, cx))
    .on_key_up((event, cx) => {
      const key = String(event.key ?? event.keystroke).toLowerCase().replace(/^arrow/, "");
      if (key === view.held) { view.held = null; cx.stop_propagation(); }
    })
    .on_size_change((size, cx) => {
      const zoom = settings().zoom ?? 1;
      const width = Math.floor(size.width / zoom), height = Math.floor(size.height / zoom);
      if (width !== view.viewWidth || height !== view.viewHeight) {
        view.viewWidth = width; view.viewHeight = height; cx.notify();
      }
    });

  panel.child(h_flex().id(`${prefix}-toolbar`).h(36).px(8).flex_none().gap(5).items_center()
    .child(div().w(22).h(22).flex_none().flex().items_center().justify_center().rounded(3)
      .bg(t.raised).font_family("JetBrains Mono").text_size(10).text_color(t.accent)
      .tooltip(`${L.unit} ${view.game.level}`).child(String(view.game.level).padStart(2, "0")))
    .child(div().flex_1().min_w(0).text_size(11).font_medium().truncate()
      .tooltip(`${deck.name} · ${locationName}\n${deck.hint}`).child(deck.name))
    .child(tool(`${prefix}-pause`, pixelIcon(view.paused ? "play" : "pause", t.muted), "Pause / resume [P]", t,
      (_event, cx) => view.pause(cx)).disabled(!view.started || stopped).opacity(!view.started || stopped ? 0.35 : 1))
    .child(tool(`${prefix}-thinking-only`, pixelIcon("link", view.thinkingOnly ? t.accent : t.dim),
      `Thinking only: ${view.thinkingOnly ? "On" : "Off"} · Agent ${selected?.status ?? "offline"}`, t,
      (_event, cx) => view.toggleThinking(cx), view.thinkingOnly).role("switch").checked(view.thinkingOnly))
    .child(tool(`${prefix}-options`, pixelIcon("options", t.dim), L.optionsButtonTip, t,
      (_event, cx) => view.toggleOptions(cx), view.optionsOpen))
    .when(!overlay, (el) => el.child(tool(`${prefix}-expand`, pixelIcon("expand", t.dim), "Open larger game", t,
      (_event, cx) => view.expand(cx))))
    .child(tool(`${prefix}-close`, pixelIcon("close", t.muted), overlay ? "Close game" : "Close game panel", t, () => view.close())));

  // HUD, deck and pilot stay together, instead of creating independent dashboard rows.
  panel.child(div().id(`${prefix}-viewport`).relative().flex_1().min_h(0).min_w(0).mx(8).overflow_hidden()
    .flex().items_center().justify_center()
    .on_size_change((size, cx) => {
      const zoom = settings().zoom ?? 1;
      const next = fitTile(size.width, Math.max(0, size.height - 66 * zoom), zoom);
      if (next !== view.tileSize) { view.tileSize = next; cx.notify(); }
    })
    .child(v_flex().id(`${prefix}-game-frame`).w(frameWidth).flex_none()
      .child(h_flex().id(`${prefix}-hud`).h(26).px(2).flex_none().items_center().gap(8)
        .child(inlineStat(L.scoreLabel, String(view.game.score).padStart(4, "0"), t))
        .child(div().flex_1())
        .child(inlineStat(L.hostilesLabel, `${view.game.enemies.length}/${view.game.enemyTotal}`, t))
        .child(div().flex_1())
        .child(div().text_size(10).font_family("JetBrains Mono").text_color(t.dim).child(time)))
      .child(deckScene(view.game, options, { play: (cx) => view.play(cx) }, cfg))
      .child(h_flex().id(`${prefix}-pilot`).relative().h(40).flex_none().gap(6).items_center()
        .child(image(resolvePortrait(cfg, view.game.hero)).w(24).h(24).flex_none())
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().text_size(10).font_medium().truncate().child(heroName))
          .child(div().text_size(9).text_color(t.dim).truncate()
            .tooltip(view.storageFailed ? "Progress is only kept for this session" : "Progress saved for this agent")
            .child(`${power.title} · ${power.xp}${power.nextXP == null ? " XP" : ` / ${power.nextXP}`}`)))
        .child(div().size(5).flex_none().rounded_full().bg(statusColor)
          .tooltip(`${view.thinkingOnly ? "Linked" : "Free play"} · Agent ${selected?.status ?? "offline"}`))
        .child(image(resolveAsset(cfg, "buff-range.svg")).w(12).h(12).flex_none())
        .child(div().text_size(10).font_family("JetBrains Mono").text_color(t.dim)
          .tooltip(`Range ${power.range} · ${power.wide ? L.payloadNames.nova : power.echo ? L.payloadNames.echo : L.payloadNames.standard} · ${(STEP_MS / power.stepMs).toFixed(1)}× speed`)
          .child(String(power.range)))
        .child(image(resolveAsset(cfg, `${cfg.art.bombPrefix}-0.svg`)).w(12).h(12).flex_none())
        .child(div().text_size(10).font_family("JetBrains Mono").text_color(t.muted)
          .accessibility_label(`${L.bombCapAria} ${power.capacity - view.game.bombs.length} of ${power.capacity}`)
          .child(`${power.capacity - view.game.bombs.length}/${power.capacity}`))
        .when(canSwitch, (el) => el.child(tool(`${prefix}-prev-agent`, "‹", L.prevPilotTip, t,
          (_event, cx) => view.selectAgent(-1, cx))).child(tool(`${prefix}-next-agent`, "›", L.nextPilotTip, t,
          (_event, cx) => view.selectAgent(1, cx))))
        .child(div().id(`${prefix}-xp`).absolute().bottom(0).left(0).right(0).h(2).bg(t.border)
          .child(div().h(2).w(`${Math.round(power.progress * 100)}%`).bg(t.accent))))));

  panel.when(view.showControls, (el) => el.child(h_flex().id(`${prefix}-dpad`).h(28).px(10).flex_none().gap(4).justify_center()
    .children([["left", "←", -1, 0], ["up", "↑", 0, -1], ["down", "↓", 0, 1], ["right", "→", 1, 0]]
      .map(([id, label, dx, dy]) => tool(`${prefix}-${id}`, label, `Move ${id}`, t, (_event, cx) => view.walk(dx, dy, cx))
        .disabled(waiting).opacity(waiting ? 0.35 : 1)))));
  panel.child(h_flex().id(`${prefix}-control-rail`).h(30).px(10).flex_none().gap(3).items_center()
    .child(div().flex_1().min_w(0).text_size(9).text_color(t.dim).truncate().child(L.railHint))
    .when(power.unlocks.nova || power.unlocks.echo, (el) => el.child(tool(`${prefix}-payload`, "E", `${L.payloadTipPrefix}: ${power.payload} [E]`, t,
      (_event, cx) => view.choosePayload(cx)).disabled(waiting)))
    .when(power.line, (el) => el.child(tool(`${prefix}-line`, "Q", L.lineTip, t,
      (_event, cx) => view.launch(cx)).disabled(waiting)))
    .child(tool(`${prefix}-drop`, L.dropLabel, L.dropTip, t,
      (_event, cx) => view.drop(cx), true).disabled(waiting).opacity(waiting ? 0.35 : 1)));
  if (view.optionsOpen) panel.child(optionsPanel(view, c, cfg));
  return panel;
}
