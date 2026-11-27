// Synced from herdr-common (mods/status/main.js). Do not edit directly; edit pack.config.mjs and run sync.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, setBadge, checking } from "herdr";
import { STATUS_CONFIG } from "./config.js";

const WAITING_STATUS = "blocked";

export default class WorkspaceStatus extends View {
  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint() {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  showWaitingOnDock(waiting) {
    if (checking()) return;
    const badge = waiting > 0 ? String(waiting) : null;
    if (badge === this.badge) return;
    this.badge = badge;
    setBadge(badge);
  }

  async close() {
    if (this.badge) setBadge(null);
  }

  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const list = agents();
    this.showWaitingOnDock(list.filter((a) => a.status === WAITING_STATUS).length);
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), (el) => el.child(label("branch", space.branch)))
      .children(STATUS_CONFIG.quest.map(([status, words]) => [status, words, list.filter((a) => a.status === status).length])
        .filter(([, , count]) => count > 0)
        .map(([status, words, count]) => h_flex().gap(6).items_center()
          .child(div().size(6).rounded(3).bg(t[status] ?? t.dim))
          .text_color(status === "blocked" ? t.blocked : t.muted)
          .child(`${count} ${words}`)))
      .when(list.length === 0, (el) => el.child(STATUS_CONFIG.emptyLabel))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint()));
  }
}
