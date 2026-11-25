# 经络与穴位接口部署

## 数据源与边界

接口只读访问既有的 `qingnang.t_meridians` 和 `qingnang.t_acupoints`，不运行迁移、不导入示例数据，也不按 `status` 过滤。穴位列表保持纯文本。穴位详情可返回经配置解析的 `location_image`，原始 `pictures` HTML 保留在数据库。

默认复用 Laravel 的 MySQL 连接，可通过环境变量覆盖：

```text
MERIDIANS_TABLE=qingnang.t_meridians
ACUPOINTS_TABLE=qingnang.t_acupoints
# 仅在使用单独连接时设置：
# MERIDIANS_DB_CONNECTION=mysql
# ACUPOINTS_DB_CONNECTION=mysql
```

数据库账号只需要两张表的 SELECT 权限。不要把账号密码提交到仓库。

## 只读 API

- `GET /api/meridians?keyword=肺经&page=1&page_size=20`
- `GET /api/meridians/1`
- `GET /api/acupoints?keyword=中府&page=1&page_size=20`
- `GET /api/acupoints?channel=手太阴肺经&page_size=100`
- `GET /api/acupoints/1`

成功返回 `{code: 0, data: ...}`，错误返回 `{code: -1, errorMsg: ...}`。经络列表每页最多 50 条，穴位列表每页最多 100 条；两者均按 `item_order ASC, 主键 ASC` 排序。`channel` 同时精确匹配穴位表的 `meridian` 和 `pulse`。

详情接口只接受无符号整数 ID（包含 0）。非法 ID 返回 422，不存在返回 404，不会回退到静态数据或其他记录。

所有展示文本在接口输出时去除 HTML：图片、脚本和样式块被删除，常见分段标签转成换行，其余标签只保留可见文字，HTML 实体被解码。该运行时清洗始终生效，不依赖数据库是否执行清洗 SQL。

## 可选的数据清洗 SQL

- MySQL 8+：`database/strip_meridian_acupoint_html_mysql8.sql`
- MySQL 5.7 / 兼容 MariaDB：`database/strip_meridian_acupoint_html_mysql57.sql`

两份脚本都不修改 `pictures` 或系统字段，默认以 `ROLLBACK` 结束。运行前先创建完整备份并检查预览；确认无误后，才把脚本末尾的 `ROLLBACK` 改为 `COMMIT`。两版都需要 CREATE ROUTINE 权限来创建执行期间使用的清洗函数。

## 发布顺序

1. 发布 Laravel 后端，配置两张表并授予 SELECT 权限。
2. 分别验证列表、搜索、经脉过滤、详情、404，以及响应中不存在 `pictures` 和 HTML 标签。
3. 发布小程序，验证首页搜索“中府”进入穴位详情、经络页选肺经后加载 11 个穴位、点击穴位进入真实详情。
4. 观察云托管 4xx/5xx、数据库权限错误和接口响应时间；数据库清洗 SQL 可独立安排，不阻塞应用发布。

当前仓库没有本地 `.env`，默认真实 MySQL 连接返回 1045，因此自动化测试使用 SQLite 内存表，不会读写生产数据。

## 验证命令

```powershell
php vendor/phpunit/phpunit/phpunit
node --test tests/miniprogram/*.test.cjs
```

## 穴位位置图

小程序在「定位」卡片中绘制体表部位参照图。现行国标中的穴位按编码或穴名匹配解剖区域，历史条目可根据已有部位字段展示。合谷使用依据经穴国标第 5.2.4 节绘制的手背示意。 [经穴名称与定位](https://www.ntcamsac.ac.cn/cms/content?id=353) · [经外奇穴名称与定位](https://www.ntcamsac.ac.cn/cms/content?id=264)

如已将旧图迁到有权使用的 HTTPS 图源，可在 Laravel 环境变量中设置 `ACUPOINT_IMAGE_BASE_URL`。详情接口优先读取 `locate` 内的图片，再查 `pictures`。两者都只接受 `/upload/material/image/年/月/日/数字.扩展名` 格式的原始资源路径，并与该图源拼接。点按图片可放大，图源缺失或加载失败时显示本地示意。

## 2026-11-24 穴位数据校订

线上 `qingnang.t_acupoints` 校订 143 条，追加安眠、牵正、新设、血压点、提托、接脊、肩前、里内庭 8 条，新增 ID 为 409–416。提交后通过新连接回读，共 416 条，字段摘要为 `babb1fd3f47ff3bb2c5f629e6ccf6275f2713ccb1563b8f8fe023c80ff910055`。

现行国标的 362 个经穴和 51 个经外奇穴条目均可在表内对应。印堂使用原 ID 161，归入督脉，旧编码 `EX-HN3` 存入别名。金津、玉液各用原 ID，共用标准合列名称。下极俞和腰奇作为旧目录条目保留。标准节号及本次定位摘要见[校订来源数据](acupoints-standard-2021.json)。[经穴名称与定位](https://www.ntcamsac.ac.cn/cms/content?id=353) · [经外奇穴名称与定位](https://www.ntcamsac.ac.cn/cms/content?id=264)

气冲和头维的交会归属参照医院公开资料。灵台补录《针灸问答》所载内容并注明书名。[奇经八脉](https://www.zyxyfy.com/zywh/zyzs/qjbm/content_2968) · [《针灸问答》](https://jicheng.tw/tcm/book/%E9%87%9D%E7%81%B8%E5%95%8F%E7%AD%94/index.html)

`scripts/repair-acupoints.mjs` 使用 `ACUPOINTS_DB_HOST`、`ACUPOINTS_DB_PORT`、`ACUPOINTS_DB_USER` 和 `ACUPOINTS_DB_PASSWORD`。支持设置 `ACUPOINTS_DB_SSL_CA`。`--check` 预览，`--verify` 只读复核。`--apply` 在事务内导出操作前的完整穴位表备份，写入后核对全部行，并用新连接复验。
