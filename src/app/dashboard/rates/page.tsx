import WorkspaceHeader from '@/components/dashboard/workspace-header'
import RatesManager from '@/components/company/rates-manager'

export default function RatesPage() {
  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader title="Agreed rates" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-5 pt-5 pb-8 text-sm leading-7 sm:px-8"><RatesManager /></div>
      </div>
    </div>
  )
}
