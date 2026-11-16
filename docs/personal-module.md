# 个人中心：MySQL 云端保存

## 当前实现

- 内容接口与个人接口统一使用云托管环境 prod-d1gb975fz674ef15d、服务 laravel-ld8m。配置集中于 miniprogram/utils/cloud-config.js。
- 页面标题为“个人中心”，底部标签保留“我的”。登录说明上方间距由120rpx改为80rpx。
- 医案详情“原文 / 解析”各占50%宽度、居中，位于收藏和写笔记行上方。
- 微信登录采用 wx.login → POST /api/personal/session → 服务端 code2Session。会话有效30天，数据库只保存会话令牌的哈希；退出后撤销会话。用户归属由服务端会话决定。
- 收藏、笔记、草稿、历史及反馈通过 Laravel 保存到 MySQL。只有云端确认后才提示保存成功。个人接口没有本地数据库回退。
- 客户端 v2 缓存按账号隔离。断网写入保留待处理队列；笔记保留恢复副本。重试使用同一操作标识，版本冲突返回409，用户可把当前输入另存为新笔记。
- 正式笔记保存与对应云端草稿清理在同一数据库事务中执行。阅读历史保留最近200条；游客阅读不写个人历史。
- 语音接入 WechatSI（wx069ba97219f66d99，默认版本0.3.3）识别普通话，最长60秒。中间结果只预览，最终结果插入光标位置；不保存录音文件、没有音频播放或上传功能。目前插件授权检查返回80082 / permission deny，语音暂未启用，点击会提示尚未开通，其他页面不受插件依赖阻塞。

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

除创建会话外，所有接口须携带 Authorization: Bearer <token>。客户端不提交openid；AppSecret与微信session_key不会返回客户端。录音字段不会存入新记录。

## 部署到当前云托管环境

1. 在 laravel-ld8m 的服务端环境变量中设置 WECHAT_APP_ID=wxa71ced3f64d1a657 和 WECHAT_APP_SECRET。密钥只进入服务配置，不发到聊天、不写入仓库。
2. 复用现有 MYSQL_* 连接。用有建表权限的数据库账号执行以下迁移（仅新增个人表，不操作医书、医案等内容表）：

    php artisan migrate --force --path=database/migrations/2026_11_16_000000_create_personal_tables.php

   新增 t_personal_users、t_personal_sessions、t_personal_records、t_personal_feedback。运行服务账号需要这四张表的 SELECT、INSERT、UPDATE、DELETE 权限；内容表继续保持原权限。
3. 配置私有COS桶及 PERSONAL_COS_BUCKET、PERSONAL_COS_REGION、PERSONAL_COS_SECRET_ID、PERSONAL_COS_SECRET_KEY。凭证仅授予 personal/ 前缀的上传、读取元信息及设置私有ACL权限。将桶的HTTPS域名加入小程序uploadFile合法域名。未配置截图存储时，文字反馈仍可提交。
4. 在小程序后台添加“微信同声传译”插件（wx069ba97219f66d99），同步更新麦克风及语音识别隐私用途。授权完成后运行 node scripts/configure-speech.cjs --enable --version=0.3.3（如后台版本不同，填实际获准版本），同时更新app.json注册和语音开关，再进行微信完整预览。可用 --disable 关闭依赖，保证未开通时其他页面仍可编译。
5. 部署后执行 php artisan personal:check，确认配置和表存在。该检查不打印密钥、不修改数据；数据库写权限仍须通过实际读写验证。
6. 用开发版真机测试真实登录和云端读写，通过后发布小程序。旧personal云函数代码已移除，不再需要单独云开发数据库。

Docker构建上下文排除本机密钥、私人数据库连接文件、缓存、测试数据及小程序目录；镜像中允许PHP运行账号重建Laravel启动缓存。生产数据库外部连接目前不支持TLS；本次没有绕过该限制，需从云环境内的合法数据库连接执行迁移。

## 旧数据与兼容

- 首次登录导入该账号及游客的旧正式记录；收到服务器确认后才移除已导入的游客条目，防止重复导入其他账号。
- 旧账号缓存不导入其他账号。旧游客草稿归属首次登录账号，本机原始副本保留。
- 旧音频附件不再上传、不自动删除；只有文字内容可作为新笔记保存。仅音频的旧条目仍保留在旧本机缓存。
- 版本冲突不会静默覆盖云端文字；原输入保存在账号恢复副本中，另存为新笔记后清理对应冲突队列。

## 验证与当前上线状态

- 后端：php vendor/phpunit/phpunit/phpunit --do-not-cache-result
- 小程序逻辑：node --test tests/miniprogram/*.test.cjs
- WXML/WXSS：微信开发者工具随附编译器。
- 实机验收：登录后收藏、新建和编辑笔记、清缓存后恢复、另一设备读取、跨账号隔离、清空历史、反馈、麦克风拒绝、无语音与网络失败。

本次本地后端36项测试（325个断言）、小程序逻辑36项测试通过；23个WXML和28个WXSS编译通过。云端服务尚未部署，本次未验证真实微信登录、云端MySQL读写及实际语音识别。云托管后台的电脑操作访问被工具拒绝，不能据本地测试声称已上线。

2026-11-17：关闭尚未授权的语音插件依赖后，微信开发者工具完整预览构建成功（约1.1MB），证明插件不会继续阻塞其他页面编译；不代表云端服务或真实语音已开通。

scripts/verify_personal_ui.cjs 已更新为独立临时项目验收：使用假数据接口、关闭真实语音服务、备份和恢复测试项目缓存，不向生产提交记录。需要 NODE_PATH 指向已安装 miniprogram-automator 的目录。本次开发者工具自动化响应超时，没有产出新页面截图，旧 docs/screenshots/personal 图片不能代表这次修改已完成视觉验收。
