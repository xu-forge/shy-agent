import { useCallback, useEffect, useState } from 'react'
import type { Project, ProjectType } from '../../../shared/ipc'

const NONE = ''
const ADD = '__add__'

type Props = {
  value: string | null
  disabled: boolean
  onChange: (projectId: string | null) => void
  onProjectsChanged?: () => void
}

export function ProjectPicker({
  value,
  disabled,
  onChange,
  onProjectsChanged
}: Props): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<Project[]> => {
    const list = await window.shy.listProjects()
    setProjects(list)
    return list
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
  }, [refresh])

  const addProject = async (type: ProjectType): Promise<void> => {
    setAdding(false)
    setError('')
    const picked = await window.shy.pickFolder()
    if (!picked.ok) return
    const created = await window.shy.createProject({ type, rootPath: picked.path })
    if (!created.ok) {
      setError(created.error === 'root_path_taken' ? '该目录已有项目' : '创建失败')
      return
    }
    await refresh()
    onChange(created.project.id)
    onProjectsChanged?.()
  }

  const onSelect = (raw: string): void => {
    if (raw === ADD) {
      setAdding(true)
      return
    }
    setAdding(false)
    setError('')
    onChange(raw === NONE ? null : raw)
  }

  return (
    <div className="project-picker">
      <select
        className="project-picker-select"
        aria-label="项目"
        value={value ?? NONE}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value={NONE}>未选择项目</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.type === 'code' ? ' · 代码' : ' · 素材'}
          </option>
        ))}
        <option value={ADD} disabled={disabled}>
          添加项目…
        </option>
      </select>
      {adding && !disabled ? (
        <div className="project-picker-types" role="group" aria-label="项目类型">
          <button type="button" onClick={() => void addProject('code')}>
            代码项目
          </button>
          <button type="button" onClick={() => void addProject('material')}>
            素材项目
          </button>
        </div>
      ) : null}
      {error ? <span className="project-picker-error">{error}</span> : null}
    </div>
  )
}
