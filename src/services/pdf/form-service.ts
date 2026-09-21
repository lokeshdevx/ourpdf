import { useFormStore } from '@/stores/form-store'
import { getObjects } from '@/stores/annotation-store'
import { updateObjects } from './annotation-service'
import type { EditObject, FieldObj } from '@/types'

/** Returns an error message when `value` violates the field's rules, otherwise null. */
export function validateValue(f: FieldObj, value: string | boolean): string | null {
  if (f.ftype === 'checkbox' || f.ftype === 'radio') return f.required && value !== true && f.ftype === 'checkbox' ? 'Required' : null
  const s = String(value ?? '')
  if (f.required && !s.trim()) return 'Required'
  if (!s) return null
  const v = f.validation
  switch (v.kind) {
    case 'number':
      return Number.isFinite(Number(s)) ? null : (v.message ?? 'Enter a number')
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? null : (v.message ?? 'Enter a valid email')
    case 'maxlength':
      return v.max && s.length > v.max ? (v.message ?? `Max ${v.max} characters`) : null
    case 'regex':
      try {
        return new RegExp(v.pattern ?? '').test(s) ? null : (v.message ?? 'Invalid format')
      } catch {
        return null
      }
    default:
      return null
  }
}

export function validateField(docId: string, id: string, value: string | boolean) {
  const f = getObjects(docId).find((o) => o.id === id)
  if (!f || f.type !== 'field') return
  useFormStore.getState().setError(id, validateValue(f, value))
}

/** Validates all fields; returns the number of problems. */
export function validateAll(docId: string): number {
  let n = 0
  const store = useFormStore.getState()
  for (const o of getObjects(docId)) {
    if (o.type !== 'field') continue
    const err = validateValue(o, o.value)
    store.setError(o.id, err)
    if (err) n++
  }
  return n
}

export function fieldsOf(docId: string): FieldObj[] {
  return getObjects(docId).filter((o): o is FieldObj => o.type === 'field')
}

/** Resets every field to its default value (one undo step). */
export function resetForm(docId: string) {
  const patches: Record<string, Partial<EditObject>> = {}
  for (const f of fieldsOf(docId)) patches[f.id] = { value: f.defaultValue }
  updateObjects(docId, patches, 'Reset form')
  useFormStore.getState().clearErrors()
}

export interface FormDataExport {
  format: 'pdfstudio-form-data'
  version: 1
  fields: Record<string, string | boolean | string[]>
}

export function exportFormData(docId: string): FormDataExport {
  const fields: FormDataExport['fields'] = {}
  for (const f of fieldsOf(docId)) {
    if (f.ftype === 'button' || f.ftype === 'signature') continue
    if (f.ftype === 'radio') {
      if (f.value === true) fields[f.fieldName] = f.exportValue
      else if (!(f.fieldName in fields)) fields[f.fieldName] = ''
    } else fields[f.fieldName] = f.value
  }
  return { format: 'pdfstudio-form-data', version: 1, fields }
}

export function formDataToCsv(data: FormDataExport): string {
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
  return `${Object.keys(data.fields).map(esc).join(',')}\n${Object.values(data.fields).map(esc).join(',')}\n`
}

/** Imports {name: value}; returns how many fields were matched. Radio groups match by export value. */
export function importFormData(docId: string, data: unknown): number {
  const d = data as Partial<FormDataExport>
  const values = d && typeof d === 'object' && 'fields' in d && d.fields ? d.fields : (data as Record<string, unknown>)
  if (!values || typeof values !== 'object') throw new Error('The file is not valid form data.')
  const patches: Record<string, Partial<EditObject>> = {}
  let matched = 0
  const seen = new Set<string>()
  for (const f of fieldsOf(docId)) {
    if (!(f.fieldName in values) || f.readOnly) continue
    const v = (values as Record<string, unknown>)[f.fieldName]
    if (f.ftype === 'checkbox') patches[f.id] = { value: v === true || v === 'true' || v === 'Yes' || v === f.exportValue }
    else if (f.ftype === 'radio') patches[f.id] = { value: String(v) === f.exportValue }
    else patches[f.id] = { value: Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '') }
    if (!seen.has(f.fieldName)) {
      seen.add(f.fieldName)
      matched++
    }
  }
  if (matched) updateObjects(docId, patches, 'Import form data')
  return matched
}
