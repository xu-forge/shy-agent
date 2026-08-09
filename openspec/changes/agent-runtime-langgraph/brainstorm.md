# Brainstorm — agent-runtime-langgraph

过夜默认（产品简报已确认）：
- OpenAI-compatible（设置页配置 baseURL/apiKey/model）
- LangGraph 跑在 Electron main
- 双模式：interactive / goal（goal 自动续跑至完成/失败/需确认）
- 单用户；不做多 Agent

选定：ChatOpenAI + 自定义 baseURL；简单 StateGraph（messages + tools 循环）；IPC 流式事件推送到 renderer。
