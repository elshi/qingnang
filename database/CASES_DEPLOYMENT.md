# Classic Cases Database Deployment

The Laravel service reads `qingnang.t_cases` through the application's default
database connection. The default MySQL database is `qingnang`, and the
connection supports either `DATABASE_URL` or the existing `MYSQL_*`
environment variables. Do not place database credentials in this repository.

Configure the CloudRun service with:

```text
MYSQL_ADDRESS=10.31.107.102:3306
MYSQL_DATABASE=qingnang
MYSQL_USERNAME=<read-only user>
MYSQL_PASSWORD=<read-only password>
```

Set `CASES_TABLE` only when the cases table is stored elsewhere:

```text
CASES_TABLE=other_database.other_table
MYSQL_DATABASE=other_database
```

`CASES_DB_CONNECTION` normally does not need to be set. It is available only
when cases must use a preconfigured Laravel connection instead of
the application's default connection.

Create the account using `cases-readonly-user.sql.example` after replacing its
placeholders. The account only needs `SELECT` on `qingnang.t_cases`.

Because an administrator password was previously shared in plaintext, rotate
that password before deployment.

## 2026-11-23 古籍医案入库

本次在腾讯云 MySQL 的 `qingnang.t_cases` 导入 1,000 例古医案，ID 为 1–1,000。新连接逐条回读，比对正文及全部整理字段，确认内容摘要为 `3a7261af642e0d51c53b5ebe38bfa11bb129c42022987cfb67d8a1bf3b9d8e4f`。

| 古籍 | 条数 | 所用底本 |
| --- | ---: | --- |
| 临证指南医案 | 390 | 乾隆三十一年刊本 |
| 吴鞠通医案 | 254 | 1936 年上海大东书局《中国医学大成》本 |
| 内科摘要 | 153 | 1654 年日本承应三年刊本 |
| 洄溪医案 | 77 | 清咸丰七年衍芬草堂本、清光绪十八年重刊本 |
| 石山医案 | 64 | 明嘉靖初祁门陈氏刊本 |
| 寓意草 | 42 | 文渊阁《四库全书》本、日刊本 |
| 小儿药证直诀 | 20 | 宋刊大字本及明载的补配本、清乾隆武英殿聚珍本 |

原著选自公版古籍。中医笈成将对公有领域文本的编排、标点等整理成果以 CC0 释出。入库范围为古案正文及案中记载，保留作者、出处和底本资料。采集时核对了各页面的底本和单独版权声明，排除了以现代点校本为底本的候选版本。参见[中医笈成著作权声明](https://jicheng.tw/tcm/copyright.html)。

`classic-cases.json` 包含每例的书名、卷篇、源页面、段落序号与正文校验值，以及每部书的底本扫描链接和采集快照摘要。原文统一为简体和常规空白，能明确关联的连续复诊保存在同一条医案中。病名优先取原书病门或个案标题，症状、古方和治法以案中可定位记载摘录。具有明确原方的 779 条写入 `prescription`，`origin_symptoms`、`temp_tags` 和 `modern_prescription` 均为 NULL。

生成工具位于 `scripts/classic-books/build-cases.mjs`，接收七份 HTML 的目录，文件名使用数据中的来源 `key`。导入和核验复用 `scripts/classic-books` 的 MySQL 驱动。

```powershell
node scripts/classic-books/import-cases.mjs --check
node scripts/classic-books/import-cases.mjs --verify
```

联网核验从 `CASES_DB_HOST`、`CASES_DB_PORT`、`CASES_DB_USER`、`CASES_DB_PASSWORD` 读取连接参数，使用 TLS。可通过 `CASES_DB_SSL_CA` 指定实例 CA。导入使用 `--apply`，事务内先回读核对全部整理字段，再提交。同批数据重复导入新增 0 条。

## 2026-11-23 第二批结构化医案

第二批新增 1,000 例，ID 为 1001–2000。两批独立回读均与对应数据文件一致，原医案未被更新。新批次包含《张聿青医案》448 例、《临证指南医案》313 例、《慎五堂治验录》200 例、《静香楼医案》35 例、《吴鞠通医案》4 例。

- `symptoms` 保存用 `/` 分隔的症状标签，`summary` 保存原案辨证、治法或首方配伍要点及出处。原文简略的病例，解析以原载症状和药味为限。
- `modern_prescription` 按 `{name, note, dose}` 数组保存首诊可辨认的处方。629 例至少有一味药的剂量，371 例全部剂量留空。公制克数保存原载明清重量的文献折算值，`note` 同时标注原文。原方无量、重量为整料配制、用量语义不清等情况保留药味，剂量为空。参见[明清度量衡折算考证](https://doi.org/10.13422/j.cnki.syfjx.20240668)。
- `origin_symptoms`、`temp_tags` 为 NULL，`treatment` 为“方药”，`status` 为 1（待校对）。

第二批文本同样来自中医笈成。数据文件保留每案的定位、处方段落、来源版本说明和快照校验值。《慎五堂治验录》《静香楼医案》的电子源页未注明具体刊本，对应记录保留原序年代和来源链接。参见[中医笈成著作权声明](https://jicheng.tw/tcm/copyright.html)。

生成工具为 `scripts/classic-books/build-structured-cases.mjs`，导入工具使用 `--structured` 选取第二批。参见[第二批数据](structured-classic-cases.json)。

```powershell
node scripts/classic-books/import-cases.mjs --check --structured
node scripts/classic-books/import-cases.mjs --verify --structured
```

第二批字段摘要为 `8959efaa8ccad218d1797a8a85637e054410fb1c426cab14dee87e04c9831028`，重复运行 `--apply --structured` 新增 0 条。

## 2026-11-23 古医案增补

本次目标为新增 30,000 例。按原案可定位、处方可结构化和跨批去重的条件，从 52 部古籍的 14,488 个候选案段中筛出 28 部书的 2,352 例，尚缺 27,648 例。候选案段包含重复转载、复诊片段和在案界、药味、症状记录上无法确认的文本。

新增记录的 ID 为 2001–4352，状态为 1（待校对）。事务内比对了导入前的 1,000 条记录，提交后使用新连接回读新增内容，表内共 3,352 条。导入时首批 ID 1–1000 已不在表中，本批去重仍使用首批与第二批的数据文件。

数据文件保留每案的卷篇、段落序号、处方段落、正文与底本校验值。症状采用 `/` 分隔的标签，解析依据原载症状、辨证、治法或方药整理。处方使用 `name`、`note`、`dose` 数组。1,283 例至少有一味药带剂量，1,069 例全部剂量留空。可核对的重量标明为原方折算值。原载成方在 `name` 中保留名称，`note` 标注其为成方，剂量留空。`origin_symptoms`、`temp_tags` 为 NULL。参见[入库数据](classic-cases-expansion.json)和[度量衡折算考证](https://doi.org/10.13422/j.cnki.syfjx.20240668)。

本批使用中医笈成 `jc.data` 的固定版本 `4e95fff6c57bad2401bff023b64c1d59caa41503`。所用内容为公版古籍案文与适用 CC0 的电子整理。来源版次、单独权利声明或案界仍需确认的候选文本留待后续核查。国家地球系统科学数据中心发布的中医古籍知识库仅限科研使用，复制须取得其书面许可。参见[中医笈成著作权声明](https://jicheng.tw/tcm/copyright.html)、[数据下载说明](https://jicheng.tw/tcm/download.html)和[中医古籍知识库使用声明](https://www.geodata.cn/data/datadetails.html?dataguid=263200287827331&docid=20588)。

```powershell
node scripts/classic-books/build-case-expansion.mjs <jc.data目录>
node scripts/classic-books/import-cases.mjs --expansion --check
node scripts/classic-books/import-cases.mjs --expansion --verify
```

本批字段摘要为 `d964c4187cf182cd1af67e68aad7dd406577024a2a2097a173eca7e4e59e109b`。

## 2026-11-24 医案剂量更新

`qingnang.t_cases` 中 1,909 条医案的 17,366 项克数统一采用一钱约 3g 的参考换算。已有可显示剂量的条目将原单位和数量保存为 `original_dose`，`note` 保留原药名、炮制及煎服等说明。医案解析保留原分析和文献出处。参见[中药计量单位换算](https://xxgk.qinshui.gov.cn/xzf/qswtj/fdzdgknr/gzdt/202312/t20231207_1899438.shtml)。

两批数据文件与线上记录已逐条回读比对。结构化医案批次字段摘要为 `61953fbc02d02840f2e5df8e318c28824e530ab257d4f3c0ec8b0f275abfd636`，增补批次字段摘要为 `437ad3f86c0de7b0a2268be55baba9ec26518d8d3484f29b870c05d01013097c`。

## 2026-11-24 《伤寒论》辨证条文

新增 47 条张仲景辨证条文，ID 为 4353–4399，状态为待校对。覆盖六经、霍乱和病后辨治。来源为仓库中《伤寒论》宋本固定快照。数据文件记录条文所在卷篇、整理本行号、原文校验值及各方的组成出处。参见[中医笈成《伤寒论》（宋本）](https://jicheng.tw/tcm/book/%E5%82%B7%E5%AF%92%E8%AB%96%EF%BC%88%E5%AE%8B%E6%9C%AC%EF%BC%89/index.html)。

`prescription` 保存原方组成和古单位。`modern_prescription` 保存药名及原载炮制说明，现代剂量留空。条文对不同证候分别列方时，处方按原文顺序分组。`summary` 标明记录类型并保留文献出处。

```powershell
node scripts/classic-books/build-shanghanlun-cases.mjs
node scripts/classic-books/import-cases.mjs --check --shanghanlun
node scripts/classic-books/import-cases.mjs --verify --shanghanlun
```

线上表共 3,399 条。本批提交后由新连接逐条回读，字段摘要为 `690e01df09a7c9e9825f2a2f280408ccc219986545fc609fa1342c7906d68ee6`。既有两批共 3,352 条也通过回读校验。参见[入库数据](shanghanlun-cases.json)。
