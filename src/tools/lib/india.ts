/** GST state / UT codes (first two digits of a GSTIN). */
export const GST_STATES: [string, string][] = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['97', 'Other Territory'],
]
export const stateName = (code: string) => GST_STATES.find(([c]) => c === code)?.[1] ?? ''

export const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40]

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** Validates GSTIN format and its mod-36 check character. */
export function validGstin(g: string): boolean {
  const s = g.trim().toUpperCase()
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(s[i]) * (i % 2 ? 2 : 1)
    sum += Math.floor(v / 36) + (v % 36)
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === s[14]
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  const parts: string[] = []
  if (h) parts.push(`${ONES[h]} Hundred`)
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`)
  return parts.join(' ')
}

/** Indian numbering system words: 1,23,45,678 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight". */
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 1e7)
  if (crore) parts.push(`${crore >= 1000 ? numberToWords(crore) : below1000(crore)} Crore`)
  n %= 1e7
  const lakh = Math.floor(n / 1e5)
  if (lakh) parts.push(`${below1000(lakh)} Lakh`)
  n %= 1e5
  const th = Math.floor(n / 1000)
  if (th) parts.push(`${below1000(th)} Thousand`)
  n %= 1000
  if (n) parts.push(below1000(n))
  return parts.join(' ')
}

export function rupeesInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount) + 1e-9)
  const paise = Math.round((Math.abs(amount) - rupees) * 100)
  return `${amount < 0 ? 'Minus ' : ''}Rupees ${numberToWords(rupees)}${paise ? ` and ${numberToWords(paise)} Paise` : ''} Only`
}

/** 1234567.5 → "12,34,567.50" */
export function formatInr(n: number, decimals = 2): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
