# 经典处方接口接入与部署

## 数据源

读取已有的 `qingnang.t_prescriptions`，不运行建表、迁移、导入或修改数据。
字段使用用户提供的结构：`id, name, modern_dose, decoction, indications, explanation, cited, tags, abbreviation, item_order`。
`modern_dose`、煎服法、主治、方解原样返回；不推断药材剂量或转换单位。
`item_order` 不参与排序；列表按 `id ASC`，同名不同 ID 的记录独立保留。

默认使用既有 Laravel 数据库连接，可通过环境变量覆盖：

```text
PRESCRIPTIONS_TABLE=qingnang.t_prescriptions
# 仅在使用单独的、已经配置好的连接时设置：
# PRESCRIPTIONS_DB_CONNECTION=mysql
```

数据库账号需具有该表的 SELECT 权限。复用现有 MYSQL_* / DATABASE_URL 配置，不把凭证写入代码仓库。

## 只读 API

- `GET /api/prescriptions?keyword=度瘴&page=1&page_size=20`
- `GET /api/prescriptions/1`

成功返回 `{code: 0, data: ...}`，错误返回 `{code: -1, errorMsg: ...}`。
列表 data 为 `items, total, page, page_size, has_more`；条目字段为 `id, title, source, tags, summary`。
详情在条目字段基础上返回 `modern_dose, decoction, indications, explanation`。
`name` 映射为 `title`，`cited` 映射为 `source`，摘要为主治前 120 个字符，截断时加省略号。
空标题显示“未命名处方”，空出处由界面显示“出处未注明”。标签按中英文逗号、分号、顿号、斜杠、换行拆分去重。

分页默认 20、最大 50；关键词最多 100 字符。搜索方名、出处、主治、现代剂量、方解、标签与简称。
空白分隔的多个词全部匹配，每个词可匹配任一搜索字段。
主键按原表无符号 INT 校验，包含 0；非法 ID 返回 422、不存在返回 404，不回退到其他记录。
旧示例 ID（如 prescription-001）不转换成真实记录。

## 发布顺序

1. 通过项目既有流程，将本次 Laravel 代码发布到小程序使用的云托管服务，保留现有环境配置。
2. 验证两个新增 GET 接口和表 SELECT 权限；核对真实总数、已知 ID、关键词、空结果、404。
3. 再发布包含新接口调用的小程序代码，完成手机端首页搜索 → 列表 → 详情验证。
4. 保留医书、医案接口回归检查，观察处方接口的 4xx/5xx 和响应时间。

本次交付未部署云托管后端，也未发布正式小程序。后端未部署时，手机上的处方请求不能工作；前端会显示错误和重试，不会用示例处方冒充真实数据。
微信开发者工具的既有开发环境回退可以访问 `http://127.0.0.1:8765`，该行为不适用于真机。本次原生验证使用此回退连接隔离 SQLite 测试服务，未修改请求层的云端地址。

## 验证命令与证据

```powershell
php vendor/phpunit/phpunit/phpunit
node --test tests/miniprogram/prescriptions.test.cjs
```

PHP 测试使用 SQLite 内存库并在建表前核对连接，真实数据表不受影响。
用户提供的“度瘴散”原文放在 `tests/Fixtures/prescription.php`，仅用于测试一致性，不代表内容已经审核。
截图与模拟器测试记录见 `prescriptions-qa.md`。
