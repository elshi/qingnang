# 个人中心：MySQL 云端保存

## 当前实现

- 内容接口与个人接口统一使用云托管环境 prod-d1gb975fz674ef15d、服务 laravel-ld8m。配置集中于 miniprogram/utils/cloud-config.js。
- 页面标题为“个人中心”，底部标签保留“我的”。登录说明上方间距由120rpx改为80rpx。
- 医案详情“原文 / 解析”各占50%宽度、居中，位于收藏和写笔记行上方。
- 微信登录采用 wx.login → POST /api/personal/session → 服务端 code2Session。会话有效30天，数据库只保存会话令牌的哈希；退出后撤销会话。用户归属由服务端会话决定。
- 收藏、笔记、草稿、历史及反馈通过 Laravel 保存到 MySQL。只有云端确认后才提示保存成功。个人接口没有本地数据库回退。
- 客户端 v2 缓存按账号隔离。断网写入保留待处理队列；笔记保留恢复副本。重试使用同一操作标识，版本冲突返回409，用户可把当前输入另存为新笔记。
- 正式笔记保存与对应云端草稿清理在同一数据库事务中执行。阅读历史保留最近200条；游客阅读不写个人历史。
- 笔记使用文字编辑，保存按钮位于正文文本框下方；已移除语音转文字入口、录音权限及识别接口。

## 接口

统一响应：成功 { code: 0, data }；失败使用相应HTTP状态码。422为输入错误，401为会话失效，409为版本冲突。

| 方法与路径 | 行为 |
| --- | --- |
| POST /api/personal/session | 用一次性微信code创建会话 |
| GET /api/personal/session | 验证当前会话 |
| DELETE /api/personal/session | 撤销当前会话 |
| GET /api/personal/records?cursor=… | 按当前用户分页读取记录，每页100条 |
| POST /api/personal/records | 保存一条记录；record、expectedVersion、mutationId；保存笔记可携带draftKey |
| DELETE /api/personal/history | 清空当前账号历史，保留删除标记 |
| POST /api/personal/import | 幂等导入最多20条旧本机记录，不覆盖远程版本和删除标记 |
| POST /api/personal/uploads | 签发单张私有反馈截图上传凭证，5分钟有效、最大5MB |
| POST /api/personal/feedback | 提交文字、可选联系方式及最多3张已上传截图引用 |
| GET /api/comments?type=…&id=…&chapterId=… | 游客分页查看公开点评；chapterId 仅用于医书章节 |
| GET /api/personal/comments?type=…&id=…&chapterId=… | 登录后查看点评，并标记自己的点评 |
| POST /api/personal/comments | 发表点评：type、id、章节的chapterId、content（1–1000字）、submissionId；相同提交编号幂等 |
| DELETE /api/personal/comments/{id} | 删除自己的点评；重复删除幂等 |

除创建会话和游客查看点评外，所有接口须携带 Authorization: Bearer <token>。客户端不提交openid；AppSecret、微信session_key不会返回客户端。

2026-11-28 新增公开点评：覆盖医书章节、医案、经方、经络和穴位详情；所有人可查看，登录后可发表及删除自己的点评。列表按时间倒序，每页20条，以 cursor 读取更早记录。公开响应仅包含书友代号，不返回账号ID。点评独立存入 `t_content_comments`，不改变私有笔记。发表失败保留当前输入，重试复用 submissionId；删除后清空正文并保留幂等标记。

2026-11-28 已在 Navicat 的 `qingnang` 连接、`qingnang` 数据库中创建并回读核验 `t_content_comments`：8 个字段，主键、分页索引和防重复提交唯一索引共3个索引。迁移 `2026_11_28_000000_create_content_comments` 已登记为 batch 2。现有用户、会话和笔记表字段齐全，无需修改。该数据库不必重复建表，应用代码仍需部署。

新环境先执行以下迁移，再发布小程序：

```powershell
php artisan migrate --force --path=database/migrations/2026_11_28_000000_create_content_comments.php
```

运行服务账号需要新表的 SELECT、INSERT、UPDATE 权限。数据库迁移完成不表示应用代码已部署。

## 部署到当前云托管环境

1. 在 laravel-ld8m 的服务端环境变量中设置 WECHAT_APP_ID=wxa71ced3f64d1a657 和 WECHAT_APP_SECRET。密钥只进入服务配置，不发到聊天、不写入仓库。
2. 复用现有 MYSQL_* 连接。个人表已于 2026-11-17 在 `qingnang` 库通过加密连接创建，并登记迁移版本；新环境可执行以下迁移（仅新增个人表，不操作医书、医案等内容表）：

    php artisan migrate --force --path=database/migrations/2026_11_16_000000_create_personal_tables.php

   新增 t_personal_users、t_personal_sessions、t_personal_records、t_personal_feedback。运行服务账号需要这四张表的 SELECT、INSERT、UPDATE、DELETE 权限；内容表继续保持原权限。
3. 配置私有COS桶及 PERSONAL_COS_BUCKET、PERSONAL_COS_REGION、PERSONAL_COS_SECRET_ID、PERSONAL_COS_SECRET_KEY。凭证仅授予 personal/ 前缀的上传、读取元信息及设置私有ACL权限。将桶的HTTPS域名加入小程序uploadFile合法域名。未配置截图存储时，文字反馈仍可提交。
4. 部署后执行 php artisan personal:check，确认配置、个人表和点评表存在。该检查不打印密钥、不修改数据；数据库写权限仍须通过实际读写验证。
5. 用开发版真机测试真实登录和云端读写，通过后发布小程序。旧personal云函数代码已移除，不再需要单独云开发数据库。

Docker构建上下文排除本机密钥、私人数据库连接文件、缓存、测试数据及小程序目录；镜像中允许PHP运行账号重建Laravel启动缓存。当前 MySQL 5.7 在严格模式下要求会话时间字段使用 `DATETIME`，迁移文件已同步调整。

## 旧数据与兼容

- 首次登录导入该账号及游客的旧正式记录；收到服务器确认后才移除已导入的游客条目，防止重复导入其他账号。
- 旧账号缓存不导入其他账号。旧游客草稿归属首次登录账号，本机原始副本保留。
- 旧音频附件不再上传、不自动删除；只有文字内容可作为新笔记保存。仅音频的旧条目仍保留在旧本机缓存。
- 版本冲突不会静默覆盖云端文字；原输入保存在账号恢复副本中，另存为新笔记后清理对应冲突队列。

## 验证与当前上线状态

- 后端：php vendor/phpunit/phpunit/phpunit --do-not-cache-result
- 小程序逻辑：node --test tests/miniprogram/*.test.cjs
- WXML/WXSS：微信开发者工具随附编译器。
- 实机验收：登录后收藏、新建和编辑笔记、清缓存后恢复、另一设备读取、跨账号隔离、清空历史、反馈，以及点评发表、分页和删除。

个人中心和点评数据库表已建立，但本地测试不代表云端服务已部署，也不能替代真实微信登录和云端读写验证。

2026-11-28：移除笔记语音转文字功能，部署检查不再要求配置语音识别服务。

scripts/verify_personal_ui.cjs 使用独立临时项目验收：使用假数据接口、备份和恢复测试项目缓存，不向生产提交记录。需要 NODE_PATH 指向已安装 miniprogram-automator 的目录。旧 docs/screenshots/personal 图片不能代表当前页面已完成视觉验收。
