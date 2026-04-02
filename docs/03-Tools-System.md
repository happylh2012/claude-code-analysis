# 03 - Tools System 工具系统与处理器

> 24 种内置工具：文件读写、命令执行、浏览器控制、搜索等

## 1. 工具分类总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tool System                              │
├─────────────┬─────────────┬─────────────┬─────────────────────┤
│   文件操作   │   命令执行   │   搜索查询   │   浏览器/外部       │
├─────────────┼─────────────┼─────────────┼─────────────────────┤
│ read_file   │execute_     │search_      │ browser_action      │
│ write_to_   │ command     │ files       │ web_fetch           │
│ file        │             │ list_files  │ web_search          │
│ replace_in_ │             │ list_code_  │ use_mcp_tool        │
│ file        │             │ definition  │ access_mcp_        │
│             │             │             │ resource            │
├─────────────┴─────────────┴─────────────┴─────────────────────┤
│                    任务控制类                                   │
├─────────────────────────────────────────────────────────────────┤
│ ask_followup_question, attempt_completion, new_task,            │
│ plan_mode_respond, act_mode_respond, summarize_task,            │
│ report_bug, generate_explanation, use_skill, use_subagents      │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 工具定义格式

```typescript
// src/shared/tools.ts
export enum ClineDefaultTool {
  ASK = "ask_followup_question",
  ATTEMPT = "attempt_completion",
  BASH = "execute_command",
  FILE_EDIT = "replace_in_file",
  FILE_READ = "read_file",
  FILE_NEW = "write_to_file",
  SEARCH = "search_files",
  LIST_FILES = "list_files",
  LIST_CODE_DEF = "list_code_definition_names",
  BROWSER = "browser_action",
  MCP_USE = "use_mcp_tool",
  MCP_ACCESS = "access_mcp_resource",
  MCP_DOCS = "load_mcp_documentation",
  // ... more tools
}

// 工具的 JSON Schema 定义示例
const readFileTool = {
  name: "read_file",
  description: "读取文件内容",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "要读取的文件路径"
      },
      offset: {
        type: "integer",
        description: "起始行号",
        default: 1
      },
      limit: {
        type: "integer", 
        description: "读取行数",
        default: 1000
      }
    },
    required: ["path"]
  }
}
```

## 3. 工具处理器架构

```typescript
// 工具处理器接口
export interface ToolHandler {
  name: string
  description: string
  schema: JSONSchema
  
  // 处理工具调用
  handle(block: ToolUse, uiHelpers: UIHelpers): Promise<ToolResult>
  
  // 处理部分响应（流式输出时）
  handlePartialBlock?(block: ToolUse, uiHelpers: UIHelpers): Promise<void>
  
  // 验证参数
  validate?(params: Record<string, any>): ValidationResult
}

// 完整管理工具接口 (无需额外包装)
export interface IFullyManagedTool {
  name: ClineDefaultTool
  handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void>
  handle(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<ToolResponse>
}
```

### 处理器目录结构

```
src/core/task/tools/handlers/
├── WriteToFileToolHandler.ts      # 写文件 (create/edit)
├── ReadFileToolHandler.ts        # 读文件
├── ExecuteCommandToolHandler.ts  # 执行命令
├── SearchFilesToolHandler.ts     # 搜索文件内容
├── ListFilesToolHandler.ts       # 列出文件
├── ListCodeDefinitionNamesToolHandler.ts  # 列出代码定义
├── BrowserToolHandler.ts         # 浏览器控制
├── WebFetchToolHandler.ts        # 获取网页内容
├── WebSearchToolHandler.ts       # 搜索网页
├── UseMcpToolHandler.ts          # 使用 MCP 工具
├── AccessMcpResourceHandler.ts   # 访问 MCP 资源
├── ApplyPatchHandler.ts          # 应用补丁
├── UseSkillToolHandler.ts        # 使用 Skill
├── SubagentToolHandler.ts        # 子代理
├── GenerateExplanationToolHandler.ts  # 生成解释
├── AskFollowupQuestionToolHandler.ts  # 询问用户
├── AttemptCompletionHandler.ts  # 尝试完成
├── PlanModeRespondHandler.ts    # 规划模式响应
├── ActModeRespondHandler.ts      # 执行模式响应
├── SummarizeTaskHandler.ts      # 总结任务
├── ReportBugHandler.ts           # 报告 Bug
├── NewTaskHandler.ts            # 新建任务
├── CondenseHandler.ts           # 压缩上下文
└── LoadMcpDocumentationHandler.ts  # 加载 MCP 文档
```

## 4. 工具执行器协调器

```typescript
// src/core/task/tools/ToolExecutorCoordinator.ts
export class ToolExecutorCoordinator {
  private handlers: Map<ClineDefaultTool, IFullyManagedTool>
  private mcpTools: Map<string, MCPToolHandler> = new Map()
  
  constructor(
    private toolValidator: ToolValidator,
    private mcpHub: McpHub
  ) {
    this.registerBuiltinHandlers()
    this.registerMcpHandlers()
  }
  
  private registerBuiltinHandlers() {
    this.handlers.set(ClineDefaultTool.FILE_NEW, new WriteToFileToolHandler(this.toolValidator))
    this.handlers.set(ClineDefaultTool.FILE_READ, new ReadFileToolHandler(this.toolValidator))
    this.handlers.set(ClineDefaultTool.BASH, new ExecuteCommandToolHandler(this.toolValidator))
    // ... 24 种内置工具
  }
  
  async execute(toolUse: ToolUse): Promise<ToolResponse> {
    const handler = this.handlers.get(toolUse.name as ClineDefaultTool)
    
    if (!handler) {
      // 尝试 MCP 工具
      const mcpHandler = this.mcpTools.get(toolUse.name)
      if (mcpHandler) {
        return await mcpHandler.execute(toolUse.params)
      }
      throw new Error(`Unknown tool: ${toolUse.name}`)
    }
    
    // 验证参数
    await this.toolValidator.validate(toolUse.name, toolUse.params)
    
    // 执行前钩子
    await this.runPreExecutionHooks(toolUse)
    
    // 执行工具
    const result = await handler.handle(toolUse, this.uiHelpers)
    
    // 执行后钩子
    await this.runPostExecutionHooks(toolUse, result)
    
    return result
  }
}
```

## 5. 具体示例：写文件工具

```typescript
// src/core/task/tools/handlers/WriteToFileToolHandler.ts
export class WriteToFileToolHandler implements IFullyManagedTool {
  readonly name = ClineDefaultTool.FILE_NEW
  
  async handle(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<ToolResponse> {
    const { path, content, diff } = block.params
    
    // 1. 验证路径
    const absolutePath = resolveWorkspacePath(path)
    if (!await this.isValidPath(absolutePath)) {
      return { success: false, error: "Invalid path" }
    }
    
    // 2. 处理 diff 或 content
    let finalContent = content
    if (diff) {
      finalContent = this.applyDiffPatch(diff)
    }
    
    // 3. 创建/写入文件
    try {
      await fs.writeFile(absolutePath, finalContent, 'utf-8')
      
      return {
        success: true,
        content: `File ${path} created/updated successfully`,
        changes: this.calculateChanges(finalContent)
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error.message}`
      }
    }
  }
  
  // 处理流式响应的部分更新
  async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
    // 打开编辑器实时显示内容
    uiHelpers.openDiffView(block.params.path)
    uiHelpers.streamContent(block.params.content || block.params.diff)
  }
}
```

## 6. 具体示例：执行命令工具

```typescript
// src/core/task/tools/handlers/ExecuteCommandToolHandler.ts
export class ExecuteCommandToolHandler implements IFullyManagedTool {
  readonly name = ClineDefaultTool.BASH
  
  async handle(block: ToolUse, uiHelpers: StronglyManagedUIHelpers): Promise<ToolResponse> {
    const { command, requires_approval, timeout } = block.params
    
    // 1. 检查是否需要用户批准
    if (requires_approval === "true" || requires_approval === true) {
      const approved = await uiHelpers.requestApproval(`Execute: ${command}`)
      if (!approved) {
        return { success: false, error: "Command rejected by user" }
      }
    }
    
    // 2. 设置终端
    const terminal = uiHelpers.createTerminal()
    
    // 3. 执行命令
    try {
      const result = await terminal.execute(command, {
        cwd: uiHelpers.getConfig().cwd,
        timeout: timeout || 60000, // 默认 60 秒
        env: uiHelpers.getConfig().env
      })
      
      return {
        success: result.exitCode === 0,
        content: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode
      }
    } catch (error) {
      return {
        success: false,
        error: `Command failed: ${error.message}`
      }
    }
  }
}
```

## 7. 工具参数验证

```typescript
// src/core/task/tools/ToolValidator.ts
export class ToolValidator {
  private schemas: Map<ClineDefaultTool, JSONSchema> = new Map([
    [ClineDefaultTool.FILE_READ, {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 10000 }
      },
      required: ["path"]
    }],
    [ClineDefaultTool.BASH, {
      type: "object",
      properties: {
        command: { type: "string", minLength: 1 },
        timeout: { type: "integer", minimum: 1, maximum: 300000 },
        requires_approval: { type: "string", enum: ["true", "false"] }
      },
      required: ["command"]
    }],
    // ... 更多 schema
  ])
  
  async validate(toolName: ClineDefaultTool, params: Record<string, any>): Promise<ValidationResult> {
    const schema = this.schemas.get(toolName)
    if (!schema) {
      return { valid: false, error: `No schema for tool: ${toolName}` }
    }
    
    return this.validateAgainstSchema(params, schema)
  }
}
```

## 8. 工具权限与自动批准

```typescript
// src/core/task/tools/autoApprove.ts
export class AutoApproveController {
  private rules: AutoApproveRule[] = []
  
  async shouldAutoApprove(tool: ToolUse): Promise<boolean> {
    // 检查自动批准规则
    for (const rule of this.rules) {
      if (rule.matches(tool)) {
        return true
      }
    }
    
    // 检查是否是只读工具
    return READ_ONLY_TOOLS.includes(tool.name)
  }
}

// 只读工具列表（自动批准）
export const READ_ONLY_TOOLS = [
  ClineDefaultTool.LIST_FILES,
  ClineDefaultTool.FILE_READ,
  ClineDefaultTool.SEARCH,
  ClineDefaultTool.LIST_CODE_DEF,
  ClineDefaultTool.BROWSER,
  ClineDefaultTool.WEB_SEARCH,
  ClineDefaultTool.WEB_FETCH,
] as const
```

## 9. MCP 工具扩展

```typescript
// 使用外部 MCP 工具
{
  name: "use_mcp_tool",
  params: {
    server_name: "filesystem",
    tool_name: "read_file",
    arguments: { path: "/workspace/README.md" }
  }
}

// MCP 资源访问
{
  name: "access_mcp_resource",
  params: {
    uri: "file:///workspace/config.json"
  }
}
```

---

*下一章: [04-Context-Manager.md](./04-Context-Manager.md) - 上下文管理*