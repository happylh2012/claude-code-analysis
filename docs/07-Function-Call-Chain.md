# 07 - 完整函数调用链实例

> 从用户输入到工具执行的完整数据流

## 1. 完整调用链概览

```
用户输入
    │
    ▼
┌─────────────────┐
│ Task.start()    │  src/core/task/index.ts:3755
└───────┬─────────┘
        │
        ▼
┌──────────────────────────┐
│ 消息循环                 │
│ while (!isComplete) {    │
│   1. buildContext()      │
│   2. callLLM()           │
│   3. parseResponse()     │
│   4. executeTool()       │
│ }                        │
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│ ContextManager.build()   │
│ - systemPrompt           │
│ - message history        │
│ - file context           │
│ - available tools        │
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│ ApiHandler.createMessage │
│ - Anthropic/OpenAI/etc   │
│ - Streaming response     │
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│ AssistantMessageParser   │
│ - Text chunks            │
│ - Tool calls             │
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│ ToolExecutorCoordinator  │
│ - Route to handler       │
│ - Execute                │
│ - Return result          │
└──────────────────────────┘
```

## 2. 具体调用示例

### 示例 1: 读取文件请求

```typescript
// 用户输入: "帮我看一下 package.json 的内容"

// Step 1: Task.start() 启动
const task = new Task({
  controller: controller,
  mcpHub: mcpHub,
  cwd: process.cwd(),
  apiConfig: apiConfig
});

await task.start("帮我看一下 package.json 的内容");

// Step 2: 构建上下文
const context = await task.contextManager.build({
  userInput: "帮我看一下 package.json 的内容",
  relevantFiles: [], // 初始为空
  includeHistory: true
});

// 生成的 systemPrompt:
const systemPrompt = `
You are Claude Code, an AI coding assistant.

Current Environment:
- Working Directory: /home/user/project
- OS: Linux
- Shell: bash

Available Tools:
1. read_file - 读取文件内容
2. write_to_file - 写入文件
3. execute_command - 执行命令
...

User Rules:
- 使用 read_file 查看文件前先用 list_files 确认存在
`;

// Step 3: 调用 LLM
const stream = await apiHandler.createMessage(
  systemPrompt,
  [
    { role: "user", content: "帮我看一下 package.json 的内容" }
  ],
  [readFileTool, listFilesTool, ...]
);

// Step 4: 解析流式响应
for await (const chunk of stream) {
  if (chunk.type === "content_block_delta") {
    // 累积文本
    accumulatedText += chunk.delta.text;
  }
  if (chunk.type === "tool_use") {
    // 解析工具调用
    const toolCall = {
      name: chunk.name,
      params: chunk.input
    };
  }
}

// LLM 返回:
// 我会帮你查看 package.json 的内容

// <tool_use>
// <name>read_file</name>
// <input>{"path": "package.json"}</input>
// </tool_use>

// Step 5: 执行工具
const result = await toolCoordinator.execute({
  name: "read_file",
  params: { path: "package.json" }
});

// ToolExecutorCoordinator.execute():
// 1. 查找 handler: handlers.get("read_file") -> ReadFileToolHandler
// 2. 验证参数: validatePath(params.path)
// 3. 执行: fs.readFile(params.path, 'utf-8')
// 4. 返回: { success: true, content: "{...}" }

// Step 6: 工具结果加入消息历史
messages.push({
  role: "assistant",
  content: "使用工具: read_file\n结果: { ... }"
});

// Step 7: 再次调用 LLM (循环)
// LLM 看到工具结果后，生成最终回复
// "这是 package.json 的内容: { ... }"
```

### 示例 2: 代码搜索请求

```typescript
// 用户输入: "找出项目中所有使用 axios 的地方"

// Step 1-3: 同上

// Step 4: LLM 决定使用 search_files 工具
const toolCall = {
  name: "search_files",
  params: {
    path: "/workspace",
    regex: "axios",
    file_pattern: "*.ts"
  }
};

// Step 5: SearchFilesToolHandler 执行
class SearchFilesToolHandler {
  async execute(params) {
    const { path, regex, file_pattern } = params;
    
    // 1. 获取所有匹配 file_pattern 的文件
    const files = await glob(`${path}/**/${file_pattern}`);
    
    // 2. 在每个文件中搜索 regex
    const results = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const matches = content.matchAll(new RegExp(regex, 'g'));
      
      for (const match of matches) {
        results.push({
          file: file,
          line: getLineNumber(content, match.index),
          match: match[0]
        });
      }
    }
    
    return {
      success: true,
      content: formatResults(results)
    };
  }
}

// Step 6-7: 返回搜索结果，LLM 总结
// "在项目中发现 15 处使用 axios 的地方：
// - src/api/client.ts:15
// - src/services/http.ts:42
// ..."
```

### 示例 3: 浏览器操作请求

```typescript
// 用户输入: "打开 GitHub 并截图"

// Step 1-3: 同上

// Step 4: LLM 生成浏览器操作序列
const toolCalls = [
  {
    name: "browser_action",
    params: { action: "launch", url: "https://github.com" }
  },
  {
    name: "browser_action",
    params: { action: "screenshot" }
  },
  {
    name: "browser_action",
    params: { action: "close" }
  }
];

// Step 5: BrowserToolHandler 执行
class BrowserToolHandler {
  private browserSession: BrowserSession;
  
  async execute(toolCall) {
    const { action, ...params } = toolCall.params;
    
    switch (action) {
      case "launch":
        await this.browserSession.launch();
        if (params.url) {
          await this.browserSession.navigate(params.url);
        }
        return { success: true, content: "Browser launched" };
        
      case "screenshot":
        const screenshot = await this.browserSession.screenshot();
        return { 
          success: true, 
          content: screenshot,  // base64
          isImage: true 
        };
        
      case "close":
        await this.browserSession.close();
        return { success: true, content: "Browser closed" };
    }
  }
}

// Step 6-7: 返回截图，LLM 描述
// "已打开 GitHub 并截图：[图片]"
```

## 3. 核心类交互图

```
┌─────────────────────────────────────────────────────────────┐
│                         User                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Task (Orchestrator)                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  start(userInput)                                     │  │
│  │  ├── contextManager.buildContext()                   │  │
│  │  ├── apiHandler.createMessage()                      │  │
│  │  ├── parseStream()                                    │  │
│  │  ├── toolCoordinator.execute()                       │  │
│  │  └── loop until complete                              │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│  Context    │  │   API        │  │   Tool       │
│  Manager    │  │   Handler    │  │   Executor   │
├─────────────┤  ├──────────────┤  ├──────────────┤
│- fileCtx    │  │- anthropic   │  │- handlers:   │
│- rules      │  │- openai      │  │  Map<string, │
│- envCtx     │  │- 40+ others  │  │  ToolHandler>│
└─────────────┘  └──────────────┘  └──────────────┘
```

## 4. 数据流详细追踪

### 4.1 消息状态流转

```typescript
// src/core/task/message-state.ts

// 状态定义
enum TaskPhase {
  THINKING = "thinking",    // LLM 思考中
  ACTING = "acting",        // 执行工具
  WAITING = "waiting",      // 等待用户确认
  COMPLETE = "complete"     // 任务完成
}

// 状态流转示例
const stateFlow = {
  // 初始状态
  initial: { phase: "thinking", lastToolUse: null },
  
  // 用户输入 -> THINKING
  onUserInput: {
    from: "idle",
    to: "thinking",
    action: "callLLM"
  },
  
  // THINKING -> ACTING (需要工具)
  onToolUse: {
    from: "thinking",
    to: "acting",
    action: "executeTool"
  },
  
  // ACTING -> THINKING (工具完成)
  onToolResult: {
    from: "acting",
    to: "thinking",
    action: "callLLM"
  },
  
  // THINKING -> WAITING (需要确认)
  onApprovalNeeded: {
    from: "thinking",
    to: "waiting",
    action: "requestApproval"
  },
  
  // WAITING -> ACTING (用户批准)
  onApproved: {
    from: "waiting",
    to: "acting",
    action: "executeTool"
  },
  
  // THINKING -> COMPLETE
  onCompletion: {
    from: "thinking",
    to: "complete",
    action: "endTask"
  }
};
```

### 4.2 文件上下文追踪

```typescript
// src/core/context/context-tracking/FileContextTracker.ts

interface FileContext {
  path: string;
  lastOperation: 'read' | 'write' | 'edit';
  lastAccessTime: number;
  readCount: number;
  writeCount: number;
  contentSnapshot?: string;
}

// 追踪示例
const trackingExample = {
  // 初始状态
  files: new Map(),
  
  // 用户: "读取 src/main.ts"
  onRead: {
    action: "trackFile",
    params: { path: "src/main.ts", operation: "read" },
    result: {
      path: "src/main.ts",
      lastOperation: "read",
      lastAccessTime: 1704067200000,
      readCount: 1,
      writeCount: 0
    }
  },
  
  // 用户: "修改 src/main.ts"
  onWrite: {
    action: "trackFile",
    params: { path: "src/main.ts", operation: "write" },
    result: {
      path: "src/main.ts",
      lastOperation: "write",
      lastAccessTime: 1704067260000,
      readCount: 1,
      writeCount: 1
    }
  },
  
  // 获取相关文件 (用于上下文构建)
  getContextualFiles: {
    // 返回最近访问的 10 个文件
    result: [
      "src/main.ts",
      "src/utils.ts",
      "package.json"
    ]
  }
};
```

### 4.3 Token 预算管理

```typescript
// src/core/context/context-management/ContextManager.ts

interface TokenBudget {
  maxTokens: number;      // 最大 Token 数 (如 200000)
  systemPrompt: number;   // System Prompt 占用
  messages: number;       // 历史消息占用
  tools: number;         // 工具描述占用
  fileContext: number;   // 文件上下文占用
  remaining: number;     // 剩余可用
}

// Token 计算示例
const tokenCalculation = {
  maxTokens: 200000,
  
  // 初始分配
  initial: {
    systemPrompt: 500,
    tools: 2000,
    fileContext: 5000,
    messages: 1000,
    remaining: 191500
  },
  
  // 触发压缩阈值 (80%)
  threshold: 160000,
  
  // 压缩策略
  compression: {
    // 1. 压缩旧消息
    condenseOldMessages: true,
    
    // 2. 移除不相关文件
    removeIrrelevantFiles: true,
    
    // 3. 摘要长消息
    summarizeLongMessages: true
  }
};
```

## 5. 完整请求生命周期

```
时间轴:

T+0ms    用户输入: "创建一个 hello.js 文件"
         └── Task.start() 调用

T+5ms    构建上下文
         ├── 加载 System Prompt (500 tokens)
         ├── 加载用户规则 (可选)
         ├── 构建工具列表 (2000 tokens)
         └── 准备消息历史 (100 tokens)

T+10ms   调用 LLM API
         ├── POST /v1/messages
         └── 等待流式响应

T+500ms  接收 LLM 响应 (流式)
         ├── "我会帮你创建文件..."
         └── 工具调用: write_to_file

T+505ms  解析工具调用
         └── Extract: { name: "write_to_file", params: {...} }

T+510ms  路由到处理器
         └── handlers.get("write_to_file") -> WriteToFileToolHandler

T+515ms  执行工具
         ├── 验证参数
         ├── 创建文件
         └── 返回结果

T+520ms  更新消息历史
         └── 添加工具结果到 messages

T+525ms  再次调用 LLM (第二轮)
         └── 发送工具结果

T+1000ms 接收最终回复
         └── "文件已创建成功！"

T+1005ms 任务完成
         └── Task 结束，返回结果给用户

总耗时: ~1000ms
API 调用: 2 次
工具执行: 1 次
```

---

*下一章: [08-Tool-Handlers-Deep-Dive.md](./08-Tool-Handlers-Deep-Dive.md) - 24 种工具处理器深度解析*