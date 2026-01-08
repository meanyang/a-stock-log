# AStockLog

一个基于Next.js和Nextra的个人股票投资知识管理与日志系统。

## 🌟 项目简介

AStockLog是一个用于记录和管理股票投资相关知识、策略和日志的个人知识库网站。它提供了清晰的内容组织方式，方便您随时查阅和更新您的投资理念与经验。

## 🛠️ 技术栈

- **Next.js 16** - 现代化的React框架
- **Nextra 4** - Next.js的静态站点生成器，支持MDX
- **React 19** - 用于构建用户界面的JavaScript库
- **MDX** - 结合Markdown和JSX的内容格式
- **Pagefind** - 静态站点搜索功能

## 📁 项目结构

```text
.
├── app/                      # Next.js App Router 目录
│   ├── about/               # 关于页面
│   ├── contact/             # 联系页面
│   ├── posts/               # 文章列表页面
│   │   ├── (dragon-tiger-list)/  # 龙虎榜文章
│   │   ├── (trend)/         # 趋势分析文章
│   │   ├── get-posts.js     # 文章获取工具函数
│   │   └── page.jsx         # 文章列表页面
│   ├── tags/                # 标签分类页面
│   │   └── [tag]/           # 动态标签页面
│   ├── _archive/            # 归档内容
│   ├── layout.jsx           # 全局布局组件
│   ├── page.mdx             # 首页内容
│   └── _meta.global.js      # 全局元数据配置
├── .next/                   # Next.js构建输出
├── node_modules/            # 项目依赖
├── mdx-components.js       # MDX组件配置
├── next.config.js          # Next.js配置
├── package.json            # 项目依赖配置
└── README.md               # 项目文档
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:3000 查看网站。

### 生产构建

```bash
npm run build
npm start
```

## 📝 内容组织

网站内容使用MDX格式编写，采用Nextra的App Router结构：

### 主要功能模块

- **首页** (`/`) - 项目介绍和导航
- **文章列表** (`/posts`) - 所有文章的聚合页面
- **龙虎榜分析** (`/posts/dragon-tiger-list`) - 股票龙虎榜数据分析
- **趋势分析** (`/posts/trend`) - 市场趋势和行业分析
- **标签分类** (`/tags/[tag]`) - 按标签分类的文章
- **归档内容** (`/_archive`) - 历史文章归档
- **关于页面** (`/about`) - 项目介绍
- **联系页面** (`/contact`) - 联系方式

### 内容管理特点

- **自动标签系统** - 文章自动按标签分类
- **搜索功能** - 集成Pagefind实现全文搜索
- **响应式设计** - 适配各种设备屏幕
- **代码复用** - 使用可复用的组件架构

## 🎯 使用指南

### 添加新文章

1. 在`app/posts/`目录下的相应分类中创建新的文章目录
2. 在目录中创建`page.mdx`文件
3. 使用MDX语法编写内容，包含必要的frontmatter：

```mdx
---
title: "文章标题"
date: "2025-01-01"
tags: ["标签1", "标签2"]
---

文章内容...
```

### 自定义导航

在`app/_meta.global.js`中配置全局导航菜单：

```javascript
export default {
  index: '首页',
  posts: '文章',
  about: '关于',
  contact: '联系'
}
```

## 🔍 搜索功能

项目集成了Pagefind搜索功能，构建后会自动生成搜索索引：

```bash
npm run build  # 自动执行postbuild脚本生成搜索索引
```

## 🎨 自定义主题

您可以在`app/layout.jsx`中自定义网站的布局、颜色和其他样式。Nextra提供了灵活的主题配置选项。

## 📄 许可证

MIT License © 2025 AStockLog

## 🤝 贡献

本项目为个人知识库，暂不接受外部贡献。

---

**更新日志**
- 2025-01-07: 重构代码结构，抽离重复逻辑为可复用组件
- 2025-01-07: 集成Pagefind搜索功能
- 2025-01-07: 优化项目结构和文档

如有任何问题或建议，欢迎随时记录在您的知识库中！