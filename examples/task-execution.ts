/**
 * 示例 3: 任务执行引擎
 * 演示简化的任务循环
 */

import { Anthropic } from "@anthropic-ai/sdk"

interface Message {
  role: "user" | "assistant"
  content: string
  tool_calls?: ToolCall[]
}

interface ToolCall {
  name: string
  parameters: Record<string, any>
}

// 简化的任务执行器
class SimpleTaskEngine {
  private messages: Message[] = []
  private anthropic: Anthropic
  private maxIterations: number = 10

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey })
  }

  async run(userInput: string) {
    console.log("🚀 启动任务引擎")
    console.log(`💬 用户输入: ${userInput}\n`)

    // 添加用户消息
    this.messages.push({ role: "user", content: userInput })

    let iteration = 0
    let isComplete = false

    while (!isComplete && iteration < this.maxIterations) {
      iteration++
      console.log(`\n--- 迭代 ${iteration} ---`)

      // 调用 LLM
      console.log("🤖 调用 LLM...")
      const response = await this.callLLM()

      // 解析响应
      const parsed = this.parseResponse(response)

      if (parsed.type === "text") {
        console.log(`💬 LLM 回复: ${parsed.content}`)
        
        // 检查是否完成任务
        if (parsed.content.includes("任务完成") || parsed.content.includes("completed")) {
          isComplete = true
        }
        
        this.messages.push({
          role: "assistant",
          content: parsed.content
        })
      } else if (parsed.type === "tool_call") {
        console.log(`🔧 工具调用: ${parsed.toolCall.name}`)
        
        // 执行工具
        const result = await this.executeTool(parsed.toolCall)
        
        // 添加工具结果到消息历史
        this.messages.push({
          role: "assistant",
          content: `使用工具: ${parsed.toolCall.name}\n结果: ${result}`
        })
      }
    }

    console.log("\n✅ 任务完成")
    return this.messages
  }

  private async callLLM(): Promise<string> {
    const systemPrompt = `你是一个编程助手。你可以使用以下工具:
1. read_file - 读取文件内容
2. write_file - 写入文件内容  
3. execute_command - 执行命令

工具调用格式: <tool name="tool_name">参数JSON</tool>`

    const response = await this.anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.messages
    })

    const content = response.content[0]
    return content.type === "text" ? content.text : ""
  }

  private parseResponse(response: string): ParsedResponse {
    // 检查是否包含工具调用
    const toolMatch = response.match(/<tool name="([^"]+)">(.+)<\/tool>/)
    
    if (toolMatch) {
      return {
        type: "tool_call",
        toolCall: {
          name: toolMatch[1],
          parameters: JSON.parse(toolMatch[2])
        }
      }
    }

    return {
      type: "text",
      content: response
    }
  }

  private async executeTool(toolCall: ToolCall): Promise<string> {
    // 简化的工具执行
    const toolImplementations: Record<string, Function> = {
      read_file: async (params: any) => {
        const fs = await import("fs/promises")
        try {
          return await fs.readFile(params.path, "utf-8")
        } catch (e: any) {
          return `Error: ${e.message}`
        }
      },
      write_file: async (params: any) => {
        const fs = await import("fs/promises")
        await fs.writeFile(params.path, params.content)
        return "File written successfully"
      },
      execute_command: async (params: any) => {
        const { exec } = await import("child_process")
        const util = await import("util")
        const execPromise = util.promisify(exec)
        
        try {
          const { stdout } = await execPromise(params.command)
          return stdout
        } catch (e: any) {
          return e.message
        }
      }
    }

    const implementation = toolImplementations[toolCall.name]
    if (implementation) {
      return await implementation(toolCall.parameters)
    }
    
    return `Unknown tool: ${toolCall.name}`
  }
}

interface ParsedResponse {
  type: "text" | "tool_call"
  content?: string
  toolCall?: ToolCall
}

// 使用示例
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log("请设置 ANTHROPIC_API_KEY 环境变量")
    return
  }

  const engine = new SimpleTaskEngine(apiKey)
  
  // 运行任务
  await engine.run("查看当前目录的文件列表")
}

main().catch(console.error)
