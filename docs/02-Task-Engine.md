# 02 - Task Engine 任务执行核心引擎

> AI 编程代理的大脑：理解意图 → 调用 LLM → 执行工具 → 循环迭代

## 1. 核心架构

### 主循环流程

```
┌────────────────────────────────────────────────────────────────────┐
│                         Task Loop                                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────┐    ┌───────────┐    ┌────────────┐    ┌───────────┐ │
│  │  User    │───▶│  Context  │───▶│    LLM     │───▶│   Parse   │ │
│  │  Input   │    │  Builder  │    │  (API)     │    │  Response │ │
│  └──────────┘    └───────────┘    └────────────┘    └───────────┘ │
│                                                                  │ │
│  ┌──────────┐    ┌────────────┐                                │ │
│  │  Execute │◀───│   Tool     │─────────────────────────────────┘ │
│  │  Action  │    │  Executor  │                                      │
│  └──────────┘    └────────────┘                                      │
│       │                                                                 │
│       ▼                                                                 │
│  ┌──────────┐                                                        │
│  │   Tool   │                                                        │
│  │ Result   │────────────────────────────────────────────────────────
│  └──────────┘    (返回步骤 2, 循环直到完成)
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 核心文件结构

```
src/core/task/
├── index.ts              # 主入口，任务循环 (3755 行)
├── TaskState.ts          # 任务状态管理
├── ToolExecutor.ts       # 工具执行器
├── StreamResponseHandler.ts  # 流式响应处理
├── message-state.ts      # 消息状态机
├── focus-chain/         # 任务规划和焦点链
├── tools/               # 工具系统
│   ├── ToolExecutorCoordinator.ts   # 工具调度协调
│   ├── handlers/        # 24 种工具处理器
│   │   ├── WriteToFileToolHandler.ts
│   │   ├── ReadFileToolHandler.ts
│   │   ├── ExecuteCommandToolHandler.ts
│   │   ├── BrowserToolHandler.ts
│   │   └── ...
```

## 2. 主任务循环代码

```typescript
// src/core/task/index.ts (简化版)
export class Task {
  async run(): Promise<void> {
    while (!this.isComplete()) {
      // 1. 构建上下文
      const context = await this.contextManager.build()
      
      // 2. 调用 LLM
      const stream = await this.apiHandler.createMessage(
        context.systemPrompt,
        context.messages,
        context.tools
      )

      // 3. 解析响应
      for await (const chunk of stream) {
        const parsed = this.parseChunk(chunk)
        
        if (parsed.type === "text") {
          // 累积文本响应
          this.accumulateText(parsed.content)
        } else if (parsed.type === "tool_use") {
          // 4. 执行工具
          const result = await this.toolExecutor.execute(
            parsed.name,
            parsed.params
          )
          
          // 5. 将工具结果加入消息历史
          this.addToolResult(parsed.name, result)
        } else if (parsed.type === "reasoning") {
          // 处理推理过程
          this.updateReasoning(parsed.reasoning)
        }
      }
      
      // 6. 检查是否完成
      await this.checkCompletion()
    }
  }
}
```

## 3. 消息状态机

```typescript
// src/core/task/message-state.ts
export interface MessageState {
  mode: "plan" | "act"           // 规划模式 / 执行模式
  phase: "thinking" | "acting" | "waiting"  // 当前阶段
  lastToolUse: string | null      // 上次使用的工具
  toolCallCount: number           // 工具调用次数
}

export class MessageStateHandler {
  private state: MessageState
  
  // 状态转换
  onToolUse(toolName: string) {
    this.state.lastToolUse = toolName
    this.state.toolCallCount++
    this.state.phase = "acting"
    
    // 检查是否需要用户确认
    if (this.needsApproval(toolName)) {
      this.state.phase = "waiting"
      this.requestApproval(toolName)
    }
  }
  
  onToolResult(result: ToolResult) {
    if (result.success) {
      this.state.phase = "thinking"
    } else {
      // 工具执行失败，可能需要重试或放弃
      this.handleFailure(result)
    }
  }
}
```

## 4. 工具执行协调器

```typescript
// src/core/task/tools/ToolExecutorCoordinator.ts
export class ToolExecutorCoordinator {
  private handlers: Map<string, ToolHandler>
  
  constructor() {
    this.registerDefaultHandlers()
  }
  
  private registerDefaultHandlers() {
    this.handlers.set("read_file", new ReadFileToolHandler())
    this.handlers.set("write_to_file", new WriteToFileToolHandler())
    this.handlers.set("execute_command", new ExecuteCommandToolHandler())
    this.handlers.set("browser_action", new BrowserToolHandler())
    this.handlers.set("search_files", new SearchFilesToolHandler())
    // ... 24 种内置工具
  }
  
  async execute(toolName: string, params: Record<string, any>): Promise<ToolResult> {
    const handler = this.handlers.get(toolName)
    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}`)
    }
    
    // 验证参数
    this.validateParams(handler.schema, params)
    
    // 执行前钩子
    await this.runPreHooks(toolName, params)
    
    // 执行工具
    const result = await handler.execute(params)
    
    // 执行后钩子
    await this.runPostHooks(toolName, result)
    
    return result
  }
}
```

## 5. Plan Mode vs Act Mode

Cline 使用双模式设计：

### Plan Mode (规划模式)
```typescript
// 任务规划阶段
{
  mode: "plan",
  // LLM 仅思考和规划，不执行实际操作
  // 生成的任务列表存储在 focus-chain
}
```

### Act Mode (执行模式)
```typescript
// 实际执行阶段
{
  mode: "act",
  // 执行 Plan 阶段制定的任务
  // 可以使用全部工具
}
```

### 模式切换
```typescript
// Plan Mode 响应处理器
// src/core/task/tools/handlers/PlanModeRespondHandler.ts
export class PlanModeRespondHandler {
  handle(response: LLMResponse): PlanResult {
    // 解析 LLM 的规划输出
    const tasks = this.parsePlanTasks(response.content)
    
    // 存储到 focus-chain
    this.focusChain.setTasks(tasks)
    
    // 切换到 Act Mode
    this.task.setMode("act")
    this.task.executeTask(tasks[0])
  }
}
```

## 6. 示例：完整任务执行流程

```typescript
// examples/task-execution.ts
import { Task } from "@core/task"
import { ApiConfiguration } from "@shared/api"

// 1. 初始化任务
const task = new Task({
  controller: controller,
  mcpHub: mcpHub,
  cwd: process.cwd(),
  apiConfig: {
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    apiModelId: "claude-3-opus-20240229",
  }
})

// 2. 启动任务
task.start("帮我创建一个 hello-world.py 文件")

// 3. 内部流程
// [User] "帮我创建一个 hello-world.py 文件"
//   ↓
// [Context] 加载项目规则、文件上下文、历史记录
//   ↓
// [LLM] "我将创建一个 Python 文件..." (thinking)
//   ↓
// [LLM] tool_use: write_to_file { path: "hello.py", content: "..." }
//   ↓
// [Tool Executor] 执行写入操作
//   ↓
// [Tool Result] { success: true, content: "File created successfully" }
//   ↓
// [LLM] "文件已创建完成！\n\n这是一个简单的 Hello World 程序..."
//   ↓
// [Task Complete]
```

## 7. 关键设计模式

| 模式 | 应用场景 |
|------|----------|
| **状态机** | 任务阶段管理 (plan/act, thinking/acting/waiting) |
| **责任链** | 工具执行前后的钩子处理 |
| **观察者** | 任务状态变更通知 UI |
| **策略** | 不同工具使用不同的执行策略 |
| **迭代器** | 流式响应逐块处理 |

## 8. 错误处理与恢复

```typescript
// 自动重试机制
async function executeWithRetry(
  toolName: string,
  params: any,
  maxRetries: number = 3
): Promise<ToolResult> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.coordinator.execute(toolName, params)
    } catch (error) {
      lastError = error
      console.warn(`Attempt ${attempt} failed: ${error.message}`)
      
      // 根据错误类型决定是否重试
      if (!isRetryable(error)) {
        throw error
      }
      
      // 指数退避
      await sleep(Math.pow(2, attempt) * 1000)
    }
  }
  
  throw lastError
}
```

---

*下一章: [03-Tools-System.md](./03-Tools-System.md) - 工具系统与处理器*