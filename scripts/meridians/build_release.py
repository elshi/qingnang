"""Build a self-contained Laravel, mini-program and atlas data release from an allowlist."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT=Path(__file__).resolve().parents[2]
TREES=['app','config','routes','resources','vendor','conf','public','miniprogram',
       'database/atlas','database/migrations','database/seeds','scripts/meridians']
FILES=['artisan','bootstrap/app.php','Dockerfile','.dockerignore','run.sh','server.php',
       'composer.json','composer.lock','container.config.json','LICENSE','database/acupoints-standard-2021.json',
       'scripts/repair-acupoints.mjs','docs/meridian-atlas.md']
BOOKS=['lingshu','zhenjiudacheng','qijingbamaikao']
EMPTY=['storage/logs','storage/app','storage/framework/cache/data','storage/framework/views',
       'storage/framework/sessions','bootstrap/cache']


def files():
    paths=[ROOT/f for f in FILES]+[ROOT/'txt/classic-books/chapters'/(k+'.json') for k in BOOKS]
    for folder in TREES:
        paths.extend((ROOT/folder).rglob('*'))
    for p in sorted(set(paths)):
        rel=p.relative_to(ROOT)
        if p.is_file() and not any(x in rel.parts for x in ('node_modules','__pycache__','.git')) and p.name not in ('project.private.config.json','.env') and not p.name.endswith(('.log','.pyc')):
            yield p,rel.as_posix()


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('zip',type=Path)
    cli.add_argument('--acceptance',type=Path)
    args=cli.parse_args()
    args.zip.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(args.zip,'w',ZIP_DEFLATED,compresslevel=6) as archive:
        for p,rel in files():archive.write(p,rel)
        for f in EMPTY:archive.writestr(f+'/',b'')
        if args.acceptance:
            for f in sorted(args.acceptance.rglob('*')):
                if f.is_file():archive.write(f,'acceptance/'+f.relative_to(args.acceptance).as_posix())
    print(args.zip)


if __name__=='__main__':main()

