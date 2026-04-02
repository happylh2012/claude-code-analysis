# 01 - API Provider 层分析

> 统一接口封装 40+ 种 LLM 提供商

## 1. 架构设计

### 核心抽象

```typescript
// 统一接口定义
export interface ApiHandler {
  createMessage(
    systemPrompt: string, 
    messages: ClineStorageMessage[], 
    tools?: ClineTool[], 
    useResponseApi?: boolean
  ): ApiStream
  
  getModel(): ApiHandlerModel
  getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined>
  abort?(): void
}
```

### 类图

```
┌─────────────────────────────────────────────────────────────┐
│                     ApiHandler (Interface)                  │
│  + createMessage() → ApiStream                              │
│  + getModel() → ApiHandlerModel                             │
│  + abort() → void                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ implements
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 Base Handler Classes                        │
├─────────────────┬─────────────────┬─────────────────────────┤
│ AnthropicHandler│ OpenAIHandler   │  GeminiHandler          │
│ DeepSeekHandler │ OllamaHandler   │  BedrockHandler         │
│ ... (40+ more)  │ ...             │  ...                    │
└─────────────────┴─────────────────┴─────────────────────────┘
```

## 2. 工厂模式创建处理器

```typescript
// src/core/api/index.ts
function createHandlerForProvider(
  apiProvider: string,
  options: ApiConfiguration,
  mode: Mode
): ApiHandler {
  switch (apiProvider) {
    case "anthropic":
      return new AnthropicHandler(options)
    case "openrouter":
      return new OpenRouterHandler(options)
    case "openai":
      return new OpenAiHandler(options)
    case "ollama":
      return new OllamaHandler(options)
    // ... 40+ more providers
    default:
      throw new Error(`Unknown provider: ${apiProvider}`)
  }
}
```

## 3. 具体实现示例: Anthropic Handler

```typescript
// src/core/api/providers/anthropic.ts
import { Anthropic } from "@anthropic-ai/sdk"
import type { ApiHandlerOptions } from "../../shared/api"

export class AnthropicHandler implements ApiHandler {
  private client: Anthropic
  private options: ApiHandlerOptions

  constructor(options: ApiHandlerOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.anthropicBaseUrl || "https://api.anthropic.com",
    })
    this.options = options
  }

  async *createMessage(
    systemPrompt: string,
    messages: ClineStorageMessage[],
    tools?: ClineTool[]
  ): ApiStream {
    const stream = await this.client.messages.create({
      model: this.options.apiModelId || "claude-3-opus-20240229",
      max_tokens: 8192,
      temperature: 0,
      system: systemPrompt,
      messages: messages.map(m => this.convertMessage(m)),
      tools: tools ? this.convertTools(tools) : undefined,
      stream: true,
    })

    for await (const chunk of stream) {
      yield this.convertChunk(chunk)
    }
  }

  getModel(): ApiHandlerModel {
    return {
      id: this.options.apiModelId || "claude-3-opus-20240229",
      info: {
        supportsImages: true,
        maxTokens: 200000,
        contextWindow: 200000,
        supportsPromptCache: true,
      }
    }
  }
}
```

## 4. 流式响应处理

```typescript
// src/core/api/transform/stream.ts
export type ApiStream = AsyncGenerator<ApiStreamChunk>

export type ApiStreamChunk =
  | ApiStreamTextChunk
  | ApiStreamToolUseChunk
  | ApiStreamToolResultChunk
  | ApiStreamUsageChunk

export interface ApiStreamTextChunk {
  type: "text"
  text: string
}

export interface ApiStreamToolUseChunk {
  type: "tool_use"
  name: string
  params: Record<string, any>
}

// 统一的流转换器
export function* transformStream(
  stream: AsyncIterable<any>,
  converter: (chunk: any) => ApiStreamChunk | undefined
): ApiStream {
  for await (const chunk of stream) {
    const converted = converter(chunk)
    if (converted) {
      yield converted
    }
  }
}
```

## 5. 使用示例

```typescript
// examples/api-usage.ts
import { buildApiHandler } from "@core/api"

async function main() {
  // 1. 创建处理器
  const handler = buildApiHandler({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    apiModelId: "claude-3-opus-20240229",
  })

  // 2. 发送消息
  const stream = handler.createMessage(
    "你是一个 helpful AI 助手",
    [
      { role: "user", content: "Hello, how are you?" }
    ],
    [
      {
        name: "read_file",
        description: "读取文件内容",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "文件路径" }
          },
          required: ["path"]
        }
      }
    ]
  )

  // 3. 处理流式响应
  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text":
        process.stdout.write(chunk.text)
        break
      case "tool_use":
        console.log(`\n[调用工具] ${chunk.name}`, chunk.params)
        break
    }
  }
}
```

## 6. 支持的全部提供商

| 类别 | 提供商 |
|------|--------|
| **商业 API** | Anthropic, OpenAI, Azure, AWS Bedrock, Google Gemini, Mistral, Cohere |
| **聚合平台** | OpenRouter, Vercel AI Gateway, AIHubMix, Requesty, Together |
| **本地部署** | Ollama, LM Studio, HuggingFace, vLLM |
| **中国地区** | 通义千问 (Qwen), 豆包 (Doubao), DeepSeek, MiniMax |
| **特殊接口** | VS Code LM API, Dify, LiteLLM |

## 7. 关键设计模式

1. **工厂模式**: `createHandlerForProvider()` 动态创建对应处理器
2. **适配器模式**: 每个 Handler 将特定 SDK 转换为统一接口
3. **生成器模式**: `ApiStream` 使用 AsyncGenerator 实现流式响应
4. **策略模式**: 不同模型支持的能力通过 `ModelInfo` 描述

## 8. 错误处理与重试

```typescript
// 自动重试机制
export interface CommonApiHandlerOptions {
  onRetryAttempt?: (attempt: number, error: Error) => void
}

// 指数退避
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      await sleep(Math.pow(2, i) * 1000) // 指数退避
    }
  }
  
  throw lastError
}
```

---

*下一章: [02-Task-Engine.md](./02-Task-Engine.md) - 任务执行核心引擎*
