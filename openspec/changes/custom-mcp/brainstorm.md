<!--
Raw capture of superpowers:brainstorming output.
-->

# Brainstorm: 自定义 MCP（stdio）替代内置 web_search

> 本档为 superpowers:brainstorming 的 raw capture，供 proposal / design 萃取。

## 背景

Session 日志显示内置 `web_search` 失败：`bing 无结构化命中；ddg 无命中`。实现是本机 `httpGet` 抓 Bing HTML 再正则抠 `li.b_algo`，失败回退 DuckDuckGo Instant Answer。国内 Electron `net.fetch` 拿到的往往不是可解析 SERP；DDG Instant 对中文查询也常为空。百度移动端只在排查时验证过，**从未写入内置实现**。

对照：

- WorkBuddy：`POST ${endpoint}/agenttool/v1/search`（需登录 Bearer），不扒 HTML。
- dream：WPS `agentspace .../web-search`（`wps_sid`）或 hosted provider。
- pi-agent：**没有** webSearch / MCP 内置。

用户实际搜索来源是 [MiniMax Token Plan MCP](https://platform.minimaxi.com/docs/token-plan/mcp-guide)：`uvx minimax-coding-plan-mcp`，stdio，工具名 `web_search`。

shy 现状：无 MCP 客户端；工具经 `registerTool` → `buildTools` 注入 LLM。设置弹窗仅记忆 / 常规 / 日志。`config/mcporter.json` 为空壳，README MCP 未做。`web_fetch` 为 HTTP GET + 剥标签，与搜索无关。

## Q1：配置方式？

| 方案 | 说明 |
|---|---|
| A | 仅设置表单 |
| B | 仅 `~/.shy/config/mcp.json` |
| **C（选）** | JSON 为源 + 设置页编辑 |

**结论**：`~/.shy/config/mcp.json` 为唯一源；格式对齐 Cursor / Claude Desktop `mcpServers`。设置新增 MCP tab 做增删改、开关、连接状态。

## Q2：传输？

用户给的 MiniMax 配置是 stdio：

```json
{
  "mcpServers": {
    "MiniMax": {
      "command": "uvx",
      "args": ["minimax-coding-plan-mcp", "-y"],
      "env": {
        "MINIMAX_API_KEY": "…",
        "MINIMAX_API_HOST": "https://api.minimaxi.com"
      }
    }
  }
}
```

**结论**：首版 **只做 stdio**（`command` / `args` / `env` / `enabled`）。SSE / HTTP 以后再加。

## Q3：与内置 web_search 撞名？

内置不是百度。用户决定：**拿掉内置 `web_search`**，搜索只走 MCP。MiniMax 导出名就是 `web_search`，无需前缀。

`web_fetch` **保留**（MiniMax MCP 文档只有 search，没有 fetch）。

撞名策略：MCP 工具沿用导出名；两个 server 导出同名时，后者加前缀 `mcp_<server>_`。

## Q4：何时连接？

| 方案 | 说明 |
|---|---|
| **1（选）** | 应用启动时连所有 enabled server |
| 2 | 第一次发消息再连 |
| 3 | 设置里手动点连接 |

**结论**：启动并行连接；某一个失败只记状态，不堵其它。设置保存后重连变更过的 server，不必整应用重启。Electron 下 `uvx` 常不在 PATH，失败提示用绝对路径。

## 明确不做

- SSE / Streamable HTTP 远程 MCP
- MCP 市场 / 专家中心
- Resources / Prompts 全协议（首版只要 tools）
- 为 MCP 工具另做专用 Renderer（走现有通用 / SearchFetch 按工具名匹配）

## 验收锚点

配上 MiniMax MCP 后，问「广州周末去哪玩」能真正搜到结果；不配 MCP 时没有 `web_search`，`web_fetch` 仍可用。
