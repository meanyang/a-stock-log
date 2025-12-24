# AStockLog

一个基于Next.js和Nextra的个人股票投资知识管理与日志系统。

## 🌟 项目简介

AStockLog是一个用于记录和管理股票投资相关知识、策略和日志的个人知识库网站。它提供了清晰的内容组织方式，方便您随时查阅和更新您的投资理念与经验。

## 🛠️ 技术栈

- **Next.js 14** - 现代化的React框架
- **Nextra 4** - Next.js的静态站点生成器，支持MDX
- **React 18** - 用于构建用户界面的JavaScript库
- **MDX** - 结合Markdown和JSX的内容格式

## 📁 项目结构

```text
.
├── app/                      # Next.js App Router 目录
│   ├── [[...mdxPath]]/       # 动态路由，用于处理 MDX 内容
│   │   └── page.jsx          # 动态页面组件
│   └── layout.jsx            # 全局布局组件
├── content/                  # 内容目录
│   ├── dragon-tiger-list/    # 龙虎榜分析
│   ├── knowledge/            # 股票知识
│   ├── my-concepts/          # 概念解析
│   ├── my-strategies/        # 交易策略
│   └── index.mdx             # 首页内容
├── next.config.mjs           # Next.js 配置
├── mdx-components.js         # MDX 组件配置
├── package.json              # 项目依赖
└── README.md                 # 项目文档
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

网站内容使用MDX格式编写，存放在`content/`目录下：

- **my-strategies/** - 投资策略文档
- **my-concepts/** - 投资概念和理念
- **knowledge/** - 投资相关知识
- **week-log/** - 每周投资日志
- **dragon-tiger-list/** - 龙虎榜数据分析

每个目录下的`.mdx`或`.md`文件会自动被解析为网站页面，目录结构会反映在网站的导航栏中。

## 🎯 使用指南

### 添加新内容

1. 在`content/`目录下的相应分类中创建新的`.mdx`或`.md`文件
2. 使用Markdown或MDX语法编写内容
3. 保存文件，开发服务器会自动刷新

### 自定义导航

在每个目录下创建`_meta.json`文件可以自定义导航菜单：

```json
{
  "some-file": "显示名称",
  "some-folder": {
    "title": "文件夹显示名称",
    "position": 1
  }
}
```

## 🎨 自定义主题

您可以在`app/layout.jsx`中自定义网站的布局、颜色和其他样式。Nextra提供了灵活的主题配置选项。

## 📄 许可证

MIT License © 2025 AStockLog

## 🤝 贡献

本项目为个人知识库，暂不接受外部贡献。

---

如有任何问题或建议，欢迎随时记录在您的知识库中！