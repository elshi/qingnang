from PIL import Image, ImageDraw, ImageFont
import os, numpy as np

ROOT = os.path.dirname(__file__)
SRC = os.path.join(ROOT, '01-shou-taiyin-fei.png')
OUT = ROOT
W, H = 1024, 1536
CREAM = (250, 246, 234)
BROWN = (67, 46, 31)
GRAY = (145, 145, 136)
SKIN = (232, 196, 145)

font_title = 'C:/Windows/Fonts/simkai.ttf'
font_label = 'C:/Windows/Fonts/simkai.ttf'

def font(path, size):
    return ImageFont.truetype(path, size)

def clean_source():
    im = Image.open(SRC).convert('RGB')
    # The source figure is retained as the common anatomical base; the right
    # half (title and callouts) is covered when each chart is composed.
    return im

BASE = clean_source()

def make_reference_paper():
    """Build a clean paper field from an untouched edge of the reference."""
    strip = BASE.crop((984, 0, W, H))
    paper = Image.new('RGB', (W, H), CREAM)
    tile_width = strip.width
    for x in range(0, W, tile_width):
        tile = strip if (x // tile_width) % 2 == 0 else strip.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        paper.paste(tile, (x, 0))
    return paper

PAPER = make_reference_paper()

charts = [
 ('02-shou-yangming-dachang.png','手阳明大肠经',[(330,1280),(392,1200),(430,1060),(445,880),(455,700),(430,560),(390,470),(350,420),(310,380)],['商阳','合谷','曲池','肩髃','迎香']),
 ('03-zu-yangming-wei.png','足阳明胃经',[(340,365),(355,430),(365,520),(385,625),(400,760),(410,900),(395,1040),(375,1180),(365,1320),(350,1400)],['承泣','天枢','足三里','丰隆','厉兑']),
 ('04-zu-taiyin-pi.png','足太阴脾经',[(335,1400),(360,1320),(385,1200),(395,1060),(400,900),(390,760),(370,620),(350,520),(330,450)],['隐白','三阴交','阴陵泉','血海','大包']),
 ('05-shou-shaoyin-xin.png','手少阴心经',[(335,500),(305,535),(300,620),(295,730),(290,850),(285,970),(275,1080),(255,1180)],['极泉','少海','通里','神门','少冲']),
 ('06-shou-taiyang-xiaochang.png','手太阳小肠经',[(260,1190),(280,1100),(305,980),(320,850),(335,720),(350,600),(360,500),(385,420),(420,380)],['少泽','后溪','小海','肩贞','听宫']),
 ('07-zu-taiyang-pangguang.png','足太阳膀胱经',[(365,300),(375,380),(385,480),(395,600),(405,730),(410,860),(405,1000),(395,1140),(385,1280),(380,1410)],['睛明','大杼','肺俞','肾俞','至阴']),
 ('08-zu-shaoyin-shen.png','足少阴肾经',[(355,1400),(370,1320),(385,1210),(395,1080),(405,950),(400,820),(390,700),(380,600),(365,520),(350,450)],['涌泉','太溪','复溜','俞府','神藏']),
 ('09-zu-shaoyang-dan.png','足少阳胆经',[(270,380),(285,460),(300,560),(315,680),(330,820),(320,970),(305,1110),(290,1240),(300,1370)],['瞳子髎','风池','环跳','阳陵泉','足临泣']),
 ('10-zu-jueyin-gan.png','足厥阴肝经',[(340,1400),(350,1320),(360,1210),(370,1100),(380,990),(390,860),(385,730),(370,620),(350,520)],['大敦','太冲','蠡沟','曲泉','期门']),
 ('11-shou-shaoyang-sanjiao.png','手少阳三焦经',[(300,1240),(320,1140),(340,1020),(355,900),(370,780),(380,660),(390,550),(410,460),(435,400)],['关冲','中渚','支沟','肩髎','丝竹空']),
 ('12-shou-jueyin-xinbao.png','手厥阴心包经',[(340,500),(345,600),(350,720),(355,850),(360,980),(365,1100),(370,1210),(380,1280)],['天池','曲泽','间使','内关','中冲']),
]

def draw_chart(filename, title, path, labels):
    src = BASE.copy()
    # Keep the reference figure on the left and continue its paper texture
    # across the title/callout panel on the right.
    canvas = PAPER.copy()
    canvas.paste(src.crop((0,0,560,H)), (0,0))
    d = ImageDraw.Draw(canvas)
    d.text((590,95), title, font=font(font_title, 48), fill=(38,35,29))
    d.text((590,165), '经络穴位示意图', font=font(font_label, 24), fill=(120,106,86))

    # Meridian route and acupoints.
    d.line(path, fill=BROWN, width=6, joint='curve')
    for i,(x,y) in enumerate(path):
        r = 8 if i % 2 else 13
        d.ellipse((x-r,y-r,x+r,y+r), fill=BROWN, outline=(235,220,192), width=2)
    # Select five representative points spaced through the route.
    idxs = np.linspace(0, len(path)-1, len(labels)).round().astype(int)
    yslots = [390, 590, 790, 990, 1190]
    for label, idx, yy in zip(labels, idxs, yslots):
        x,y = path[idx]
        d.line((x+16,y,605,yy), fill=GRAY, width=2)
        d.ellipse((x-12,y-12,x+12,y+12), fill=BROWN, outline=(245,235,213), width=2)
        d.text((625,yy-22), label, font=font(font_label, 34), fill=(43,39,32))
    d.text((590,1375), '十二正经 · 传统针灸定位参考', font=font(font_label, 20), fill=(145,126,101))
    canvas.save(os.path.join(OUT, filename), quality=95)

for args in charts:
    draw_chart(*args)
print('generated', len(charts), 'charts')
