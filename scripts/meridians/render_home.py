"""Render compact transparent home charts directly from the verified anatomy mesh.

Usage: python scripts/meridians/render_home.py --source /path/to/acu361
The palette PNGs support native WeChat images, including older iOS clients.
"""
import argparse
from pathlib import Path

from PIL import Image

from anatomy import Surface, read
from render_atlas import ROOT, Renderer, VIEWS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    surface = Surface(args.source)
    renderer = Renderer(surface, '')
    channels = read(ROOT / 'database/atlas/channels.json')
    output = ROOT / 'miniprogram/assets/meridians'
    output.mkdir(parents=True, exist_ok=True)
    for group in ['regular', 'extraordinary']:
        tracks = [(surface.paths(c), c['color'], c['key'] not in ['ren', 'du', 'dai'])
                  for c in channels if c['group'] == group]
        chart = renderer.fullbody(tracks, [VIEWS[0]], home=True, transparent=True)
        chart = chart.crop(chart.getbbox())
        chart.thumbnail((340, 800), Image.Resampling.LANCZOS)
        chart = chart.quantize(colors=96, method=Image.Quantize.FASTOCTREE,
                               dither=Image.Dither.NONE)
        target = output / (group + '-transparent.png')
        chart.save(target, optimize=True)
        print(target.name, chart.size, target.stat().st_size, flush=True)


if __name__ == '__main__':
    main()
