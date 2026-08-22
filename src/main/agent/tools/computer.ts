import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { clipboard, desktopCapturer, screen } from 'electron'
import { registerTool } from './registry'
import { getShyPaths } from '../../paths'

const execAsync = promisify(exec)

export function registerComputerTools(): void {
  registerTool('browser_open', (ctx) => ({
    name: 'browser_open',
    description: '用系统默认浏览器打开 URL',
    schema: z.object({ url: z.string().url() }),
    run: async ({ url }) => {
      if (/^(file:|javascript:)/i.test(url)) {
        const ok = await ctx.confirmHighRisk('打开非常规 URL', url)
        if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
      }
      ctx.emit('tool', { name: 'browser_open', url })
      const { shell } = await import('electron')
      await shell.openExternal(url)
      return JSON.stringify({ ok: true })
    }
  }))

  registerTool('browser_fetch', (ctx) => ({
    name: 'browser_fetch',
    description: '用 Playwright 打开页面并提取可见文本（需已安装 playwright）',
    schema: z.object({
      url: z.string().url(),
      waitMs: z.number().optional()
    }),
    run: async ({ url, waitMs }) => {
      ctx.emit('tool', { name: 'browser_fetch', url })
      try {
        const { chromium } = await import('playwright')
        const browser = await chromium.launch({ headless: true })
        const page = await browser.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        if (waitMs) await page.waitForTimeout(waitMs)
        const text = await page.innerText('body')
        await browser.close()
        return JSON.stringify({ ok: true, text: text.slice(0, 40_000) })
      } catch (err) {
        return JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          hint: '请确保已 npm i playwright 且执行过 npx playwright install chromium'
        })
      }
    }
  }))

  registerTool('gui_screenshot', (ctx) => ({
    name: 'gui_screenshot',
    description: '截取主屏幕并保存到 ~/.shy/artifacts/screenshots',
    schema: z.object({}),
    run: async () => {
      ctx.emit('tool', { name: 'gui_screenshot' })
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: screen.getPrimaryDisplay().size
      })
      const source = sources[0]
      if (!source) return JSON.stringify({ ok: false, error: '无可用屏幕源' })
      const dir = getShyPaths().screenshotsDir
      await mkdir(dir, { recursive: true })
      const file = join(dir, `shot-${Date.now()}.png`)
      await writeFile(file, source.thumbnail.toPNG())
      return JSON.stringify({ ok: true, path: file })
    }
  }))

  registerTool('gui_click', (ctx) => ({
    name: 'gui_click',
    description: '在屏幕坐标点击（高危，需确认）。Windows 使用 PowerShell；macOS 需要辅助功能权限',
    schema: z.object({ x: z.number(), y: z.number() }),
    run: async ({ x, y }) => {
      const ok = await ctx.confirmHighRisk('键鼠 GUI 点击', `(${x}, ${y})`)
      if (!ok) return JSON.stringify({ ok: false, error: '用户拒绝' })
      ctx.emit('tool', { name: 'gui_click', x, y })
      if (process.platform === 'win32') {
        const ps = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})
$sig = '[DllImport("user32.dll")] public static extern void mouse_event(int f,int dx,int dy,int d,int e);'
$m = Add-Type -MemberDefinition $sig -Name M -Namespace W -PassThru
$m::mouse_event(0x02,0,0,0,0); $m::mouse_event(0x04,0,0,0,0)
`
        await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`)
        return JSON.stringify({ ok: true, platform: 'win32' })
      }
      if (process.platform === 'darwin') {
        await execAsync(`cliclick c:${Math.round(x)},${Math.round(y)}`).catch(async () => {
          throw new Error('macOS 点击需要安装 cliclick（brew install cliclick）并授予辅助功能权限')
        })
        return JSON.stringify({ ok: true, platform: 'darwin' })
      }
      return JSON.stringify({ ok: false, error: `不支持的平台 ${process.platform}` })
    }
  }))

  registerTool('clipboard_read', (ctx) => ({
    name: 'clipboard_read',
    description: '读取系统剪贴板文本',
    schema: z.object({}),
    run: async () => {
      ctx.emit('tool', { name: 'clipboard_read' })
      return JSON.stringify({ ok: true, text: clipboard.readText() })
    }
  }))

  registerTool('clipboard_write', (ctx) => ({
    name: 'clipboard_write',
    description: '写入系统剪贴板文本',
    schema: z.object({ text: z.string() }),
    run: async ({ text }) => {
      ctx.emit('tool', { name: 'clipboard_write', length: text.length })
      clipboard.writeText(text)
      return JSON.stringify({ ok: true })
    }
  }))
}
