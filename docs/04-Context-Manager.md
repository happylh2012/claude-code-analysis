# 04 - Context Manager 上下文管理

> 智能管理项目上下文、文件追踪、用户规则和历史记录

## 1. 上下文管理器架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Context Manager                            │
├──────────────────┬──────────────────┬───────────────────────────┤
│ Context Tracking │ Instructions Mgr │ Context Window Mgmt       │
├──────────────────┼──────────────────┼───────────────────────────┤
│ File Context     │ User Rules       │ Token Budgeting           │
│ Model Context    │ External Rules   │ Summarization             │
│ Environment Ctx  │ Workflows        │ Checkpoint/Restore        │
└──────────────────┴──────────────────┴───────────────────────────┘
```

## 2. 文件上下文追踪

```typescript
// src/core/context/context-tracking/FileContextTracker.ts
export class FileContextTracker {
  private files: Map<string, FileContext> = new Map()
  
  trackFile(path: string, operation: 'read' | 'write' | 'edit'): void {
    const existing = this.files.get(path)
    
    this.files.set(path, {
      path,
      lastOperation: operation,
      lastAccessTime: Date.now(),
      readCount: operation === 'read' ? (existing?.readCount || 0) + 1 : existing?.readCount || 0,
      writeCount: operation !== 'read' ? (existing?.writeCount || 0) + 1 : existing?.writeCount || 0,
    })
  }
  
  getContextualFiles(): string[] {
    // 按访问时间排序，优先返回最近访问的文件
    return Array.from(this.files.values())
      .sort((a, b) => b.lastAccessTime - a.lastAccessTime)
      .slice(0, 10)
      .map(f => f.path)
  }
  
  hasFileChanged(path: string, since: number): boolean {
    const file = this.files.get(path)
    return file ? file.lastAccessTime > since : false
  }
}

interface FileContext {
  path: string
  lastOperation: 'read' | 'write' | 'edit'
  lastAccessTime: number
  readCount: number
  writeCount: number
}
```

## 3. 环境上下文

```typescript
// src/core/context/context-tracking/EnvironmentContextTracker.ts
export class EnvironmentContextTracker {
  private context: EnvironmentContext
  
  capture(): EnvironmentContext {
    return {
      cwd: process.cwd(),
      env: this.getRelevantEnv(),
      gitBranch: this.getCurrentBranch(),
      openFiles: this.getOpenFiles(),
      terminalState: this.getTerminalState(),
      timestamp: Date.now()
    }
  }
  
  private getRelevantEnv(): Record<string, string> {
    // 只保留相关的环境变量
    const relevant = ['HOME', 'USER', 'PATH', 'NODE_ENV', 'EDITOR']
    const env: Record<string, string> = {}
    
    for (const key of relevant) {
      if (process.env[key]) {
        env[key] = process.env[key]!
      }
    }
    return env
  }
  
  getContextDiff(oldContext: EnvironmentContext): string {
    const newContext = this.capture()
    const changes: string[] = []
    
    if (oldContext.cwd !== newContext.cwd) {
      changes.push(`Working directory changed: ${oldContext.cwd} → ${newContext.cwd}`)
    }
    
    if (oldContext.gitBranch !== newContext.gitBranch) {
      changes.push(`Git branch changed: ${oldContext.gitBranch} → ${newContext.gitBranch}`)
    }
    
    return changes.join('\n')
  }
}
```

## 4. 用户规则管理

```typescript
// src/core/context/instructions/user-instructions/cline-rules.ts
export async function getGlobalClineRules(): Promise<string> {
  const globalRulesPath = path.join(os.homedir(), '.cline', 'rules')
  
  try {
    const content = await fs.readFile(globalRulesPath, 'utf-8')
    return content
  } catch {
    return ''
  }
}

export async function getLocalClineRules(cwd: string): Promise<string> {
  const localRulesPath = path.join(cwd, '.cline', 'rules')
  
  try {
    const content = await fs.readFile(localRulesPath, 'utf-8')
    return content
  } catch {
    return ''
  }
}

// 规则上下文构建器
export class RuleContextBuilder {
  async build(cwd: string): Promise<string> {
    const parts: string[] = []
    
    // 1. 全局规则
    const globalRules = await getGlobalClineRules()
    if (globalRules) {
      parts.push('# Global Rules', globalRules)
    }
    
    // 2. 本地项目规则
    const localRules = await getLocalClineRules(cwd)
    if (localRules) {
      parts.push('# Project Rules', localRules)
    }
    
    // 3. 外部规则 (Cursor, Windsurf, etc.)
    const externalRules = await this.getExternalRules(cwd)
    if (externalRules) {
      parts.push('# External Rules', externalRules)
    }
    
    return parts.join('\n\n')
  }
}
```

## 5. 上下文窗口管理

```typescript
// src/core/context/context-management/ContextManager.ts
export class ContextManager {
  private maxTokens: number
  private tokenUsage: TokenUsageTracker
  
  constructor(maxTokens: number = 200000) {
    this.maxTokens = maxTokens
    this.tokenUsage = new TokenUsageTracker()
  }
  
  async buildContext(params: BuildContextParams): Promise<Context> {
    const context: Context = {
      systemPrompt: '',
      messages: [],
      tools: []
    }
    
    // 1. 构建系统提示词
    context.systemPrompt = await this.buildSystemPrompt(params)
    
    // 2. 添加历史消息
    const historyMessages = await this.getHistoryMessages()
    context.messages.push(...historyMessages)
    
    // 3. 添加文件上下文
    const fileContext = await this.buildFileContext(params.relevantFiles)
    if (fileContext) {
      context.messages.push({
        role: 'user',
        content: `Here are some relevant files for context:\n${fileContext}`
      })
    }
    
    // 4. 添加用户输入
    context.messages.push({
      role: 'user',
      content: params.userInput
    })
    
    // 5. 添加可用工具
    context.tools = await this.buildToolsList(params)
    
    // 6. 检查上下文窗口
    const estimatedTokens = this.estimateTokens(context)
    if (estimatedTokens > this.maxTokens * 0.8) {
      // 触发压缩
      await this.condenseContext(context)
    }
    
    return context
  }
  
  async condenseContext(context: Context): Promise<void> {
    // 找到可以压缩的消息
    const compressible = context.messages.filter(m => 
      m.role === 'assistant' && m.tool_calls
    )
    
    // 生成摘要
    const summary = await this.summarizeToolResults(compressible)
    
    // 替换原始消息
    context.messages = [
      ...context.messages.filter(m => !compressible.includes(m)),
      { role: 'user', content: `Previous execution summary: ${summary}` }
    ]
  }
}

// Token 使用追踪
class TokenUsageTracker {
  private totalInput: number = 0
  private totalOutput: number = 0
  private history: TokenUsageEntry[] = []
  
  record(usage: TokenUsage) {
    this.totalInput += usage.inputTokens
    this.totalOutput += usage.outputTokens
    this.history.push({
      timestamp: Date.now(),
      ...usage
    })
  }
  
  estimateRemaining(maxTokens: number): number {
    const used = this.totalInput + this.totalOutput
    return maxTokens - used
  }
}
```

## 6. 系统提示词构建

```typescript
// src/core/prompts/system-prompt.ts
export async function getSystemPrompt(context: SystemPromptContext): Promise<string> {
  const parts: string[] = []
  
  // 1. 基础角色定义
  parts.push(`You are Claude Code, an AI coding assistant specialized in software development.
You help users write, edit, and understand code.
You have access to the following capabilities:
- Read and write files
- Execute terminal commands
- Search code
- Use web browser
- Use external tools via MCP
`)
  
  // 2. 当前环境
  parts.push(`Current Environment:
- Working Directory: ${context.cwd}
- OS: ${context.os}
- Shell: ${context.shell}
`)
  
  // 3. 用户规则
  if (context.rules) {
    parts.push(`User Rules:\n${context.rules}`)
  }
  
  // 4. 工具使用指南
  parts.push(`Tool Usage:
- Use read_file to understand existing code before editing
- Use execute_command sparingly and always with requires_approval for dangerous commands
- Use search_files when you need to find specific patterns
`)
  
  return parts.join('\n\n')
}
```

## 7. 示例：完整上下文构建

```typescript
// examples/context-usage.ts
import { ContextManager } from "@core/context"

async function buildContextExample() {
  const manager = new ContextManager({ maxTokens: 200000 })
  
  const context = await manager.buildContext({
    cwd: '/home/user/project',
    userInput: '帮我修复这个 bug',
    relevantFiles: ['src/main.ts', 'src/utils.ts'],
    includeHistory: true
  })
  
  console.log('System Prompt:', context.systemPrompt.substring(0, 500))
  console.log('Message count:', context.messages.length)
  console.log('Tools available:', context.tools.map(t => t.name))
  
  // 示例输出:
  // System Prompt: You are Claude Code...
  // Message count: 5
  // Tools available: ['read_file', 'write_to_file', 'execute_command', ...]
}
```

---

*下一章: [05-MCP-Integration.md](./05-MCP-Integration.md) - Model Context Protocol 集成*