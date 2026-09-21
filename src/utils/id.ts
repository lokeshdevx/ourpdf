let counter = 0
/** Short unique id, safe for DOM ids and IndexedDB keys. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6
  const rnd =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2, 14)
  return `${prefix}-${rnd}${counter.toString(36)}`
}
