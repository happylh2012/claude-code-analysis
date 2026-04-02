# Claude Code / Cline 源码拆解分析

基于 Cline 开源项目（Claude Code 的开源替代实现）的深度源码分析。

## 🎯 项目目标

将 Cline 的核心功能模块拆解为教学级文档，每个功能都包含：
- ✅ 功能描述与设计原理
- ✅ 核心代码路径
- ✅ 简化示例代码
- ✅ 数据流图示

## 📁 模块索引

| 模块 | 描述 | 路径 |
|------|------|------|
| [01-API-Provider](./docs/01-API-Provider.md) | LLM 提供商集成层 | `src/core/api/providers/` |
| [02-Task-Engine](./docs/02-Task-Engine.md) | 任务执行核心引擎 | `src/core/task/index.ts` |
| [03-Tools-System](./docs/03-Tools-System.md) | 工具系统与处理器 | `src/core/task/tools/` |
| [04-Context-Manager](./docs/04-Context-Manager.md) | 上下文管理 | `src/core/context/` |
| [05-MCP-Integration](./docs/05-MCP-Integration.md) | Model Context Protocol | `src/services/mcp/` |
| [06-Browser-Control](./docs/06-Browser-Control.md) | 浏览器自动化 | `src/services/browser/` |

## 🔧 快速开始

```bash
# 克隆示例项目
git clone https://github.com/your-username/claude-code-analysis.git
cd claude-code-analysis

# 运行示例
npm install
npm run example:tools
```

## 📊 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Task Execution                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ API Handler  │─▶│  Tool Call   │─▶│  Tool Executor   │  │
│  │   (LLM)      │  │   Parsing    │  │    (24 tools)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                                   │               │
│         │           ┌───────────────────────┘               │
│         │           │                                       │
│         ▼           ▼                                       │
│  ┌─────────────────────────────────────┐                   │
│  │          Context Manager            │                   │
│  │  (File tracking, Rules, History)   │                   │
│  └─────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Hub                                │
│  (External tools, Browser, Terminal, Code execution)        │
└─────────────────────────────────────────────────────────────┘
```

## 📝 技术栈

- **语言**: TypeScript
- **运行环境**: Node.js / Bun
- **核心依赖**:
  - @anthropic-ai/sdk (Claude API)
  - @anthropic-ai/model-context-protocol (MCP)
  - Playwright (Browser control)
  - Tree-sitter (Code parsing)

## 🔍 源码参考

原始项目:
- [Cline VS Code Extension](https://github.com/cline/cline) - 开源实现
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview) - 闭源产品

---

*Made with ❤️ for learning AI agent architecture*
