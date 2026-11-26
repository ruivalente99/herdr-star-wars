# Contributing

Bug reports, fixes, accessibility improvements, and testing on other platforms are welcome.

## Before opening a pull request

1. Run the regression suite: `node --test tools/*.test.mjs`.
2. Run `herdr-app check mods/<mod-name>` for every mod you changed.
3. If you changed the layout, colors, artwork, or visible behavior, update `RECIPE.md` and the relevant README section.
4. For visual changes, update the illustrations with `tools/build-readme-art.py` and note your Herdr version and operating system. Never commit screenshots: repo images are illustrations only, so no real workspace, terminal, branch or project name ends up in the history.

## Project map

- `layouts/star-wars.json`: workspace composition.
- `themes/`: Light Side and Dark Side palettes.
- `mods/`: seven custom Herdr modules.
- `backgrounds/ships/`: generated cockpit backgrounds.
- `tools/build-sprites.py`, `tools/build-ship-backgrounds.py`: artwork sources and generators.
- `share/star-wars/`: installable package export; keep it in sync with runtime files.

Artwork builders use Python's standard library. Run them from the repository root; use the `--preview` options documented in `README.md` before replacing generated assets.

## Installation and safety

Use `./install.sh` to test the project in Herdr. The script replaces only this project's named layout, themes, backgrounds, and mods, backs up any existing matching files under `backups/star-wars-<timestamp>/`, validates all seven mods, and then tries to select the layout.

Keep changes consistent across the repository and `share/star-wars/`. Do not add runtime network dependencies; the app package is intended to work from local assets.
