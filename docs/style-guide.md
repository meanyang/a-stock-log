# AStockLog 样式说明与设计 Token 规范

## 设计 Token
- 颜色（暗/明主题）
  - 变量：`--color-bg`、`--color-text`、`--color-muted`、`--color-primary`、`--color-secondary`、`--color-border`
  - 明亮：`#ffffff`、`#0a0a0a`、`#6b7280`、`#0070f3`、`#3b82f6`、`#e5e7eb`
  - 暗色：`#0b0f16`、`#f3f4f6`、`#9ca3af`、`#3b82f6`、`#60a5fa`、`#1f2937`
- 间距（8px 网格）
  - `--space-1: 8px`、`--space-2: 16px`、`--space-3: 24px`、`--space-4: 32px`、`--space-5: 40px`
- 圆角
  - `--radius-sm: 8px`、`--radius-lg: 16px`
- 排版
  - 字体族：`--font-sans`（系统无衬线）、`--font-mono`（等宽）
  - 正文行高与字色由主题控制，标题层级遵循 h1→h2→h3 递进
- 容器
  - `--container-max: 1200px`

## 文件与组织
- 全局 Token：`app/globals.css` 中的 `:root` 与 `[data-theme='dark']`
- 首页模块化样式：CSS Modules（示例：`HomeHero.module.css`、`LatestPosts.module.css`）
- 站点布局：`app/(site)/layout.jsx`（包含跳过链接与 `main#main-content`）
- 异步状态：`app/(site)/loading.jsx`、`app/(site)/error.jsx`

## 响应式断点
- 移动端：≤767px（单列）
- 平板端：768px–1023px（双列，内容权重更高）
- 桌面端：≥1024px（双列，更紧凑的间距）
- 在 CSS Modules 中通过 `@media (min-width: 768px)` 与 `@media (min-width: 1024px)` 实现

## 无障碍（WCAG 2.1 AA）
- 键盘导航：全局启用 `:focus-visible` 外描边，颜色使用 `--color-primary`
- 跳过链接：`<a href="#main-content" class="skipLink">`，仅焦点可见
- 语义结构：各区块使用 `section[aria-labelledby]` 与有序标题层级
- 图像：`next/image`，提供有意义的 `alt` 文本；纯装饰图像使用空 `alt`
- 颜色对比：正文与背景对比度至少 4.5:1；交互元素处于焦点时增强可见性

## 组件使用规范
- 首页 Hero：`HomeHero.jsx` + `HomeHero.module.css`
  - 文案与按钮使用设计 Token（颜色、间距、圆角）
  - 图片使用 `next/image`，配置 `sizes` 与 `priority`
- 最新文章：`LatestPosts.jsx` + `LatestPosts.module.css`
  - 区块使用 `section` + `aria-labelledby`
  - 只做布局与间距控制，卡片由主题组件 `PostCard` 提供
- 预测组件：`StockPredictorLoader.jsx` 动态加载，减少首屏体积

## 规范与实践
- 样式优先使用 CSS Modules；页面级全局样式仅用于 Token 与通用规则
- 间距统一以 8px 网格为基准，保持节奏一致
- 不在组件内写内联样式；如需局部样式，使用 CSS Modules 或 styled-jsx
- 图片统一使用 `next/image`，本地资源路径在 `public/` 下

## 示例引用
- 首页 Hero：[HomeHero.jsx](file:///Users/zhaodanlu/work/a-stock-log/app/components/HomeHero.jsx) 与 [HomeHero.module.css](file:///Users/zhaodanlu/work/a-stock-log/app/components/HomeHero.module.css)
- 最新文章：[LatestPosts.jsx](file:///Users/zhaodanlu/work/a-stock-log/app/components/LatestPosts.jsx) 与 [LatestPosts.module.css](file:///Users/zhaodanlu/work/a-stock-log/app/components/LatestPosts.module.css)
- 布局跳过链接：[layout.jsx](file:///Users/zhaodanlu/work/a-stock-log/app/(site)/layout.jsx) 与 [layout.module.css](file:///Users/zhaodanlu/work/a-stock-log/app/(site)/layout.module.css)
- 异步状态：[loading.jsx](file:///Users/zhaodanlu/work/a-stock-log/app/(site)/loading.jsx) 与 [error.jsx](file:///Users/zhaodanlu/work/a-stock-log/app/(site)/error.jsx)
