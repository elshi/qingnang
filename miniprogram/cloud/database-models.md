# 经典中医学习云数据库模型

本文件记录微信云开发集合结构。第一版首页使用本地种子数据，云数据库接入后按以下集合迁移。

## cases

- `title`: 医案标题
- `dynasty`: 朝代
- `source`: 出处
- `doctor`: 医家
- `summary`: 摘要
- `original`: 原文
- `analysis`: 学习解析
- `tags`: 标签数组
- `favoriteCount`: 收藏统计
- `createdAt` / `updatedAt`: 创建与更新时间

## books

- `title`: 书名
- `author`: 作者
- `dynasty`: 朝代
- `summary`: 简介
- `tags`: 标签数组
- `chapters`: 章节数组
- `chapters[].title`: 章节标题
- `chapters[].original`: 原文
- `chapters[].translation`: 译文
- `chapters[].annotation`: 注释

## prescriptions

- `title`: 方名
- `source`: 出处
- `summary`: 学习摘要
- `composition`: 组成
- `explanation`: 方解
- `tags`: 标签数组

处方内容只作为经典方剂学习材料，不写成诊断、治疗或用药建议。

## meridians

- `title`: 经脉名
- `alias`: 别名数组
- `summary`: 摘要
- `route`: 经脉路线
- `acupoints`: 穴位数组
- `indications`: 主治学习内容
- `application`: 临证应用学习内容
- `tags`: 标签数组

## favorites

- `_openid`: 用户 openid
- `contentType`: 内容类型，取值 `case`、`book`、`prescription`、`meridian`
- `contentId`: 内容 id
- `title`: 收藏标题快照
- `createdAt`: 收藏时间

## notes

- `_openid`: 用户 openid
- `contentType`: 关联内容类型
- `contentId`: 关联内容 id
- `contentTitle`: 关联内容标题快照
- `content`: 笔记内容
- `createdAt` / `updatedAt`: 创建与更新时间

## 通用约束

- 所有内容页底部展示免责声明：“仅供学习参考，不作为诊疗依据。”
- 涉及处方、经脉主治、临证应用的字段均用于古籍学习，不提供个体化诊疗判断。
