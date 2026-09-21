export type ErrorCode =
  | 'unreadable'
  | 'password-required'
  | 'password-incorrect'
  | 'encrypted-unsupported'
  | 'memory'
  | 'unsupported'
  | 'cancelled'
  | 'ocr'
  | 'invalid-input'
  | 'io'
  | 'unknown'

export class AppError extends Error {
  code: ErrorCode
  detail?: string
  constructor(code: ErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.detail = detail
  }
}

export class CancelledError extends AppError {
  constructor(message = 'Cancelled') {
    super('cancelled', message)
  }
}

export const isCancelled = (e: unknown): boolean =>
  e instanceof AppError ? e.code === 'cancelled' : e instanceof DOMException && e.name === 'AbortError'

/** Turns any thrown value into a friendly, honest message for the UI. */
export function toUserError(e: unknown, fallback = 'Something went wrong'): AppError {
  if (e instanceof AppError) return e
  const err = e as { name?: string; message?: string; code?: number }
  const msg = String(err?.message ?? e ?? '')
  if (err?.name === 'PasswordException') {
    return new AppError(err.code === 2 ? 'password-incorrect' : 'password-required', err.code === 2 ? 'Incorrect password' : 'This PDF is password protected')
  }
  if (err?.name === 'AbortError' || err?.name === 'RenderingCancelledException') return new CancelledError()
  if (/out of memory|allocation failed|array buffer allocation|Invalid array length|RangeError: Array buffer/i.test(msg) || err?.name === 'QuotaExceededError') {
    return new AppError('memory', 'Browser memory limit reached. Close other documents/tabs, enable low-memory mode, or split the file.', msg)
  }
  if (/encrypted/i.test(msg) && /not supported|ignoreEncryption/i.test(msg)) {
    return new AppError('encrypted-unsupported', 'Encrypted PDF is not supported by this operation. Open it with its password first.', msg)
  }
  if (/InvalidPDFException|Invalid PDF structure|Failed to parse|No PDF header|Expected instance of PDFDict|Unexpected end/i.test(msg) || err?.name === 'InvalidPDFException' || err?.name === 'FormatError') {
    return new AppError('unreadable', 'Unable to read PDF. The file may be damaged or use an unsupported PDF structure.', msg)
  }
  return new AppError('unknown', msg || fallback, msg)
}
