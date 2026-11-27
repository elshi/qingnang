"""Compile sourced text and chart membership from the project library and GB/T index."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'database/atlas'
BOOKS = ROOT / 'txt/classic-books/chapters'
CONFIG = Path(__file__).with_name('channels.json')


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def extract_passage(text):
    # Parenthetical annotations belong to the commentary rather than the base text.
    clean = re.sub(r'（[^（）]*）', '', text).split('\n')[0]
    sentences = re.findall(r'[^。]+。', clean)
    return ''.join(sentences[:3]) or clean


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--standard-text-dir', type=Path, required=True)
    args = parser.parse_args()
    standards = read(ROOT / 'database/acupoints-standard-2021.json')
    channels = read(CONFIG)
    classics = {key: read(BOOKS / (key + '.json'))['chapters']
                for key in ['lingshu', 'zhenjiudacheng', 'qijingbamaikao']}
    primary = next(c['content'] for c in classics['lingshu'] if c['title'] == '经脉第十')
    routes = [line.split('是动')[0] for line in primary.splitlines() if '之脉，起' in line[:22]][:12]
    assert len(routes) == 12
    national = standards['meridian_points']
    name_to_code = {p['name']: p['code'] for p in national}
    compiled = []
    for i, cfg in enumerate(channels):
        title, code = cfg['title'], cfg['code']
        sections = []
        if i < 12:
            idx = ['LU','LI','ST','SP','HT','SI','BL','KI','PC','TE','GB','LR'].index(code)
            sections.append(dict(title='循行原文', source='《灵枢·经脉第十》', text=routes[idx]))
        else:
            chapter = next(c for c in classics['qijingbamaikao'] if c['title'] == title)
            route = re.sub(r'（[^（）]*）', '', chapter['content'].splitlines()[0])
            sections.append(dict(title='循行原文', source='《奇经八脉考·'+title+'》', text=route))
        song_title = title.replace('心包经','心包络经') + ('经穴歌' if title in ['任脉','督脉'] else '穴歌')
        song = next((c for c in classics['zhenjiudacheng'] if c['title'].startswith(song_title)), None)
        if song:
            sections.append(dict(title='经穴歌', source='《针灸大成·'+song['title']+'》', text=song['content'].split('\n')[0]))
        elif i >= 12:
            verse = next(c for c in classics['zhenjiudacheng'] if c['title'].startswith('奇经八脉歌'))
            key = {'阴跷脉':'阴蹻','阳跷脉':'阳蹻'}.get(title,title)
            line = next(s for s in verse['content'].split('。') if key in s)
            sections.append(dict(title='经脉歌',source='《针灸大成·'+verse['title']+'》',text=line+'。'))
            disease_title = {'阴维脉':'二维为病','阳维脉':'二维为病','阳跷脉':'二跷为病','阴跷脉':'二跷为病'}.get(title,title+'为病')
            chapter = next((c for c in classics['qijingbamaikao'] if c['title']==disease_title),None)
            if chapter:
                sections.append(dict(title='古籍记载',source='《奇经八脉考·'+disease_title+'》',text=extract_passage(chapter['content'])))
        codes = ([p['code'] for p in national if p['channel']==title] if code
                 else [name_to_code[name] for name in cfg['meetings']])
        assert codes and len(codes)==len(set(codes)),title
        compiled.append(dict({k:v for k,v in cfg.items() if k!='meetings'}, sections=sections, points=codes,kind='owned' if code else 'meeting'))
    save(OUT/'channels.json',compiled)
    points=[]
    for source, records in zip(standards['sources'],[national,standards['extra_points']]):
        num=source['name'].split(' ')[1].split('—')[0]
        text_file=args.standard_text_dir/f'qingnang-location-standard-{num}.txt'
        pdf_file=text_file.with_suffix('.pdf')
        assert hashlib.sha256(pdf_file.read_bytes()).hexdigest()==source['source_sha256']
        text=text_file.read_text(encoding='utf-8-sig')
        for p in records:
            # Record independently searchable facts, not the full standard's prose.
            m=re.search(r'^'+re.escape(p['section'])+r'[ \t]+[^\n]*\n\s*(在[^。]+)。',text,re.M)
            if not m:
                raise ValueError(p['section'])
            facts=re.split('[,，]',re.sub(r'\s+','',m[1][1:]),maxsplit=1)
            region=facts[0]
            landmarks=facts[1] if len(facts)>1 else ''
            landmarks=re.sub(r'\(见图\d+\)$','',landmarks).replace('连7线','连线')
            points.append(dict(name=p['name'],codes=p.get('codes',[p.get('code')]),pinyin=p['pinyin'],
                               section=p['section'],reference=source['name'],url=source['url'],area=region,landmarks=landmarks,
                               channel=p.get('channel',''),location_summary=p.get('locate','')))
    save(OUT/'point-references.json',points)


if __name__=='__main__':
    main()

