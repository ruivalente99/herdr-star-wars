// How notifications look. Anything can post one with notify({ title, body,
// level, icon, action }); replace this mod to restyle them all. Click to
// run its action (e.g. go to the agent) and dismiss it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, shared, exec, window, appHome, checking } from "herdr";

// Shared character assignments from the Star Wars Agents mod.
const CAST_KEY = "star-wars-agents.cast";
const HERO_ICON_SIZE = 28;
const AGENT_TOAST = /^(.+) (finished|needs you)$/;
const QUEST = {
  finished: { pose: "done", line: "completed the mission" },
  "needs you": { pose: "blocked", line: "needs backup" },
};
const HERO_NAMES = {
  vader: "Darth Vader",
  luke: "Luke Skywalker",
  leia: "Princess Leia",
  han: "Han Solo",
  chewbacca: "Chewbacca",
  stormtrooper: "Stormtrooper",
  r2d2: "R2-D2",
  "obi-wan": "Obi-Wan Kenobi",
  yoda: "Yoda",
  "boba-fett": "Boba Fett",
  c3po: "C-3PO",
  padme: "Padmé Amidala",
  ahsoka: "Ahsoka Tano",
  "mace-windu": "Mace Windu",
  "emperor-palpatine": "Emperor Palpatine",
};
const HERO_LINES = {
  vader: {
    done: (name) => `${name} has brought order to the galaxy`,
    blocked: (name) => `${name} requires your immediate attention`,
  },
  luke: {
    done: (name) => `${name} has completed the mission`,
    blocked: (name) => `${name} needs a hand`,
  },
  leia: {
    done: (name) => `${name} has secured the plans`,
    blocked: (name) => `${name} is calling for backup`,
  },
  han: {
    done: (name) => `${name} made the jump`,
    blocked: (name) => `${name} needs a co-pilot`,
  },
  chewbacca: {
    done: (name) => `${name} roars in triumph`,
    blocked: (name) => `${name} is calling for help`,
  },
  stormtrooper: {
    done: (name) => `${name} reports: target secured`,
    blocked: (name) => `${name} lost the target`,
  },
  r2d2: {
    done: (name) => `${name} beeps: mission complete`,
    blocked: (name) => `${name} is sending an alert`,
  },
  "obi-wan": {
    done: (name) => `${name} has brought balance to the mission`,
    blocked: (name) => `${name} is waiting for backup`,
  },
  yoda: {
    done: (name) => `Mission complete, hmm. Yoda has.`,
    blocked: (name) => `A disturbance in the mission, Yoda senses.`,
  },
  "boba-fett": {
    done: (name) => `${name} returned with the bounty`,
    blocked: (name) => `${name}'s target is still at large`,
  },
  c3po: {
    done: (name) => `${name} calculates a successful mission`,
    blocked: (name) => `${name} reports a highly improbable outcome`,
  },
  padme: {
    done: (name) => `${name} has secured the alliance`,
    blocked: (name) => `${name} requests reinforcements`,
  },
  ahsoka: {
    done: (name) => `${name} completed the mission her way`,
    blocked: (name) => `${name} could use a hand`,
  },
  "mace-windu": {
    done: (name) => `${name} has delivered justice`,
    blocked: (name) => `${name} needs backup to finish this`,
  },
  "emperor-palpatine": {
    done: () => "Everything is proceeding as foreseen",
    blocked: () => "The Emperor foresees complications",
  },
};

// Only clicking a native banner should bring Herdr forward.
const HERDR_BUNDLE = "dev.herdr.app";

function reportFailure(tool) {
  return (r) => { if (r.code !== 0) console.error(`System notification failed (${tool} ${r.code}): ${r.stderr}`); };
}

// AppleScript banners can be attributed to Script Editor and open it when clicked.
// Never fall back to a script runner: keep the in-app toast if the native helper is unavailable.
function postToMacos(title, body, image) {
  const picture = image ? ["-contentImage", `${appHome()}/${image}`] : [];
  exec("terminal-notifier", ["-title", title, "-message", body || " ", "-activate", HERDR_BUNDLE, ...picture]).then(
    reportFailure("terminal-notifier"),
    (e) => console.warn(`Native macOS banner unavailable: ${e}. In-app alerts remain available. Install terminal-notifier (brew install terminal-notifier) to enable system banners.`),
  );
}

function postToLinux(title, body, image) {
  const icon = image ? ["-i", `${appHome()}/${image}`] : [];
  exec("notify-send", ["-a", "Herdr", ...icon, title, body]).then(
    reportFailure("notify-send"),
    (e) => console.error(`System notification failed (is notify-send installed?): ${e}`),
  );
}

// The in-app toast can't be seen from behind another app, so mirror it to the system's banners.
// Windows has no banner command to call, so there the in-app toast is all.
function postToSystem(platform, title, body, image) {
  if (platform === "macos") postToMacos(title, body, image);
  if (platform === "linux") postToLinux(title, body, image);
}

function heroOf(p) {
  const event = AGENT_TOAST.exec(p.title ?? "");
  const terminal = p.action?.name === "agent.focus" ? p.action.args?.terminal : null;
  const hero = terminal ? shared(CAST_KEY)?.[terminal] : null;
  if (!event || !hero || !HERO_NAMES[hero]) return null;
  const { pose, line } = QUEST[event[2]];
  const name = HERO_NAMES[hero];
  return {
    title: HERO_LINES[hero]?.[pose](name) ?? `${name} ${line}`,
    body: p.body ? `${event[1]} · ${p.body}` : event[1],
    icon: `mods/star-wars-agents/sprites/star-wars/${hero}.svg`,
    banner: null,
  };
}

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class Toast extends View {
  // init, not render: from another macOS Space the window may not draw, so render may not run.
  init() {
    const w = window();
    if (checking() || !w || w.active) return;
    const raw = props() ?? {};
    const p = { ...raw, ...heroOf(raw) };
    postToSystem(w.platform, p.title ?? "Herdr", p.body ?? "", p.banner);
  }

  render(cx) {
    const t = theme();
    const raw = props() ?? {};
    const p = { ...raw, ...heroOf(raw) };
    const iconSize = p.icon === raw.icon ? 18 : HERO_ICON_SIZE;
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .size_full()
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(iconSize).h(iconSize).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
