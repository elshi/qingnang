"""Surface geometry for Qingnang plates. Acu361/Z-Anatomy sources in the atlas NOTICE."""
import hashlib
import heapq
import json
import struct
from pathlib import Path

import numpy as np
from numba import njit


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def load_skin(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20+size])
    buffer = raw[28+size:]
    def accessor(index):
        a=gltf['accessors'][index]
        view=gltf['bufferViews'][a['bufferView']]
        dt={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]
        width={'VEC3':3,'SCALAR':1}[a['type']]
        return np.frombuffer(buffer,dtype=dt,count=a['count']*width,offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
    prim=gltf['meshes'][0]['primitives'][0]
    return accessor(prim['attributes']['POSITION']),accessor(prim['attributes']['NORMAL']),accessor(prim['indices']).reshape(-1,3)


@njit(cache=True)
def raster(xyz, shade, faces, width, height):
    depth=np.full((height,width),-1.e6,np.float32)
    light=np.zeros((height,width),np.float32)
    for tri in faces:
        a,b,c=tri
        x0,y0,z0=xyz[a];x1,y1,z1=xyz[b];x2,y2,z2=xyz[c]
        det=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
        if abs(det)<0.00001: continue
        for y in range(max(0,int(np.ceil(min(y0,y1,y2)))),min(height,int(max(y0,y1,y2))+1)):
            for x in range(max(0,int(np.ceil(min(x0,x1,x2)))),min(width,int(max(x0,x1,x2))+1)):
                u=((y1-y2)*(x-x2)+(x2-x1)*(y-y2))/det
                v=((y2-y0)*(x-x2)+(x0-x2)*(y-y2))/det
                w=1-u-v
                if min(u,v,w)<0: continue
                z=u*z0+v*z1+w*z2
                if z>depth[y,x]:
                    depth[y,x]=z
                    light[y,x]=u*shade[a]+v*shade[b]+w*shade[c]
    return depth,light


class Surface:
    def __init__(self, folder):
        manifest=read(folder/'manifest.json')
        for f in manifest['files']:
            key=Path(f['path']).name
            if key in ['points.json','meridians.json','skin.glb']:
                assert hashlib.sha256((folder/key).read_bytes()).hexdigest()==f['sha256'],key
        self.xyz,self.norm,self.faces=load_skin(folder/'skin.glb')
        self.centers=self.xyz[self.faces].mean(axis=1)
        codes=read(folder/'points.json')['points']
        self.p={r['code']:np.array(r['pos']) for r in codes if r['side']!='R'}
        # National addition: the cutaneous midpoint between medial brow ends.
        brow=self.p['BL2']
        y=brow[1]
        candidates=self.xyz[(abs(self.xyz[:,0])<9)&(abs(self.xyz[:,1]-y)<6)]
        self.p['GV24+']=np.array([0.,y,candidates[:,2].max()])
        self.lines={}
        for code,record in read(folder/'meridians.json')['meridians'].items():
            self.lines[code]=[np.array(line['points']) for side,paths in record['lines'].items() if side!='R' for line in paths]
        self.graph=[{} for _ in self.xyz]
        edges=np.unique(np.sort(np.concatenate([self.faces[:,[0,1]],self.faces[:,[1,2]],self.faces[:,[2,0]]]),axis=1),axis=0)
        # The source mesh has seam duplicates. Weld them before computing surface paths.
        _,inverse=np.unique(np.round(self.xyz,2),axis=0,return_inverse=True)
        representatives={}
        self.weld=np.array([representatives.setdefault(int(v),i) for i,v in enumerate(inverse)])
        for a,b in edges:
            a,b=self.weld[a],self.weld[b]
            if a!=b:
                dist=float(np.linalg.norm(self.xyz[a]-self.xyz[b]))
                self.graph[a][b]=self.graph[b][a]=dist

    def nearest(self,p):
        return int(self.weld[np.square(self.xyz-p).sum(axis=1).argmin()])

    def follow(self,waypoints):
        """Join consecutive verified external landmarks along the skin mesh."""
        path=[]
        for p,q in zip(waypoints,waypoints[1:]):
            start,end=self.nearest(p),self.nearest(q)
            heap=[(0.,start)];dist={start:0.};prev={}
            while heap:
                cost,a=heapq.heappop(heap)
                if a==end: break
                if cost!=dist[a]: continue
                for b,length in self.graph[a].items():
                    cand=cost+length
                    if cand<dist.get(b,float('inf')):
                        dist[b]=cand;prev[b]=a;heapq.heappush(heap,(cand,b))
            if end not in dist: raise ValueError('Disconnected skin mesh')
            nodes=[end]
            while nodes[-1]!=start:nodes.append(prev[nodes[-1]])
            path.extend(self.xyz[nodes[::-1]])
        return np.array(path)

    def paths(self,channel):
        code=channel['code']
        if code:return self.lines[code]
        p=self.p
        if channel['key']=='dai':
            left=[p[c] for c in ['GB26','GB27','GB28']]
            opposite=lambda v:v*np.array([-1,1,1])
            ring=self.follow(left+[np.array([0,left[-1][1],125])]+[opposite(x) for x in left[::-1]]+[np.array([0,left[0][1],-145]),left[0]])
            origin=self.follow([p['LR13'],left[0]])
            return [ring,origin,origin*np.array([-1,1,1])]
        codes=channel['points']
        if channel['key']=='chong':
            upper=['CV1','ST30']+codes[codes.index('KI11'):]+['KI25','CV22','CV23','CV24']
            lower=['ST30','SP11','KI10','KI7','KI3','KI1']
            return [self.follow([p[c] for c in track]) for track in (upper,lower,['CV1','CV7'])]
        if channel['key']=='yin-qiao':
            codes=['KI6','KI8','KI10','KI11','ST12','ST9','ST5','BL1']
        if channel['key']=='yang-wei':
            codes=['BL63','GB35','GB29','GB26']+codes[2:]
        return [self.follow([p[c] for c in codes])]


def axes(az,el=0):
    a,e=np.deg2rad([az,el])
    right=np.array([np.cos(a),0,-np.sin(a)])
    toward=np.array([np.sin(a)*np.cos(e),np.sin(e),np.cos(a)*np.cos(e)])
    return np.array([right,-np.cross(toward,right),toward]).T

