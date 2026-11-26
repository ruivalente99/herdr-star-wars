#!/usr/bin/env python3
"""Build the README's self-contained SVG illustrations from the real theme and artwork assets.

Usage: python3 tools/build-readme-art.py
Writes docs/images/overview.svg, arena.svg and bomb-run.svg. These are illustrations, never
screenshots: no real workspace, terminal, branch or project name may appear in repo imagery.
Python standard library only.
"""

import base64
from html import escape
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "docs/images/overview.svg"
ARENA = ROOT / "docs/images/arena.svg"
BOMB_RUN = ROOT / "docs/images/bomb-run.svg"
DECK = ROOT / "mods/star-wars-bomb-run/decks.js"
BOMB_ART = "mods/star-wars-bomb-run/art"
SPRITES = "mods/star-wars-agents/sprites/star-wars"
SYMBOLS = {}


def rect(x, y, w, h, fill, radius=0, stroke="none"):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>'


def text(x, y, value, fill, size=14, weight=400, extra=""):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" font-weight="{weight}" {extra}>{escape(value)}</text>'


def speech_bubble(side, x, y, w, h, pointer, quote, t):
    radius = 9
    outline = (f"M{x + radius} {y} H{pointer - 8} L{pointer} {y - 10} L{pointer + 8} {y} "
               f"H{x + w - radius} Q{x + w} {y} {x + w} {y + radius} "
               f"V{y + h - radius} Q{x + w} {y + h} {x + w - radius} {y + h} "
               f"H{x + radius} Q{x} {y + h} {x} {y + h - radius} "
               f"V{y + radius} Q{x} {y} {x + radius} {y} Z")
    return (f'<g id="speech-bubble-{side}"><path d="{outline}" fill="{t["popover"]}" '
            f'stroke="{t["border"]}" stroke-width="1.5" stroke-linejoin="round"/>'
            + text(x + w / 2, y + 21, quote, t["foreground"], 12, 500, 'text-anchor="middle"') + "</g>")


def artwork(path, x, y, w, h=None):
    if path not in SYMBOLS:
        source = (ROOT / path).read_text()
        viewbox = ET.fromstring(source).attrib["viewBox"]
        body = re.sub(r"<title>.*?</title>", "", source[source.index(">") + 1:source.rindex("</svg>")], flags=re.S)
        symbol = f"art-{len(SYMBOLS)}"
        SYMBOLS[path] = (symbol, f'<symbol id="{symbol}" viewBox="{viewbox}">{body}</symbol>')
    symbol = SYMBOLS[path][0]
    return f'<use href="#{symbol}" x="{x}" y="{y}" width="{w}" height="{h or w}" shape-rendering="crispEdges"/>'


def sprite(hero, x, y, size=48):
    return artwork(f"{SPRITES}/{hero}.svg", x, y, size)


def window(side, x, ship, cards, duel, quote, speaker):
    palette = json.loads((ROOT / f"themes/{side}-side.json").read_text())
    t = {**palette, **palette["colors"]}
    image = base64.b64encode((ROOT / f"backgrounds/ships/{side}-side/{ship}.png").read_bytes()).decode()
    clip = f"window-{side}"
    out = [f'<g transform="translate({x} 148)">',
           f'<defs><clipPath id="{clip}">{rect(0, 0, 652, 500, "white", 14)}</clipPath></defs>',
           f'<g clip-path="url(#{clip})">',
           rect(0, 0, 652, 500, t["background"]),
           rect(0, 0, 652, 44, t["chrome"]), rect(0, 44, 210, 430, t["chrome"]),
           rect(210, 44, 1, 430, t["border"]), rect(0, 43, 652, 1, t["border"])]
    for i, color in enumerate([t["blocked"], t["working"], t["done"]]):
        out.append(f'<circle cx="{20 + i * 16}" cy="22" r="4" fill="{color}"/>')
    for label, px, w, on in [("Files", 452, 46, False), ("Changes", 504, 62, False), ("Bomb Run", 572, 68, True)]:
        out += [rect(px, 11, w, 22, t["selected"] if on else t["chrome"], 6),
                text(px + w / 2, 26, label, t["foreground"] if on else t["muted"], 11, 600 if on else 400, 'text-anchor="middle"')]
    out += [text(84, 27, "HERDR / REBEL WORKSPACE", t["muted"], 12, 600),
            text(18, 77, "FLEET", t["dim"], 12, 600),
            rect(10, 91, 190, 51, t["selected"], 6),
            artwork("mods/star-wars-systems/ships/x-wing.svg", 18, 101, 28),
            text(55, 111, "Tatooine", t["foreground"], 15, 600),
            text(55, 131, "main · synced", t["dim"], 12),
            artwork("mods/star-wars-systems/ships/millennium-falcon.svg", 18, 153, 28),
            text(55, 164, "Endor", t["muted"], 15),
            rect(0, 191, 210, 1, t["border"]), text(18, 215, "AGENTS / 03", t["dim"], 12, 600)]
    for i, (hero, name, mood, role) in enumerate(cards):
        y = 228 + i * 79
        out += [rect(10, y, 190, 70, t["surface"], 7, t["border"]), sprite(hero, 16, y + 8),
                text(72, y + 24, name, t["foreground"], 14, 600),
                text(72, y + 43, mood, t[role], 11),
                rect(72, y + 54, 112, 3, t["border"], 1), rect(72, y + 54, 67 + i * 12, 3, t[role], 1)]
    out += [rect(222, 61, 416, 398, t["background"], 8, t["border"]),
            f'<image href="data:image/png;base64,{image}" x="223" y="100" width="414" height="358" preserveAspectRatio="xMidYMid slice" opacity="0.2"/>',
            text(238, 85, "mission-control", t["muted"], 13),
            rect(223, 98, 414, 1, t["border"]),
            text(238, 126, "MISSION / REBEL ALLIANCE", t["accent"], 12, 600),
            text(238, 164, "$ herdr-app status", t["foreground"], 17, 600),
            text(238, 195, "layout   star-wars", t["muted"], 14),
            text(238, 219, "agents   3 on mission", t["muted"], 14),
            text(238, 262, "Workspace ready.", t["done"], 18, 600),
            text(238, 285, "Fleet linked. Squad standing by.", t["dim"], 12),
            rect(238, 308, 384, 135, t["surface"], 6, t["border"]),
            text(250, 329, "SQUAD / TRAINING", t["accent"], 11, 600),
            sprite(duel[0], 318, 339), sprite(duel[1], 422, 339),
            artwork(f"{SPRITES}/weapons/{duel[2]}.svg", 351, 362, 50, 25),
            artwork(f"{SPRITES}/weapons/{duel[3]}.svg", 397, 362, 50, 25),
            speech_bubble(side, 246, 400, 368, 33, 342 if speaker == 0 else 446, quote, t),
            rect(0, 474, 652, 26, t["chrome"]),
            rect(0, 474, 652, 1, t["border"]),
            text(18, 491, "LOCAL / MAIN", t["dim"], 10, 600),
            text(622, 491, "3 ON MISSION", t["working"], 10, 600, 'text-anchor="end"'),
            "</g>", rect(0.5, 0.5, 651, 499, "none", 14, t["border"]), "</g>"]
    return "\n".join(out)


def dark_theme():
    palette = json.loads((ROOT / "themes/dark-side.json").read_text())
    return {**palette, **palette["colors"]}


def page(width, height, title, desc, body):
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" role="img" aria-labelledby="title description">',
        f'<title id="title">{escape(title)}</title>', f'<desc id="description">{escape(desc)}</desc>',
        "<defs>", *(markup for _, markup in SYMBOLS.values()), "</defs>", *body, "</svg>"]) + "\n"


def build_arena():
    SYMBOLS.clear()
    t = dark_theme()
    image = base64.b64encode((ROOT / "backgrounds/ships/dark-side/x-wing.png").read_bytes()).decode()
    fronts = [("01 / SABER DUEL", "obi-wan", "vader", "saber-blue-right", "saber-red-left", "Obi-Wan", "Vader"),
              ("02 / SABER DUEL", "ahsoka", "mace-windu", "saber-white-right", "saber-purple-left", "Ahsoka", "Mace Windu"),
              ("03 / FORCE / TECH", "yoda", "emperor-palpatine", "saber-green-right", "force-lightning-left", "Yoda", "Palpatine")]
    body = [rect(0, 0, 840, 470, t["background"], 16),
            text(28, 46, "Star Wars · Battle Simulator", t["foreground"], 22, 700, 'font-family="Trebuchet MS, Verdana, sans-serif"'),
            text(28, 70, "Illustrated training session · no real agent actions", t["muted"], 12),
            text(812, 46, "ILLUSTRATION", t["done"], 11, 600, 'text-anchor="end" letter-spacing="1"')]
    for i, preset in enumerate(["Classic", "Jedi", "Hunters", "Senate", "Custom"]):
        x = 28 + i * 82
        body += [rect(x, 88, 74, 26, t["surface"], 6, t["accent"] if preset == "Jedi" else t["border"]),
                 text(x + 37, 105, preset, t["accent"] if preset == "Jedi" else t["foreground"], 12, 500, 'text-anchor="middle"')]
    for i, (label, a, b, wa, wb, na, nb) in enumerate(fronts):
        x = 28 + i * 266
        clip = f"front-{i}"
        body += [f'<defs><clipPath id="{clip}">{rect(x, 132, 250, 230, "white", 10)}</clipPath></defs>',
                 f'<g clip-path="url(#{clip})">', rect(x, 132, 250, 230, "#0d1117"),
                 f'<image href="data:image/png;base64,{image}" x="{x}" y="132" width="250" height="230" preserveAspectRatio="xMidYMid slice" opacity="0.35"/>',
                 "</g>", rect(x + 0.5, 132.5, 249, 229, "none", 10, t["border"]),
                 text(x + 125, 160, label, t["accent"], 12, 600, 'text-anchor="middle"'),
                 sprite(a, x + 34, 226, 64), sprite(b, x + 152, 226, 64),
                 artwork(f"{SPRITES}/weapons/{wa}.svg", x + 88, 250, 40, 20),
                 artwork(f"{SPRITES}/weapons/{wb}.svg", x + 122, 250, 40, 20),
                 rect(x + 20, 298, 210, 1, t["border"]),
                 text(x + 66, 324, na, t["foreground"], 13, 500, 'text-anchor="middle"'),
                 text(x + 184, 324, nb, t["foreground"], 13, 500, 'text-anchor="middle"')]
    body += [sprite("vader", 28, 388, 44), rect(84, 382, 728, 56, t["popover"], 10, t["border"]),
             text(102, 404, "Vader · Squad", t["accent"], 11, 600),
             text(102, 426, "That name no longer has any meaning for me.", t["foreground"], 14)]
    ARENA.write_text(page(840, 470, "Star Wars Battle Simulator — illustration",
                          "Illustrated Battle Simulator with three training fronts, using the project's pixel-art characters and weapons. Not a screenshot.", body), encoding="utf-8")
    print(f"Built {ARENA.relative_to(ROOT)}")


def build_bomb_run():
    SYMBOLS.clear()
    t = dark_theme()
    source = DECK.read_text()
    hangar = json.loads(source[source.index("["):source.rindex("]") + 1])[1]
    scale, ox, oy = 2, 24, 124
    tile = lambda c, r: (ox + c * 16 * scale, oy + (32 + r * 16) * scale)
    body = [rect(0, 0, 464, 640, t["background"], 14),
            rect(12, 14, 34, 28, t["surface"], 6), text(29, 33, "02", t["blocked"], 13, 600, 'text-anchor="middle"'),
            text(56, 34, "Launch hangar", t["foreground"], 16, 600),
            text(440, 34, "ILLUSTRATION", t["muted"], 10, 600, 'text-anchor="end" letter-spacing="1"'),
            text(24, 92, "Score", t["muted"], 11), text(64, 92, "0240", t["foreground"], 14, 600),
            text(232, 92, "Hostiles 3/4", t["foreground"], 12, 500, 'text-anchor="middle"'),
            text(440, 92, "00:42", t["muted"], 13, 500, 'text-anchor="end"'),
            artwork(f"{BOMB_ART}/deck-hangar.svg", ox, oy, 208 * scale, 224 * scale)]
    for r, row in enumerate(hangar["layout"]):
        for c, cell in enumerate(row):
            if cell == "#" and 0 < r < len(hangar["layout"]) - 1 and 0 < c < len(row) - 1:
                body.append(artwork(f"{BOMB_ART}/barricade.svg", *tile(c, r), 16 * scale))
    for c, r in [(2, 1), (9, 3), (6, 5), (10, 7), (3, 9), (7, 9)]:
        body.append(artwork(f"{BOMB_ART}/coolant-0.svg", *tile(c, r), 16 * scale, 18 * scale))
    for c in range(3, 8):
        body.append(artwork(f"{BOMB_ART}/blast-h-1.svg", *tile(c, 5), 16 * scale))
    body.append(artwork(f"{BOMB_ART}/detonator-1.svg", *tile(5, 3), 16 * scale))
    for hero, c, r in [("luke", 1, 1), ("chewbacca", 11, 1), ("stormtrooper", 8, 3), ("ahsoka", 1, 9), ("emperor-palpatine", 11, 9)]:
        x, y = tile(c, r)
        body.append(sprite(hero, x - 4, y - 10, 40))
    body += [sprite("luke", 22, 586, 36), text(68, 600, "Luke Skywalker", t["foreground"], 13, 600),
             text(68, 618, "Scout · 310 / 600", t["muted"], 11),
             rect(24, 630, 416, 3, t["border"], 1), rect(24, 630, 217, 3, t["blocked"], 1)]
    BOMB_RUN.write_text(page(464, 640, "Bomb Run — illustration",
                             "Illustrated Bomb Run deck built from the game's own pixel art: the Launch Hangar map, coolant cells, a thermal charge, a blast lane and the cast. Not a screenshot.", body), encoding="utf-8")
    print(f"Built {BOMB_RUN.relative_to(ROOT)}")


def main():
    build_arena()
    build_bomb_run()
    SYMBOLS.clear()
    light = window("light", 48, "x-wing", [
        ("luke", "Luke Skywalker", "On mission", "working"),
        ("leia", "Leia Organa", "Hyperspace", "working"),
        ("r2d2", "R2-D2", "On mission", "working"),
    ], ("luke", "yoda", "saber-green-right", "saber-green-left"), "Do. Or do not. There is no try.", 1)
    dark = window("dark", 740, "millennium-falcon", [
        ("vader", "Darth Vader", "On mission", "working"),
        ("boba-fett", "Boba Fett", "Deep space", "working"),
        ("ahsoka", "Ahsoka Tano", "On mission", "working"),
    ], ("mace-windu", "emperor-palpatine", "saber-purple-right", "force-lightning-left"), "The Senate will decide your fate.", 0)
    content = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="760" viewBox="0 0 1440 760" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" role="img" aria-labelledby="title description">',
        '<title id="title">Star Wars for Herdr — one workspace, two sides</title>',
        '<desc id="description">Illustrated Light Side and Dark Side workspaces using the project’s actual pixel-art characters, ship emblems, cockpit artwork and theme colors. Not a screenshot.</desc>',
        "<defs>", *(markup for _, markup in SYMBOLS.values()), "</defs>",
        rect(0, 0, 1440, 760, "#10151d", 20),
        text(48, 52, "YOUR AGENTS. THEIR MISSIONS.", "#d5b77c", 13, 600, 'letter-spacing="2"'),
        text(48, 109, "One galaxy. Two sides.", "#eef0e9", 40, 700, 'font-family="Trebuchet MS, Verdana, sans-serif"'),
        text(1392, 103, "STAR WARS / HERDR", "#9ba9b5", 13, 500, 'text-anchor="end" letter-spacing="1"'),
        light, dark,
        rect(48, 675, 28, 3, "#68b3d3"), text(89, 682, "LIGHT SIDE", "#dfe7ea", 15, 600, 'letter-spacing="1"'),
        text(48, 708, "Ivory chrome. Rebel-blue accents.", "#a5b1bc", 14),
        rect(740, 675, 28, 3, "#e07a78"), text(781, 682, "DARK SIDE", "#dfe7ea", 15, 600, 'letter-spacing="1"'),
        text(740, 708, "Charcoal panels. Sith-red accents.", "#a5b1bc", 14),
        text(720, 744, "ILLUSTRATED PREVIEW / ACTUAL PROJECT ARTWORK", "#8998a7", 10, 500, 'text-anchor="middle" letter-spacing="1"'),
        "</svg>",
    ]
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text("\n".join(content) + "\n", encoding="utf-8")
    print(f"Built {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
