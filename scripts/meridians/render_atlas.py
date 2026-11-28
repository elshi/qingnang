"""Render versioned overview, channel and close-up plates from one coordinate frame.

Usage: python render_atlas.py --source DIR --font /path/to/CJK-font
DIR contains the hash-verified Acu361 1.0.1 skin.glb, points.json, meridians.json and manifest.json.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from anatomy import Surface, axes, raster, read

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/images/meridians'
PAPER=(249,245,235)
INK='#344049'
RUST='#a7422d'
CREDIT='Acu361 1.0.1 · Zhang, Reese, He & Zhu｜Z-Anatomy / BodyParts3D｜改绘 CC BY-SA 4.0'
# Boundaries refer to order in the sourced list, not to database IDs.
REGIONS={
 'LU':[(5,'胸肩与上臂'),(11,'前臂与手')],
 'LI':[(5,'手背'),(11,'前臂与肘'),(16,'上臂与肩'),(20,'颈面')],
 'ST':[(8,'头面'),(18,'颈胸'),(30,'腹部'),(34,'大腿'),(40,'小腿'),(45,'足背')],
 'SP':[(5,'足内侧'),(10,'小腿与膝'),(16,'腹股沟与腹部'),(21,'胸胁')],
 'HT':[(3,'腋与上臂'),(9,'前臂与手')],
 'SI':[(5,'手与腕'),(8,'前臂与肘'),(15,'肩背'),(19,'颈与头面')],
 'BL':[(10,'头项'),(17,'上背'),(24,'胸腰背'),(30,'腰骶'),(35,'骶部'),(40,'大腿后侧与膝'),(47,'背部外侧线'),(54,'腰臀外侧线'),(60,'小腿后侧与踝'),(67,'足外侧')],
 'KI':[(6,'足底与踝'),(10,'小腿内侧'),(16,'下腹'),(21,'上腹'),(27,'前胸')],
 'PC':[(3,'胸与上臂'),(9,'前臂与手掌')],
 'TE':[(5,'手背与腕'),(10,'前臂与肘'),(15,'臂肩'),(23,'颈耳与眉')],
 'GB':[(7,'额颞'),(12,'耳后'),(20,'头侧与枕项'),(25,'肩胸与胁'),(30,'腰胯'),(34,'大腿与膝'),(40,'小腿外侧'),(44,'足背')],
 'LR':[(4,'足背与踝'),(9,'下肢内侧'),(14,'腹股沟与胁腹')],
 'GV':[(4,'骶腰'),(9,'腰胸椎'),(14,'胸椎与颈背'),(19,'项枕'),(24,'头顶与前额'),(29,'眉间与鼻唇')],
 'CV':[(4,'会阴与少腹'),(9,'下腹'),(15,'上腹'),(21,'前胸'),(24,'颈与下颌')],
 'yin-wei':[(1,'小腿内侧'),(5,'腹胁'),(7,'前颈')],
 'yang-wei':[(2,'足与小腿'),(5,'肩背'),(12,'头侧'),(16,'枕项')],
 'yin-qiao':[(2,'内踝与小腿'),(3,'目内眦')],
 'yang-qiao':[(3,'外踝与小腿'),(5,'髋肩'),(8,'肩背'),(13,'头面')],
 'chong':[(3,'会阴与少腹'),(9,'下腹'),(14,'上腹')],
 'dai':[(3,'腰胁与下腹')]
}
VIEWS=[(0,0,'正面'),(180,0,'背面'),(90,0,'外侧'),(-90,0,'内侧'),(45,0,'前外侧'),(-45,0,'前内侧'),
       (135,0,'后外侧'),(-135,0,'后内侧'),(0,65,'俯视'),(0,-65,'仰视'),(90,38,'上外侧'),(90,-38,'下外侧')]


class Renderer:
    def __init__(self,surface,font):
        self.s=surface;self.font=font;self.prefix=''
    def text(self,d,xy,t,size,ink=INK,anchor='la'):
        d.text(xy,t,font=ImageFont.truetype(self.font,size),fill=ink,anchor=anchor)

    def frame(self,view,focus,W,H,overview=False,isolate=False,transparent=False):
        mat=axes(*view[:2])
        pos=self.s.xyz@mat
        f=np.array(focus)
        if overview:
            mid=np.array([0.,-855.]);scale=min(H/1790,W/695)
            faces=self.s.faces
        else:
            projected=f@mat
            lo,hi=projected[:,:2].min(axis=0),projected[:,:2].max(axis=0)
            mid=(lo+hi)/2
            extent=hi-lo
            margin=max(45,min(80,max(extent)*.26))
            scale=min(W/(extent[0]+margin*2),H/(extent[1]+margin*2))
            # A regional cutaway excludes distant limbs that would hide an inner view.
            bounds=f.min(axis=0)-margin*1.7,f.max(axis=0)+margin*1.7
            mask=np.all((self.s.centers>=bounds[0])&(self.s.centers<=bounds[1]),axis=1)
            faces=self.s.faces[mask]
            if isolate:
                # In a forearm cutaway the torso can occupy the same projected pixels.
                # Restrict this crop to the connected skin containing the labelled arm.
                allowed=set(self.s.weld[faces.ravel()])
                seen=set()
                queue=[self.s.nearest(q) for q in f]
                while queue:
                    v=queue.pop()
                    if v in seen or v not in allowed:continue
                    seen.add(v)
                    queue.extend(self.s.graph[v])
                keep=np.isin(self.s.weld[faces[:,0]],list(seen))
                faces=faces[keep]
        def project(x):
            a=np.array(x)@mat
            a[...,:2]=(a[...,:2]-mid)*scale+[W/2,H/2]
            return a
        pos[:,:2]=(pos[:,:2]-mid)*scale+[W/2,H/2]
        norm=self.s.norm@mat
        shade=np.clip(.33+norm[:,2]*.42-norm[:,0]*.23-norm[:,1]*.34,0,1)
        z,l=raster(pos,shade,faces,W,H)
        rgb=np.empty((H,W,3),dtype='uint8')
        for k,(dark,bright) in enumerate([(97,250),(111,243),(112,223)]):
            rgb[:,:,k]=np.where(z<-99999,PAPER[k],dark+(bright-dark)*l)
        image=Image.fromarray(rgb)
        if transparent:
            image.putalpha(Image.fromarray(np.where(z>-99999,255,0).astype('uint8')))
        return image,z,project

    @staticmethod
    def visible(z,p,tol=8):
        x,y,d=p
        return 0<=x<z.shape[1] and 0<=y<z.shape[0] and d>=z[int(y),int(x)]-tol

    def lines(self,img,z,project,paths,color,width):
        d=ImageDraw.Draw(img)
        for line in paths:
            run=[]
            for q in project(line):
                if self.visible(z,q):
                    run.append((float(q[0]),float(q[1])))
                else:
                    if len(run)>1:d.line(run,fill=color,width=width,joint='curve')
                    run=[]
            if len(run)>1:d.line(run,fill=color,width=width,joint='curve')

    def asset(self,image,slug,title,codes):
        # Content-addressed pairs stay cacheable across deployments and rollbacks.
        record={'title':title,'codes':codes}
        import io
        for key,width,quality in [('full',image.width,92),('preview',min(846,image.width),85)]:
            im=image if width==image.width else image.resize((width,round(image.height*width/image.width)),Image.LANCZOS)
            out=io.BytesIO();im.save(out,'JPEG',quality=quality,optimize=True,subsampling=0)
            data=out.getvalue()
            name=f'{slug}-{key}-{hashlib.sha256(data).hexdigest()[:12]}.jpg'
            (OUT/name).write_bytes(data);record[key]=name
        record.update(width=image.width,height=image.height)
        return record

    def fullbody(self,tracks,views,home=False,transparent=False):
        W,H=(1024,1740) if home else (640,1410)
        allim=Image.new('RGBA' if transparent else 'RGB',(W*len(views),H+(0 if home else 62)),(0,0,0,0) if transparent else PAPER)
        for n,view in enumerate(views):
            img,z,project=self.frame(view,[],W,H,True,transparent=transparent)
            if home:
                # The overview follows the clothed figure in the design. Plot routes last.
                def xy(x,y): return tuple(project([float(x),float(y),0.])[:2])
                mask=Image.new('L',(W,H))
                draw=ImageDraw.Draw(mask)
                outline=[(-160,945),(-173,890),(-175,770),(-42,760),(0,785),(42,760),(175,770),(173,890),(160,945)]
                draw.polygon([xy(x,y) for x,y in outline],fill=255)
                cloth=Image.new('RGB',(W,H),'#ded4bd')
                sew=ImageDraw.Draw(cloth)
                for h in [941,932]:
                    sew.line([xy(-165,h),xy(0,h-5),xy(165,h)],fill='#a3977d',width=2)
                for sign in [-1,1]:
                    sew.line([xy(160*sign,920),xy(125*sign,876),xy(102*sign,858)],fill='#c0b49a',width=2)
                    sew.line([xy(173*sign,777),xy(47*sign,768)],fill='#aa9c80',width=2)
                img.paste(cloth,(0,0),Image.fromarray(np.where(z>-99999,np.asarray(mask),0).astype('uint8')))
            for paths,color,symmetric in tracks:
                self.lines(img,z,project,paths,color,4 if home else 5)
                if symmetric:
                    self.lines(img,z,project,[p*np.array([-1,1,1]) for p in paths],color,4 if home else 5)
            allim.paste(img,(W*n,0))
            if not home:self.text(ImageDraw.Draw(allim),(W*n+W/2,H+20),view[2],32,anchor='ma')
        return allim

    def regional(self,channel,region,codes,paths,name_of):
        W,H=1160,1080
        todo=list(codes);images=[]
        while todo:
            focus=[self.s.p[k] for k in todo]
            candidates=[]
            for order,view in enumerate(VIEWS):
                _,z,project=self.frame(view,focus,232,216)
                projected=project(focus)
                visible=[i for i,p in enumerate(projected) if self.visible(z,p,4)]
                normal=sum(float(np.dot(self.s.norm[self.s.nearest(focus[i])],axes(*view[:2])[:,2])) for i in visible)
                # Prefer a face-on surface and separation between neighbouring dots.
                separation=sum(min(12,min((np.linalg.norm(projected[i,:2]-projected[j,:2]) for j in visible if j!=i),default=12)) for i in visible)
                candidates.append((len(visible),normal+.05*separation,-order,visible))
            _,_,neg,indices=max(candidates)
            if not indices: raise ValueError(('no unobstructed view',todo))
            view=VIEWS[-neg];shown=[todo[i] for i in indices]
            img,z,project=self.frame(view,focus,W,H,isolate=(channel['code']=='LU' and region=='前臂与手'))
            self.lines(img,z,project,paths,RUST,7)
            sheet=Image.new('RGB',(1880,H+92),PAPER);sheet.paste(img,(360,84))
            draw=ImageDraw.Draw(sheet)
            self.text(draw,(55,19),region+' · '+view[2],42)
            draw.line((55,74,1825,74),fill='#cdbea5',width=2)
            points=project([self.s.p[k] for k in shown])
            coords=sorted([(float(q[0])+360,float(q[1])+84,k) for q,k in zip(points,shown)])
            # Alternate banks for crowded vertical lines; order labels vertically within each bank.
            split=(len(coords)+1)//2
            for side,bank in enumerate([coords[:split],coords[split:]]):
                bank=sorted(bank,key=lambda a:a[1])
                targets=[]
                for _,y,_ in bank:targets.append(max(130,min(H+40,y),targets[-1]+92 if targets else 0))
                for j in range(len(targets)-1,-1,-1):targets[j]=min(targets[j],H+40 if j==len(targets)-1 else targets[j+1]-92)
                for (x,y,k),ty in zip(bank,targets):
                    bx=(320 if not side else 1560)
                    draw.line([(x,y),(bx+(26 if not side else -26),ty),(bx,ty)],fill='#826c50',width=3)
                    self.text(draw,(bx+(-14 if not side else 14),ty-6),name_of[k],53,anchor='rm' if not side else 'lm')
                    self.text(draw,(bx+(-14 if not side else 14),ty+41),k,29,'#755333','rm' if not side else 'lm')
            for x,y,k in coords:
                draw.ellipse((x-10,y-10,x+10,y+10),fill=RUST,outline='#fff7da',width=3)
            images.append((sheet,region+' · '+view[2],shown))
            todo=[k for k in todo if k not in shown]
        return images


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--font',default='C:/Windows/Fonts/msyh.ttc')
    p.add_argument('--only',nargs='+',help='Rebuild selected channel slugs or group keys')
    a=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    s=Surface(a.source);r=Renderer(s,a.font)
    ch=read(ROOT/'database/atlas/channels.json')
    names={p['code']:p['name'] for p in read(ROOT/'database/acupoints-standard-2021.json')['meridian_points']}
    manifest=ROOT/'database/atlas/graphics.json'
    g=read(manifest) if a.only else {'credit':CREDIT,'groups':{},'channels':{}}
    lines={c['key']:s.paths(c) for c in ch}
    for group,label in [('regular','十二正经'),('extraordinary','奇经八脉')]:
        if a.only and group not in a.only:continue
        tracks=[(lines[c['key']],c['color'],c['key'] not in ['ren','du','dai']) for c in ch if c['group']==group]
        g['groups'][group]=r.asset(r.fullbody(tracks,[VIEWS[0]],True),group,label,[])
    for c in ch:
        if a.only and c['key'] not in a.only:continue
        key=c['key'];codes=c['points'];paths=lines[key]
        cover=r.fullbody([(paths,RUST,key not in ['ren','du','dai'])],[VIEWS[0],VIEWS[2],VIEWS[1]])
        plates=[r.asset(cover,key+'-overview','体表循行全图',[])];start=0
        for end,region in REGIONS[c['code'] or key]:
            portion=codes[start:end];start=end
            for img,title,items in r.regional(c,region,portion,paths,names):
                plates.append(r.asset(img,key+'-'+str(len(plates)),title,items))
        assert sorted(x for pl in plates for x in pl['codes'])==sorted(codes),key
        g['channels'][key]=plates
        print(key,len(plates),flush=True)
    (ROOT/'database/atlas/graphics.json').write_text(json.dumps(g,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

if __name__=='__main__':main()

