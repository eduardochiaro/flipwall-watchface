#!/usr/bin/env python3
"""Build the watch's vector fonts: resources/fonts/<id>.ffont, one per entry of
FONTS. `npm run font` runs it; needs fontTools (pip install fonttools).

Each font is pinned to one static instance (variable fonts), cut to the glyphs
the face draws (CHARS), given tabular digits (so a ticking clock doesn't shift
sideways), written as an SVG font and compiled by fctx-compiler.

Size matters more than anything here: fctx loads the whole .ffont into the app
heap, and basalt has little of it to spare (see fctx_open in blocks.c). Only one
font is ever loaded, so the budget is per font: keep each at or under ~12KB.
Two things keep them small:
  * quadratic TrueType curves are merged into cubics within `err` font units
    (1/1000 em; 1 is invisible on the watch, Nunito needs 6 to fit);
  * outlines go through fontTools pens, which emit far fewer points than the
    opentype.js path the old script used (Lekton: 11.1KB -> 9.0KB).

The order of FONTS is the wire format: the config page sends the index, and the
watch's FONT_RES table (flipwall-watchface.c) and FONTS in catalog.js follow
it. Only ever append.
"""
import base64, io, os, subprocess, sys, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.varLib.instancer import instantiateVariableFont

CHARS = " %-./0123456789:@ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz°"
GF = "https://github.com/google/fonts/raw/main/ofl/"
CTAN = "https://mirrors.ctan.org/fonts/tex-gyre/opentype/"

#  id, source (a path in the repo or a URL), variable-axis pins, err, overrides
FONTS = [
    # Lekton is mono, so "." would sit in a full em/2 cell ("3 . 2"); narrow it.
    ("lekton",    "resources/fonts/Lekton-Bold.ttf", {}, 1, {".": 250}),
    ("bricolage", GF + "bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf",
                  {"wght": 700, "wdth": 100, "opsz": 24}, 1, {}),
    ("adventor",  CTAN + "texgyreadventor-bold.otf", {}, 1, {}),
    ("nunito",    GF + "nunito/Nunito%5Bwght%5D.ttf", {"wght": 700}, 6, {}),
    ("tektur",    GF + "tektur/Tektur%5Bwdth%2Cwght%5D.ttf", {"wght": 800, "wdth": 100}, 1, {}),
    ("aldrich",   GF + "aldrich/Aldrich-Regular.ttf", {}, 1, {}),
    ("quantico",  GF + "quantico/Quantico-Bold.ttf", {}, 1, {}),
    ("oxanium",   GF + "oxanium/Oxanium%5Bwght%5D.ttf", {"wght": 700}, 1, {}),
    ("squadaone", GF + "squadaone/SquadaOne-Regular.ttf", {}, 1, {}),
]

# The config page previews each font under these names (FONTS[].css in
# catalog.js). They are all inlined into the page, as web fonts cut to the same
# glyphs plus the icon stand-ins the preview draws as text: the page is opened
# as a data: URL, and the phone app's webview won't fetch Google Fonts there.
FAMILY = {"lekton": "Lekton", "bricolage": "Bricolage Grotesque", "adventor": "TeX Gyre Adventor",
          "nunito": "Nunito", "tektur": "Tektur", "aldrich": "Aldrich", "quantico": "Quantico",
          "oxanium": "Oxanium", "squadaone": "Squada One"}

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE = os.path.join(ROOT, "build", "fonts")   # downloads + intermediate SVGs
OUT = os.path.join(ROOT, "resources", "fonts")


def source(fid, src):
    if not src.startswith("https://"):
        return os.path.join(ROOT, src)
    path = os.path.join(CACHE, fid + os.path.splitext(src)[1])
    if not os.path.exists(path):
        urllib.request.urlretrieve(src, path)
    return path


def tabular(font, cmap):
    """Point the digits at the font's tnum glyphs, if it has them."""
    if "GSUB" not in font:
        return
    t = font["GSUB"].table
    for fr in t.FeatureList.FeatureRecord:
        if fr.FeatureTag != "tnum":
            continue
        for li in fr.Feature.LookupListIndex:
            for st in t.LookupList.Lookup[li].SubTable:
                m = getattr(st, "mapping", None) or {}
                for d in "0123456789":
                    cmap[ord(d)] = m.get(cmap[ord(d)], cmap[ord(d)])


def static_font(path, axes):
    """The font at `axes` (a variable font pinned to one instance)."""
    font = TTFont(path)
    if "fvar" in font:
        loc = {a.axisTag: axes.get(a.axisTag, a.defaultValue) for a in font["fvar"].axes}
        instantiateVariableFont(font, loc, inplace=True)
    return font


def svg_font(fid, path, axes, err, overrides):
    font = static_font(path, axes)
    gs, cmap, upm = font.getGlyphSet(), dict(font.getBestCmap()), font["head"].unitsPerEm
    missing = [c for c in CHARS if ord(c) not in cmap]
    if missing:
        sys.exit(f"{fid}: no glyph for {''.join(missing)!r}")
    tabular(font, cmap)
    # No tnum glyphs: centre each digit in the widest one's cell instead.
    cell = max(gs[cmap[ord(d)]].width for d in "0123456789")
    rows = []
    for c in CHARS:
        g = gs[cmap[ord(c)]]
        w = overrides.get(c, cell if c.isdigit() else g.width)
        pen = SVGPathPen(gs, ntos=lambda v: str(round(v)))
        tpen = TransformPen(pen, (1, 0, 0, 1, (w - g.width) / 2, 0))   # keep the ink centred
        g.draw(Qu2CuPen(tpen, max_err=err) if err else tpen)
        ch = {"&": "&amp;", "<": "&lt;", '"': "&quot;"}.get(c, c)
        rows.append(f'    <glyph unicode="{ch}" horiz-adv-x="{round(w)}" d="{pen.getCommands()}"/>')
    hh, cap = font["hhea"], getattr(font["OS/2"], "sCapHeight", 0) or round(upm * 0.7)
    return (f'<?xml version="1.0" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg">\n<defs>\n'
            f'  <font id="{fid}" horiz-adv-x="{upm // 2}">\n'
            f'    <font-face units-per-em="{upm}" ascent="{hh.ascent}" descent="{hh.descent}" cap-height="{cap}"/>\n'
            + "\n".join(rows) + "\n  </font>\n</defs>\n</svg>\n")


def main():
    os.makedirs(CACHE, exist_ok=True)
    compiler = os.path.join(ROOT, "node_modules", ".bin", "fctx-compiler")
    for fid, src, axes, err, overrides in FONTS:
        svg = os.path.join(CACHE, fid + ".svg")
        with open(svg, "w") as f:
            f.write(svg_font(fid, source(fid, src), axes, err, overrides))
        # fctx-compiler names its output after the font id and writes it into
        # ./resources/ if the working directory has one, else into the working
        # directory: run it from the cache so it lands there.
        subprocess.run([compiler, svg], check=True, cwd=CACHE, stdout=subprocess.DEVNULL)
        out = os.path.join(OUT, fid + ".ffont")
        os.replace(os.path.join(CACHE, fid + ".ffont"), out)
        print(f"{fid:10} {os.path.getsize(out):6} bytes")
    write_page_css()


def write_page_css():
    css = ["/* Generated by scripts/fonts.py. Do not edit. */"]
    for fid, src, axes, *_ in FONTS:
        opts = subset.Options()
        opts.flavor, opts.layout_features = "woff", ["tnum"]
        opts.drop_tables += ["FFTM"]   # FontForge's timestamp; subset can't cut it
        font = static_font(source(fid, src), axes)
        sub = subset.Subsetter(opts)
        sub.populate(text=CHARS + "\u2600\u2191\u2192")
        sub.subset(font)
        buf = io.BytesIO()
        font.flavor = "woff"
        font.save(buf)
        data = base64.b64encode(buf.getvalue()).decode()
        css.append(f"@font-face {{ font-family: '{FAMILY[fid]}'; font-weight: 100 900; "
                   f"src: url(data:font/woff;base64,{data}) format('woff'); }}")
    with open(os.path.join(ROOT, "src", "pkjs", "page", "fonts.css"), "w") as f:
        f.write("\n".join(css) + "\n")


if __name__ == "__main__":
    main()
