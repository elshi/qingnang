# 古籍采集与增量导入工具

安装：`npm ci`。完整数据、版本说明、字段映射和命令示例见项目中的 `txt/classic-books/README.md`。

- `catalog.mjs`：50 部书的人工选目、原创简介、明确别名和特定来源选择。
- `capture.mjs`：下载或复用可校验的 HTML 快照，保存来源目录和著作权声明；《医宗金鉴》显式按分册次序采集。
- `extract.mjs`：提取卷篇层次及段落，保留古注，排除明确标记的现代校订，记录缺文和图版。
- `collect.mjs`：构建规范 JSON、繁体提取副本、源目录和转换记录。
- `validate.mjs`：检查整包完整性、源文件哈希、所有段落映射和简繁转换，输出首中尾及逐卷抽样。
- `import.mjs`：CLI；默认只预检，只有 `--apply` 才写入，凭据来自 `BOOKS_DB_*` 环境变量。
- `connection.mjs`：连接配置；远程连接须显式启用并加载该实例可信 CA，验证证书链，不保存密码。
- `import-core.mjs`：真实表结构检查、别名检测、章节冲突检查、事务及增量插入。没有 UPDATE/DELETE 业务数据语句。
- `test/*.test.mjs`：提取边界和隔离 MySQL 场景；MySQL 测试只创建并删除唯一命名的 `qingnang_books_test_*` 库。
- `test-corpus.mjs`：整包实际导入与再次执行验证，必须使用独立测试端口。

依赖独立锁定于 `package-lock.json`，Node.js 版本须满足所锁定依赖要求（建议 Node.js 22.12 或更新版本）。

审查记录 `review.json` 与数据 SHA-256 绑定。重新采集或修改转换规则后，先复核差异并更新审查记录；工具不会自动将新的文本宣布为已审查。
