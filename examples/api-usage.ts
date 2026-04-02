/**
 * 示例 1: API Provider 使用
 * 演示如何构建 API Handler 并发送消息
 */

import { Anthropic } from "@anthropic-ai/sdk"

// 简化的 API Handler 实现
interface ApiHandler {
  createMessage(systemPrompt: string, messages: any[]): AsyncGenerator<any>
  getModel(): { id: string; info: any }
}

class SimpleAnthropicHandler implements ApiHandler {
  private client: Anthropic
  private modelId: string

  constructor(apiKey: string, modelId: string = "claude-3-opus-20240229") {
    this.client = new Anthropic({ apiKey })
    this.modelId = modelId
  }

  async *createMessage(systemPrompt: string, messages: any[]) {
    const stream = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: true
    })

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        yield {
          type: "text",
          text: chunk.delta.text
        }
      }
    }
  }

  getModel() {
    return {
      id: this.modelId,
      info: {
        supportsImages: true,
        maxTokens: 200000,
        contextWindow: 200000
      }
    }
  }
}

// 使用示例
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log("请设置 ANTHROPIC_API_KEY 环境变量")
    console.log("export ANTHROPIC_API_KEY=your_key_here")
    return
  }

  console.log("🚀 创建 API Handler...")
  const handler = new SimpleAnthropicHandler(apiKey)

  console.log("📤 发送消息...")
  const stream = handler.createMessage(
    "你是一个专业的程序员助手",
    [{ role: "user", content: "写一个快速排序算法" }]
  )

  console.log("📥 接收响应:\n")
  let fullResponse = ""

  for await (const chunk of stream) {
    if (chunk.type === "text") {
      process.stdout.write(chunk.text)
      fullResponse += chunk.text
    }
  }

  console.log("\n\n✅ 完成!")
  console.log(`总字符数: ${fullResponse.length}`)
}

main().catch(console.error)
