# 青囊经络图谱发布与回滚

安装包根目录是 Laravel 服务，小程序项目在 `miniprogram/`。服务端提供两张总图、20 套经脉图、54 幅经外及历史穴定位参照图。每幅均有手机预览与高清原图。所有穴位入口沿用现有数据库主键。

## 数据与图版

- 经脉目录及正文位于 `database/atlas/channels.json`。十二正经循行摘自《灵枢·经脉第十》，任督及其余奇经循行摘自《奇经八脉考》的相应篇章。十四经穴歌及奇经歌摘自《针灸大成》。歌诀保留原书字词和古代穴数，界面索引按现行国标编排。
- 穴位名称、拼音、定位参照和部位见 `database/atlas/point-references.json`。该索引含 362 个经穴、51 个经外奇穴标准条目。金津与玉液共用国标条款，数据库分别存储。另有腰奇、下极俞两条历史记录。印堂保留旧编码别名与原 ID，其现行编码为 GV24+。[经穴名称与定位](https://www.ntcamsac.ac.cn/cms/content?id=353) · [经外奇穴名称与定位](https://www.ntcamsac.ac.cn/cms/content?id=264)
- 六条奇经的交会穴采用甘肃中医药大学附属医院《奇经八脉》各经的交会腧穴表。图版以经过的体表部位和交会穴为标志进行重绘。入里、分支和古籍记载见详情正文。带脉采用带脉、五枢、维道三穴，各自链接至足少阳胆经原穴位记录。[奇经八脉](https://www.zyxyfy.com/zywh/zyzs/qjbm/content_2968)
- 361 个三维穴位和十四经体表曲线来自 Acu361 v1.0.1。印堂由眉头间中点定位，六条奇经按体表标志绘为示意。经外及历史穴图以距离、方位、中点或重合关系解释定位。整套衍生图版尚未经临床专家逐幅审签。公开分发请随图保留 `public/images/meridians/NOTICE.txt` 和随附许可证。[Acu361 数据与署名](https://github.com/Elwyn921/Acu361/tree/v1.0.1)
- `graphics.json` 管理总图、全程图和局部图。`extra-graphics.json` 管理经外及历史穴定位参照图。导入时按图版编码逐项核对数据库主键与顺序。详情接口的每幅经脉图同时返回 `codes` 与 `point_ids`。

## 发布顺序

微信开发者工具的 develop 模拟器可在控制台执行 `wx.setStorageSync('qingnang.atlas.local', true)`，直接联调本机 `https://localhost:8843` 的经络和穴位只读接口。取消时执行 `wx.removeStorageSync('qingnang.atlas.local')`。体验版与正式版通过原有云托管请求。

1. 解压到新的发布目录，配置 Laravel 的 `APP_KEY`、`APP_URL` 与 `ASSET_URL`。地址示例为 `https://api.example.cn`。图片域名须支持公网 HTTPS、有效证书和匿名读取，并加入微信公众平台的小程序 downloadFile 合法域名；使用 wx.request 时也要配置 request 域名。开发库与正式库分别配置。后端容器使用现有 Dockerfile，构建上下文为发布目录根。
2. 指定目标 MySQL 库。导入脚本与 Laravel 使用相同的 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_DATABASE`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`。远程 MySQL 使用校验证书的 TLS；自签根证书设置 `MYSQL_ATTR_SSL_CA`。当前脚本针对同库的 `t_meridians`、`t_acupoints` 及三张图谱表。Laravel 表名如显式包含库名，须指向同一目标库。
3. 在已有的 20 经、416 穴基线上执行独立迁移，安装导入工具的依赖。在服务运行目录和公网文档目录之外，指定私有审计目录保存差异和备份。
   
   ```sh
   php artisan migrate --path=database/migrations/2026_11_27_000000_create_meridian_atlas.php --force
   npm ci --prefix scripts/meridians
   node scripts/meridians/import-atlas.cjs --check /private/atlas-audit
   ```
   
4. 阅读生成的逐字段差异。导入会先保存五张表的原始值，再在同一事务中写入，验证提交前后摘要。已有定位引文、历史名称、编码别名和非空资料保留。原录主治、刺灸等字段的来源及待核状态写入 `t_acupoint_review`。
   
   ```sh
   node scripts/meridians/import-atlas.cjs --apply /private/atlas-audit
   node scripts/meridians/import-atlas.cjs --verify /private/atlas-audit
   ```
   
5. 先启用能提供旧接口、新接口及全部静态图片的后端，再验证 20 经与 416 个穴位详情，最后上传小程序。域名使用公开受信证书时可省略 `--ca`；开发环境可传入开发证书。保留旧版图片文件，供缓存中的详情和回滚版本读取。
   
   ```sh
   python scripts/meridians/verify_service.py https://api.example.cn --report /private/atlas-audit/service.json
   ```

## 回滚

先撤回新版小程序或切换到兼容版本的后端。导入日志中的 `backup` 指向该次写入之前的完整快照。回滚会核对目标库、备份指纹和当前数据，检测到导入后有其他编辑时会停止。数据恢复后再按部署版本决定是否撤回图谱表迁移。

```sh
node scripts/meridians/import-atlas.cjs --restore /private/atlas-audit /private/atlas-audit/实际文件名-apply-backup.json
```

## 重新生成图版

服务部署直接使用随包图片。重新绘图时使用 Python、NumPy、Numba、Pillow 及支持中文的字体。三个古籍章节文件随发布包提供。若重编国标索引，需在本机提供与 `database/acupoints-standard-2021.json` 摘要匹配的两份标准 PDF 及其 pdftotext 文本，命名为 `qingnang-location-standard-12346.pdf/.txt` 和 `qingnang-location-standard-40997.pdf/.txt`。

```sh
python scripts/meridians/compile_catalog.py --standard-text-dir /path/to/standards
python scripts/meridians/fetch_anatomy.py /path/to/acu361
python scripts/meridians/render_atlas.py --source /path/to/acu361 --font /path/to/chinese-font.ttc
python scripts/meridians/render_extras.py --font /path/to/chinese-font.ttc
```

