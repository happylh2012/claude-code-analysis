# 06 - Browser Control 浏览器自动化

> 使用 Playwright 控制浏览器，实现网页操作、内容抓取和交互

## 1. 浏览器会话管理

```typescript
// src/services/browser/BrowserSession.ts
export class BrowserSession {
  private browser: Browser | null = null
  private page: Page | null = null
  private context: BrowserContext | null = null
  
  async launch(): Promise<void> {
    // 使用 Playwright 启动浏览器
    this.browser = await chromium.launch({
      headless: false, // 显示浏览器窗口
      args: ['--disable-blink-features=AutomationControlled']
    })
    
    // 创建新上下文（隔离会话）
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: this.getRandomUserAgent()
    })
    
    // 创建新页面
    this.page = await this.context.newPage()
  }
  
  async navigate(url: string): Promise<void> {
    if (!this.page) {
      await this.launch()
    }
    
    await this.page!.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    })
    
    // 等待页面加载完成
    await this.page!.waitForLoadState('domcontentloaded')
  }
  
  async close(): Promise<void> {
    await this.context?.close()
    await this.browser?.close()
    
    this.page = null
    this.context = null
    this.browser = null
  }
  
  getPage(): Page | null {
    return this.page
  }
}
```

## 2. 浏览器动作类型

```typescript
// src/shared/ExtensionMessage.ts
export type BrowserAction = 
  | "launch"      // 启动浏览器
  | "navigate"    // 导航到 URL
  | "click"       // 点击元素
  | "type"        // 输入文本
  | "scroll"      // 滚动页面
  | "screenshot"  // 截图
  | "close"       // 关闭浏览器

export const browserActions: BrowserAction[] = [
  "launch",
  "navigate", 
  "click",
  "type",
  "scroll",
  "screenshot",
  "close"
]
```

## 3. 工具处理器实现

```typescript
// src/core/task/tools/handlers/BrowserToolHandler.ts
export class BrowserToolHandler implements IFullyManagedTool {
  readonly name = ClineDefaultTool.BROWSER
  
  async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
    const { action, url, coordinate, text } = block.params
    const { browserSession } = config.services
    
    switch (action) {
      case "launch":
        await browserSession.launch()
        if (url) {
          await browserSession.navigate(url)
        }
        return {
          success: true,
          content: `Browser launched${url ? ` and navigated to ${url}` : ''}`
        }
        
      case "navigate":
        if (!url) {
          return { success: false, error: "URL is required for navigate action" }
        }
        await browserSession.navigate(url)
        return {
          success: true,
          content: `Navigated to ${url}`
        }
        
      case "click":
        const [x, y] = coordinate.split(',').map(Number)
        await browserSession.click(x, y)
        return {
          success: true,
          content: `Clicked at coordinates (${x}, ${y})`
        }
        
      case "type":
        await browserSession.type(text)
        return {
          success: true,
          content: `Typed: ${text}`
        }
        
      case "screenshot":
        const screenshot = await browserSession.screenshot()
        return {
          success: true,
          content: screenshot
        }
        
      case "close":
        await browserSession.close()
        return {
          success: true,
          content: "Browser closed"
        }
        
      default:
        return {
          success: false,
          error: `Unknown action: ${action}`
        }
    }
  }
}
```

## 4. 浏览器动作实现

```typescript
// src/services/browser/BrowserSession.ts
export class BrowserSession {
  // 点击坐标
  async click(x: number, y: number): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched")
    }
    
    await this.page.mouse.click(x, y)
    
    // 等待可能的页面加载
    await this.page.waitForTimeout(500)
    await this.page.waitForLoadState('networkidle', { timeout: 5000 })
  }
  
  // 输入文本
  async type(text: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched")
    }
    
    // 获取当前焦点元素
    const focusedElement = await this.page.evaluate(() => {
      return document.activeElement?.tagName
    })
    
    if (focusedElement === 'INPUT' || focusedElement === 'TEXTAREA') {
      await this.page.keyboard.type(text)
    } else {
      throw new Error("No input field is focused")
    }
  }
  
  // 滚动页面
  async scroll(direction: 'up' | 'down', amount: number = 300): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched")
    }
    
    const delta = direction === 'up' ? -amount : amount
    
    await this.page.evaluate((scrollAmount) => {
      window.scrollBy(0, scrollAmount)
    }, delta)
  }
  
  // 截图
  async screenshot(): Promise<string> {
    if (!this.page) {
      throw new Error("Browser not launched")
    }
    
    const buffer = await this.page.screenshot({
      type: 'png',
      fullPage: false
    })
    
    // 返回 base64 编码的截图
    return buffer.toString('base64')
  }
  
  // 获取页面内容（文本）
  async getPageContent(): Promise<string> {
    if (!this.page) {
      throw new Error("Browser not launched")
    }
    
    return await this.page.evaluate(() => {
      // 提取主要内容
      const main = document.querySelector('main, article, [role="main"]')
      if (main) {
        return main.innerText
      }
      return document.body.innerText
    })
  }
  
  // 获取页面元数据
  async getPageMetadata(): Promise<PageMetadata> {
    if (!this.page) {
      throw new Error("Browser not launched")
    }
    
    return await this.page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content')
    }))
  }
}
```

## 5. URL 内容抓取器

```typescript
// src/services/browser/UrlContentFetcher.ts
export class UrlContentFetcher {
  constructor(private browserSession: BrowserSession) {}
  
  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    // 检查缓存
    const cached = await this.checkCache(url)
    if (cached && !options.force) {
      return cached
    }
    
    // 获取内容
    let content: string
    
    if (options.useBrowser) {
      // 使用浏览器获取动态内容
      await this.browserSession.navigate(url)
      content = await this.browserSession.getPageContent()
    } else {
      // 使用简单 HTTP 请求
      content = await this.httpFetch(url)
    }
    
    // 内容清洗
    content = this.cleanContent(content)
    
    // 存储缓存
    await this.cacheContent(url, content)
    
    return {
      url,
      content,
      timestamp: Date.now()
    }
  }
  
  private cleanContent(content: string): string {
    // 移除多余空白
    content = content.replace(/\s+/g, ' ')
    
    // 移除脚本和样式内容
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    
    // 转换为纯文本
    content = content.replace(/<[^>]+>/g, ' ')
    
    return content.trim()
  }
}
```

## 6. 完整的浏览器操作示例

```typescript
// examples/browser-usage.ts
import { BrowserSession } from "@services/browser"

async function browserExample() {
  const browser = new BrowserSession()
  
  try {
    // 1. 启动浏览器并访问 Google
    await browser.launch()
    await browser.navigate('https://www.google.com')
    
    // 2. 搜索
    // 点击搜索框（假设坐标已知）
    await browser.click(500, 300)
    await browser.type('Claude Code tutorial')
    await browser.page?.keyboard.press('Enter')
    
    // 等待搜索结果
    await browser.page?.waitForTimeout(2000)
    
    // 3. 截图
    const screenshot = await browser.screenshot()
    console.log('Screenshot (base64):', screenshot.substring(0, 100) + '...')
    
    // 4. 获取页面内容
    const content = await browser.getPageContent()
    console.log('Page content:', content.substring(0, 500))
    
    // 5. 滚动查看更多结果
    await browser.scroll('down', 500)
    
  } finally {
    await browser.close()
  }
}

browserExample().catch(console.error)
```

## 7. 与 LLM 的交互格式

```typescript
// LLM 调用浏览器工具的格式
{
  name: "browser_action",
  params: {
    action: "launch",
    url: "https://github.com"
  }
}

// 点击操作
{
  name: "browser_action",
  params: {
    action: "click",
    coordinate: "500,300"
  }
}

// 输入操作
{
  name: "browser_action",
  params: {
    action: "type",
    text: "Hello World"
  }
}

// 截图
{
  name: "browser_action",
  params: {
    action: "screenshot"
  }
}
```

## 8. 安全考虑

```typescript
// 浏览器安全策略
const SECURITY_POLICIES = {
  // 禁止访问的域名
  blockedDomains: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    'file://'
  ],
  
  // 需要用户确认的操作
  requiresApproval: [
    'download',
    'upload',
    'file_input'
  ],
  
  // 最大会话时长
  maxSessionDuration: 300000, // 5分钟
  
  // 最大页面数
  maxPages: 10
}

export function validateBrowserAction(action: BrowserAction, url?: string): boolean {
  if (url) {
    const domain = new URL(url).hostname
    if (SECURITY_POLICIES.blockedDomains.includes(domain)) {
      throw new Error(`Access to ${domain} is blocked`)
    }
  }
  
  return true
}
```

---

## 总结

Cline/Claude Code 的完整架构：

```
User Input
    ↓
Context Manager (规则 + 文件上下文 + 环境)
    ↓
Task Engine (Plan/Act 双模式循环)
    ↓
API Handler (40+ LLM 提供商)
    ↓
Tool System (24 种内置工具)
    ↓
├─ File Operations (read/write/edit)
├─ Command Execution (bash)
├─ Search (files/code/definitions)
├─ Browser (playwright)
└─ MCP Hub (外部工具扩展)
```

*项目完成！*