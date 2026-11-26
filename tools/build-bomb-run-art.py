#!/usr/bin/env python3
"""Bomb Run's local pixel-art deck, props, bitmap lettering and walking atlases.

Uses only the standard library. Character palettes come from the existing
32px cast; each atlas has idle / left stride / right stride, in four directions.
Run: python3 tools/build-bomb-run-art.py [--preview /tmp/bomb-run-decks.png]
"""
import argparse
from html import escape
from pathlib import Path
import json
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "mods/star-wars-bomb-run/art"
CAST = ROOT / "mods/star-wars-agents/sprites/star-wars"
INK = "#11151f"


class Canvas:
    def __init__(self, width, height, title):
        self.width, self.height, self.title = width, height, title
        self.pixels = [[None] * width for _ in range(height)]

    def rect(self, x, y, width, height, color):
        for yy in range(max(0, y), min(self.height, y + height)):
            for xx in range(max(0, x), min(self.width, x + width)):
                self.pixels[yy][xx] = color

    def svg(self):
        out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}" width="{self.width}" height="{self.height}" shape-rendering="crispEdges">',
               f"<title>{escape(self.title)}</title>"]
        for y, row in enumerate(self.pixels):
            x = 0
            while x < self.width:
                color, end = row[x], x + 1
                while end < self.width and row[end] == color:
                    end += 1
                if color:
                    out.append(f'<rect x="{x}" y="{y}" width="{end - x}" height="1" fill="{color}"/>')
                x = end
        return "\n".join([*out, "</svg>", ""])

    def save(self, name):
        path = ART / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.svg())

    def png(self, path):
        raw = b"".join(b"\x00" + bytes(int((color or "#09131f")[index:index + 2], 16)
                        for color in line for index in (1, 3, 5)) for line in self.pixels)
        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", self.width, self.height, 8, 2, 0, 0, 0))
                              + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


# Small native bitmap alphabet: no downloaded font, emoji or platform glyphs.
FONT = {
    "A": "010/101/111/101/101", "B": "110/101/110/101/110", "C": "011/100/100/100/011",
    "D": "110/101/101/101/110", "E": "111/100/110/100/111", "F": "111/100/110/100/100",
    "G": "011/100/101/101/011", "H": "101/101/111/101/101", "I": "111/010/010/010/111",
    "J": "001/001/001/101/010", "K": "101/101/110/101/101", "L": "100/100/100/100/111",
    "M": "10001/11011/10101/10001/10001", "N": "1001/1101/1011/1001/1001",
    "O": "010/101/101/101/010", "P": "110/101/110/100/100", "Q": "010/101/101/111/011",
    "R": "110/101/110/101/101", "S": "011/100/010/001/110", "T": "111/010/010/010/010",
    "U": "101/101/101/101/111", "V": "101/101/101/101/010", "W": "10001/10001/10101/10101/01010",
    "X": "101/101/010/101/101", "Y": "101/101/010/010/010", "Z": "111/001/010/100/111",
    " ": "00/00/00/00/00", "-": "000/000/111/000/000",
}


def lettering(text, name, color):
    width = sum(len(FONT[c].split('/')[0]) + 1 for c in text) - 1
    p = Canvas(width, 5, text)
    x = 0
    for char in text:
        glyph = FONT[char].split('/')
        for y, line in enumerate(glyph):
            for dx, dot in enumerate(line):
                if dot == "1":
                    p.rect(x + dx, y, 1, 1, color)
        x += len(glyph[0]) + 1
    p.save(f"{name}.svg")


def deck(spec):
    p = Canvas(208, 224, f"{spec['name']} — hand-pixelled interior")
    p.rect(0, 0, 208, 224, "#080e16")
    # Space through three forward windows, inset into a bevelled hull.
    p.rect(0, 0, 208, 30, "#1c2a37")
    p.rect(0, 0, 208, 2, "#607380")
    for x, width in [(12, 49), (65, 78), (147, 49)]:
        p.rect(x - 2, 5, width + 4, 20, "#344654")
        p.rect(x, 6, width, 16, "#060d18")
        p.rect(x + 1, 7, width - 2, 1, "#42637b")
        for i in range(6):
            sx, sy = x + 4 + (i * 13 + x) % (width - 8), 10 + (i * 7) % 10
            p.rect(sx, sy, 1 if i % 2 else 2, 1, "#93a7bd")
    # Distant planet, with stepped silhouette rather than a smooth circle.
    p.rect(113, 12, 15, 9, "#264568")
    p.rect(116, 10, 9, 13, "#264568")
    p.rect(116, 10, 5, 2, "#688c9b")
    p.rect(113, 13, 3, 5, "#426783")
    p.rect(113, 19, 15, 4, "#060d18")
    # Walkable deck: small floor seams, not a visible board-game grid.
    p.rect(0, 30, 208, 178, "#192732")
    for y in range(32, 208, 16):
        for x in range(0, 208, 16):
            p.rect(x, y, 16, 16, "#1d2c37" if (x + y) % 32 else "#202f39")
            p.rect(x + 1, y + 15, 14, 1, "#14232d")
            if (x * 3 + y) % 48 == 0:
                p.rect(x + 3, y + 3, 1, 1, "#3a4b56")
                p.rect(x + 12, y + 12, 1, 1, "#101d27")
    # Continuous outer walls follow the level's collision border.
    for x, y, w, h in [(0, 30, 208, 18), (0, 192, 208, 16), (0, 48, 16, 144), (192, 48, 16, 144)]:
        p.rect(x, y, w, h, "#0c1824")
        p.rect(x + 2, y + 2, max(1, w - 4), max(1, h - 4), "#344554")
    p.rect(16, 45, 176, 2, "#72919b")
    p.rect(16, 191, 176, 2, "#72919b")
    p.rect(13, 48, 2, 144, "#58717c")
    p.rect(193, 48, 2, 144, "#58717c")
    # Control banks and status lights embedded in the walls.
    for x in range(23, 190, 24):
        p.rect(x, 34, 17, 7, "#111f2b")
        p.rect(x + 2, 35, 7, 3, "#365c6d")
        p.rect(x + 3, 35, 3, 1, "#8ab2b8")
        p.rect(x + 11, 36, 2, 2, "#bf7258")
        p.rect(x + 14, 36, 1, 2, "#dbc080")
        p.rect(x, 197, 15, 3, "#172a37")
        p.rect(x + 2, 198, 6, 1, "#86a8b2")
    for y in range(54, 185, 24):
        for x in (4, 198):
            p.rect(x, y, 6, 16, "#172330")
            for dy in (2, 5, 8, 11):
                p.rect(x + 1, y + dy, 4, 1, "#516572")
            p.rect(x + 2, y + 18, 2, 2, "#d8a85f")
    # Recessed service hatch and hazard chevrons at the stern.
    p.rect(0, 208, 208, 16, "#14212c")
    p.rect(60, 211, 88, 11, "#263b49")
    p.rect(63, 214, 82, 6, "#0b1722")
    p.rect(100, 214, 8, 6, "#4e6770")
    for x in list(range(20, 54, 6)) + list(range(156, 190, 6)):
        p.rect(x, 211, 3, 2, "#9b7952")
        p.rect(x + 1, 213, 3, 2, "#9b7952")
    # Different architecture as well as color: every zone has its own skyline
    # and floor markings. Solid collision objects are rendered from the map.
    zone = spec["id"]
    accent = spec["accent"]
    if zone == "hangar":
        p.rect(10, 4, 188, 21, "#0a1422")
        p.rect(14, 6, 180, 17, "#14243a")
        for x in range(18, 194, 12):
            p.rect(x, 6, 5, 2, accent)
        for y in range(56, 187, 24):
            for x in (20, 184):
                p.rect(x, y, 4, 8, "#7d704a")
                p.rect(x + 2, y + 6, 4, 2, "#7d704a")
        p.rect(96, 48, 1, 144, "#3d4b52")
        p.rect(111, 48, 1, 144, "#3d4b52")
    elif zone == "cryo":
        p.rect(10, 4, 188, 21, "#153543")
        for x in range(14, 192, 22):
            p.rect(x, 6, 18, 16, "#366477")
            p.rect(x + 2, 8, 14, 12, "#224c65")
            p.rect(x + 3, 9, 3, 8, "#91c7d2")
            p.rect(x + 11, 16, 3, 3, "#b0d7dc")
        for y in range(48, 192, 8):
            p.rect(15, y, 2 + y % 3, 3, "#83b1c3")
            p.rect(191, y, 2, 4, "#83b1c3")
    elif zone == "cargo":
        p.rect(10, 4, 188, 21, "#211c25")
        for x in range(15, 195, 30):
            p.rect(x, 6, 25, 16, "#645149")
            p.rect(x + 2, 8, 21, 12, "#302c32")
            for xx in range(x + 4, x + 23, 4):
                p.rect(xx, 9, 1, 10, "#8e7660")
            p.rect(x + 9, 12, 6, 3, "#c2a87b")
        for x in (24, 80, 136):
            for y in (54, 118, 174):
                p.rect(x, y, 40, 1, "#665344")
                p.rect(x, y, 1, 9, "#665344")
    elif zone == "engine":
        p.rect(10, 4, 188, 21, "#211823")
        for x in (28, 72, 116, 160):
            p.rect(x, 5, 21, 19, "#7a4d48")
            p.rect(x - 2, 9, 25, 11, "#573b42")
            p.rect(x + 3, 8, 15, 13, "#211f2c")
            p.rect(x + 5, 11, 11, 7, "#db8e53")
            p.rect(x + 8, 12, 5, 5, "#ffe1a0")
        for y in range(56, 190, 16):
            for x in (4, 197):
                p.rect(x, y, 8, 5, "#bd6f4e")
                p.rect(x + 2, y, 1, 5, "#f4af72")
        for y in (82, 146):
            p.rect(20, y, 168, 1, "#553f3b")
    elif zone == "bridge":
        p.rect(9, 4, 190, 22, "#627091")
        p.rect(12, 6, 184, 17, "#090f23")
        p.rect(18, 21, 172, 2, "#344f79")
        for x in range(18, 192, 15):
            p.rect(x, 8 + x % 9, 1, 1, "#b8b2f0")
        for x in (44, 80, 128, 164):
            p.rect(x, 6, 2, 17, "#627091")
        for x in (27, 180):
            p.rect(x, 48, 1, 143, "#565577")
        p.rect(36, 185, 136, 2, "#565577")
    elif zone == "detention":
        p.rect(10, 4, 188, 21, "#121c24")
        for x in range(14, 194, 23):
            p.rect(x, 5, 18, 19, "#586757")
            p.rect(x + 2, 7, 14, 14, "#0a1720")
            for xx in range(x + 3, x + 15, 4):
                p.rect(xx, 7, 1, 14, "#84927b")
            p.rect(x + 6, 22, 5, 1, "#b95d54")
        for y in range(54, 190, 24):
            p.rect(8, y, 2, 8, "#aaba83")
            p.rect(198, y, 2, 8, "#aaba83")
    elif zone == "foundry":
        p.rect(10, 4, 188, 21, "#2c2327")
        for x in range(16, 194, 32):
            p.rect(x, 6, 24, 8, "#705244")
            p.rect(x + 2, 7, 20, 2, "#b78655")
            p.rect(x + 8, 12, 8, 9, "#18232b")
            p.rect(x + 10, 13, 4, 6, "#f1bd62")
        for y in (65, 113, 161):
            p.rect(18, y, 172, 5, "#161f28")
            for x in range(20, 190, 6):
                p.rect(x, y + 1, 2, 3, "#5c5446")
    replacements = {
        "#1d2c37": spec["floor"], "#202f39": spec["floor"],
        "#344554": spec["wall"], "#72919b": accent,
    }
    p.pixels = [[replacements.get(color, color) for color in line] for line in p.pixels]
    p.save(f"deck-{zone}.svg")


def zone_props():
    for kind in ("barricade", "cryo-pod", "cargo-rack", "turbine", "terminal", "cell-door", "press"):
        p = Canvas(16, 16, kind.replace("-", " "))
        p.rect(1, 13, 14, 3, "#0a1320")
        if kind == "barricade":
            p.rect(1, 3, 14, 10, "#273541")
            p.rect(2, 4, 12, 2, "#a1a99c")
            p.rect(2, 7, 12, 4, "#a8894a")
            for x in (2, 7, 12):
                p.rect(x, 7, 2, 2, "#233440")
                p.rect(x + 1, 9, 2, 2, "#233440")
        elif kind == "cryo-pod":
            p.rect(3, 0, 10, 14, "#374f61")
            p.rect(4, 1, 8, 2, "#abc3cc")
            p.rect(4, 4, 8, 7, "#4e8da5")
            p.rect(5, 4, 2, 7, "#98d1d9")
            p.rect(8, 5, 2, 4, "#c7e9dd")
            p.rect(5, 12, 6, 2, "#8198a5")
        elif kind == "cargo-rack":
            p.rect(1, 2, 14, 12, "#2a2630")
            for x in (2, 11):
                p.rect(x, 1, 2, 13, "#9b8c76")
            for y in (3, 8):
                p.rect(4, y, 7, 4, "#6e746e")
                p.rect(5, y, 2, 3, "#c2c3a9")
                p.rect(2, y + 4, 11, 1, "#705748")
        elif kind == "turbine":
            p.rect(3, 1, 10, 13, "#985e4c")
            p.rect(1, 4, 14, 7, "#985e4c")
            p.rect(4, 3, 8, 9, "#242937")
            for x, y in ((5, 4), (9, 6), (7, 9), (3, 7)):
                p.rect(x, y, 4, 2, "#bfac8a")
            p.rect(7, 6, 2, 3, "#eeac63")
        elif kind == "terminal":
            p.rect(1, 1, 14, 9, "#69789b")
            p.rect(2, 2, 12, 6, "#233658")
            p.rect(3, 3, 5, 1, "#a2bad6")
            p.rect(3, 5, 9, 1, "#738ed1")
            p.rect(3, 10, 10, 4, "#3d4665")
            for x in range(4, 12, 2):
                p.rect(x, 11, 1, 1, "#b8b2f0")
        elif kind == "cell-door":
            p.rect(1, 0, 14, 14, "#5c6e60")
            p.rect(3, 2, 10, 11, "#13232a")
            for x in (4, 7, 10):
                p.rect(x, 2, 1, 11, "#9ba990")
            p.rect(1, 6, 2, 2, "#d27960")
        else:
            p.rect(1, 0, 14, 3, "#c09b6d")
            for x in (2, 11):
                p.rect(x, 3, 3, 10, "#82664b")
                p.rect(x, 4, 1, 6, "#d4af7b")
            p.rect(6, 3, 4, 5, "#c3ba9a")
            p.rect(5, 8, 6, 2, "#4d5151")
            p.rect(2, 13, 12, 2, "#ab7946")
        p.save(f"{kind}.svg")


def pickups():
    glyphs = {
        "range": ("#f2bd66", [(7, 3, 2, 10), (3, 7, 10, 2), (5, 4, 6, 1), (5, 11, 6, 1)]),
        "nova": ("#ef9678", [(6, 3, 4, 10), (3, 6, 10, 4), (4, 4, 2, 2), (10, 10, 2, 2), (4, 10, 2, 2), (10, 4, 2, 2)]),
        "echo": ("#c2b0ef", [(3, 4, 6, 2), (3, 4, 2, 6), (3, 8, 6, 2), (7, 6, 6, 2), (11, 6, 2, 6), (7, 10, 6, 2)]),
        "rack": ("#9ccc8e", [(3, 4, 10, 2), (3, 7, 10, 2), (3, 10, 10, 2), (4, 3, 2, 10)]),
        "line": ("#78ced1", [(3, 6, 2, 4), (6, 6, 2, 4), (9, 6, 2, 4), (11, 4, 2, 8)]),
        "speed": ("#8fbaf2", [(3, 3, 2, 3), (5, 5, 2, 3), (3, 8, 2, 4), (8, 3, 2, 3), (10, 5, 2, 3), (8, 8, 2, 4)]),
    }
    for name, (color, marks) in glyphs.items():
        p = Canvas(16, 16, f"{name} power-up")
        p.rect(2, 0, 12, 16, "#0b1420")
        p.rect(0, 2, 16, 12, "#0b1420")
        p.rect(2, 1, 12, 14, color)
        p.rect(1, 2, 14, 12, color)
        p.rect(3, 3, 10, 10, "#1c2a38")
        for x, y, w, h in marks:
            p.rect(x, y, w, h, color)
        p.rect(7, 7, 2, 2, "#f4efd6")
        p.save(f"buff-{name}.svg")


def props():
    # Sealed machinery pylons: body, vents, a tiny control screen, grounded shadow.
    p = Canvas(16, 16, "Armoured power console")
    p.rect(1, 13, 14, 3, "#080e17")
    p.rect(2, 1, 12, 13, "#0b1420")
    p.rect(3, 0, 10, 1, "#0b1420")
    p.rect(3, 1, 10, 2, "#617787")
    p.rect(2, 3, 12, 9, "#344a59")
    p.rect(3, 3, 1, 8, "#83939a")
    p.rect(12, 3, 1, 9, "#1c2b3a")
    p.rect(5, 4, 6, 3, "#101e2b")
    p.rect(6, 5, 4, 1, "#648d9e")
    for y in (8, 10):
        p.rect(5, y, 6, 1, "#192937")
    p.rect(4, 12, 8, 2, "#263847")
    p.rect(6, 12, 1, 1, "#c78c66")
    p.rect(9, 12, 1, 1, "#7cbeb2")
    p.save("console.svg")
    # Destructible coolant canister: rounded pixel silhouette, glass, couplings.
    for phase in (0, 1):
        p = Canvas(16, 18, "Unstable coolant cell")
        p.rect(2, 15, 12, 3, "#0b1420")
        p.rect(5, 1, 6, 15, "#0b1420")
        p.rect(3, 3, 10, 11, "#0b1420")
        p.rect(4, 3, 8, 11, "#366269")
        p.rect(5, 3, 6, 10, "#4b8c8a")
        p.rect(6, 4, 2, 8, "#89cfb7")
        p.rect(8, 6, 2, 5, "#b4e0bb" if phase else "#92cbb1")
        for y in (2, 13):
            p.rect(4, y, 8, 2, "#7c8e8d")
            p.rect(5, y, 3, 1, "#bfcbc0")
        p.rect(5, 15, 6, 1, "#3b535d")
        p.rect(4, 7, 1, 4, "#bed8bc")
        p.rect(10, 3, 1, 3, "#264e57")
        p.save(f"coolant-{phase}.svg")
    # Metallic thermal detonator with a round, stepped silhouette and red LED.
    for phase in (0, 1, 2):
        p = Canvas(16, 16, "Armed thermal detonator")
        p.rect(3, 13, 11, 2, "#0b1420")
        for x, y, w, h in [(5, 2, 6, 12), (3, 4, 10, 8), (2, 6, 12, 4)]:
            p.rect(x, y, w, h, "#101820")
        p.rect(5, 3, 6, 10, "#71848a")
        p.rect(4, 5, 8, 6, "#71848a")
        p.rect(3, 6, 10, 4, "#536771")
        p.rect(5, 4, 3, 2, "#d0d4bc")
        p.rect(4, 6, 2, 2, "#96a8a7")
        p.rect(4, 9, 8, 1, "#293c4b")
        p.rect(6, 11, 5, 1, "#435968")
        p.rect(8, 5, 3, 3, "#26333e")
        p.rect(9, 6, 2, 1, ["#a65c4d", "#f16a4e", "#ffe2a3"][phase])
        p.save(f"detonator-{phase}.svg")
    # Connected plasma tongues, not a text glyph or a floating plus sign.
    for phase in range(3):
        p = Canvas(16, 16, "Thermal plasma burst")
        for x in range(16):
            spread = [3, 4, 5, 4][(x + phase) % 4]
            p.rect(x, 8 - spread, 1, spread * 2, "#c64e38")
            p.rect(x, 9 - spread, 1, spread * 2 - 2, "#f49946")
            p.rect(x, 7 + (x + phase) % 2, 1, 2, "#ffe5a0")
        p.save(f"blast-h-{phase}.svg")
        p.pixels = [list(line) for line in zip(*p.pixels)]
        p.save(f"blast-v-{phase}.svg")
    # Pixel shadow and floor scorch remain independent of actors' gait.
    p = Canvas(16, 16, "Ground shadow")
    p.rect(4, 12, 8, 3, "#0a1420")
    p.rect(2, 13, 12, 1, "#0a1420")
    p.save("shadow.svg")
    p = Canvas(16, 16, "Echo blast warning — not a pickup")
    for x, y, w, h in [(0, 0, 5, 2), (0, 0, 2, 5), (11, 0, 5, 2), (14, 0, 2, 5),
                        (0, 14, 5, 2), (0, 11, 2, 5), (11, 14, 5, 2), (14, 11, 2, 5)]:
        p.rect(x, y, w, h, "#ef9678")
    for x, y, w, h in [(5, 4, 6, 2), (9, 6, 2, 2), (5, 8, 6, 1), (5, 9, 2, 2), (5, 11, 6, 1)]:
        p.rect(x, y, w, h, "#f2bd66")
    p.save("echo-beacon.svg")


def actors():
    rects = re.compile(r'<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"/>')
    for path in sorted(CAST.glob("*.svg")):
        src = Canvas(32, 32, path.stem)
        for x, y, w, h, color in rects.findall(path.read_text()):
            src.rect(int(x), int(y), int(w), int(h), color)
        if not any(any(row) for row in src.pixels):
            continue
        for facing in ("down", "up", "left", "right"):
            atlas = Canvas(96, 32, f"{path.stem} — {facing}: idle, left stride, right stride")
            # Back view keeps the character's head/cape palette, without front eyes.
            rear = src.pixels[7][10] or src.pixels[5][12] or "#3e5061"
            for phase in range(3):
                for y, line in enumerate(src.pixels):
                    for x, color in enumerate(line):
                        if color is None:
                            continue
                        xx, yy = x, y
                        # Swing lower legs and outer arms in opposing directions.
                        if phase and y >= 27 and 10 <= x <= 21:
                            leading = (x < 16) == (phase == 1)
                            yy = y - (1 if leading else 0)
                            xx += (-1 if x < 16 else 1) if leading else 0
                        if phase and 20 <= y <= 25 and (x < 11 or x > 20):
                            yy += (1 if x < 16 else -1) * (1 if phase == 1 else -1)
                        if facing == "up":
                            if 8 <= y <= 16 and 9 <= x <= 22 and color != INK:
                                color = rear
                            elif 10 <= y <= 15 and 10 <= x <= 21:
                                color = rear
                        if facing in ("left", "right"):
                            # Narrow silhouette and a slight profile, still on whole pixels.
                            xx = 16 + round((xx - 16) * 0.8)
                            if y < 18:
                                xx += 1
                        if facing == "left":
                            xx = 31 - xx
                        if 0 <= xx < 32 and 0 <= yy < 32:
                            atlas.rect(phase * 32 + xx, yy, 1, 1, color)
            atlas.save(f"actors/{path.stem}-{facing}.svg")


def overview(specs, destination):
    """Generated architecture overview, deliberately not an app screenshot."""
    sheet = Canvas(896, 524, "Bomb Run deck architecture")
    sheet.rect(0, 0, sheet.width, sheet.height, "#09131f")
    rects = re.compile(r'<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"')
    def paste(name, x, y):
        for sx, sy, width, height, color in rects.findall((ART / name).read_text()):
            sheet.rect(x + int(sx), y + int(sy), int(width), int(height), color)
    for index, spec in enumerate(specs):
        left, top = 8 + index % 4 * 224, 12 + index // 4 * 260
        cursor = left
        for char in spec["id"].upper():
            glyph = FONT[char].split("/")
            for y, line in enumerate(glyph):
                for x, dot in enumerate(line):
                    if dot == "1":
                        sheet.rect(cursor + x * 2, top + y * 2, 2, 2, spec["accent"])
            cursor += (len(glyph[0]) + 1) * 2
        paste(f"deck-{spec['id']}.svg", left, top + 18)
        for y, line in enumerate(spec["layout"]):
            for x, kind in enumerate(line):
                if kind == "#" and 0 < x < 12 and 0 < y < 10:
                    paste(f"{spec['prop']}.svg", left + x * 16, top + 18 + (y + 2) * 16)
    sheet.png(destination)


def main(preview=None):
    ART.mkdir(parents=True, exist_ok=True)
    # Remove files from the earlier unused artwork prototype.
    for name in ("deck.svg", "ship-interior.svg", "bulkhead.svg", "conduit.svg", "blast-0.svg", "blast-1.svg", "blast-2.svg"):
        (ART / name).unlink(missing_ok=True)
    old_walk = ART / "walk"
    if old_walk.exists():
        for path in old_walk.glob("*.svg"):
            path.unlink()
        old_walk.rmdir()
    specs = json.loads((ROOT / "mods/star-wars-bomb-run/decks.js").read_text().removeprefix("export const DECKS = ").strip().removesuffix(";"))
    for spec in specs:
        deck(spec)
    props()
    zone_props()
    pickups()
    actors()
    for text, name, color in [
        ("BOMB RUN", "title", "#e4d7b4"), ("CLEAR THE DECK", "mission", "#93b7b5"),
        ("DECK SECURED", "victory", "#b8d5a5"), ("SIGNAL LOST", "defeat", "#dd9b86"),
        ("ON STANDBY", "paused", "#e4d7b4"),
    ]:
        lettering(text, name, color)
    if preview:
        overview(specs, preview)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ART, help="Destination for generated SVGs")
    parser.add_argument("--preview", type=Path, help="Optional eight-zone architecture PNG")
    args = parser.parse_args()
    ART = args.output
    main(args.preview)
