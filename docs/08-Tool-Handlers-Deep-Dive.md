# 08 - 工具处理器深度解析

> 24 种内置工具的详细实现原理

## 工具分类总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Handlers (24 种)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📁 文件操作类 (6)                                              │
│  ├── read_file        - 读取文件内容，支持 offset/limit          │
│  ├── write_to_file   - 创建/覆写文件，支持 diff 模式            │
│  ├── replace_in_file - 替换文件中特定内容                        │
│  ├── apply_patch     - 应用 git 风格的 patch                   │
│  ├── list_files      - 列出目录文件                             │
│  └── search_files    - 正则搜索文件内容                         │
│                                                                 │
│  🔧 命令执行类 (1)                                             │
│  └── execute_command - 执行 shell 命令                          │
│                                                                 │
│  🔍 代码理解类 (3)                                             │
│  ├── list_code_definition_names - 列出代码中的类/函数/变量定义  │
│  ├── generate_explanation - 生成代码解释                      │
│  └── summarize_task        - 总结已完成的任务                   │
│                                                                 │
│  🌐 浏览器/Web 类 (5)                                           │
│  ├── browser_action   - Playwright 浏览器控制                    │
│  ├── web_fetch        - 获取网页内容 (无 JS)                    │
│  ├── web_search       - 搜索引擎查询                            │
│  └── use_mcp_tool     - 调用 MCP 外部工具                       │
│  └── access_mcp_resource - 访问 MCP 资源                        │
│                                                                 │
│  💬 对话/任务类 (9)                                             │
│  ├── ask_followup_question   - 询问用户澄清问题                 │
│  ├── attempt_completion      - 尝试完成任务                     │
│  ├── report_bug              - 报告发现的问题                    │
│  ├── new_task                - 创建新任务                       │
│  ├── plan_mode_respond       - 规划模式响应                      │
│  ├── act_mode_respond       - 执行模式响应                      │
│  ├── use_skill              - 使用 Skill                        │
│  └── use_subagents          - 调用子代理                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 1. 文件操作类详解

### 1.1 ReadFileToolHandler

```typescript
// src/core/task/tools/handlers/ReadFileToolHandler.ts
class ReadFileToolHandler {
  readonly name = ClineDefaultTool.FILE_READ;
  
  async handle(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<ToolResponse> {
    const { path, offset, limit } = block.params;
    
    // 1. 验证路径安全
    const absolutePath = resolveWorkspacePath(path);
    await this.validatePath(absolutePath);
    
    // 2. 读取文件
    const content = await fs.readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');
    
    // 3. 应用 offset/limit
    const startLine = offset || 1;
    const endLine = limit ? startLine + limit : lines.length;
    const selectedLines = lines.slice(startLine - 1, endLine);
    
    // 4. 计算位置信息
    const position = {
      startLine: startLine,
      endLine: endLine,
      totalLines: lines.length,
      truncated: lines.length > endLine
    };
    
    // 5. 返回结果
    return {
      success: true,
      content: selectedLines.join('\n'),
      metadata: {
        path: absolutePath,
        lines: selectedLines.length,
        position
      }
    };
  }
  
  // 支持流式输出（实时显示读取进度）
  async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
    // 打开 diff 视图，实时显示内容
    uiHelpers.openFileInEditor(block.params.path);
    uiHelpers.streamContentPreview(block.params.path);
  }
}

// 使用示例
const result = await toolExecutor.execute({
  name: "read_file",
  params: {
    path: "/workspace/src/main.ts",
    offset: 100,  // 从第 100 行开始
    limit: 50     // 读取 50 行
  }
});
// 结果: { success: true, content: "第100-149行...", ... }
```

### 1.2 WriteToFileToolHandler

```typescript
// src/core/task/tools/handlers/WriteToFileToolHandler.ts
class WriteToFileToolHandler {
  readonly name = ClineDefaultTool.FILE_NEW;
  
  async handle(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<ToolResponse> {
    const { path, content, diff } = block.params;
    
    const absolutePath = resolveWorkspacePath(path);
    
    // 处理两种模式: content 或 diff
    let finalContent = content;
    if (diff) {
      // Diff 模式：应用 patch
      finalContent = await this.applyDiff(diff, absolutePath);
    }
    
    // 确保目录存在
    await this.ensureDirectoryExists(path.dirname(absolutePath));
    
    // 写入文件
    await fs.writeFile(absolutePath, finalContent, 'utf-8');
    
    // 追踪文件上下文
    this.contextTracker.trackFile(absolutePath, 'write');
    
    // 计算变更统计
    const changes = this.calculateChanges(content);
    
    return {
      success: true,
      content: `文件 ${path} 已创建/更新`,
      metadata: {
        bytes: Buffer.byteLength(finalContent, 'utf-8'),
        lines: finalContent.split('\n').length,
        changes
      }
    };
  }
  
  // Diff 模式处理
  private async applyDiff(diff: string, targetPath: string): Promise<string> {
    try {
      const original = await fs.readFile(targetPath, 'utf-8');
      // 使用 patch parser 应用 diff
      return this.patchParser.apply(original, diff);
    } catch {
      // 文件不存在，直接写入
      return diff;
    }
  }
  
  // 计算变更
  private calculateChanges(content: string) {
    return {
      linesAdded: content.split('\n').length,
      bytesAdded: Buffer.byteLength(content, 'utf-8')
    };
  }
}

// 使用示例
// 模式 1: 直接内容
await toolExecutor.execute({
  name: "write_to_file",
  params: {
    path: "/workspace/hello.js",
    content: "console.log('Hello World');"
  }
});

// 模式 2: Diff
await toolExecutor.execute({
  name: "write_to_file",
  params: {
    path: "/workspace/hello.js",
    diff: `@@ -1,1 +1,2 @@
 console.log('Hello World');
+console.log('New line');
`
  }
});
```

### 1.3 ExecuteCommandToolHandler

```typescript
// src/core/task/tools/handlers/ExecuteCommandToolHandler.ts
class ExecuteCommandToolHandler {
  readonly name = ClineDefaultTool.BASH;
  
  async handle(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<ToolResponse> {
    const { command, timeout, requires_approval, description } = block.params;
    
    // 1. 检查是否需要用户批准
    if (requires_approval === "true" || requires_approval === true) {
      const approved = await uiHelpers.requestApproval(
        `执行命令: ${command}\n${description || ''}`
      );
      if (!approved) {
        return { success: false, error: "用户拒绝执行" };
      }
    }
    
    // 2. 安全检查
    this.validateCommand(command);
    
    // 3. 创建终端会话
    const terminal = uiHelpers.createTerminal({
      cwd: uiHelpers.getConfig().cwd,
      env: uiHelpers.getConfig().env
    });
    
    // 4. 执行命令
    const startTime = Date.now();
    const result = await terminal.execute(command, {
      timeout: timeout || 60000,
      onOutput: (data) => {
        // 实时输出到 UI
        uiHelpers.streamTerminalOutput(data);
      }
    });
    const duration = Date.now() - startTime;
    
    // 5. 返回结果
    return {
      success: result.exitCode === 0,
      content: result.stdout,
      error: result.stderr,
      metadata: {
        exitCode: result.exitCode,
        duration,
        workingDir: terminal.cwd
      }
    };
  }
  
  // 命令安全验证
  private validateCommand(command: string) {
    // 禁止的命令
    const forbidden = [
      'rm -rf /',
      'rm -rf /*',
      ':(){:|:&};:',
      'mkfs',
      'dd if=/dev/zero'
    ];
    
    for (const pattern of forbidden) {
      if (command.includes(pattern)) {
        throw Error(`禁止执行危险命令: ${pattern}`);
      }
    }
  }
}

// 使用示例
const result = await toolExecutor.execute({
  name: "execute_command",
  params: {
    command: "npm install",
    timeout: 300000,  // 5 分钟超时
    requires_approval: true,
    description: "安装项目依赖"
  }
});
// 结果: { success: true, content: "added 123 packages...", exitCode: 0 }
```

## 2. 浏览器控制类详解

### 2.1 BrowserToolHandler

```typescript
// src/core/task/tools/handlers/BrowserToolHandler.ts
class BrowserToolHandler implements IFullyManagedTool {
  readonly name = ClineDefaultTool.BROWSER;
  
  private browserSession: BrowserSession;
  
  async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
    const { action, url, coordinate, text, scrollDirection } = block.params;
    
    switch (action) {
      case "launch":
        await this.browserSession.launch({ headless: false });
        if (url) {
          await this.browserSession.navigate(url);
        }
        return { success: true, content: `浏览器启动${url ? `并打开 ${url}` : ''}` };
      
      case "navigate":
        await this.browserSession.navigate(url);
        return { success: true, content: `已导航到 ${url}` };
      
      case "click":
        const [x, y] = coordinate.split(',').map(Number);
        await this.browserSession.click(x, y);
        return { success: true, content: `点击坐标 (${x}, ${y})` };
      
      case "type":
        await this.browserSession.type(text);
        return { success: true, content: `输入: ${text}` };
      
      case "scroll":
        await this.browserSession.scroll(scrollDirection, 300);
        return { success: true, content: `滚动${scrollDirection}` };
      
      case "screenshot":
        const screenshot = await this.browserSession.screenshot();
        return { success: true, content: screenshot, isImage: true };
      
      case "close":
        await this.browserSession.close();
        return { success: true, content: "浏览器已关闭" };
      
      default:
        return { success: false, error: `未知动作: ${action}` };
    }
  }
}

// 完整的浏览器操作序列示例
const browserActions = [
  {
    name: "browser_action",
    params: { action: "launch", url: "https://github.com" }
  },
  {
    name: "browser_action",
    params: { action: "click", coordinate: "500,300" }  // 点击搜索框
  },
  {
    name: "browser_action",
    params: { action: "type", text: "cline" }
  },
  {
    name: "browser_action",
    params: { action: "click", coordinate: "600,350" }  // 点击搜索结果
  },
  {
    name: "browser_action",
    params: { action: "screenshot" }
  }
];
```

## 3. MCP 工具类详解

### 3.1 UseMcpToolHandler

```typescript
// src/core/task/tools/handlers/UseMcpToolHandler.ts
class UseMcpToolHandler {
  readonly name = ClineDefaultTool.MCP_USE;
  
  async handle(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<ToolResponse> {
    const { server_name, tool_name, arguments: toolArgs } = block.params;
    
    // 1. 获取 MCP Hub
    const mcpHub = this.mcpService.getHub();
    
    // 2. 验证服务器已连接
    if (!mcpHub.isConnected(server_name)) {
      return {
        success: false,
        error: `MCP 服务器未连接: ${server_name}`
      };
    }
    
    // 3. 调用工具
    const result = await mcpHub.useMcpTool(server_name, tool_name, toolArgs);
    
    // 4. 格式化返回结果
    return {
      success: !result.isError,
      content: result.content,
      error: result.error
    };
  }
}

// MCP 工具调用格式
const mcpCall = {
  name: "use_mcp_tool",
  params: {
    server_name: "filesystem",
    tool_name: "read_file",
    arguments: {
      path: "/workspace/README.md"
    }
  }
};

// 或使用 MCP 资源
const mcpResource = {
  name: "access_mcp_resource",
  params: {
    uri: "file:///workspace/config.json"
  }
};
```

## 4. 工具权限与安全

### 4.1 权限级别

```typescript
// src/core/task/tools/permissions.ts

enum ToolPermissionLevel {
  // 只读操作，自动批准
  READ_ONLY = "read_only",
  
  // 写入操作，需要确认
  WRITE = "write",
  
  // 危险操作，需要明确批准
  DANGEROUS = "dangerous",
  
  // 禁止操作
  FORBIDDEN = "forbidden"
}

// 权限映射
const toolPermissions: Record<string, ToolPermissionLevel> = {
  // 只读工具
  read_file: "read_only",
  list_files: "read_only",
  list_code_definition_names: "read_only",
  web_fetch: "read_only",
  web_search: "read_only",
  
  // 写入工具
  write_to_file: "write",
  execute_command: "write",
  browser_action: "write",
  
  // 危险工具
  execute_command: "dangerous",  // 如果包含 rm, del 等
};

// 自动批准规则
const autoApproveRules = [
  // 只读操作
  { pattern: /^read_file$/, action: "auto_approve" },
  
  // 特定安全的写入操作
  { pattern: /^write_to_file$/, 
    condition: (params) => !params.path.includes('node_modules'),
    action: "auto_approve" 
  },
  
  // 需要批准的写入
  { pattern: /^execute_command$/, action: "require_approval" }
];

// 检查是否需要批准
function shouldRequireApproval(toolName: string, params: any): boolean {
  const level = toolPermissions[toolName];
  
  if (level === ToolPermissionLevel.READ_ONLY) return false;
  if (level === ToolPermissionLevel.FORBIDDEN) return true;
  
  // 检查自动批准规则
  for (const rule of autoApproveRules) {
    if (rule.pattern.test(toolName)) {
      if (rule.condition && !rule.condition(params)) {
        return true;
      }
      return rule.action === "require_approval";
    }
  }
  
  return level === ToolPermissionLevel.WRITE;
}
```

---

*文档持续更新中...*