/**
 * 示例 4: 浏览器控制
 * 演示简化的浏览器自动化
 */

import { chromium, Browser, Page, BrowserContext } from "playwright"

interface BrowserAction {
  type: "launch" | "navigate" | "click" | "type" | "scroll" | "screenshot" | "close"
  params?: Record<string, any>
}

// 简化的浏览器会话
class SimpleBrowserSession {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: false })
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    })
    this.page = await this.context.newPage()
    console.log("🌐 浏览器已启动")
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched")
    
    await this.page.goto(url, { waitUntil: "networkidle" })
    console.log(`📍 已导航到: ${url}`)
  }

  async click(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error("Browser not launched")
    
    await this.page.mouse.click(x, y)
    console.log(`👆 点击坐标: (${x}, ${y})`)
  }

  async type(text: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched")
    
    await this.page.keyboard.type(text)
    console.log(`⌨️ 输入文本: ${text}`)
  }

  async scroll(direction: "up" | "down", amount: number = 300): Promise<void> {
    if (!this.page) throw new Error("Browser not launched")
    
    const delta = direction === "up" ? -amount : amount
    await this.page.evaluate((d) => window.scrollBy(0, d), delta)
    console.log(`📜 滚动 ${direction} ${amount}px`)
  }

  async screenshot(savePath?: string): Promise<string> {
    if (!this.page) throw new Error("Browser not launched")
    
    const buffer = await this.page.screenshot({ type: "png" })
    const base64 = buffer.toString("base64")
    
    if (savePath) {
      const fs = await import("fs/promises")
      await fs.writeFile(savePath, buffer)
      console.log(`📸 截图已保存: ${savePath}`)
    }
    
    return base64
  }

  async getContent(): Promise<string> {
    if (!this.page) throw new Error("Browser not launched")
    
    return await this.page.evaluate(() => document.body.innerText)
  }

  async close(): Promise<void> {
    await this.context?.close()
    await this.browser?.close()
    this.browser = null
    this.context = null
    this.page = null
    console.log("🔴 浏览器已关闭")
  }
}

// 使用示例
async function main() {
  const browser = new SimpleBrowserSession()

  try {
    // 1. 启动浏览器
    await browser.launch()

    // 2. 访问网站
    await browser.navigate("https://github.com")

    // 3. 等待加载
    await new Promise(r => setTimeout(r, 2000))

    // 4. 获取页面内容
    const content = await browser.getContent()
    console.log("\n📄 页面内容预览:")
    console.log(content.substring(0, 200) + "...")

    // 5. 截图
    await browser.screenshot("./screenshot.png")

  } catch (error) {
    console.error("错误:", error)
  } finally {
    await browser.close()
  }
}

main().catch(console.error)