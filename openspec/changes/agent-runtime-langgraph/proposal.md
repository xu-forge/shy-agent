## Why

壳已就绪但无法对话。需要在 main 进程落地 LangGraph 编排与 OpenAI-compatible 模型接入，并支持交互式/目标双模式，作为记忆、技能、本机工具的宿主。

## What Changes

- 新增模型设置存取（本地 userData，apiKey 本地保存）
- LangGraph agent 循环：消息状态、工具调用钩子、取消
- 交互式：单轮/对话协作；目标模式：自动续跑直到完成、失败或高危确认
- IPC：settings、chat、cancel、事件推送
- Renderer：接通发送与流式展示（基础）

## Capabilities

### New Capabilities

- `model-settings`: OpenAI-compatible 配置读写
- `agent-runtime`: LangGraph 双模式执行与事件流

### Modified Capabilities

- `renderer-shell-ui`: 聊天从占位变为可发送（依赖 runtime）

## Impact

- 依赖：@langchain/langgraph、@langchain/openai、@langchain/core 等
- main 进程常驻 agent 服务；需网络访问模型 API
