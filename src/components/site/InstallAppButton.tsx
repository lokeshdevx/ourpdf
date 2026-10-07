'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Download, FileText, MonitorSmartphone, Share, SquarePlus, WifiOff, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { BrandMark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type W = Window & { __ourpdfInstall?: InstallPromptEvent | null; __ourpdfInstalled?: boolean }

const SNOOZE_KEY = 'ourpdf.install.snoozedUntil'
const SNOOZE_DAYS = 7
const AUTO_DELAY_MS = 20_000

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

function platform(): 'ios' | 'safari' | 'firefox' | 'other' {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'safari'
  return 'other'
}

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now()
  } catch {
    return false
  }
}

const BENEFITS = [
  { icon: MonitorSmartphone, text: 'Opens in its own window, like any app' },
  { icon: WifiOff, text: 'Works offline – even without internet' },
  { icon: FileText, text: 'Open PDFs straight from your computer' },
  { icon: Zap, text: 'Starts instantly from your desktop or home screen' },
]

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span><span>{children}</span></li>
)

/**
 * "Install app": opens OurPDF's own install modal (description, benefits, Install / Later). Install hands over to the
 * browser's install confirmation where one exists (Chrome, Edge, Android); elsewhere the modal shows the manual steps.
 * The modal also appears once on its own when the browser says the site is installable; "Later" snoozes it for a week.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const [installed, setInstalled] = useState(true)
  const [canPrompt, setCanPrompt] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => {
      setInstalled(isStandalone() || !!(window as W).__ourpdfInstalled)
      setCanPrompt(!!(window as W).__ourpdfInstall)
    }
    sync()
    window.addEventListener('ourpdf:installable', sync)
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', sync)
    return () => {
      window.removeEventListener('ourpdf:installable', sync)
      mq.removeEventListener('change', sync)
    }
  }, [])

  // offer the modal once by itself, a little after the visitor arrives
  useEffect(() => {
    if (installed || !canPrompt || snoozed()) return
    const t = setTimeout(() => setOpen(true), AUTO_DELAY_MS)
    return () => clearTimeout(t)
  }, [installed, canPrompt])

  const later = useCallback(() => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000))
    } catch {
      /* storage unavailable – it simply asks again next visit */
    }
    setOpen(false)
  }, [])

  const install = async () => {
    const evt = (window as W).__ourpdfInstall
    if (!evt) return
    setBusy(true)
    try {
      await evt.prompt()
      const { outcome } = await evt.userChoice
      ;(window as W).__ourpdfInstall = null
      setCanPrompt(false)
      if (outcome === 'accepted') {
        setOpen(false)
        toast.success('OurPDF is installing – you’ll find it with your other apps.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (installed) return null
  const p = typeof window === 'undefined' ? 'other' : platform()

  return (
    <>
      <Button variant="outline" className={className ?? 'h-9 gap-2 border-primary px-3.5 font-semibold text-primary hover:bg-primary/10 hover:text-primary dark:border-primary'} onClick={() => setOpen(true)} data-testid="install-app">
        <Download className="size-4" aria-hidden /> <span className="hidden sm:inline">Install app</span><span className="sm:hidden">Install</span>
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : later())}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:hover:bg-white/15" data-testid="install-modal">
          <div className="relative bg-gradient-to-br from-primary to-violet-600 px-6 pb-6 pt-8 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" aria-hidden />
            <span className="grid size-16 place-items-center rounded-2xl bg-white shadow-lg"><BrandMark size={44} /></span>
            <DialogTitle className="mt-4 text-2xl font-extrabold tracking-tight text-white">Install OurPDF</DialogTitle>
            <DialogDescription className="mt-1 text-white/85">Get all 67 PDF tools as an app on your device – free, private and always one click away.</DialogDescription>
          </div>
          <div className="space-y-5 px-6 pb-6 pt-5">
            <ul className="space-y-2.5">
              {BENEFITS.map((b) => (
                <li key={b.text} className="flex items-center gap-3 text-sm"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><b.icon className="size-4" aria-hidden /></span>{b.text}</li>
              ))}
            </ul>

            {!canPrompt && (
              <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                <p className="mb-3 font-semibold">How to install in this browser</p>
                <ol className="space-y-2.5">
                  {p === 'ios' ? (
                    <><Step n={1}>Tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> <strong>Share</strong> in Safari’s toolbar.</Step><Step n={2}>Choose <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</Step></>
                  ) : p === 'safari' ? (
                    <><Step n={1}>In the menu bar choose <strong>File → Add to Dock…</strong></Step><Step n={2}>Click <strong>Add</strong> – OurPDF appears in your Dock.</Step></>
                  ) : p === 'firefox' ? (
                    <><Step n={1}>Desktop Firefox can’t install apps – open this site in <strong>Chrome</strong> or <strong>Edge</strong>.</Step><Step n={2}>On Android, use Firefox’s <strong>⋮ menu → Install</strong>.</Step></>
                  ) : (
                    <><Step n={1}>Open your browser menu (<strong>⋮</strong> or <strong>…</strong>).</Step><Step n={2}>Choose <strong>Install OurPDF</strong> or <strong>Add to Home screen</strong>.</Step></>
                  )}
                </ol>
              </div>
            )}

            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="size-3.5 text-green-600" aria-hidden /> No sign-up, no ads. Your files still never leave your device.</p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-10 px-5 font-semibold" onClick={later} data-testid="install-later">Later</Button>
              {canPrompt && <Button className="h-10 gap-2 px-6 font-semibold shadow-lg shadow-primary/25" disabled={busy} onClick={() => void install()} data-testid="install-confirm"><Download className="size-4" aria-hidden /> Install</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
