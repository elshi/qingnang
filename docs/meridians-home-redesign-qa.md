# 经络首页改版验收

- 首页：墨绿分类按钮、两级经脉名称、左右独立点击区、中央透明人体图。
- 图片：从现有模型和循行数据重新渲染，两张 PNG 的 Alpha 范围均为 0–255；合计 58,516 字节。小程序媒体合计 194,165 字节，低于 200 KB 限制。
- 自动检查：`node --test tests/miniprogram/meridians.test.cjs`，17 项通过。
- 微信开发者工具：390 × 844、375 × 667 视口检查通过；正经／奇经切换、任脉详情入口与返回保留分类通过。
- 预览：`docs/screenshots/meridians-redesign/regular.png`、`extraordinary.png`、`compact.png`。
- 尚未进行实体手机验收。
