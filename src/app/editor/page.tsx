import type { Metadata } from 'next'
import { EditorLoader } from '@/components/editor/EditorLoader'

export const metadata: Metadata = {
  title: 'OurPDF Editor',
  description: 'Edit, annotate, sign, organize and convert PDFs privately in your browser.',
  robots: { index: false },
}

export default function EditorPage() {
  return <EditorLoader />
}
