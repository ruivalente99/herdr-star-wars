#!/usr/bin/env python3
"""Build seven pixel-art cockpits in dark/light variants, without dependencies.

Usage: python3 tools/build-ship-backgrounds.py [--preview /tmp/fleet-backgrounds.png]
PNG files are used by Herdr; matching SVG files are editable/exportable sources.
"""

import argparse
from html import escape
import json
from pathlib import Path
import random
import struct
import xml.etree.ElementTree as ET
import zlib

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "backgrounds/ships"
FLEET = {
    "millennium-falcon": ("Millennium Falcon", "#b59a68"),
    "x-wing": ("X-wing", "#b66c62"),
    "tie-fighter": ("TIE Fighter", "#6eaa8f"),
    "star-destroyer": ("Star Destroyer", "#9e7e98"),
    "y-wing": ("Y-wing", "#b8a261"),
    "a-wing": ("A-wing", "#bb6865"),
    "imperial-shuttle": ("Imperial Shuttle", "#829fbc"),
}
W, H = 320, 180


def rgb(color):
    return tuple(bytes.fromhex(color.lstrip("#")))


def blend(a, b, amount):
    return "#" + "".join(f"{round(x * (1 - amount) + y * amount):02x}" for x, y in zip(rgb(a), rgb(b)))


def png(path, pixels, scale=1):
    height, width = len(pixels), len(pixels[0])
    rows = []
    for row in pixels:
        scan = b"\0" + b"".join(bytes(rgb(color)) * scale for color in row)
        rows.extend([scan] * scale)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">2I5B", width * scale, height * scale, 8, 2, 0, 0, 0)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
                           + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b""))


class Scene:
    def __init__(self, dark, accent):
        # The two theme files are the only source of interface/cockpit colors.
        side = "dark-side" if dark else "light-side"
        theme = json.loads((ROOT / "themes" / f"{side}.json").read_text())
        colors = theme["colors"]
        self.colors = {
            "sky": theme["background"], "deep": colors["canvas"], "planet": colors["hover"],
            "star": blend(colors["dim"], theme["background"], 0.35),
            "frame": colors["border"], "hull": blend(colors["input"], theme["background"], 0.72),
            "edge": colors["input"], "panel": colors["surface"], "glass": colors["selected"],
            "light": colors["muted"],
        }
        self.colors["accent"] = blend(accent, self.colors["sky"], 0.18 if dark else 0.48)
        self.pixels = [[self.colors["sky"]] * W for _ in range(H)]

    def rect(self, x, y, width, height, color):
        color = self.colors.get(color, color)
        for yy in range(max(0, y), min(H, y + height)):
            self.pixels[yy][max(0, x):min(W, x + width)] = [color] * max(0, min(W, x + width) - max(0, x))

    def poly(self, points, color):
        # Scanline fill on the low-resolution grid: deliberate stepped edges.
        for y in range(max(0, min(p[1] for p in points)), min(H, max(p[1] for p in points))):
            hits = []
            for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
                if min(y1, y2) <= y + 0.5 < max(y1, y2):
                    hits.append(x1 + (y + 0.5 - y1) * (x2 - x1) / (y2 - y1))
            hits.sort()
            for x1, x2 in zip(hits[::2], hits[1::2]):
                left, right = round(x1), round(x2)
                self.rect(left, y, right - left, 1, color)

    def line(self, x1, y1, x2, y2, width, color):
        steps = max(abs(x2 - x1), abs(y2 - y1), 1)
        for step in range(steps + 1):
            x, y = round(x1 + (x2 - x1) * step / steps), round(y1 + (y2 - y1) * step / steps)
            self.rect(x - width // 2, y - width // 2, width, width, color)

    def disc(self, cx, cy, radius, color):
        for y in range(max(0, cy - radius), min(H, cy + radius + 1)):
            half = int(max(0, radius ** 2 - (y - cy) ** 2) ** 0.5)
            self.rect(cx - half, y, 2 * half + 1, 1, color)

    def window(self, points, rim=None):
        space = self.pixels
        self.pixels = [[self.colors["frame"]] * W for _ in range(H)]
        if rim:
            self.poly(rim, "hull")
        self.poly(points, "sky")
        for y, row in enumerate(self.pixels):
            for x, color in enumerate(row):
                if color == self.colors["sky"]:
                    row[x] = space[y][x]

    def instruments(self, x, y, width, height, seed):
        self.rect(x, y, width, height, "deep")
        self.rect(x + 2, y + 2, width - 4, height - 4, "panel")
        randomizer = random.Random(seed)
        for yy in range(y + 5, y + height - 3, 5):
            for xx in range(x + 5, x + width - 4, 7):
                self.rect(xx, yy, randomizer.choice([2, 3, 4]), 1,
                          randomizer.choice(["glass", "glass", "edge", "accent"]))

    def svg(self, title):
        out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" '
               'width="640" height="360" shape-rendering="crispEdges">',
               f"  <title>{escape(title)} cockpit — pixel art</title>"]
        for y, row in enumerate(self.pixels):
            x = 0
            while x < W:
                end = x + 1
                while end < W and row[end] == row[x]:
                    end += 1
                out.append(f'<rect x="{x}" y="{y}" width="{end - x}" height="1" fill="{row[x]}"/>')
                x = end
        return "\n".join([*out, "</svg>", ""])


def draw(ship, dark=True):
    s = draw_space(ship, dark)
    if ship == "millennium-falcon":
        # Falcon's rounded segmented canopy, bronze rims and wide console.
        s.window([(43, 24), (277, 24), (306, 52), (306, 123), (274, 147), (46, 147), (14, 123), (14, 52)],
                 rim=[(35, 18), (285, 18), (315, 48), (315, 130), (278, 156), (42, 156), (5, 130), (5, 48)])
        for a, b in [((62, 18), (86, 150)), ((258, 18), (234, 150)), ((160, 18), (160, 147))]:
            s.line(*a, *b, 5, "frame")
            s.line(*a, *b, 1, "edge")
        s.rect(0, 153, 320, 27, "hull")
        s.instruments(16, 158, 82, 22, 1)
        s.instruments(108, 155, 104, 25, 2)
        s.instruments(222, 158, 82, 22, 3)
    elif ship == "tie-fighter":
        # TIE's unmistakable hexagonal viewport and radial braces.
        s.window([(77, 12), (243, 12), (302, 65), (302, 115), (243, 168), (77, 168), (18, 115), (18, 65)])
        for x, y in [(77, 12), (160, 12), (243, 12), (302, 65), (302, 115), (243, 168), (77, 168), (18, 115), (18, 65)]:
            s.line(160, 90, x, y, 3, "hull")
        s.rect(146, 75, 28, 30, "frame")
        s.rect(150, 79, 20, 22, "sky")
        s.rect(0, 0, 320, 7, "deep")
        s.instruments(8, 145, 62, 30, 4)
        s.instruments(250, 145, 62, 30, 5)
    elif ship == "star-destroyer":
        # Imperial bridge: a broad slanted window wall and two crew pits.
        s.poly([(0, 0), (320, 0), (320, 20), (0, 12)], "frame")
        s.poly([(0, 130), (320, 130), (320, 180), (0, 180)], "hull")
        for x in [18, 84, 150, 216, 282]:
            s.poly([(x, 12), (x + 7, 12), (x + 20, 130), (x + 12, 130)], "frame")
            s.line(x + 4, 17, x + 17, 126, 1, "edge")
        s.rect(0, 128, 320, 3, "edge")
        s.instruments(8, 142, 116, 35, 6)
        s.instruments(196, 142, 116, 35, 7)
        s.poly([(140, 136), (180, 136), (194, 180), (126, 180)], "panel")
        s.rect(141, 147, 38, 2, "accent")
    elif ship == "imperial-shuttle":
        # Lambda shuttle's tall center fin and geometric white cockpit surround.
        s.poly([(0, 0), (320, 0), (320, 28), (0, 20)], "hull")
        for points in [[(0, 0), (26, 0), (66, 143), (41, 154), (0, 73)],
                       [(320, 0), (294, 0), (254, 143), (279, 154), (320, 73)],
                       [(154, 0), (166, 0), (171, 148), (149, 148)]]:
            s.poly(points, "frame")
        s.rect(158, 24, 4, 118, "edge")
        s.poly([(0, 145), (320, 145), (320, 180), (0, 180)], "hull")
        s.instruments(30, 151, 113, 26, 8)
        s.instruments(177, 151, 113, 26, 9)
    else:
        # Rebel fighters: individual canopy silhouettes, livery, and instruments.
        if ship == "x-wing":
            ribs = [((18, 0), (91, 150)), ((302, 0), (229, 150)), ((160, 0), (160, 61))]
        elif ship == "y-wing":
            ribs = [((44, 0), (62, 150)), ((276, 0), (258, 150)), ((112, 0), (112, 143)), ((208, 0), (208, 143))]
            s.rect(30, 52, 12, 82, "panel")
            s.rect(278, 52, 12, 82, "panel")
            s.rect(32, 63, 8, 45, "accent")
            s.rect(280, 63, 8, 45, "accent")
        else:  # A-wing's low, sharp arrow-shaped canopy.
            ribs = [((0, 15), (118, 148)), ((320, 15), (202, 148)), ((114, 0), (143, 148)), ((206, 0), (177, 148))]
            for x, y in [(22, 30), (41, 76), (284, 35), (271, 88)]:
                s.line(x, y, x + (12 if x > 160 else -12), y - 5, 1, "star")
        s.rect(0, 0, 320, 8, "frame")
        for a, b in ribs:
            s.line(*a, *b, 7, "frame")
            s.line(*a, *b, 2, "edge")
        s.poly([(0, 143), (112, 149), (160, 139), (208, 149), (320, 143), (320, 180), (0, 180)], "hull")
        s.line(0, 146, 105, 154, 3, "accent")
        s.line(215, 154, 320, 146, 3, "accent")
        s.instruments(19, 157, 76, 22, 10)
        s.instruments(111, 150, 98, 30, 11)
        s.instruments(225, 157, 76, 22, 12)
        s.rect(149, 153, 22, 12, "glass")
        s.rect(158, 155, 4, 8, "accent")
        s.rect(153, 158, 14, 1, "accent")
    return s


def draw_space(ship, dark):
    # Same deterministic starfield and ship hologram, without the cockpit frame.
    s = Scene(dark, FLEET[ship][1])
    rng = random.Random(705)
    for _ in range(90):
        s.rect(rng.randrange(W), rng.randrange(145), 1, 1, "star")
    s.disc(245, 58, 35, "planet")
    s.disc(254, 53, 32, "sky")
    emblem = ET.parse(ROOT / f"mods/star-wars-systems/ships/{ship}.svg").getroot()
    for rect in emblem.findall("{http://www.w3.org/2000/svg}rect"):
        x, y, w, h = (int(rect.attrib[k]) for k in ["x", "y", "width", "height"])
        ink = blend(rect.attrib["fill"], s.colors["sky"], 0.62 if dark else 0.70)
        s.rect(205 + x * 4, 40 + y * 4, w * 4, h * 4, ink)
    return s


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    DEST.mkdir(parents=True, exist_ok=True)
    scenes = []
    for ship, (title, _) in FLEET.items():
        for dark in [True, False]:
            scene = draw(ship, dark)
            target = DEST / ("dark-side" if dark else "light-side")
            target.mkdir(parents=True, exist_ok=True)
            (target / f"{ship}.svg").write_text(scene.svg(title), encoding="utf-8")
            png(target / f"{ship}.png", scene.pixels, scale=2)
            if dark:
                scenes.append(scene)
    if args.preview:
        background = Scene(True, FLEET["millennium-falcon"][1]).colors["sky"]
        sheet = [[background] * (W * 2) for _ in range(H * 4)]
        for index, scene in enumerate(scenes):
            x, y = (index % 2) * W, (index // 2) * H
            for yy, row in enumerate(scene.pixels):
                sheet[y + yy][x:x + W] = row
        png(args.preview, sheet)
        print(f"Preview: {args.preview}")
    print(f"Built {len(FLEET) * 2} cockpit backgrounds (PNG + SVG) in {DEST}")


if __name__ == "__main__":
    main()
