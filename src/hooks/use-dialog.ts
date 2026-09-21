import { useUiStore, type DialogId } from '@/stores/ui-store'

export function useDialogOpener() {
  const open = useUiStore((s) => s.openDialog)
  return (id: DialogId, data?: unknown) => open(id, data)
}
