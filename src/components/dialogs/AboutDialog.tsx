'use client'

import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell } from './DialogShell'

export default function AboutDialog() {
  const close = useUiStore((s) => s.closeDialog)
  return (
    <DialogShell id="about" title="About OurPDF" size="lg" footer={<Button onClick={close}>Close</Button>}>
      <section className="space-y-1 text-sm">
        <h3 className="flex items-center gap-2 font-medium"><Lock className="size-4" /> Privacy</h3>
        <p>Your files never leave this device. There is no server, account, upload or analytics. The page’s Content-Security-Policy also blocks network requests to other origins, so the browser itself prevents accidental leaks. After the first visit the app works offline.</p>
      </section>
      <section className="space-y-1 text-sm">
        <h3 className="font-medium">Honest limitations</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li><strong className="text-foreground">Editing existing text</strong> is done by covering the original run and placing replacement text (an overlay) in the exact font the PDF embeds (or its metric-compatible standard font). Arbitrary PDF text – embedded subset fonts, complex layout – cannot always be edited natively. To remove text for good, use Redact.</li>
          <li><strong className="text-foreground">Redaction</strong> is real: pages with redactions are re-rendered with the marked areas burned into the pixels and the original content is dropped. Those pages become images (with a rebuilt searchable text layer that excludes redacted text).</li>
          <li><strong className="text-foreground">Signatures</strong> are visual images, not certificate-based digital signatures.</li>
          <li><strong className="text-foreground">Passwords</strong>: AES-256 encryption is genuine; permission flags (print/copy/edit) are honoured only by compliant viewers.</li>
          <li><strong className="text-foreground">Cropping</strong> hides content but does not delete it, like most editors.</li>
          <li><strong className="text-foreground">DOCX/XLSX → PDF</strong> is best-effort (no complex layout). <strong className="text-foreground">PDF → DOCX/XLSX/PPTX</strong> is not offered because it cannot be done reliably without a server.</li>
          <li><strong className="text-foreground">Fonts</strong>: standard PDF fonts cover Latin text; other scripts are embedded as images unless you load a custom TTF/OTF font.</li>
          <li><strong className="text-foreground">Very large files</strong> are streamed for viewing, but exporting needs the whole file in memory; the status bar warns when memory gets risky.</li>
          <li>Annotations are written into page content on export (not as editable native annotations), except links, notes and form fields which are native. The editable version lives in your local project.</li>
        </ul>
      </section>
      <section className="text-xs text-muted-foreground">Built with Next.js, React, PDF.js, pdf-lib, Tesseract.js, JSZip, Radix UI / shadcn/ui and Tailwind CSS.</section>
    </DialogShell>
  )
}
