# Claude Code / Cline 源码拆解分析

基于 Cline 开源项目（Claude Code 的开源替代实现），进行核心功能模块的深度拆解。

## 项目目标

像 "hello agent" 那样，每个功能都有独立示例和详细解释，最终输出完整的教学级文档并发布到 GitHub。

## 核心模块拆解计划

### 1. API Provider 层 (`src/core/api/providers/`)
- 40+ 种 LLM 提供商集成
- 统一接口设计
- 支持本地/远程模型

### 2. 任务执行引擎 (`src/core/task/`)
- 核心循环：接收请求 → 调用 LLM → 解析响应 → 执行工具
- 工具调度器 (ToolExecutor)
- 工具处理器 (Handlers)

### 3. 工具系统 (`src/core/task/tools/`)
- 24 种内置工具处理器
- 文件读写、命令执行、搜索、浏览器控制等

### 4. 上下文管理 (`src/core/context/`)
- 文件上下文追踪
- 环境上下文
- 规则和指令管理

### 5. MCP 集成 (`src/services/mcp/`)
- Model Context Protocol 支持
- 外部工具扩展

### 6. 浏览器控制 (`src/services/browser/`)
- 自动化网页操作
- 元素交互和截图

## 输出格式

每个功能模块包含：
- 功能描述
- 核心代码路径
- 简化示例
- 数据流图
