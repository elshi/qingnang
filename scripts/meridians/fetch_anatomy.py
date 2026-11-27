"""Fetch the pinned, licensed inputs for render_atlas.py into the given working directory."""
import argparse
import hashlib
from pathlib import Path
from urllib.request import urlopen

BASE='https://raw.githubusercontent.com/Elwyn921/Acu361/v1.0.1/data/'
EXPECTED={
    'manifest.json': None,
    'points.json':'245ea3b2a3584c699f5070b241d0538b7c792a79ffb92544a09c64c75ae64985',
    'meridians.json':'fcf108aaccc4e21c90cd630ee7ab71e9a60c96a82b7b4526135f25a22576bb25',
    'body/skin.glb':'80957317899b2ba9c037ca42eb5cb6a09a0629599f49f1e1773e893400c8e517'
}
if __name__=='__main__':
    cli=argparse.ArgumentParser()
    cli.add_argument('out',type=Path)
    out=cli.parse_args().out
    out.mkdir(parents=True,exist_ok=True)
    for key,digest in EXPECTED.items():
        with urlopen(BASE+key,timeout=60) as res:data=res.read()
        if digest and hashlib.sha256(data).hexdigest()!=digest:raise ValueError(key)
        (out/Path(key).name).write_bytes(data)

