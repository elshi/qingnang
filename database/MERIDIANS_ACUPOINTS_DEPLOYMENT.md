# 经络与穴位接口部署

## 数据源与边界

接口只读访问既有的 `qingnang.t_meridians` 和 `qingnang.t_acupoints`，不运行迁移、不导入示例数据，也不按 `status` 过滤。`pictures` 字段不参与 SELECT、API 响应或小程序展示。

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
