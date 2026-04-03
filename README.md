# Claude Code / Cline 源码拆解分析

基于 Cline 开源项目（Claude Code 的开源替代实现）的深度源码分析。

## 🎯 项目目标

将 Cline 的核心功能模块拆解为教学级文档，每个功能都包含：
- ✅ 功能描述与设计原理
- ✅ 核心代码路径
- ✅ 简化示例代码
- ✅ 数据流图示

## 📁 模块索引

| 模块 | 描述 | 路径 | 行数 |
|------|------|------|------|
| [01-API-Provider](./docs/01-API-Provider.md) | LLM 提供商集成层 | `src/core/api/providers/` | 256 |
| [02-Task-Engine](./docs/02-Task-Engine.md) | 任务执行核心引擎 | `src/core/task/index.ts` | 306 |
| [03-Tools-System](./docs/03-Tools-System.md) | 工具系统与处理器 | `src/core/task/tools/` | 371 |
| [04-Context-Manager](./docs/04-Context-Manager.md) | 上下文管理 | `src/core/context/` | 326 |
| [05-MCP-Integration](./docs/05-MCP-Integration.md) | Model Context Protocol | `src/services/mcp/` | 303 |
| [06-Browser-Control](./docs/06-Browser-Control.md) | 浏览器自动化 | `src/services/browser/` | 448 |
| [07-Function-Call-Chain](./docs/07-Function-Call-Chain.md) | 完整函数调用链实例 | 全流程追踪 | 400+ |
| [08-Tool-Handlers-Deep-Dive](./docs/08-Tool-Handlers-Deep-Dive.md) | 24 种工具深度解析 | handlers/ | 500+ |

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/your-username/claude-code-analysis.git
cd claude-code-analysis

# 安装依赖
npm install

# 运行示例
npm run example:api      # API Provider 示例
npm run example:tools    # 工具系统示例
npm run example:task     # 任务引擎示例
npm run example:browser  # 浏览器控制示例
npm run example:mcp      # MCP 集成示例

# 查看文档
npm run docs:serve
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
│  │   (40+ LLMs) │  │   Parsing    │  │    (24 tools)    │  │
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

## 📁 项目结构

```
claude-code-analysis/
├── README.md              # 项目索引
├── LICENSE                # MIT 许可证
├── package.json           # npm 配置
├── tsconfig.json          # TypeScript 配置
├── SPEC.md                # 规格说明
│
├── docs/                  # 核心模块文档 (8 篇，总计 3000+ 行)
│   ├── 01-API-Provider.md          # API Provider 层 (40+ LLM)
│   ├── 02-Task-Engine.md           # 任务执行核心引擎 (Plan/Act)
│   ├── 03-Tools-System.md          # 工具系统 (24 种工具)
│   ├── 04-Context-Manager.md       # 上下文管理 (Token/规则)
│   ├── 05-MCP-Integration.md       # MCP 集成 (外部工具扩展)
│   ├── 06-Browser-Control.md       # 浏览器自动化 (Playwright)
│   ├── 07-Function-Call-Chain.md   # 完整调用链实例 (数据流)
│   └── 08-Tool-Handlers-Deep-Dive.md # 工具处理器深度解析
│
└── examples/              # 运行示例 (5 个 TypeScript 示例)
    ├── api-usage.ts          # API 使用示例
    ├── tools-usage.ts        # 工具系统示例
    ├── task-execution.ts     # 任务执行示例
    ├── browser-usage.ts      # 浏览器控制示例
    └── mcp-usage.ts          # MCP 集成示例
```

## 🔍 源码参考

- **Cline (VS Code)**: https://github.com/cline/cline - 开源实现，约 76,500 行核心代码
- **Claude Code (官方)**: https://docs.anthropic.com/en/docs/claude-code/overview - 闭源产品

## 📝 主要功能模块

### 1. API Provider 层 (40+ LLM)
- Anthropic, OpenAI, Google Gemini, DeepSeek, 豆包, 通义等
- 统一接口，流式响应
- 工厂模式动态创建

### 2. Task Engine 任务引擎
- Plan/Act 双模式
- 消息状态机
- 工具调度协调

### 3. Tools System (24 种工具)
- 文件操作: read_file, write_to_file, replace_in_file
- 命令执行: execute_command
- 搜索: search_files, list_files, list_code_definition_names
- 浏览器: browser_action
- 外部: use_mcp_tool, access_mcp_resource

### 4. Context Manager
- 文件上下文追踪
- 用户规则 (.cline/rules)
- Token 预算管理

### 5. MCP Integration
- Stdio/SSE/Streamable-HTTP 传输
- 工具和资源注册
- OAuth 认证

### 6. Browser Control
- Playwright 驱动
- 坐标点击/输入/滚动/截图

## 📜 学习路径

1. **入门**: 阅读 [01-API-Provider.md](docs/01-API-Provider.md) 理解 LLM 调用
2. **核心**: 阅读 [02-Task-Engine.md](docs/02-Task-Engine.md) 理解任务循环
3. **实践**: 运行 `npm run example:task` 体验完整流程
4. **扩展**: 阅读 [05-MCP-Integration.md](docs/05-MCP-Integration.md) 了解工具扩展

---

MIT License - Created for learning AI agent architecture