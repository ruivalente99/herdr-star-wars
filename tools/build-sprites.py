#!/usr/bin/env python3
"""Rebuild the fifteen 32×32 character sprites. Standard library only; weapons stay separate.

Usage: python3 tools/build-sprites.py [--preview /tmp/star-wars-sprites.png]
The optional contact sheet shows dark/light backgrounds and a 36px size check.
"""

import argparse
from html import escape
import json
from pathlib import Path
import struct
import zlib

SIZE = 32
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "mods/star-wars-agents/sprites/star-wars"
INK = "#11151f"
SKIN = {"s": "#b87555", "f": "#e4a878", "F": "#ffcf98", "r": "#bc7061"}
STEEL = {"K": INK, "d": "#202b39", "m": "#3e5061", "h": "#708898", "H": "#b8cbd0"}


class Sprite:
    def __init__(self, title, palette):
        self.title = title
        self.palette = {"K": INK, **palette}
        self.pixels = [[None] * SIZE for _ in range(SIZE)]

    def rect(self, x, y, w, h, color):
        assert color in self.palette, (self.title, color)
        assert 0 <= x < x + w <= SIZE and 0 <= y < y + h <= SIZE
        for row in self.pixels[y:y + h]:
            row[x:x + w] = [self.palette[color]] * w

    def stamp(self, x, y, rows):
        for dy, row in enumerate(rows):
            for dx, color in enumerate(row):
                if color != ".":
                    self.rect(x + dx, y + dy, 1, 1, color)

    def mirror(self, x, y, rows):
        """Stamp each left half and reflect it about the shared x=16 axis."""
        for dy, row in enumerate(rows):
            assert x + len(row) == 16, (self.title, dy, len(row))
            self.stamp(x, y + dy, [row + row[::-1]])

    def svg(self):
        # Merge adjacent pixels, keeping integer coordinates and no smoothing.
        lines = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" '
            'width="36" height="36" shape-rendering="crispEdges">',
            f"  <title>{escape(self.title)} — pixel art</title>",
        ]
        for y, row in enumerate(self.pixels):
            x = 0
            while x < SIZE:
                color = row[x]
                end = x + 1
                while end < SIZE and row[end] == color:
                    end += 1
                if color:
                    lines.append(f'  <rect x="{x}" y="{y}" width="{end - x}" '
                                 f'height="1" fill="{color}"/>')
                x = end
        return "\n".join([*lines, "</svg>", ""])


def vader():
    p = Sprite("Darth Vader", {**STEEL, "R": "#ed6165", "B": "#66aee1", "W": "#e2e8de"})
    # Wide cape, shoulder armour, gloves and boots: not a floating helmet.
    p.mirror(5, 17, [
        "....KKKKKKK", "...Kmmmmddd", "..Kmhmmdddd", ".KmmhKddddd",
        ".KddmKddddd", ".KddmKddddd", ".KddKKddddd", "KdddKKddddd",
        "KdddmKddddd", "KdddmKmmmmm", "KdddKKddddd", "KdddmKddddd",
        "KddmmKddddd", "KKKKKKKKKKK",
    ])
    p.rect(11, 26, 4, 4, "m")
    p.rect(17, 26, 4, 4, "d")
    p.rect(10, 30, 5, 1, "h")
    p.rect(17, 30, 5, 1, "m")
    p.rect(12, 20, 8, 6, "K")
    p.stamp(13, 21, ["mHmBmm", "mRmWmm", "mWmWmm", "mmmmmm"])
    p.rect(10, 26, 12, 2, "K")
    p.stamp(11, 26, ["HdddHHdddH"])
    p.mirror(5, 1, [
        "........KKK", "......KKmmm", ".....Kmmhhh", "....Kmmhmmm",
        "...Kmmhhmmm", "..Kmhhmmmmm", "..Kmmmmmmmm", ".Kmmmmmmmmm",
        ".KmHHmmmmmm", "KmmHHdKKKmm", "KmmHddKKKKm", "KmmHdddKKmm",
        "KmmhdddddHm", ".KmhddddHmm", "..KmhddHmmK", "...KKmHKmKm",
        "....KKmmmmm",
    ])
    # Center seam, deep angled lenses, triangular breathing grille.
    p.rect(15, 3, 2, 7, "h")
    p.rect(15, 10, 2, 3, "H")
    p.stamp(12, 13, ["...mm...", "..mKKm..", ".mKhKhK.", "mKhKhKhK", "mmmmmmmm"])
    # A restrained reflected highlight, not glowing eyes.
    p.rect(9, 10, 2, 1, "h")
    p.rect(10, 6, 2, 1, "H")
    p.rect(9, 7, 1, 2, "h")
    return p


def human(title, hair):
    p = Sprite(title, {**SKIN, **hair, "W": "#fff0cf", "w": "#dfcfab", "t": "#b6a384",
                       "b": "#78523d", "B": "#ab7951", "d": "#273440", "h": "#4d6374",
                       "m": "#384956", "H": "#b8cbd0"})
    # Shared anatomy, not shared costume: compact heads and a readable stance.
    p.mirror(7, 4, [
        "...KKKKKK", "..Kyyyyyy", ".KyyyYYYY", ".KyyYFFFF", ".KyyFFFFF",
        "KsyyFFFFF", "KfsyFFFFF", ".KsFFFFFf", "..KsFFFFf", "..KsFFFFf",
        "...KsFFFF", "....Kssss",
    ])
    p.rect(11, 10, 2, 2, "K")
    p.rect(19, 10, 2, 2, "K")
    p.rect(11, 10, 1, 1, "H")
    p.rect(19, 10, 1, 1, "H")
    p.rect(15, 12, 2, 1, "f")
    p.rect(14, 14, 4, 1, "r")
    p.rect(14, 16, 4, 2, "f")
    return p


def luke():
    p = human("Luke Skywalker", {"y": "#a16a35", "Y": "#d9aa50", "L": "#ffe19a"})
    # Swept blonde hair and ivory Tatooine wrap tunic.
    p.stamp(8, 2, ["....KKKKKKKK....", "..KKYYYYYYYYKK..", ".KYYLLLLYYYYYYK.",
                    "KYYLLLLYYYYYYYYK", "KYYLLYYYYYYYYYYK", "KYYYYYYyYYYyYYYK",
                    ".KYYYyyFFFFFyYK.", ".KYYyFFFFFFFfyK."])
    p.mirror(6, 18, [
        "....KKKWWK", "...KWWWWwK", "..KWWWWWwt", "..KWwWWWwt", ".KWwwWWWwt",
        ".KwwKWWWwt", ".KffKWWWWW", ".KssKbbbbb", "..KKKWWwww", "....KWwwww",
        "....KbBBbK", "....KbBBbK", "...KKbBBbK",
    ])
    p.rect(11, 25, 10, 2, "b")
    p.rect(15, 25, 2, 2, "H")
    p.rect(10, 30, 5, 1, "b")
    p.rect(17, 30, 5, 1, "b")
    return p


def leia():
    p = human("Princess Leia", {"y": "#503027", "Y": "#805038", "L": "#b17a50"})
    p.palette.update({"W": "#f3f5f2", "w": "#d4dde2", "t": "#9eacb9"})
    p.stamp(8, 3, ["....KKKKKKKK....", "..KKYYLLLLYYKK..", ".KYYLLYYYYLLYYK.",
                    "KYYYYYYYYYYYYYYK", "KYYYyyyyyyyyYYYK", "KYYyFFFFFFFFyYYK"])
    # Buns sit beside the face, attached to the hairline, with a spiral highlight.
    p.stamp(3, 8, [".KKKK.", "KYLLYK", "KLYyYK", "KLYyYK", "KYYLYK", ".KYYK.", "..KK.."])
    p.stamp(23, 8, [".KKKK.", "KYLLYK", "KLYyYK", "KLYyYK", "KYYLYK", ".KYYK.", "..KK.."])
    p.mirror(6, 18, [
        "....KKKWWK", "...KWWWWWW", "..KWWWWWWW", "..KWWWWWWW", ".KWWwWWWWW",
        ".KWWKWWWWW", ".KffKWWWWW", ".KssKttttt", "..KKKWWWWW", "....KWWWWW",
        "....KWWWWW", "...KWWWWWW", "...Kwwwwww",
    ])
    p.rect(14, 25, 4, 1, "H")
    p.rect(15, 20, 1, 5, "w")
    p.rect(11, 30, 4, 1, "t")
    p.rect(17, 30, 4, 1, "t")
    return p


def han():
    p = human("Han Solo", {"y": "#432e29", "Y": "#704631", "L": "#ab7245",
                            "n": "#364766", "N": "#536a88", "R": "#b45245"})
    p.stamp(8, 2, ["......KKKKKK....", "...KKKYYYYYYKK..", ".KKYYLLYYYYYYYK.",
                    "KYYYLLYYYYYYYYYK", "KYYYYYYYYYYYYYYK", "KYYYYyyFFFFyyYYK",
                    ".KYYyFFFFFFFfyK.", ".KyyFFFFFFFFfyK."])
    p.mirror(6, 18, [
        "....KKdWWK", "...KWWdWWW", "..KWWWdWWW", "..KWWwdWWW", ".KWWwwdWWW",
        ".KwwKddWWW", ".KffKddWWW", ".KssKbbbbb", "..KKKnNNnK", "....KnNNnK",
        "....KnNNnK", "....KdddKK", "...KKdddKK",
    ])
    p.rect(10, 19, 3, 6, "d")
    p.rect(19, 19, 3, 6, "d")
    p.rect(10, 20, 2, 1, "h")
    p.rect(20, 20, 2, 1, "h")
    p.rect(10, 23, 2, 1, "h")
    p.rect(20, 23, 2, 1, "h")
    p.rect(15, 25, 2, 1, "H")
    p.rect(21, 26, 1, 3, "R")
    p.rect(10, 30, 5, 1, "m")
    p.rect(17, 30, 5, 1, "m")
    return p


def chewbacca():
    p = Sprite("Chewbacca", {"d": "#4c3027", "m": "#805037", "h": "#b27b4c", "H": "#dfae71",
                             "b": "#a0653e", "W": "#e9dcc0", "s": "#738393", "S": "#c2cbd0"})
    p.mirror(6, 1, [
        ".......K.K", ".....KKmKm", "....Kmhmmh", "...Kmhhmhm", "..Kmhmmhmm",
        ".Kmhhmhmhm", ".Kmhmmmmmm", "Kmhmmmhmhm", "Kmhmmmhhmm", "KmmhdKKmmd",
        "KmmhdKKmmd", "Kmhmmhhhmm", ".KmmhhmhhK", ".KmhmmhddK", "..Kmhmmhdd",
        "...Kmhmmhh", "...Kmmhhmm", "..Kmmhmmhm", ".Kmmhhmmhm", ".Kmhmmhmmm",
        "KmhmmKmmhm", "KmmhmKmhmm", "KmmhmKmmhm", ".KmmKKmmhm", "..KKKmhmmm",
        "....Kmmhmm", "....KmmhmK", "....KmhhmK", "...KmhhmmK", "...KmmhmmK",
    ])
    # Dark nose and muzzle; off-white teeth make the Wookiee face legible.
    p.rect(14, 11, 4, 2, "K")
    p.rect(11, 10, 2, 2, "K")
    p.rect(19, 10, 2, 2, "K")
    p.rect(11, 10, 1, 1, "H")
    p.rect(19, 10, 1, 1, "H")
    p.stamp(11, 13, ["hhdKKddhhH", "hdKKKKKdhH", ".KWKWWKWK.", "..dhhhhd.."])
    # Diagonal leather bandolier and silver ammunition blocks.
    for i in range(8):
        p.rect(10 + i, 18 + i, 3, 2, "d")
        if i % 2 == 0:
            p.rect(10 + i, 18 + i, 2, 1, "S")
            p.rect(10 + i, 19 + i, 2, 1, "s")
    p.rect(10, 30, 5, 1, "d")
    p.rect(17, 30, 5, 1, "d")
    return p


def stormtrooper():
    p = Sprite("Stormtrooper", {**STEEL, "W": "#f6f7ed", "w": "#cbd8d8", "t": "#92a7b3"})
    p.mirror(5, 2, [
        ".......KKKK", ".....KKWWWW", "....KWWWWWW", "...KWWWwwww", "..KWWWWWWWW",
        "..KWWWWWWWW", ".KWWWWwwwww", ".KWWtKKKKKK", ".KWwKKKKKKK", ".KWwKKKwwWW",
        "KWWwWWWWWWW", "KWWwWWwKKWW", "KWWwwWwKKKK", ".KWWwwWwKKK", "..KWWwwwKmw",
        "...KWWwwwwW", "....KKKKKKK",
    ])
    p.mirror(6, 19, [
        "...KKKKwwK", "..KWWWWWWW", ".KWWWKWWWW", ".KWWwKWWWw", ".KWWKKwwww",
        ".KddKKWWWW", "..KKKKwwKw", "....KWWWWK", "....KWWwwK", "....KWWwwK",
        "....KKddKK", "...KWWWWwK",
    ])
    p.stamp(12, 13, ["WWWKKWWW", "WWKmmKWW", "WKmKmKmW", "KhmKmKmh", "wwwwwwww"])
    p.rect(10, 16, 2, 1, "d")
    p.rect(20, 16, 2, 1, "d")
    p.rect(10, 24, 12, 1, "K")
    p.stamp(10, 25, ["wWKWWKKWWKWw"])
    p.rect(19, 22, 2, 1, "d")
    return p


def r2d2():
    p = Sprite("R2-D2", {**STEEL, "W": "#f1f3e8", "w": "#c3d4d7", "B": "#2e5a9e",
                         "b": "#4389ce", "L": "#8bcbef", "R": "#f16a63", "Y": "#d7b16b"})
    # Low, rounded dome, squat body, three separate feet. No red antenna.
    p.mirror(7, 5, [
        "......KKK", "....KKhhh", "...KhhbBB", "..KhhBbBB", ".KhhBBbBB", ".KhwBBbBB",
        "KWWwwwwww", "KWWWWWWWW", "KWWWWBBBB", "KWWWWBBBB", "KWWWWWWWW", "KWWWWBBBB",
        "KWWWWBBBB", "KWWWWWWWW", "KWWWWBWWB", "KWWWWBWWB", "KWWWWWWWW", "KWWWWwwww",
        ".KKKKKKKK",
    ])
    p.rect(14, 9, 4, 4, "K")
    p.rect(15, 9, 2, 1, "L")
    p.rect(15, 10, 1, 1, "h")
    p.rect(19, 12, 2, 1, "R")
    p.rect(10, 12, 2, 1, "L")
    p.rect(11, 14, 10, 1, "b")
    p.rect(12, 17, 8, 1, "b")
    p.stamp(12, 21, ["hHhHHhHh", "dmdmdmdm"])
    p.mirror(3, 16, [
        "..KK.........", ".KwwK........", ".KWWK........", ".KWWK........", ".KWwK........",
        ".KWwK........", ".KWwK........", ".KBwK........", ".KBwK........", ".KBwK........",
        "KWWwwK.......", "KWWwwK.......", "KKKKKK.......",
    ])
    p.rect(14, 24, 4, 3, "m")
    p.rect(13, 27, 6, 1, "W")
    p.rect(12, 28, 8, 1, "w")
    p.rect(12, 29, 8, 1, "K")
    return p


def obi_wan():
    p = human("Obi-Wan Kenobi", {"y": "#693d2c", "Y": "#ac6840", "L": "#d69a60",
                                  "c": "#51372e", "C": "#815438", "q": "#b48150"})
    # Swept auburn hair, a full ginger beard, and an open brown Jedi robe.
    p.stamp(8, 2, ["....KKKKKKKK....", "..KKYYYYYYYYKK..", ".KYYLLLLYYYYYYK.",
                    "KYYLLLLLYYYYYYYK", "KYYLLYYYYYYYYYYK", "KYYYyyyyyyyyYYYK",
                    ".KYyFFFFFFFFyYK.", ".KyyFFFFFFFFyyK."])
    p.stamp(10, 12, ["YfFFFFFFFFfY", "YYfFFFFFFfYY", ".YYffrrffYY.",
                     "..YYffffYY..", "...YYYYYY...", "....yyyy...."])
    p.mirror(6, 18, [
        "....KKbWWK", "...KCqbWWw", "..KCqCbWWw", ".KCqCCbWWw", ".KCCCKbWWW",
        ".KCCCKbWWW", ".KCffKbWWW", ".KCssKbbbb", "..KKCKWwww", "...KCKWwww",
        "...KCKbBBK", "..KCCKbBBK",
    ])
    p.rect(11, 25, 10, 2, "b")
    p.rect(15, 25, 2, 1, "H")
    p.rect(8, 30, 3, 1, "c")
    p.rect(21, 30, 3, 1, "c")
    p.rect(10, 30, 5, 1, "b")
    p.rect(17, 30, 5, 1, "b")
    return p


def yoda():
    p = Sprite("Yoda", {"g": "#64864d", "G": "#9dbb72", "L": "#d4dfa0",
                         "b": "#604733", "B": "#8a6847", "W": "#e0d1ac", "w": "#b2a17e"})
    # Both ears join the rounded head; the smaller body sits on the same baseline.
    p.mirror(1, 10, [
        "KKKK...........", "KLGGKKKK.......", ".KLGGGggKK.....", "..KLGGgggGKK...",
        "...KGGgggGGK...", "....KKgggGK....", "......KKKK.....",
    ])
    p.mirror(7, 6, [
        "......KKK", "....KKGGG", "...KGGLLG", "..KGGLLGG", ".KGGGGGGG",
        ".KGgGGGGG", "KGGgGGGGG", "KGGgGGGGG", ".KGggGGGG", ".KGGggGGG",
        "..KGGgggg", "...KGGggg", "....KKggg", ".....KKKK",
    ])
    # Heavy lids, bright eyes, a broad nose and a small, knowing mouth.
    p.stamp(10, 11, ["gGGg....gGGg", ".KK......KK.", ".LK......KL.",
                     "...gGGg.....", "....gg......", "...gKKg.....", "....GG......"])
    p.mirror(7, 19, [
        "....KKWbK", "...KWWWbB", "..KWWWWbB", ".KWWWwWbB", ".KWWwKWbB",
        "KGGwKKWbB", "KggKKKWbB", ".KK.KWWbB", "...KWWwbB", "...Kwwwbb",
        "...KKgggK", "..KKggggK",
    ])
    p.rect(23, 24, 1, 7, "b")
    p.stamp(22, 23, ["bb", "b."])
    return p


def boba_fett():
    p = Sprite("Boba Fett", {"G": "#456d58", "g": "#73916a", "L": "#a8b77c",
                              "R": "#9e4945", "W": "#d9d4b8", "w": "#a8b5a8",
                              "d": "#303943", "m": "#667478", "Y": "#c7a252",
                              "y": "#e1bd6d", "b": "#77533b", "c": "#515e49"})
    # Cape and jetpack sit behind the armour; the rangefinder is not a weapon.
    p.stamp(5, 17, ["..KccK", ".KcGcK", ".KcGcK", ".KcGcK", "KccGcK",
                    "KccGcK", "KccGcK", "KccGcK", "KccGcK", "KcccK.", "KccK..", "KKK..."])
    p.rect(9, 16, 14, 8, "Y")
    p.mirror(6, 18, [
        "...KKKmmmm", "..KYyYKGGG", ".KYyyYKGLG", ".KmmKKKGGG", ".KmmKKGgGG",
        ".KRRKKGggG", ".KRRKKmmmm", ".KddKKbbbb", "..KKKmmmmm", "....KmwwmK",
        "....KmwwmK", "...KKdddKK", "...KmmmmmK",
    ])
    p.stamp(11, 20, ["gGGGmmGGGg", "GGGLmmGdGG", ".GGGmmGGG.", "..GGmmGG.."])
    p.rect(19, 20, 1, 2, "Y")
    p.stamp(10, 25, ["bYbbYbbYbbYb"])
    p.rect(25, 3, 3, 13, "K")
    p.rect(26, 4, 1, 11, "m")
    p.stamp(24, 1, ["KKKKK", "KWWWK", ".KKK."])
    # Rounded Mandalorian helmet, red framing and a continuous black T visor.
    p.mirror(5, 2, [
        ".......KKKK", ".....KKggGG", "....KggLLgG", "...KggLggGG", "..KggLggGGG",
        "..KgLggGGGG", ".KggggGGGGG", ".KgRRRRRRRR", ".KRRKKKKKKK", "KRddKKKKKKK",
        "KRddGGGGGRK", "KRddGGGGGRK", "KRddGGGGGRK", ".KRdGGGGGRK", "..KRGGGGGRK",
        "...KRRRRRRK", "....KKKKKKK",
    ])
    p.rect(11, 6, 2, 1, "W")
    p.rect(12, 7, 1, 1, "L")
    p.rect(20, 5, 2, 1, "d")
    p.rect(8, 14, 2, 1, "W")
    return p


def c3po():
    p = Sprite("C-3PO", {"G": "#bd8b35", "g": "#e1b94f", "Y": "#fff0af",
                          "d": "#433c32", "m": "#896027", "h": "#c69b42",
                          "R": "#ae6551", "B": "#66899b", "S": "#a6b8bf", "H": "#e0e5db"})
    # Articulated shoulders, elbow joints, chest plates and exposed waist wiring.
    p.mirror(6, 17, [
        "....KKmGKK", "...KGgGmGG", "..KGYgGmGg", ".KGgKKGgGg", ".KGmKKGGgg",
        ".KmmKKdddd", ".KGgKKdRdd", ".KGgKKmmmm", "..KKKGGggG", "....KGGggK",
        "....KGgggK", "....KGgggK", "...KKGgggK", "...KGYgggK",
    ])
    p.stamp(12, 19, ["gGmGGmGg", "GgGggGgG", "GGgmmgGG", "mGGggGGm",
                     "dRdBddYd", "dBdRdYdd"])
    p.rect(17, 27, 4, 3, "S")
    p.rect(17, 27, 1, 3, "H")
    p.rect(20, 27, 1, 3, "B")
    p.rect(17, 30, 5, 1, "S")
    # Rounded gold skull, temple discs and round, illuminated photoreceptors.
    p.mirror(7, 2, [
        "......KKK", "....KKGGg", "...KGgYYg", "..KGgYYgg", ".KGgYgggg",
        ".KGgGgggg", "KGmGmmmmG", "KGmGKYYKG", "KGmGKYYKG", ".KGgGmmGG",
        ".KGgggGgg", "..KGgGmGG", "...KGGggG", "....KKGGG", ".....Kmmm", ".....KKKK",
    ])
    p.stamp(10, 8, ["mKKm....mKKm", "KYYK....KYYK", "mYmG....GYmG"])
    p.rect(12, 9, 1, 1, "h")
    p.rect(20, 9, 1, 1, "h")
    p.rect(15, 10, 2, 3, "Y")
    p.stamp(13, 13, ["mKKKKm", ".hGGh."])
    p.rect(15, 4, 1, 3, "G")
    return p


def padme():
    # Naboo's red royal gown and gold headdress distinguish her from Leia.
    p = human("Padmé Amidala", {"y": "#402b27", "Y": "#684438", "L": "#e5bd68",
                                  "s": "#bd9b86", "f": "#e8d8c2", "F": "#fff0d3", "r": "#b9373e",
                                  "R": "#a72d3d", "J": "#d04b4d", "a": "#aa7a36", "A": "#edc66d"})
    p.mirror(3, 3, [
        "..KKKK.......", ".KyyyyKK.....", "KyyYLLyyK....", "KyYLLLYyyK...",
        "KyYLLYyyyK...", "KyYLLYyK.....", ".KyLYyyK.....", ".KyyyyK......",
        "..KyyK.......", "...KK........",
    ])
    p.stamp(11, 1, ["..KKKKKK..", ".KJJJJJJK.", "KJJAAAAJJK",
                     "KJAAAAAAJK", ".KJJAAJJK."])
    p.rect(15, 7, 2, 1, "R")
    p.rect(11, 13, 1, 1, "r")
    p.rect(20, 13, 1, 1, "r")
    p.rect(14, 14, 4, 1, "F")
    p.rect(15, 14, 2, 1, "r")
    p.rect(15, 15, 1, 1, "r")
    p.mirror(5, 17, [
        ".....KRAARK", "....KRJRAAR", "...KRJJRAAR", "..KRJJJRAAR", ".KRJJJRRAAR",
        ".KRJJJKRAAR", "KRJJJJKRAAR", "KRJFFJKRAAR", ".KJffKKRaaR", "..KKKKRRAAR",
        "...KRJJRAAR", "..KRJJJRAAR", ".KRJJJJRAAR", ".KRRRRRRRRR",
    ])
    p.stamp(12, 17, ["aAARRAAa"])
    p.rect(15, 21, 2, 1, "J")
    p.rect(15, 25, 2, 1, "J")
    return p


def ahsoka():
    p = Sprite("Ahsoka Tano", {"O": "#c96c43", "o": "#f0a36f", "W": "#f2efdc",
                               "w": "#bac4c0", "B": "#4a82aa", "b": "#2e526e",
                               "d": "#313a45", "m": "#66777a", "R": "#97494a", "t": "#775541"})
    p.mirror(6, 17, [
        "....KKOmmK", "...Kdmmmmm", "..KmmmWmmm", ".KOOKmdmmm", ".KOOKmdmmm",
        ".KOOOKdddd", ".KmmKKmmmm", ".KddKKtttt", "..KKKddddd", "....KddmmK",
        "....KddmmK", "....KddmmK", "...KKmmmmK", "...KmmmmmK",
    ])
    p.stamp(13, 19, ["mWWWWm", "mdWWdm", "mmddmm"])
    p.rect(15, 24, 2, 1, "w")
    # Two tapered montrals and striped lekku frame, rather than replace, the face.
    p.mirror(4, 1, [
        ".....KK.....", "....KWbK....", "....KWWbK...", "...KWWBBWK..", "...KWWBBWWK.",
        "..KWWBBWWWWK", "..KWBBWWBBWW", ".KWWBWOOOOOO", ".KWBWOOooooo", ".KWWWOoooooo",
        "KWBBWOOooooo", "KWWBWOoooooo", "KWWWBOoooooo", "KWBWWOOooooo", "KWBWWbOOoooo",
        "KWWBBWKOOooo", ".KWWBWK.KOOo", ".KWBWWK..KKK", ".KWWBBK.....", ".KWWWBK.....",
        "..KWWBK.....", "..KWWK......", "...KK.......",
    ])
    p.stamp(11, 9, ["W..WW..W", "oW.WW.Wo"])
    p.rect(11, 12, 2, 2, "K")
    p.rect(19, 12, 2, 2, "K")
    p.rect(11, 12, 1, 1, "W")
    p.rect(19, 12, 1, 1, "W")
    p.rect(15, 12, 2, 2, "W")
    p.rect(15, 14, 1, 1, "W")
    p.rect(12, 14, 1, 1, "W")
    p.rect(19, 14, 1, 1, "W")
    p.rect(15, 16, 2, 1, "R")
    return p


def mace_windu():
    p = Sprite("Mace Windu", {"s": "#69402f", "f": "#955d40", "F": "#bd8359",
                               "r": "#6e4436", "H": "#e8cfaa", "W": "#eee0bd",
                               "w": "#ceba96", "t": "#aa916d", "b": "#543c30", "B": "#92704d",
                               "c": "#48332c", "C": "#735039", "q": "#a17a51"})
    # Bald head and warm brown Jedi robes; purple belongs to his separate saber.
    p.mirror(7, 3, [
        ".....KKKK", "...KKffff", "..KffFFFF", ".KffFFFFF", ".KfFFFFFF",
        "KsfFFFFFF", "KsfFFFFFF", "KsfFFFFFF", ".KsfFFFFf", ".KsfFFFff",
        "..KsfFfff", "..Kssffff", "...Kssfff", "....Kssss", ".....Kfff",
    ])
    p.rect(10, 9, 4, 1, "s")
    p.rect(18, 9, 4, 1, "s")
    p.rect(11, 10, 2, 2, "K")
    p.rect(19, 10, 2, 2, "K")
    p.rect(11, 10, 1, 1, "H")
    p.rect(19, 10, 1, 1, "H")
    p.rect(15, 12, 1, 2, "s")
    p.rect(14, 15, 4, 1, "r")
    p.mirror(6, 18, [
        "....KKCWWK", "...KCqCWwt", "..KCqCCWwt", ".KCqCCCWwt", ".KCCCCKWwt",
        ".KCCCCKWWW", ".KffCKWWWW", ".KssCKbbbb", "..KKCKWwww", "...KCKWwww",
        "...KCKbBBK", "..KCCKbBBK",
    ])
    p.rect(11, 25, 10, 2, "b")
    p.rect(15, 25, 2, 1, "H")
    p.rect(8, 30, 3, 1, "c")
    p.rect(21, 30, 3, 1, "c")
    p.rect(10, 30, 5, 1, "b")
    p.rect(17, 30, 5, 1, "b")
    return p


def emperor_palpatine():
    p = Sprite("Emperor Palpatine", {"d": "#272934", "m": "#414653", "h": "#66717e",
                                     "s": "#857b72", "f": "#b9b29b", "F": "#e1dac0",
                                     "R": "#e4be56", "W": "#f4eed6"})
    # Continuous hood and flared robe, with folds visible on the dark background.
    p.mirror(4, 17, [
        "......KKmmmm", "....KKmddddm", "...Kmddddddm", "..Kmdddmdddm", "..KmdddKdddm",
        ".KmddddKdddm", ".KmfffKKdddm", ".KmfsfKKdddm", ".KmsssKKdddm", "..KKKKmKdddm",
        "..KmddmKdddm", ".KmdddmKdddm", "KmddddmKdddm", "KKKKKKKKKKKK",
    ])
    p.mirror(4, 1, [
        ".........KKK", ".......KKmmm", "......Kmmhmm", ".....Kmmhmmm", "....Kmmhmmmm",
        "...Kmmhmmddd", "..KmmhmdKKKK", "..KmhmdKssFF", ".KmmmdKsFFFF", ".KmmmdKfFFFF",
        "KmmhmdKfFFFF", "KmmhmdKsFFFF", "KmmhmdKsFFFF", "KmmhmdKssFFF", ".KmmhmdKsFFF",
        ".KmmhmdKKsff", "..KmmhmddKKK", "...Kmmhmmddd", "....KKmmmmmm",
    ])
    # Wrinkled forehead, recessed amber eyes and the Emperor's thin grin.
    p.stamp(13, 8, ["sFFFFs", ".ssss."])
    p.stamp(11, 10, ["sKFF..FFKs", ".KRK..KRK.", "sFFFssFFFs", ".sFfssFfs.",
                     "..sKKKKs..", "...fWWf...", "....ff...."])
    p.rect(15, 19, 2, 2, "h")
    p.rect(9, 29, 5, 1, "m")
    p.rect(18, 29, 5, 1, "m")
    return p


def write_preview(sprites, path):
    # Dependency-free PNG: rows are large nearest-neighbour art, then actual-size checks.
    backgrounds = [json.loads((ROOT / "themes" / f"{side}-side.json").read_text())["background"]
                   for side in ["dark", "light"]]
    width, height, cell = len(sprites) * 144, 424, 144
    rgb = lambda color: bytes.fromhex(color.lstrip("#"))
    rows = []
    for y in range(height):
        bg = backgrounds[y // (height // 2)]
        row = bytearray(rgb(bg) * width)
        local_y = y % (height // 2)
        for index, sprite in enumerate(sprites):
            for scale, top in [(4, 8), (1.125, 160)]:
                size = round(SIZE * scale)
                if not top <= local_y < top + size:
                    continue
                sy = int((local_y - top) / scale)
                left = index * cell + (cell - size) // 2
                for dx in range(size):
                    color = sprite.pixels[sy][int(dx / scale)]
                    if color:
                        row[(left + dx) * 3:(left + dx + 1) * 3] = rgb(color)
        rows.append(b"\0" + row)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0))
    Path(path).write_bytes(png + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b""))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    drawings = {
        "vader": vader, "luke": luke, "leia": leia, "han": han,
        "chewbacca": chewbacca, "stormtrooper": stormtrooper, "r2d2": r2d2,
        "obi-wan": obi_wan, "yoda": yoda, "boba-fett": boba_fett,
        "c3po": c3po, "padme": padme, "ahsoka": ahsoka,
        "mace-windu": mace_windu, "emperor-palpatine": emperor_palpatine,
    }
    DEST.mkdir(parents=True, exist_ok=True)
    characters = {name: draw() for name, draw in drawings.items()}
    for name, sprite in characters.items():
        (DEST / f"{name}.svg").write_text(sprite.svg(), encoding="utf-8")
    print(f"Built {len(characters)} character sprites in {DEST}")
    if args.preview:
        write_preview(list(characters.values()), args.preview)
        print(f"Preview: {args.preview}")


if __name__ == "__main__":
    main()
