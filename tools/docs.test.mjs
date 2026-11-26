// Local documentation checks; no network requests or real Herdr commands.
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const readme = read("README.md");
const slug = value => value.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

function checkLink(target) {
  if (/^https?:\/\//.test(target)) return;
  const [path, anchor] = target.split("#");
  assert(!path || existsSync(resolve(root, path)), `Missing README asset or link: ${target}`);
  if (anchor) {
    const document = path ? read(path) : readme;
    const headings = [...document.matchAll(/^#{1,6} (.+)$/gm)].map(match => slug(match[1]));
    assert(headings.includes(anchor), `Missing README anchor: ${target}`);
  }
}

test("README navigation, images and local links resolve", () => {
  for (const match of readme.matchAll(/(?:src|href)="([^"]+)"/g)) checkLink(match[1]);
  for (const match of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) checkLink(match[1]);
  assert(!readme.includes('src="layouts/star-wars.png"'), "Do not reuse the blurry layout thumbnail as the README hero");
});

test("overview is a self-contained, wide SVG with explicit illustration provenance", () => {
  const art = read("docs/images/overview.svg");
  assert.match(art, /viewBox="0 0 1440 760"/);
  assert.match(art, /Not a screenshot\./);
  assert.match(art, /LIGHT SIDE/);
  assert.match(art, /DARK SIDE/);
  assert.match(art, /id="speech-bubble-light"/);
  assert.match(art, /id="speech-bubble-dark"/);
  assert(!/<script|<foreignObject/.test(art));
  const ids = [...art.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Duplicate SVG IDs");
  for (const [, href] of art.matchAll(/\bhref="([^"]+)"/g)) {
    assert(href.startsWith("#") || href.startsWith("data:image/png;base64,"), `External SVG asset: ${href}`);
    if (href.startsWith("#")) assert(ids.includes(href.slice(1)), `Missing SVG symbol: ${href}`);
  }
});

test("root recipe and preview match the installable export", () => {
  assert(read("RECIPE.md").includes("# Star Wars"));
  assert(read("RECIPE.md").includes("![Star Wars for Herdr](preview.png)"));
  assert(readFileSync(resolve(root, "RECIPE.md")).equals(readFileSync(resolve(root, "share/star-wars/RECIPE.md"))));
  assert(readFileSync(resolve(root, "preview.png")).equals(readFileSync(resolve(root, "share/star-wars/preview.png"))));
});

test("installer backs up only matching files, validates mods and installs the layout", () => {
  const temp = mkdtempSync(join(tmpdir(), "herdr-install-"));
  try {
    const bin = join(temp, "bin");
    const app = join(temp, "app");
    mkdirSync(bin);
    mkdirSync(join(app, "layouts"), { recursive: true });
    mkdirSync(join(app, "mods", "star-wars-agents"), { recursive: true });
    writeFileSync(join(app, "layouts", "star-wars.json"), "previous layout");
    writeFileSync(join(app, "layouts", "unrelated.json"), "keep me");
    writeFileSync(join(app, "mods", "star-wars-agents", "old-file"), "previous mod");
    writeFileSync(join(bin, "herdr-app"), `#!/bin/sh
case "$1" in
  check) test -f "$2/main.js" && test -f "$2/mod.json" || exit 1 ;;
  do) test "$2" = layout.switch && test "$3" = --name && test "$4" = star-wars && test -f "$HERDR_APP_HOME/layouts/star-wars.json" || exit 1 ;;
  *) exit 1 ;;
esac
printf '%s %s\\n' "$1" "$2"
`, { mode: 0o755 });
    const result = spawnSync("/bin/bash", [resolve(root, "install.sh")], {
      cwd: root, encoding: "utf8",
      env: { HOME: temp, HERDR_APP_HOME: app, PATH: `${bin}:/usr/bin:/bin` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.split("\n").filter(line => line.startsWith("check ")).length, 7);
    assert(result.stdout.trim().endsWith("Star Wars layout installed and selected."));
    for (const mod of ["agents", "alerts", "status", "systems", "arena", "bomb-run", "tabs"]) {
      assert(existsSync(join(app, "mods", `star-wars-${mod}`, "main.js")), mod);
      assert(!existsSync(join(app, `star-wars-${mod}`)), `Mod copied outside mods/: ${mod}`);
    }
    assert(existsSync(join(app, "themes/light-side.json")));
    assert(existsSync(join(app, "themes/dark-side.json")));
    assert(existsSync(join(app, "backgrounds/ships/dark-side/millennium-falcon.png")));
    assert.equal(readFileSync(join(app, "layouts/unrelated.json"), "utf8"), "keep me");
    const backupRoot = join(app, "backups");
    const backup = readdirSync(backupRoot).find(name => name.startsWith("star-wars-"));
    assert(backup, "Expected a backup directory for replaced project files");
    assert.equal(readFileSync(join(backupRoot, backup, "layouts/star-wars.json"), "utf8"), "previous layout");
    assert.equal(readFileSync(join(backupRoot, backup, "mods/star-wars-agents/old-file"), "utf8"), "previous mod");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
