# 经络首页

经络页分为“十二正经”和“奇经八脉”。顶部墨绿分类按钮显示各组经脉数量，下方为“循经识络”标题和静态正面人体图。两侧标注采用“手太阴／肺经”两级排版，保留编码与经脉色标；点击直接进入对应经络详情，返回保留当前分类。穴位表和循行正文在详情页展示，首页不重复罗列。

经脉目录和顺序由现有图谱接口及兼容目录提供，入口沿用真实数据库 ID。其余六脉在详情中以“交会穴”标示，左右同名穴位只列一次。图上的线路用于教学总览，不能代替临床穴位定位。

资料来源：[WHO *A Proposed Standard International Acupuncture Nomenclature*](https://apps.who.int/iris/bitstream/handle/10665/40001/9241544171_eng.pdf)；[甘肃中医药大学附属医院《奇经八脉》](https://www.zyxyfy.com/zywh/zyzs/qjbm/content_2968)。

首页图片为 `miniprogram/assets/meridians/regular-transparent.png` 和 `extraordinary-transparent.png`，带真实 Alpha 透明通道，不使用底色混合模拟透明。图片从现有 Acu361 模型和循行数据渲染，随小程序加载；详情原图继续使用原有远程资源。生成命令：`python scripts/meridians/render_home.py --source /path/to/acu361`。授权和署名见同目录 `NOTICE.txt`。

图谱区保留独立的文字点击区域，不遮挡中央人像。短屏设备允许页面滚动，为底部导航预留空间，不缩小文字或裁掉脚部。

验证：`node --test tests/miniprogram/meridians.test.cjs`。小程序模拟器检查两个 Tab、透明图片、图上标注和详情返回；媒体文件总量不得超过 200 KB。
