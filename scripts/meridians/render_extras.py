"""Draw relational landmark diagrams for the separately indexed extra points."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'public/images/meridians'
DATA = ROOT/'database/atlas'


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--font', default='C:/Windows/Fonts/msyh.ttc')
    font = cli.parse_args().font
    landmarks = json.loads(Path(__file__).with_name('extra-landmarks.json').read_text(encoding='utf8'))
    refs = json.loads((DATA/'point-references.json').read_text(encoding='utf8'))
    refs = {name: r for r in refs if not r['channel'] for name in (['金津','玉液'] if r['name']=='金津玉液' else [r['name']])}
    catalog = {}
    for name, relation in landmarks.items():
        historic = {'腰奇':'EX-B9', '下极俞':'EX-B5'}
        ref = refs.get(name, {})
        codes = ref.get('codes', [historic.get(name)])
        code = ('EX-HN12' if name=='金津' else 'EX-HN13') if len(codes)>1 else next(iter(codes), '')
        img = Image.new('RGB', (1400,760),'#f9f5eb')
        d = ImageDraw.Draw(img)
        def text(x,y,s,size=38,color='#344049',anchor='mm'):
            d.text((x,y),s,font=ImageFont.truetype(font,size),fill=color,anchor=anchor)
        def dot(x,y,red=True):
            d.ellipse((x-14,y-14,x+14,y+14), fill='#a34231' if red else '#89775e',outline='#fff7e1',width=3)
        def line(a,b):
            d.line([a,b],fill='#a89373',width=4)
        text(72,65,name,64,anchor='lm')
        text(1328,65,(code+'   ' if code else '')+(ref.get('area') or '腰骶部'),34,anchor='rm')
        line((70,125),(1330,125))
        kind,anchor,*detail = relation
        if kind in ('中点','分界'):
            x=700 if kind=='中点' else 475
            line((250,345),(1150,345));dot(250,345,False);dot(1150,345,False);dot(x,345)
            text(250,415,anchor);text(1150,415,detail[0]);text(x,268,name,44,'#9e3c29')
            caption = detail[1] if len(detail)>1 else '两处体表标志连线的中点'
        elif kind in ('两侧','四方'):
            points=[(460,350),(940,350)]
            if kind=='四方':points.extend([(700,225),(700,475)])
            for q in points:line((700,350),q);dot(*q)
            dot(700,350,False);text(700,407,anchor,32)
            text(460,303,name,36,'#9e3c29');caption=detail[0]
        elif kind=='重合':
            d.ellipse((603,248,797,442),outline='#cbbd9f',width=3)
            line((545,345),(855,345));line((700,190),(700,500));dot(700,345)
            text(977,344,name,45,'#9e3c29');text(700,544,anchor,37)
            caption=detail[0]
        else:
            a,b=((700,460),(700,245)) if kind=='上方' else ((700,245),(700,460)) if kind=='下方' else ((460,345),(940,345))
            if kind=='左侧':a,b=b,a
            line(a,b);dot(*a,False);dot(*b)
            text(a[0],a[1]+60,anchor,36);text(b[0],b[1]-55,name,44,'#9e3c29')
            caption=detail[0]
        text(700,616,caption,40)
        source=ref.get('reference','原库《中国针灸学》' if name=='腰奇' else '原库定位条目，出处待核')+' '+ref.get('section','')
        text(72,706,'定位参照示意',26,'#7d6e57','lm');text(1328,706,source,26,'#7d6e57','rm')
        plate={'title':name+'定位参照图','width':1400,'height':760,'code':code,'source':source.strip()}
        for key,w in [('preview',760),('full',1400)]:
            buf=io.BytesIO();img.resize((w,round(w*760/1400)),Image.LANCZOS).save(buf,'JPEG',quality=92,optimize=True)
            data=buf.getvalue(); filename='extra-'+key+'-'+hashlib.sha256(data).hexdigest()[:12]+'.jpg'
            (OUT/filename).write_bytes(data);plate[key]=filename
        catalog[name]=plate
    assert len(catalog)==54
    (DATA/'extra-graphics.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


if __name__=='__main__':main()

