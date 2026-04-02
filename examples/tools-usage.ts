/**
 * 示例 2: 工具系统使用
 * 演示工具注册和执行流程
 */

// 工具定义
interface Tool {
  name: string
  description: string
  parameters: Record<string, any>
}

interface ToolResult {
  success: boolean
  content?: string
  error?: string
}

// 简化的工具处理器
abstract class ToolHandler {
  abstract readonly name: string
  abstract execute(params: Record<string, any>): Promise<ToolResult>
}

// 读文件工具
class ReadFileHandler extends ToolHandler {
  readonly name = "read_file"

  async execute(params: { path: string; offset?: number; limit?: number }): Promise<ToolResult> {
    const fs = await import("fs/promises")
    
    try {
      const content = await fs.readFile(params.path, "utf-8")
      const lines = content.split("\n")
      
      const offset = params.offset || 1
      const limit = params.limit || lines.length
      
      const selectedLines = lines.slice(offset - 1, offset - 1 + limit)
      
      return {
        success: true,
        content: selectedLines.join("\n")
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to read file: ${error.message}`
      }
    }
  }
}

// 执行命令工具
class ExecuteCommandHandler extends ToolHandler {
  readonly name = "execute_command"

  async execute(params: { command: string; timeout?: number }): Promise<ToolResult> {
    const { exec } = await import("child_process")
    const util = await import("util")
    const execPromise = util.promisify(exec)
    
    try {
      const { stdout, stderr } = await execPromise(params.command, {
        timeout: params.timeout || 60000
      })
      
      return {
        success: true,
        content: stdout || stderr
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Command failed: ${error.message}`,
        content: error.stdout || error.stderr
      }
    }
  }
}

// 工具协调器
class ToolCoordinator {
  private handlers: Map<string, ToolHandler> = new Map()

  register(handler: ToolHandler) {
    this.handlers.set(handler.name, handler)
  }

  async execute(toolName: string, params: Record<string, any>): Promise<ToolResult> {
    const handler = this.handlers.get(toolName)
    if (!handler) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      }
    }

    console.log(`🔧 执行工具: ${toolName}`)
    console.log(`   参数: ${JSON.stringify(params)}`)
    
    const startTime = Date.now()
    const result = await handler.execute(params)
    const duration = Date.now() - startTime

    console.log(`   耗时: ${duration}ms`)
    console.log(`   结果: ${result.success ? "✅ 成功" : "❌ 失败"}`)
    
    return result
  }
}

// 使用示例
async function main() {
  const coordinator = new ToolCoordinator()
  
  // 注册工具
  coordinator.register(new ReadFileHandler())
  coordinator.register(new ExecuteCommandHandler())

  console.log("=== 示例 1: 读取文件 ===")
  const readResult = await coordinator.execute("read_file", {
    path: "./package.json"
  })
  
  if (readResult.success) {
    console.log("文件内容:")
    console.log(readResult.content?.substring(0, 500) + "...")
  } else {
    console.log("错误:", readResult.error)
  }

  console.log("\n=== 示例 2: 执行命令 ===")
  const execResult = await coordinator.execute("execute_command", {
    command: "ls -la"
  })
  
  if (execResult.success) {
    console.log("命令输出:")
    console.log(execResult.content)
  }
}

main().catch(console.error)
