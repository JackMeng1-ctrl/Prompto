# Prompto

[English](README.md) | 中文

Prompto 是一个 Chrome 扩展（Manifest V3），帮你把模糊的想法变成清晰、具体的 LLM 提示词。它会先问你几个澄清问题，弄清楚你想要什么，然后生成几个优化后的提示词，供你对比和复制。

> **关于这个仓库。** Prompto 是 2025 年秋季的一个五人团队项目。这是我的个人副本：以团队最终版本为基础，加上我之后做的修复。详见[团队与分工](#团队与分工)。

## 功能

- **先澄清，再优化。** 输入提示词，回答 GPT-4o 生成的澄清问题，就能得到多个优化后的提示词，按标签页展示，每个都有复制按钮。
- **文档作为上下文。** 可以附加 PDF、Word（DOC/DOCX）或 TXT 文件，和提示词一起发送给模型（最大 20 MB）。
- **数据集模式（OPRO 方式）。** 上传 CSV 或 TSV，选择输入列和输出列，Prompto 会迭代生成候选提示词，并用你数据里的样本给每个候选打分。
- **每次调用都要你确认。** 发送给模型之前，Prompto 会展示完整的系统提示词和用户提示词，你点 Accept 后才会发送。
- **弹窗和侧边栏都能用。** 同一套流程既能在工具栏弹窗里用，也能在 Chrome 侧边栏里用。在设置页添加网站（比如 `chatgpt.com`）后，这些网站上会出现 "Open Prompto" 按钮，点击即可打开侧边栏。
- **关掉也不丢进度。** 当前步骤和你填写的答案保存在 `chrome.storage.local` 里，重新打开时自动恢复。

## 快速开始

环境要求：Node.js 18 或更高版本，Chrome 116 或更高版本。

```bash
npm install
npm run build
```

1. 打开 `chrome://extensions`，打开 **开发者模式**，点 **加载已解压的扩展程序**，选择 `dist` 文件夹。
2. 打开扩展的 **选项** 页面，填入你的 OpenAI API Key。这里还可以设置澄清问题和优化提示词的数量，以及要显示侧边栏按钮的网站。
3. 点击工具栏上的 Prompto 图标开始使用。

## 开发

```bash
npm run dev       # Vite 开发服务器，支持热更新（同样加载 dist/）
npm test          # Vitest 监听模式
npx vitest run    # 只运行一次测试
npm run coverage  # 生成测试覆盖率报告
```

## 工作原理

```
弹窗和侧边栏（React，HashRouter）
  /                 InputPromptPage          输入提示词，可选附件、可选数据集
  /clarifying       ClarifyingQuestionsPage  回答生成的澄清问题
  /dataset-config   DatasetConfigPage        选择数据列，运行 OPRO 迭代
  /refined          RefinedPromptPage        对比并复制结果

services/Llm.jsx    所有 OpenAI 调用（Responses API，gpt-4o，只返回 JSON）
background/         service worker：在指定网站上启用并打开侧边栏
content/autoOpen.js 在指定网站上插入 "Open Prompto" 按钮
options/            API Key、数量设置和网站列表（chrome.storage.sync）
```

## 目录结构

```
src/
  background/index.js        侧边栏相关的 service worker
  content/autoOpen.js        页面上的 "Open Prompto" 按钮
  options/                   设置页
  popup/
    pages/                   流程中每一步对应一个组件
    hooks/                   usePopupState、useDatasetState（持久化状态）
    utils/                   数据集解析、OPRO 提示词构建、输入校验
    components/              Loading、Notification
  sidepanel/                 同样的页面、hooks 和工具函数，显示在侧边栏里
  services/Llm.jsx           OpenAI 客户端、附件处理、返回结果解析
test/                        Vitest + Testing Library 测试
manifest.config.js           扩展清单（CRXJS）
```

## 安全与隐私

- OpenAI API Key 保存在 `chrome.storage.sync` 里，请求直接从浏览器发到 OpenAI（`dangerouslyAllowBrowser`）。个人使用没问题；如果要公开发布，应该通过一个小型后端转发请求，让 Key 不出现在浏览器里。
- 在你点 Accept 之前，Prompto 不会发送任何内容。
- content script 会在所有页面上运行，但只在你添加的网站上显示按钮。

## 已知限制

- 附件只保存在内存里，如果在完成流程之前关掉 Prompto，需要重新上传。
- 模型的返回结果按 JSON 解析；如果模型返回了别的内容，Prompto 会显示错误，你可以重试。
- 侧边栏有一套自己的页面、hooks 和工具函数副本，改一处需要两边同时改。

## 团队与分工

由五人团队在 2025 年秋季开发。

**我在团队版本中负责的部分（孟庆鑫）：**

- PDF、DOC/DOCX、TXT 文档上传，作为上下文发送给 OpenAI Responses API，以及移除按钮
- 在用户指定网站上打开侧边栏的 "Open Prompto" 按钮（content script + 后台 service worker）
- 提示词输入和设置页的客户端校验
- 侧边栏界面修复和扩展图标

**之后在这个副本里做的改动：**

- 附件不再写入 `chrome.storage`（File 对象会变成 `{}`，导致重新打开后提交会静默失败）
- API Key 错误、限流、断网时显示明确的错误提示，不再没有任何反应
- 文件大小限制、Word 文件使用正确的 MIME 类型、TXT 文件直接作为文本发送
- 生成最终提示词时也会带上附件
- 侧边栏能稳定打开（在点击时直接调用 `sidePanel.open()`，而不是等异步读取存储之后）
- 设置页：API Key 去除首尾空格并隐藏显示、滑块标签与实际值一致、网站输入错误时在页面内提示
- 更新并补充测试：从 10 个通过 7 个，到 29 个全部通过
