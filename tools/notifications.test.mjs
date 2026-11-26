// Notification routing tests: never post real banners or launch applications.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const notificationSource = read("mods/star-wars-alerts/main.js");
const source = notificationSource.replace(/^import .*;\n/gm, "")
  .replace("export default class Toast", "return class Toast");
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ platform = "macos", active = false, checking = false, missingWindow = false,
  payload = {}, cast = {}, execute = async () => ({ code: 0, stderr: "" }) } = {}) {
  const state = { executions: [], warnings: [], errors: [], runs: [], closed: [], nodes: [] };
  const element = asset => {
    const node = { asset, calls: [] };
    const proxy = new Proxy(node, { get(target, key) {
      if (key in target) return target[key];
      if (key === "when") return (condition, fn) => condition ? fn(proxy) : proxy;
      return (...args) => { target.calls.push([key, ...args]); return proxy; };
    } });
    state.nodes.push(node);
    return proxy;
  };
  const Toast = new Function("host", `const { View, div, image, v_flex, h_flex, props, closeOverlay, run, theme, shared, exec, window, appHome, checking, console } = host;\n${source}`)({
    View: class {}, div: () => element(), image: element, v_flex: () => element(), h_flex: () => element(),
    props: () => ({ overlay: "toast-test", ...payload }), closeOverlay: id => state.closed.push(id),
    run: (...args) => state.runs.push(args), theme: () => ({ accent: "#123456" }), shared: () => cast,
    exec: (command, args) => { state.executions.push({ command, args }); return execute(command, args); },
    window: () => missingWindow ? null : ({ platform, active }), appHome: () => "/tmp/herdr-test-home",
    checking: () => checking,
    console: { warn: message => state.warnings.push(message), error: message => state.errors.push(message) },
  });
  return { state, view: new Toast() };
}

const hasText = (nodes, text) => nodes.some(node => node.calls.some(call => call[0] === "child" && call[1] === text));

test("inactive macOS banners target Herdr only on click and preserve literal title/body arguments", async () => {
  const title = 'Build "A" finished';
  const body = 'Quotes " and newlines\nstay data; do not run scripts.';
  const { state, view } = fixture({ payload: { title, body } });
  view.init();
  await flush();
  assert.deepEqual(state.executions, [{
    command: "terminal-notifier",
    args: ["-title", title, "-message", body, "-activate", "dev.herdr.app"],
  }]);
  assert.deepEqual(state.runs, []);
  assert.deepEqual(state.closed, []);
  assert.deepEqual(state.errors, []);
  assert.deepEqual(state.warnings, []);
});

test("missing macOS helper never falls back to AppleScript or opens another application", async () => {
  const { state, view } = fixture({
    payload: { title: "Build finished", body: "Ready for review", action: { name: "agent.focus", args: { terminal: "a1" } } },
    execute: async () => { throw new Error("terminal-notifier: ENOENT"); },
  });
  view.init();
  await flush();
  assert.deepEqual(state.executions.map(call => call.command), ["terminal-notifier"]);
  assert.equal(state.warnings.length, 1);
  assert.match(state.warnings[0], /brew install terminal-notifier/);
  assert.equal(state.closed.length, 0, "Do not dismiss the in-app alert on a helper failure");
  assert.equal(state.runs.length, 0, "Do not focus Herdr while posting a notification");
  view.render({});
  assert(hasText(state.nodes, "Build finished"));
  assert(hasText(state.nodes, "Ready for review"));
  const toast = state.nodes.find(node => node.calls.some(call => call[0] === "id" && call[1] === "toast"));
  toast.calls.find(call => call[0] === "on_click")[1]();
  assert.deepEqual(state.runs, [["agent.focus", { terminal: "a1" }]]);
  assert.deepEqual(state.closed, ["toast-test"]);
});

test("a failing macOS helper reports its error without running a fallback", async () => {
  const { state, view } = fixture({ execute: async () => ({ code: 1, stderr: "Notifications are not permitted" }) });
  view.init();
  await flush();
  assert.deepEqual(state.executions.map(call => call.command), ["terminal-notifier"]);
  assert.equal(state.errors.length, 1);
  assert.match(state.errors[0], /Notifications are not permitted/);
  assert.deepEqual(state.runs, []);
  assert.deepEqual(state.closed, []);
});

test("active Herdr windows, checks and missing windows never send system banners", async () => {
  for (const options of [{ active: true }, { checking: true }, { missingWindow: true }]) {
    const { state, view } = fixture(options);
    view.init();
    await flush();
    assert.deepEqual(state.executions, []);
  }
});

test("character-aware background alerts keep their attribution and use the Herdr click target", async () => {
  const { state, view } = fixture({
    cast: { a1: "luke" },
    payload: { title: "pi finished", body: "Task complete", action: { name: "agent.focus", args: { terminal: "a1" } } },
  });
  view.init();
  await flush();
  assert.deepEqual(state.executions[0], {
    command: "terminal-notifier",
    args: ["-title", "Luke Skywalker has completed the mission", "-message", "pi · Task complete", "-activate", "dev.herdr.app"],
  });
  view.render({});
  assert(state.nodes.some(node => node.asset === "mods/star-wars-agents/sprites/star-wars/luke.svg"));
});

test("macOS optional banner images remain separate command arguments", async () => {
  const { state, view } = fixture({ payload: { title: "Update", banner: "icons/notification.png" } });
  view.init();
  await flush();
  assert.deepEqual(state.executions[0].args.slice(-2), ["-contentImage", "/tmp/herdr-test-home/icons/notification.png"]);
  assert.equal(state.executions[0].args[3], " ", "Keep an empty body acceptable to terminal-notifier");
});

test("Linux still uses notify-send; Windows keeps the in-app notification", async () => {
  const linux = fixture({ platform: "linux", payload: { title: "Done", body: "Ready", banner: "icons/notification.png" } });
  linux.view.init();
  await flush();
  assert.deepEqual(linux.state.executions, [{
    command: "notify-send",
    args: ["-a", "Herdr", "-i", "/tmp/herdr-test-home/icons/notification.png", "Done", "Ready"],
  }]);
  const windows = fixture({ platform: "windows", payload: { title: "Done" } });
  windows.view.init();
  windows.view.render({});
  await flush();
  assert.deepEqual(windows.state.executions, []);
  assert(hasText(windows.state.nodes, "Done"));
});

test("the shared export ships the same safe notification implementation", () => {
  assert.equal(read("share/star-wars/mods/star-wars-alerts/main.js"), notificationSource);
  assert(!notificationSource.includes("SYSTEM_NOTIFICATION"));
  assert(!/exec\(["'](?:osascript|open)["']/.test(notificationSource));
});
