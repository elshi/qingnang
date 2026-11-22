# 青囊核心医籍数据包

本包收录计划中的 **50 部古代医籍、23,400 个正文单元、10,456,707 个字符**（包括标点、古注和明确标识的图版占位文字）。《素问》《灵枢》分列。正文采用简体文言文，未生成现代释义。

已完成来源快照、书目整理、全文提取、简繁转换、全量结构检查和隔离数据库导入验证。**没有向本地业务数据库写入数据。**

## 文件

| 文件或目录 | 用途 |
| --- | --- |
| `books.json` | 书目、明确别名、分类、正文文件位置和数据校验值 |
| `chapters/*.json` | 每书章节；含卷名、标题、正文、顺序及来源位置 |
| `raw/*.html.gz` | 所选源站页面的完整压缩快照；解压后为 UTF-8 HTML |
| `raw/*.json` | URL、采集时间、ETag、Last-Modified、SHA-256 |
| `original/*.json.gz` | 繁体提取结果及段落位置，含明确标识的古注和图版占位；逐字原页面以 raw 为准 |
| `sources.json` | 每书版本、原始作者字段、底本及其链接、授权依据 |
| `audit/*.json` | 全部源目录节点、未收图版、疑字缺文标记、被排除的现代校订说明 |
| `quality-report.json` | 各书字符数、容量、结构检查结果和来源限制 |
| `validation-report.json` | 全量转换复核及 583 个首、中、尾／逐卷自动抽查单元 |
| `review.json` | 助手逐书节选阅读、版本选择说明及对应数据校验值 |
| `corpus-import-test-report.json` | 整包在独立 MySQL 测试库中的实际导入和重复执行结果 |
| `cli-test-report.json` | 默认预检不写入、显式应用和重复执行的命令行验证 |
| `verification-summary.json` | 测试汇总与业务库未写入说明 |

`chapter_count` 指正文单元数，包含序跋、附录、古注；不等同于历史原书卷数。源站只有连续正文而没有细分标题时保留为一个单元，不擅自杜撰章名。所有源目录节点另存于 `audit`。

## 版本与使用范围

原文来自[中医笈成](https://jicheng.tw/tcm/)。该站[著作权声明](https://jicheng.tw/tcm/copyright.html)将公有领域文本的编排、标点、附注等编辑成果以 **CC0** 释出；自行撰写的说明等使用 **CC BY 4.0**，个别声明优先。本文保留来源署名、作者和底本信息；网页快照中的站点说明不被宣称为本项目原创或统一为 CC0。

版权依据是古代原著及古注的著作财产权保护期已届满，并结合来源对数字整理成果的声明。不是对所有现代版本的笼统授权。署名等权利仍应尊重，参见[《著作权法》](https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html)。本项目的书目简介独立撰写，未复制现代译文。

本包选定的是固定快照的**电子整理本**，源站可能参校多个刻本。`sources.json` 原样记录所据底本，不把电子整理本说成某一刻本的逐字影录。

- 《难经》使用元代滑寿《难经本义》古注本，分别标识“经文”和“滑寿注”。未采用混用 1991 年现代校注本的候选来源。
- 《湿热病篇》完整取自《温热经纬》卷四相应篇章，保留王士雄等古代按语；不使用底本未明的独立候选页面。
- 《医宗金鉴》合并 15 个分册，按 90 卷系统的分册顺序排列；各分册自身卷次原样保留。
- 《神农本草经》采用孙星衍、孙冯翼辑本；《傅青主女科》作者使用“题傅山”，保留归属问题。
- 《本草备要》《汤头歌诀》的来源列有近现代重印本，保留具体说明；原著、序言和古注的作者及年代另核，不用重印年份代替原著年代。
- 本包是文字数据。**825 处图版只保留来源和占位，未采集图片；51 个正文单元检测到疑字或缺文相关标记，逐项记录而不臆补。** 标记筛查也可能命中讨论文献缺损的古代按语，不等于 51 处都存在实际脱文。
- 已做全量结构／转换检查、逐书首中尾节选阅读和逐卷自动抽样，**未完成逐页影印底本校勘**。源站自身的“品质”标记如实保存，不等同于本项目准确率或校勘完成率。

## 安装与检查

在项目根目录运行；依赖位于独立工具目录，不改变 Laravel 或小程序的依赖。

```powershell
npm --prefix scripts/classic-books ci
node scripts/classic-books/validate.mjs
```

导入脚本需要已有的 `t_books` 和 `t_book_chapters`，不会建表、改表或删除数据。它从环境变量读取连接信息，不读取仓库中的私有凭据文件。

```powershell
$env:BOOKS_DB_HOST = '127.0.0.1'
$env:BOOKS_DB_PORT = '3306'
$env:BOOKS_DB_DATABASE = 'qingnang'
$env:BOOKS_DB_USER = '<本地数据库用户>'
$env:BOOKS_DB_PASSWORD = '<本地数据库密码>'

# 默认仅预检，不写业务数据
node scripts/classic-books/import.mjs

# 仅预检一本
node scripts/classic-books/import.mjs --book shanghanlun
```

默认只接受本机数据库地址。远程数据库须显式启用，并加载从该实例控制台下载的可信 CA 证书：

```powershell
$env:BOOKS_DB_HOST = '<远程数据库地址>'
$env:BOOKS_DB_PORT = '<远程端口>'
$env:BOOKS_DB_ALLOW_REMOTE = '1'
$env:BOOKS_DB_SSL_CA = '<该实例 CA 证书的绝对路径.pem>'
# 默认验证 CA 证书链；证书包含外网主机名时可同时验证主机名
$env:BOOKS_DB_SSL_VERIFY_IDENTITY = '1'
node scripts/classic-books/import.mjs
```

远程连接不会降级为明文或跳过 CA 验证。首次交付时本地业务库凭据返回 `ER_ACCESS_DENIED_ERROR`，未能核实真实表结构；导入脚本在实际连接后先检查结构、必填字段、字符集及长度。

**9 个正文单元超过 MySQL TEXT 的 65,535 字节容量，最大为 119,538 字节。** 若现有 `content` 是 TEXT，相关书籍预检将报错，不截断、不擅自拆章、不自动改表。隔离验证使用 UTF-8 MB4 和 MEDIUMTEXT；具体超长单元分布见 `verification-summary.json`。

如以后决定执行导入，可在上述环境变量配置完成后运行：

```powershell
node scripts/classic-books/import.mjs --apply
```

## 增量规则

1. 按规范书名及清单中的明确别名查找书籍。已有唯一记录：复用实际 ID，**不插入、不更新其任何字段**，包括简介、作者、朝代和拼音简码。
2. 没有匹配记录才新增书籍。多条同名或别名匹配时报告歧义，既不新增，也不随机关联。
3. 已有章节必须与新数据形成内容、卷名、标题和顺序一致的前缀，才能补入末尾缺章。已有释义保持原样，新章节的 `shiyi` 为 NULL，字段不允许 NULL 时用空串。
4. 当前公开 API 按章节 ID 排序。中间缺章、次序变化、正文差异或多余章节均报告冲突，不覆盖、不删除、不改 ID。
5. 每书独立事务，插入后验证文本和书籍关联；发现已有书籍字段被数据库触发器等改动也会回滚。每次应用取得本工具的数据库互斥锁，避免工具自身并发导入。
6. 不具备默认值的额外必填字段、非事务表、容量不足或字符集不兼容会明确报错。其他书籍的冲突／错误在报告中列出；已成功的书籍不重复写入，可修复后重试。
7. 数据校验值或审查记录不匹配时拒绝导入。报告写入 `reports/`，不输出密码。

数据中没有预设数据库 ID。新书字段为 `name、summary、dynasty、author、jp`；章节兼容 `title/name` 等现有接口字段，`item_order` 存在时同步填写，公开 API 不变。

## 复现采集与测试

```powershell
# 优先复用已保存且校验正确的来源快照
node scripts/classic-books/capture.mjs
node scripts/classic-books/collect.mjs
node scripts/classic-books/validate.mjs

# --refresh 才重新访问来源；新内容必须重新核查 review.json
node scripts/classic-books/capture.mjs --refresh

# 纯提取测试；未指定测试数据库时 MySQL 场景明确跳过
npm --prefix scripts/classic-books test

# 使用另行启动的隔离 MySQL 实例；不能指向本地业务实例
$env:BOOKS_TEST_PORT = '<隔离实例端口>'
$env:BOOKS_TEST_USER = '<测试用户>'
$env:BOOKS_TEST_PASSWORD = '<测试密码>'
npm --prefix scripts/classic-books test
node scripts/classic-books/test-corpus.mjs

# 现有 API 回归测试，使用 phpunit.xml 配置的内存 SQLite
php vendor/phpunit/phpunit/phpunit --filter BookApiTest
```

实际验证：14 项提取／MySQL 场景测试通过；现有书籍 API 6 项测试、36 个断言通过。完整数据集在独立 MySQL 8.4 测试实例中，预置 1 本书后新增 49 本书和 23,400 个正文单元；已有书籍全部字段不变。再次执行新增书籍与章节均为 0。测试表和测试实例均与业务库分离。

## 书目

下表由本包书目和正文文件统计生成，作者与朝代为作品说明，底本刊刻信息见 `sources.json`。

| 序号 | 书名 | 作者 | 朝代 | 正文单元 | 标识 |
| --- | --- | --- | --- | ---: | --- |
| 1 | 黄帝内经·素问 | 佚名；王冰次注 | 战国至西汉 | 84 | suwen |
| 2 | 黄帝内经·灵枢 | 佚名 | 战国至汉 | 83 | lingshu |
| 3 | 难经 | 佚名（旧题秦越人）；滑寿注 | 汉 | 87 | nanjing |
| 4 | 伤寒论 | 张仲景；后世整理 | 东汉 | 24 | shanghanlun |
| 5 | 金匮要略 | 张仲景；林亿等校定 | 东汉 | 37 | jinguiyaolue |
| 6 | 神农本草经 | 佚名；孙星衍、孙冯翼辑 | 秦汉 | 386 | shennongbencaojing |
| 7 | 本草纲目 | 李时珍 | 明 | 1944 | bencaogangmu |
| 8 | 本草备要 | 汪昂 | 清 | 487 | bencaobeiyao |
| 9 | 本草从新 | 吴仪洛 | 清 | 737 | bencaocongxin |
| 10 | 本草求真 | 黄宫绣 | 清 | 581 | bencaoqiuzhen |
| 11 | 本草纲目拾遗 | 赵学敏 | 清 | 899 | bencaogangmushiyi |
| 12 | 备急千金要方 | 孙思邈 | 唐 | 1808 | qianjinyaofang |
| 13 | 千金翼方 | 孙思邈 | 唐 | 1992 | qianjinyifang |
| 14 | 外台秘要 | 王焘 | 唐 | 1093 | waitaimiyao |
| 15 | 肘后备急方 | 葛洪；后世增补 | 东晋 | 74 | zhouhoubeijifang |
| 16 | 太平惠民和剂局方 | 太平惠民和剂局编修 | 宋 | 829 | hejijufang |
| 17 | 医方集解 | 汪昂 | 清 | 450 | yifangjijie |
| 18 | 汤头歌诀 | 汪昂 | 清 | 230 | tangtougejue |
| 19 | 医方考 | 吴昆 | 明 | 839 | yifangkao |
| 20 | 脉经 | 王叔和 | 西晋 | 102 | maijing |
| 21 | 濒湖脉学 | 李时珍 | 明 | 29 | binhumaixue |
| 22 | 诊家枢要 | 滑寿 | 元 | 14 | zhenjiashuyao |
| 23 | 针灸甲乙经 | 皇甫谧 | 西晋 | 142 | zhenjiujiayijing |
| 24 | 针灸大成 | 杨继洲 | 明 | 327 | zhenjiudacheng |
| 25 | 奇经八脉考 | 李时珍 | 明 | 18 | qijingbamaikao |
| 26 | 诸病源候论 | 巢元方等 | 隋 | 1740 | zhubingyuanhoulun |
| 27 | 脾胃论 | 李杲 | 金元 | 104 | piweilun |
| 28 | 儒门事亲 | 张从正等 | 金 | 738 | rumenshiqin |
| 29 | 格致余论 | 朱震亨 | 元 | 47 | gezhiyulun |
| 30 | 丹溪心法 | 朱震亨；程充等整理 | 元明 | 122 | danxixinfa |
| 31 | 景岳全书 | 张介宾 | 明 | 1167 | jingyuequanshu |
| 32 | 医学心悟 | 程国彭 | 清 | 673 | yixuexinwu |
| 33 | 四圣心源 | 黄元御 | 清 | 159 | sishengxinyuan |
| 34 | 医宗金鉴 | 吴谦等奉敕编 | 清 | 1664 | yizongjinjian |
| 35 | 温疫论 | 吴有性 | 明 | 87 | wenyilun |
| 36 | 温热论 | 叶桂口述；门人整理 | 清 | 1 | wenrelun |
| 37 | 湿热病篇 | 薛雪；王士雄辑注 | 清 | 1 | shirebingpian |
| 38 | 温病条辨 | 吴瑭 | 清 | 87 | wenbingtiaobian |
| 39 | 温热经纬 | 王士雄 | 清 | 28 | wenrejingwei |
| 40 | 妇人大全良方 | 陈自明 | 宋 | 1306 | furendaquanliangfang |
| 41 | 傅青主女科 | 题傅山 | 清 | 78 | fuqingzhunvke |
| 42 | 小儿药证直诀 | 钱乙；阎孝忠编 | 宋 | 220 | xiaoeryaozhengzhijue |
| 43 | 幼幼集成 | 陈复正 | 清 | 250 | youyoujicheng |
| 44 | 外科正宗 | 陈实功 | 明 | 278 | waikezhengzong |
| 45 | 外科证治全生集 | 王维德 | 清 | 464 | waikezhengzhiquanshengji |
| 46 | 临证指南医案 | 叶桂；华岫云编 | 清 | 113 | linzhengzhinanyian |
| 47 | 医林改错 | 王清任 | 清 | 111 | yilingaicuo |
| 48 | 医学三字经 | 陈念祖 | 清 | 81 | yixuesanzijing |
| 49 | 医学源流论 | 徐大椿 | 清 | 100 | yixueyuanliulun |
| 50 | 饮膳正要 | 忽思慧 | 元 | 485 | yinshanzhengyao |
