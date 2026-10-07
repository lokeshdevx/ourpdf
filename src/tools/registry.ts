/** Every tool. Each has its own page at /<slug>; `editor` tools hand over to the full editor from that page. */

export type ToolCategory = 'scan' | 'pages' | 'edit' | 'to-pdf' | 'from-pdf' | 'security' | 'ai' | 'business' | 'collab'

export interface ToolDef {
  slug: string
  name: string
  description: string
  category: ToolCategory
  icon: string
  /** Opens `/editor?tool=<editor>` instead of a standalone page. */
  editor?: string
  keywords: string[]
  /** Optional longer help shown under the tool. */
  about?: string
  isNew?: boolean
}

export const CATEGORIES: { id: ToolCategory; title: string; blurb: string }[] = [
  { id: 'scan', title: 'Scan & Workflow', blurb: 'Capture paper documents and automate multi-step jobs.' },
  { id: 'pages', title: 'Page Management', blurb: 'Merge, split, reorder and reshape pages.' },
  { id: 'edit', title: 'Edit & Annotate', blurb: 'Change content, sign, stamp and mark up.' },
  { id: 'to-pdf', title: 'Convert → PDF', blurb: 'Turn documents, images, sheets and audio into PDF.' },
  { id: 'from-pdf', title: 'Convert → Other', blurb: 'Get your content out of PDF in the format you need.' },
  { id: 'security', title: 'Security & Privacy', blurb: 'Protect, unlock and clean sensitive documents.' },
  { id: 'ai', title: 'AI Tools', blurb: 'On-device intelligence – your documents never leave the browser.' },
  { id: 'business', title: 'Business', blurb: 'Invoices, receipts and GST paperwork for Indian businesses.' },
  { id: 'collab', title: 'Collaborate & Share', blurb: 'Browser-to-browser sharing with no server in between.' },
]

const t = (slug: string, name: string, description: string, category: ToolCategory, icon: string, keywords: string[], extra: Partial<ToolDef> = {}): ToolDef => ({ slug, name, description, category, icon, keywords, ...extra })

export const TOOLS: ToolDef[] = [
  /* Scan & Workflow */
  t('scan-document', 'Scan Document', 'Use your camera to scan any document and export it as a PDF. 100% on-device.', 'scan', 'ScanLine', ['scanner', 'camera scan', 'photo to pdf', 'cam scanner'], { isNew: true }),
  t('pdf-workflow', 'PDF Workflow Builder', 'Upload once, chain multiple operations in sequence – compress, watermark, page numbers and more in one click.', 'scan', 'Workflow', ['batch', 'automation', 'pipeline', 'chain'], { isNew: true }),

  /* Page Management */
  t('merge-pdf', 'Merge PDFs', 'Combine multiple PDFs into one document with drag & drop.', 'pages', 'Combine', ['combine', 'join', 'append']),
  t('alternate-mix-pdf', 'Alternate & Mix PDF', 'Interleave the pages of two or more PDFs, one page from each in turn.', 'pages', 'Shuffle', ['interleave', 'collate', 'duplex scan', 'odd even'], { isNew: true }),
  t('compress-pdf', 'Compress PDF', 'Reduce PDF file size by up to 70% while maintaining quality.', 'pages', 'Minimize2', ['reduce size', 'shrink', 'optimize']),
  t('split-pdf', 'Split PDF', 'Separate PDF into individual pages or extract specific ranges.', 'pages', 'Split', ['separate', 'extract pages', 'divide']),
  t('split-pdf-by-text', 'Split PDF by Text', 'Start a new file at every page containing a phrase you choose.', 'pages', 'TextSearch', ['split on keyword', 'invoice split', 'separate by phrase'], { isNew: true }),
  t('split-pdf-by-bookmarks', 'Split PDF by Bookmarks', 'Turn each chapter or bookmarked section into its own PDF file.', 'pages', 'BookMarked', ['split chapters', 'outline', 'toc'], { isNew: true }),
  t('split-pdf-in-half', 'Split PDF in Half', 'Cut a PDF into two files, or slice every page down the middle for book scans.', 'pages', 'SquareSplitHorizontal', ['book scan', 'two up', 'cut pages'], { isNew: true }),
  t('split-pdf-by-size', 'Split PDF by Size', 'Break a large PDF into parts that each stay under a file size limit.', 'pages', 'HardDriveDownload', ['email limit', 'upload limit', 'max size'], { isNew: true }),
  t('organize-pdf', 'Organize Pages', 'Rotate, delete, reorder, or rearrange PDF pages easily.', 'pages', 'LayoutGrid', ['reorder', 'rearrange', 'delete pages', 'sort']),
  t('rotate-pdf', 'Rotate PDF', 'Rotate individual pages or the entire PDF – 90°, 180°, 270° – 100% local.', 'pages', 'RotateCw', ['turn', 'orientation', 'sideways']),
  t('flip-pdf', 'Flip PDF', 'Mirror every page of a PDF horizontally, vertically or both.', 'pages', 'FlipHorizontal2', ['mirror', 'reverse image', 'iron-on'], { isNew: true }),
  t('pages-per-sheet', 'Multiple Pages Per Sheet', 'Place 2, 4, 6, 9 or 16 PDF pages on a single sheet to save paper.', 'pages', 'Grid2x2', ['n-up', 'handouts', 'print saver', 'imposition'], { isNew: true }),
  t('crop-resize-pdf', 'Crop & Resize', 'Crop margins, resize pages to standard sizes (A4, Letter).', 'pages', 'Crop', ['trim', 'margins', 'page size', 'a4', 'letter']),
  t('pdf-to-zip', 'PDF to ZIP', 'Bundle multiple PDFs into a single compressed ZIP archive – fully local, zero upload.', 'pages', 'FileArchive', ['archive', 'bundle', 'zip files'], { isNew: true }),

  /* Edit & Annotate */
  t('edit-pdf', 'Edit PDF & Add Signature', 'Click any text to edit it in-place, add custom text, and insert digital signatures.', 'edit', 'FilePen', ['edit text', 'pdf editor', 'change text'], { editor: 'edit' }),
  t('sign-pdf', 'Sign PDF', 'Draw, type or photograph your signature and place it on any page.', 'edit', 'PenLine', ['e-sign', 'signature', 'initials']),
  t('pdf-to-handwriting', 'PDF to Handwriting', 'Turn a PDF or typed text into realistic handwritten notes.', 'edit', 'NotebookPen', ['handwritten notes', 'assignment', 'convert to handwriting'], { isNew: true }),
  t('thumbmark-maker', 'Thumbmark Maker', 'Photograph your thumbprint and get a clean transparent PNG for forms – nothing uploaded.', 'edit', 'Fingerprint', ['thumb impression', 'fingerprint png', 'angutha'], { isNew: true }),
  t('text-to-handwriting', 'Text to Handwriting', 'Type or paste text and get realistic handwritten notes – in your own handwriting, 100% private.', 'edit', 'PenTool', ['handwriting generator', 'assignment writer', 'notes'], { isNew: true }),
  t('handwriting-to-pdf', 'Handwriting to PDF', 'Convert handwritten pages to typed text, keeping the original layout.', 'edit', 'ScanText', ['handwriting ocr', 'notes to text', 'digitize notes'], { isNew: true }),
  t('fill-pdf-form', 'Fill PDF Form', 'Fill a fillable PDF and lock the answers so every viewer shows them.', 'edit', 'FormInput', ['fillable', 'acroform', 'form filler']),
  t('redact-pdf', 'Redact PDF', 'Permanently remove sensitive text and information from PDFs.', 'edit', 'SquareSlash', ['black out', 'censor', 'hide text']),
  t('add-watermark', 'Add Watermark', 'Protect documents with text or image watermarks.', 'edit', 'Droplets', ['stamp', 'logo', 'confidential']),
  t('add-page-numbers', 'Add Page Numbers', 'Automatically number PDF pages with custom formatting.', 'edit', 'ListOrdered', ['page numbering', 'paginate']),
  t('bates-numbering', 'Bates Numbering', 'Stamp sequential Bates numbers across a whole document production, continuing between files.', 'edit', 'Hash', ['legal numbering', 'discovery', 'exhibit']),
  t('headers-footers', 'Headers & Footers', 'Add custom headers and footers with text, dates, and page numbers.', 'edit', 'PanelTop', ['header', 'footer', 'running head']),
  t('flatten-pdf', 'Flatten PDF', 'Make PDFs permanently non-editable – removes forms, annotations & scripts.', 'edit', 'Layers2', ['flatten forms', 'flatten annotations', 'lock pdf']),
  t('invert-pdf-colours', 'Invert PDF Colours', 'Dark mode, light mode, sepia & high contrast – pixel-perfect colour conversion.', 'edit', 'Contrast', ['dark mode pdf', 'negative', 'night reading'], { isNew: true }),

  /* Convert → PDF */
  t('word-to-pdf', 'Word to PDF', 'Convert .doc and .docx files to PDF with perfect formatting.', 'to-pdf', 'FileText', ['docx to pdf', 'doc to pdf']),
  t('images-to-pdf', 'Images to PDF', 'Convert JPG, PNG images to PDF. Batch convert multiple images.', 'to-pdf', 'ImagePlus', ['jpg to pdf', 'png to pdf', 'photos to pdf']),
  t('excel-to-pdf', 'Excel to PDF', 'Convert spreadsheets to PDF – preserves colors, merged cells & formatting.', 'to-pdf', 'Sheet', ['xlsx to pdf', 'spreadsheet to pdf']),
  t('powerpoint-to-pdf', 'PowerPoint to PDF', 'Convert .pptx presentations to PDF – no upload, 100% private.', 'to-pdf', 'Presentation', ['pptx to pdf', 'slides to pdf'], { isNew: true }),
  t('html-to-pdf', 'HTML to PDF', 'Convert HTML files or code to professional PDFs.', 'to-pdf', 'FileCode', ['web page to pdf', 'html file']),
  t('create-pdf', 'Create PDF', 'Write rich text with formatting, images & styles – export as PDF.', 'to-pdf', 'FilePlus2', ['word processor', 'write pdf', 'new pdf']),
  t('markdown-to-pdf', 'Markdown to PDF', 'Convert Markdown documents to beautifully formatted PDFs.', 'to-pdf', 'FileType', ['md to pdf', 'readme to pdf'], { isNew: true }),
  t('resume-builder', 'Resume Builder', 'Build a resume from a finished template, then take away a PDF or the LaTeX source.', 'to-pdf', 'IdCard', ['cv maker', 'resume template', 'latex resume'], { isNew: true }),
  t('csv-pdf', 'CSV ↔ PDF Converter', 'Convert CSV to formatted PDFs or extract tables from PDFs back to CSV.', 'to-pdf', 'Table2', ['csv to pdf', 'pdf to csv', 'table'], { isNew: true }),
  t('audio-to-pdf', 'Audio to PDF', 'Transcribe any audio file to an editable PDF using on-device Whisper AI.', 'to-pdf', 'AudioLines', ['transcribe', 'speech to text', 'voice notes'], { isNew: true }),
  t('ebook-to-pdf', 'eBook to PDF', 'Convert EPUB, TXT & HTML eBooks to beautifully typeset PDFs.', 'to-pdf', 'BookOpen', ['epub to pdf', 'ebook converter'], { isNew: true }),

  /* Convert → Other */
  t('pdf-to-word', 'PDF to Word', 'Convert PDF to editable .docx files – no upload, 100% private.', 'from-pdf', 'FileText', ['pdf to docx', 'pdf to doc'], { isNew: true }),
  t('pdf-to-jpg', 'PDF to JPG', 'Convert PDF pages to high-quality JPG images (up to 600 DPI).', 'from-pdf', 'FileImage', ['pdf to image', 'pdf to png']),
  t('edit-pdf-metadata', 'Edit PDF Metadata', 'Read and rewrite the title, author, subject, keywords and dates stored inside a PDF.', 'from-pdf', 'Tags', ['properties', 'title author', 'document info']),
  t('extract-images', 'Extract Images from PDF', 'Pull the embedded photos and graphics out of a PDF at original quality.', 'from-pdf', 'Images', ['get images', 'save pictures'], { isNew: true }),
  t('pdf-to-excel', 'PDF to Excel', 'Extract tables from PDF into editable XLSX spreadsheets – 100% local, no upload.', 'from-pdf', 'Sheet', ['pdf to xlsx', 'table extraction'], { isNew: true }),
  t('pdf-to-powerpoint', 'PDF to PowerPoint', 'Convert PDF to editable .pptx presentations – pixel-perfect, 100% local.', 'from-pdf', 'Presentation', ['pdf to pptx', 'pdf to slides'], { isNew: true }),
  t('extract-text', 'Extract Text', 'Copy text from PDF documents without formatting issues.', 'from-pdf', 'Type', ['pdf to text', 'pdf to txt', 'copy text']),
  t('pdf-to-html', 'PDF to HTML', 'Convert PDF to pixel-accurate or semantic HTML – colours, fonts, tables, links preserved.', 'from-pdf', 'Code', ['pdf to web page', 'html export']),
  t('pdf-to-audio', 'PDF to Audio', 'Listen to any PDF read aloud using your browser’s built-in speech engine.', 'from-pdf', 'Volume2', ['read aloud', 'text to speech', 'tts'], { isNew: true }),
  t('pdf-to-epub', 'PDF to EPUB', 'Convert PDFs into portable eBook files for any e-reader.', 'from-pdf', 'BookOpen', ['pdf to ebook', 'kindle', 'e-reader'], { isNew: true }),

  /* Security & Privacy */
  t('encrypt-pdf', 'Encrypt PDF – Free, No Upload', 'Password-protect PDFs with strong encryption. 100% free, files never uploaded, no sign-up.', 'security', 'Lock', ['password protect', 'aes 256', 'secure pdf']),
  t('remove-password', 'Remove Password', 'Unlock password-protected PDFs and remove encryption securely.', 'security', 'LockOpen', ['decrypt', 'unlock password']),
  t('unlock-pdf', 'Unlock PDF', 'Remove printing, copying and editing restrictions from a PDF you own.', 'security', 'KeyRound', ['remove restrictions', 'permissions', 'owner password'], { isNew: true }),
  t('auto-redact-pii', 'Auto-Redact PII', 'Find and permanently remove Aadhaar, PAN, cards, emails and phone numbers.', 'security', 'EyeOff', ['aadhaar mask', 'pan', 'personal data'], { isNew: true }),
  t('privacy-risk-scanner', 'Privacy Risk Scanner', 'Detect Aadhaar, PAN, card numbers & hidden metadata. Export a redacted PDF – 100% local.', 'security', 'ShieldAlert', ['pii scan', 'metadata check', 'privacy audit'], { isNew: true }),
  t('fingerprint-generator', 'Fingerprint Generator', 'Generate SHA-256, SHA-1 & MD5 cryptographic hashes to verify file integrity.', 'security', 'FileKey', ['checksum', 'sha256', 'md5', 'hash'], { isNew: true }),

  /* AI */
  t('chat-with-pdf', 'Chat with PDF (AI)', 'Ask questions and get insights from your PDFs using AI.', 'ai', 'MessagesSquare', ['ask pdf', 'pdf question answer', 'ai'], { isNew: true }),
  t('ai-pdf-summarizer', 'AI PDF Summarizer', 'Summarize any PDF with on-device AI – no upload, 100% private.', 'ai', 'Sparkles', ['summary', 'tldr', 'key points'], { isNew: true }),
  t('ocr-pdf', 'Searchable PDF (OCR)', 'Extract text from scanned or image-based PDFs using AI recognition.', 'ai', 'ScanText', ['ocr', 'searchable', 'scan to text']),
  t('compare-pdfs', 'Compare PDFs', 'View two PDF files side-by-side for easy comparison.', 'ai', 'GitCompare', ['diff', 'differences', 'versions'], { isNew: true }),
  t('repair-pdf', 'Repair PDF', 'Fix corrupted, truncated, or broken PDF files – no upload needed.', 'ai', 'Wrench', ['fix pdf', 'corrupt', 'recover'], { isNew: true }),

  /* Business */
  t('gst-invoice-generator', 'GST Invoice Generator', 'Create legally compliant GST Tax Invoices – CGST, SGST, IGST, HSN codes, all included.', 'business', 'ReceiptIndianRupee', ['tax invoice', 'gst bill', 'hsn'], { isNew: true }),
  t('pos-bill-generator', 'POS Bill Generator', 'Point-of-sale billing for any shop – manage products, cart, GST, and print thermal receipts.', 'business', 'ShoppingCart', ['billing software', 'receipt', 'thermal printer'], { isNew: true }),
  t('gst-filing-prep', 'GST Filing Prep', 'Compress & split compiled PDFs to meet GST portal upload limits – SCN Reply and Appeal.', 'business', 'FolderCheck', ['gst portal', 'scn reply', 'appeal upload limit'], { isNew: true }),

  /* Collaborate */
  t('p2p-file-share', 'P2P File Share', 'Send any file directly to another browser – no server, no upload, 100% private.', 'collab', 'Share2', ['send files', 'webrtc', 'transfer'], { isNew: true }),
  t('collab-whiteboard', 'Collab Whiteboard', 'Real-time P2P drawing – no server, no upload.', 'collab', 'Presentation', ['draw together', 'whiteboard', 'sketch'], { isNew: true }),
]

export const TOOL_MAP = new Map(TOOLS.map((x) => [x.slug, x]))
/** Every tool has its own page at a clean root URL (good for search). Editor-backed tools link onwards from there. */
export const STANDALONE = TOOLS
export const toolHref = (x: ToolDef) => `/${x.slug}`
