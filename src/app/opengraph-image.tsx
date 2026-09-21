import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const alt = 'OurPDF – Powerful PDF editing. Completely private.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo-mark.png'))).toString('base64')}`
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: 'linear-gradient(135deg,#1e3a8a 0%,#4f46e5 55%,#7c3aed 100%)', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 96, height: 96, borderRadius: 26, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={logo} width={64} height={68} alt="" />
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, display: 'flex' }}>Our<span style={{ color: '#93c5fd' }}>PDF</span></div>
        </div>
        <div style={{ marginTop: 44, fontSize: 82, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Powerful PDF editing. Completely private.</div>
        <div style={{ marginTop: 28, fontSize: 34, opacity: 0.9 }}>Edit, sign, OCR, merge & compress – right in your browser.</div>
        <div style={{ marginTop: 48, display: 'flex', gap: 16, fontSize: 26 }}>
          {['No uploads', 'No accounts', 'Works offline'].map((t) => (<div key={t} style={{ padding: '10px 22px', borderRadius: 999, background: 'rgba(255,255,255,0.18)' }}>{t}</div>))}
        </div>
      </div>
    ),
    size,
  )
}
