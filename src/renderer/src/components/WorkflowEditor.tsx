import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Workflow, WorkflowNode, WorkflowNodeType } from '../../../shared/ipc'
import { NODE_TYPE_LABELS } from '../../../shared/workflow-format'
import { WorkflowScheduleEditor } from './WorkflowScheduleEditor'

type Props = {
  initial: Workflow
  onBack: () => void
  onSaved: () => void
}

const COLORS: Record<string, string> = {
  trigger: '#7c5cff',
  fetch: '#2f9e6b',
  summarize: '#2f6bb0',
  recommend: '#d97706',
  write_doc: '#b0463a',
  output: '#666'
}

// 自定义节点组件
function WFNode({ data, selected }: NodeProps): React.JSX.Element {
  const type = data.type as WorkflowNodeType
  const hasInput = type !== 'trigger'
  const hasOutput = true
  return (
    <div
      className={`wf-node${selected ? ' selected' : ''}`}
      style={{ borderTopColor: COLORS[type] }}
    >
      {hasInput ? <Handle type="target" position={Position.Left} className="wf-handle" /> : null}
      <div className="wf-node-title">{data.label as string}</div>
      <div className="wf-node-type">{NODE_TYPE_LABELS[type] ?? type}</div>
      {hasOutput ? <Handle type="source" position={Position.Right} className="wf-handle" /> : null}
    </div>
  )
}

const nodeTypes: NodeTypes = { wf: WFNode }

let nodeSeq = 0
let edgeSeq = 0
function nextNodeId(type: string): string {
  nodeSeq += 1
  return `${type}_${nodeSeq}`
}
function nextEdgeId(): string {
  edgeSeq += 1
  return `e_${edgeSeq}`
}

function toRFNodes(nodes: WorkflowNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'wf',
    position: { x: n.x, y: n.y },
    data: { ...n }
  }))
}

function toRFEdges(edges: { id: string; source: string; target: string }[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.8 }
  }))
}

export function WorkflowEditor({ initial, onBack, onSaved }: Props): React.JSX.Element {
  const [wf, setWf] = useState<Workflow>(initial)
  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(initial.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(initial.edges))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle')
  const [runMessage, setRunMessage] = useState<string | null>(null)

  // 反向映射：RF node id -> WorkflowNode
  const rfNodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return
      const id = nextEdgeId()
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 1.8 }
          },
          eds
        )
      )
      setWf((prev) => ({
        ...prev,
        edges: [...prev.edges, { id, source: conn.source!, target: conn.target! }],
        updatedAt: new Date().toISOString()
      }))
    },
    [setEdges]
  )

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const addNodeFromLibrary = (type: WorkflowNodeType): void => {
    const id = nextNodeId(type)
    const defaults: Record<string, unknown> =
      type === 'fetch'
        ? { url: '' }
        : type === 'write_doc'
          ? { filename: 'report.md', dir: '' }
          : {}
    const node: WorkflowNode = {
      id,
      type,
      label: NODE_TYPE_LABELS[type] ?? type,
      x: 60 + (nodes.length % 4) * 220,
      y: 40 + Math.floor(nodes.length / 4) * 120,
      config: defaults
    }
    setWf((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
      updatedAt: new Date().toISOString()
    }))
    setNodes((nds) => [
      ...nds,
      { id, type: 'wf', position: { x: node.x, y: node.y }, data: { ...node } }
    ])
    setSelectedNodeId(id)
  }

  const updateSelectedNode = (patch: Partial<WorkflowNode>): void => {
    if (!selectedNodeId) return
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n)),
      updatedAt: new Date().toISOString()
    }))
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n))
    )
  }

  const updateSelectedConfig = (key: string, value: unknown): void => {
    if (!selectedNodeId) return
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, config: { ...n.config, [key]: value } } : n
      ),
      updatedAt: new Date().toISOString()
    }))
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: { ...n.data, config: { ...(n.data as WorkflowNode).config, [key]: value } }
            }
          : n
      )
    )
  }

  const removeSelectedNode = (): void => {
    if (!selectedNodeId) return
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== selectedNodeId),
      edges: prev.edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
      updatedAt: new Date().toISOString()
    }))
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }

  const buildCurrentWf = useCallback((): Workflow => {
    const nodeList: WorkflowNode[] = nodes.map((n) => ({
      ...(n.data as WorkflowNode),
      id: n.id,
      x: n.position.x,
      y: n.position.y
    }))
    const edgeList = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target
    }))
    return { ...wf, nodes: nodeList, edges: edgeList, updatedAt: new Date().toISOString() }
  }, [nodes, edges, wf])

  const save = async (): Promise<void> => {
    const current = buildCurrentWf()
    await window.shy.saveWorkflow(current)
    setWf(current)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    onSaved()
  }

  const run = async (): Promise<void> => {
    if (runStatus === 'running') return
    setRunStatus('running')
    setRunMessage('正在执行…')
    try {
      const current = buildCurrentWf()
      await window.shy.saveWorkflow(current)
      setWf(current)
      const result = await window.shy.runWorkflow(current.id)
      if (result.ok) {
        setRunStatus('success')
        setRunMessage(result.run?.output ? '执行完成，已生成文档' : '执行完成')
      } else {
        setRunStatus('failed')
        setRunMessage(result.error || result.run?.error || '执行失败')
      }
    } catch (err) {
      setRunStatus('failed')
      setRunMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const selectedNode =
    selectedNodeId && rfNodeMap.get(selectedNodeId)
      ? (rfNodeMap.get(selectedNodeId)!.data as WorkflowNode)
      : null

  return (
    <div className="wf-editor">
      <div className="wf-toolbar">
        <button type="button" className="btn" onClick={onBack}>
          ← 返回
        </button>
        <span className="wf-title">{wf.name}</span>
        <div className="wf-toolbar-right">
          {saved ? <span className="toast">已保存</span> : null}
          {runMessage ? (
            <span
              className={`wf-run-status wf-run-${runStatus}`}
              title={runMessage}
              role="status"
            >
              {runStatus === 'running' ? '… ' : runStatus === 'success' ? '✓ ' : runStatus === 'failed' ? '✗ ' : ''}
              {runMessage}
            </span>
          ) : null}
          <button type="button" className="btn" onClick={() => void save()} disabled={runStatus === 'running'}>
            保存
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void run()}
            disabled={runStatus === 'running'}
          >
            {runStatus === 'running' ? '执行中…' : '保存并立即执行'}
          </button>
        </div>
      </div>

      <div className="wf-body">
        <aside className="wf-library" aria-label="节点库">
          <div className="wf-library-title">节点库</div>
          {(Object.keys(NODE_TYPE_LABELS) as WorkflowNodeType[]).map((t) => (
            <button
              key={t}
              type="button"
              className="wf-lib-item"
              onClick={() => addNodeFromLibrary(t)}
            >
              <span className="wf-dot" style={{ background: COLORS[t] }} />
              {NODE_TYPE_LABELS[t]}
            </button>
          ))}
          <p className="wf-library-hint">
            点击添加节点到画布。在画布上拖动节点，从右侧端口拖到左侧端口连线。
          </p>
        </aside>

        <div className="wf-canvas">
          {nodes.length === 0 ? (
            <div className="wf-canvas-empty">从左侧节点库添加第一个节点</div>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="transparent" />
            <Controls />
            <MiniMap nodeColor={(n) => COLORS[(n.data as WorkflowNode).type] ?? '#888'} />
          </ReactFlow>
        </div>

        <aside className="wf-inspector" aria-label="属性面板">
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              onChange={(patch) => updateSelectedNode(patch)}
              onConfig={(key, value) => updateSelectedConfig(key, value)}
              onRemove={removeSelectedNode}
            />
          ) : (
            <WorkflowSettings wf={wf} setWf={setWf} />
          )}
        </aside>
      </div>
    </div>
  )
}

function WorkflowSettings({
  wf,
  setWf
}: {
  wf: Workflow
  setWf: (w: Workflow) => void
}): React.JSX.Element {
  return (
    <div className="wf-inspector-block">
      <div className="wf-inspector-head">
        <h3>工作流设置</h3>
        <p className="wf-inspector-sub">未选中节点时编辑全局信息；点击画布节点可配置该步骤。</p>
      </div>
      <label>
        名称
        <input value={wf.name} onChange={(e) => setWf({ ...wf, name: e.target.value })} />
      </label>
      <label>
        描述
        <textarea
          value={wf.description}
          onChange={(e) => setWf({ ...wf, description: e.target.value })}
          rows={3}
          placeholder="简要说明这个工作流做什么"
        />
      </label>
      <div className="section-divider">
        <h3>定时调度</h3>
      </div>
      <WorkflowScheduleEditor
        schedule={wf.schedule}
        onChange={(schedule) => setWf({ ...wf, schedule })}
      />
    </div>
  )
}

function NodeInspector({
  node,
  onChange,
  onConfig,
  onRemove
}: {
  node: WorkflowNode
  onChange: (patch: Partial<WorkflowNode>) => void
  onConfig: (key: string, value: unknown) => void
  onRemove: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="wf-inspector-block">
      <div className="wf-inspector-head">
        <h3>节点设置</h3>
        <span className="wf-type-chip">
          <span className="wf-dot" style={{ background: COLORS[node.type] }} />
          {NODE_TYPE_LABELS[node.type] ?? node.type}
        </span>
      </div>
      <label>
        标签
        <input value={node.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      {node.type === 'fetch' ? (
        <>
          <label>
            抓取 URL
            <input
              value={String(node.config.url ?? '')}
              placeholder="https://example.com/news"
              onChange={(e) => onConfig('url', e.target.value)}
            />
          </label>
          <label>
            等待毫秒（可选）
            <input
              type="number"
              value={String(node.config.waitMs ?? '')}
              onChange={(e) =>
                onConfig('waitMs', e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        </>
      ) : null}
      {node.type === 'summarize' ? (
        <>
          <label>
            语言
            <input
              value={String(node.config.language ?? '简体中文')}
              onChange={(e) => onConfig('language', e.target.value)}
            />
          </label>
          <label>
            摘要要求
            <textarea
              value={String(node.config.brief ?? '请用要点总结以下内容，突出关键信息')}
              onChange={(e) => onConfig('brief', e.target.value)}
              rows={3}
            />
          </label>
        </>
      ) : null}
      {node.type === 'recommend' ? (
        <>
          <label>
            分析角色
            <input
              value={String(node.config.context ?? '股票概念与标的推荐')}
              onChange={(e) => onConfig('context', e.target.value)}
            />
          </label>
          <label>
            推荐要求
            <textarea
              value={String(node.config.style ?? '')}
              onChange={(e) => onConfig('style', e.target.value)}
              rows={3}
              placeholder="请从新闻中提炼相关概念板块，并推荐可能受益的股票（给出理由）"
            />
          </label>
        </>
      ) : null}
      {node.type === 'write_doc' ? (
        <>
          <label>
            文件名
            <input
              value={String(node.config.filename ?? 'report.md')}
              onChange={(e) => onConfig('filename', e.target.value)}
            />
          </label>
          <label>
            输出目录（留空=~/.shy/artifacts/reports）
            <input
              value={String(node.config.dir ?? '')}
              onChange={(e) => onConfig('dir', e.target.value)}
              placeholder="/path/to/output"
            />
          </label>
        </>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-danger" onClick={() => onRemove(node.id)}>
          删除节点
        </button>
      </div>
    </div>
  )
}
