import WorkspaceHeader from '@/components/dashboard/workspace-header'
import DocumentsManager from '@/components/company/documents-manager'

export default function DocumentsPage() {
  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader title="Company documents" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-5 pt-5 pb-8 text-sm leading-7 sm:px-8"><DocumentsManager /></div>
      </div>
    </div>
  )
}
