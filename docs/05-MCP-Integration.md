# 05 - MCP Integration Model Context Protocol 集成

> 通过 MCP 协议连接外部工具和服务，扩展 AI 能力边界

## 1. MCP 简介

Model Context Protocol (MCP) 是 Anthropic 推出的开放协议，允许 AI 系统安全地连接外部工具和数据源。

```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│   Claude Code   │◄─────────────────────►│  External Tools │
│   (MCP Client)  │  JSON-RPC over SSE    │   (MCP Server)  │
└─────────────────┘                       └─────────────────┘
        │                                          │
        │                                          │
        ▼                                          ▼
┌─────────────────┐                       ┌─────────────────┐
│  use_mcp_tool   │                       │   File System   │
│  access_mcp_    │                       │   Git History   │
│  resource       │                       │   Database      │
└─────────────────┘                       │   API Clients   │
                                          └─────────────────┘
```

## 2. MCP Hub 架构

```typescript
// src/services/mcp/McpHub.ts
export class McpHub {
  private servers: Map<string, McpServer> = new Map()
  private connections: Map<string, Client> = new Map()
  
  constructor(private config: McpHubConfig) {}
  
  async initialize(): Promise<void> {
    // 加载所有配置的 MCP 服务器
    for (const serverConfig of this.config.servers) {
      await this.connectServer(serverConfig)
    }
  }
  
  async connectServer(config: McpServerConfig): Promise<void> {
    const client = new Client({ name: 'cline', version: '1.0.0' })
    
    // 根据传输类型创建连接
    const transport = this.createTransport(config)
    
    await client.connect(transport)
    
    // 获取服务器能力
    const capabilities = await client.getCapabilities()
    
    // 获取可用工具列表
    const tools = await client.listTools()
    
    // 获取可用资源列表
    const resources = await client.listResources()
    
    // 存储连接信息
    this.connections.set(config.name, client)
    this.servers.set(config.name, {
      ...config,
      capabilities,
      tools,
      resources
    })
  }
  
  // 创建传输层
  private createTransport(config: McpServerConfig): Transport {
    switch (config.transport) {
      case 'stdio':
        return new StdioTransport(config)
      case 'sse':
        return new SSETransport(config)
      case 'streamable-http':
        return new StreamableHttpTransport(config)
      default:
        throw new Error(`Unknown transport: ${config.transport}`)
    }
  }
}
```

## 3. MCP 工具调用

```typescript
// 使用 MCP 工具
async useMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, any>
): Promise<ToolResult> {
  const client = this.connections.get(serverName)
  if (!client) {
    throw new Error(`MCP server not found: ${serverName}`)
  }
  
  // 调用工具
  const result = await client.callTool(toolName, args)
  
  return {
    success: result.isError ? false : true,
    content: result.content,
    error: result.isError ? result.error : undefined
  }
}

// 示例调用
const result = await mcpHub.useMcpTool(
  'filesystem',
  'read_file',
  { path: '/home/user/project/README.md' }
)
```

## 4. MCP 资源访问

```typescript
// 访问 MCP 资源
async accessMcpResource(uri: string): Promise<ResourceContent> {
  // 解析 URI: mcp://server-name/resource-path
  const parsed = this.parseUri(uri)
  
  const client = this.connections.get(parsed.serverName)
  if (!client) {
    throw new Error(`MCP server not found: ${parsed.serverName}`)
  }
  
  // 获取资源内容
  const content = await client.readResource(parsed.resourcePath)
  
  return {
    mimeType: content.mimeType,
    text: content.text,
    blob: content.blob
  }
}
```

## 5. MCP 配置示例

```json
// ~/.cline/mcp-config.json
{
  "servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["@anthropic/mcp-filesystem-server", "/home/user"],
      "env": {
        "HOME": "/home/user"
      }
    },
    {
      "name": "github",
      "transport": "sse",
      "url": "https://api.github.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    },
    {
      "name": "postgres",
      "transport": "stdio",
      "command": "python",
      "args": ["mcp-postgres-server"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/mydb"
      }
    }
  ]
}
```

## 6. 动态工具注册

```typescript
// 当 MCP 服务器连接后，将其工具注册到主工具系统
export class McpToolIntegrator {
  constructor(
    private mcpHub: McpHub,
    private toolCoordinator: ToolExecutorCoordinator
  ) {}
  
  async syncTools(): Promise<void> {
    for (const [serverName, server] of this.mcpHub.servers) {
      for (const tool of server.tools) {
        // 创建唯一工具名: "mcp:server-name.tool-name"
        const toolId = `mcp:${serverName}.${tool.name}`
        
        // 注册到主工具协调器
        this.toolCoordinator.registerMcpTool(toolId, {
          name: tool.name,
          description: tool.description,
          schema: tool.inputSchema,
          execute: async (params) => {
            return await this.mcpHub.useMcpTool(serverName, tool.name, params)
          }
        })
      }
    }
  }
}
```

## 7. OAuth 认证流程

```typescript
// src/services/mcp/McpOAuthManager.ts
export class McpOAuthManager {
  async initiateAuth(serverName: string): Promise<AuthResult> {
    const client = this.connections.get(serverName)
    const authUrl = await client.getAuthorizationUrl()
    
    // 打开浏览器进行授权
    await open(authUrl)
    
    // 等待回调
    const code = await this.waitForAuthCallback()
    
    // 交换 token
    const token = await client.exchangeCodeForToken(code)
    
    // 存储 token
    await this.storeToken(serverName, token)
    
    return { success: true }
  }
}
```

## 8. 完整的 MCP 使用示例

```typescript
// examples/mcp-usage.ts
import { McpHub } from "@services/mcp"

async function mcpExample() {
  // 1. 初始化 MCP Hub
  const hub = new McpHub({
    servers: [
      {
        name: 'filesystem',
        transport: 'stdio',
        command: 'npx',
        args: ['@anthropic/mcp-filesystem-server', '/home/user/project']
      }
    ]
  })
  
  await hub.initialize()
  
  // 2. 列出可用工具
  const filesystemTools = await hub.listTools('filesystem')
  console.log('Available tools:', filesystemTools.map(t => t.name))
  // Output: ['read_file', 'write_file', 'list_directory', ...]
  
  // 3. 使用工具
  const result = await hub.useMcpTool('filesystem', 'read_file', {
    path: '/home/user/project/package.json'
  })
  
  console.log('File content:', result.content)
  
  // 4. 访问资源
  const resource = await hub.accessMcpResource(
    'mcp://filesystem/config.json'
  )
  
  console.log('Resource:', resource.text)
}

mcpExample().catch(console.error)
```

## 9. Cline 中的 MCP 工具调用格式

```typescript
// LLM 调用 MCP 工具的格式
{
  name: "use_mcp_tool",
  params: {
    server_name: "filesystem",
    tool_name: "read_file",
    arguments: JSON.stringify({
      path: "/workspace/src/main.ts"
    })
  }
}

// 资源访问格式
{
  name: "access_mcp_resource",
  params: {
    uri: "file:///workspace/config.json"
  }
}
```

---

*下一章: [06-Browser-Control.md](./06-Browser-Control.md) - 浏览器自动化*