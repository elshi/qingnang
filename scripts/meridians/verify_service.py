"""Audit the deployed HTTPS catalog, database IDs and every content-addressed image."""
import argparse
import concurrent.futures
import hashlib
import json
import re
import ssl
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('base');cli.add_argument('--ca');cli.add_argument('--report',type=Path,required=True)
    args=cli.parse_args();base=args.base.rstrip('/')
    assert base.startswith('https://')
    context=ssl.create_default_context(cafile=args.ca)
    images=set()
    def api(path):
        for attempt in range(5):
            try:
                with urlopen(base+'/api/'+path,context=context,timeout=30) as res: body=json.load(res)
                break
            except HTTPError as error:
                if error.code != 429 or attempt == 4: raise
                time.sleep(min(65, max(1,int(error.headers.get('Retry-After','60')))))
        assert body['code']==0,path
        return body['data']
    def graphic(plate):
        assert plate['full_url']!=plate['preview_url']
        for k in ['full_url','preview_url']:
            url=plate[k];assert url.startswith('https://');images.add(url)
    atlas=api('meridian-atlas')
    groups=atlas['groups']
    assert [len(g['items']) for g in groups]==[12,8]
    seen={};channels=[];db_ids=set()
    for group in groups:
        graphic(group['image'])
        for c in group['items']:
            assert c['id'] not in db_ids
            db_ids.add(c['id']);entry=api('meridians/'+str(c['id']))
            assert entry['id']==c['id'] and entry['title']==c['title'] and entry['atlas_key']==c['key']
            assert entry['route'] and all(s['source'] and s['text'] for s in entry['sections'])
            assert any('歌' in s['title'] for s in entry['sections'])
            ids={p['code']:p['id'] for p in entry['related_points']}
            checked=[]
            for plate in entry['plates']:
                graphic(plate);checked+=plate['codes']
                assert plate['point_ids']==[ids[k] for k in plate['codes']]
            assert sorted(checked)==sorted(ids)
            for k,id in ids.items():
                assert seen.setdefault(k,id)==id
            if c['key']=='du':assert 'GV24+' in ids and len(ids)==29
            if c['key']=='dai':assert list(ids)==['GB26','GB27','GB28'] and entry['point_label']=='交会穴'
            if c['key']=='lung':assert len(ids)==11
            if c['key']=='bladder':assert len(ids)==67
            channels.append({'id':c['id'],'name':entry['title'],'points':len(ids),'plates':len(entry['plates'])})
    all_points=[]
    for n in range(1,6):all_points.extend(api('acupoints?'+urlencode({'page_size':100,'page':n}))['items'])
    assert len(all_points)==len({p['id'] for p in all_points})==416
    historic=[]
    for p in all_points:
        item=api('acupoints/'+str(p['id']))
        assert item['id']==p['id'] and item['review']['section']
        plate=item['atlas_plate'];graphic(plate)
        if p['code'] in seen:
            assert seen[p['code']]==item['id'] and p['code'] in plate['codes']
        else:assert item['name']+'定位参照图'==plate['title'] and p['code']==plate['code']
        if '历史条目' in item['review']['section']:historic.append(item['name'])
    for keyword in ['印堂','EX-HN3','GV24+']:
        r=api('acupoints?'+urlencode({'keyword':keyword}))
        assert any(p['id']==seen['GV24+'] for p in r['items']),keyword
    def check(url):
        with urlopen(url,context=context,timeout=20) as res:
            data=res.read();assert res.status==200 and res.headers.get_content_type()=='image/jpeg'
            assert data.startswith(b'\xff\xd8') and data.endswith(b'\xff\xd9')
            assert re.search(r'-'+hashlib.sha256(data).hexdigest()[:12]+r'\.jpg$',url)
            return len(data)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:size=sum(pool.map(check,images))
    result={'origin':base,'groups':[12,8],'channels':channels,'points':len(all_points),'channelPoints':len(seen),
            'historic':historic,'verifiedHttpsJpegs':len(images),'bytes':size}
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(len(channels),len(all_points),len(images),size)


if __name__=='__main__':main()

