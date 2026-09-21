export interface StampPreset {
  id: string
  label: string
  color: string
  showDate?: boolean
  dynamic?: boolean
}
export const STAMP_PRESETS: StampPreset[] = [
  { id: 'approved', label: 'APPROVED', color: '#16a34a' },
  { id: 'rejected', label: 'REJECTED', color: '#dc2626' },
  { id: 'draft', label: 'DRAFT', color: '#2563eb' },
  { id: 'confidential', label: 'CONFIDENTIAL', color: '#dc2626' },
  { id: 'review', label: 'FOR REVIEW', color: '#d97706' },
  { id: 'final', label: 'FINAL', color: '#7c3aed' },
  { id: 'void', label: 'VOID', color: '#475569' },
  { id: 'date', label: 'RECEIVED', color: '#0f766e', showDate: true },
  { id: 'dynamic', label: 'Approved {date} {time}', color: '#16a34a', dynamic: true },
]
