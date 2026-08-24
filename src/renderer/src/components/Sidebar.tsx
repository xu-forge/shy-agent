import type { SessionSummary } from '../../../shared/ipc'
import type { NavKey, SecondaryMode, SessionGroup } from '../lib/shellLayout'
import type { SettingsTab } from './SettingsDialog'
import { IconRail } from './IconRail'
import { SecondarySidebar } from './SecondarySidebar'

export type { NavKey }

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
  showSecondary: boolean
  secondaryMode: SecondaryMode
  groups: SessionGroup[]
  activeSessionId: string
  onSelectSession: (session: SessionSummary) => void
  onNewSession: () => void
  onDeleteSession: (id: string, title: string) => void
  onDeleteProject: (id: string, title: string) => void
  ipcOk: boolean | null
  onOpenSettings: (tab?: SettingsTab) => void
  codeProjectId?: string | null
  codeRootPath?: string | null
  openFilePath?: string | null
  onOpenFile?: (relativePath: string) => void
}

/** 图标轨 + 可选二级侧栏（会话分组 / 文件树） */
export function Sidebar({
  active,
  onChange,
  showSecondary,
  secondaryMode,
  groups,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onDeleteProject,
  ipcOk,
  onOpenSettings,
  codeProjectId,
  codeRootPath,
  openFilePath,
  onOpenFile
}: Props): React.JSX.Element {
  return (
    <>
      <IconRail
        active={active}
        onChange={onChange}
        onOpenSettings={() => onOpenSettings('general')}
        ipcOk={ipcOk}
      />
      {showSecondary ? (
        <SecondarySidebar
          mode={secondaryMode}
          groups={groups}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
          onDeleteProject={onDeleteProject}
          projectId={codeProjectId}
          rootPath={codeRootPath}
          activeFilePath={openFilePath}
          onOpenFile={onOpenFile}
        />
      ) : null}
    </>
  )
}
