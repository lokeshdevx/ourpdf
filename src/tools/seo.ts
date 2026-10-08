import { CATEGORIES, TOOLS, type ToolDef } from './registry'

/** Search-engine content for every tool page: title, intro, how-to steps and FAQ. */
export interface ToolSeo { title: string; description: string; intro: string; steps: string[]; faq: { q: string; a: string }[]; points: string[] }

const INPUT: Partial<Record<string, string>> = {
  'scan-document': 'Open your camera (or choose photos of the pages)', 'merge-pdf': 'Choose two or more PDF files', 'alternate-mix-pdf': 'Choose the PDFs to interleave', 'pdf-to-zip': 'Choose the PDFs to bundle', 'bates-numbering': 'Choose the PDFs in production order',
  'word-to-pdf': 'Choose your .docx files', 'images-to-pdf': 'Choose your JPG, PNG or other images', 'excel-to-pdf': 'Choose your spreadsheet', 'powerpoint-to-pdf': 'Choose your .pptx presentation', 'html-to-pdf': 'Paste HTML code or choose an .html file',
  'create-pdf': 'Write your document in the editor', 'markdown-to-pdf': 'Paste Markdown or open a .md file', 'resume-builder': 'Pick a template and fill in your details', 'csv-pdf': 'Choose a CSV file (or a PDF with tables)', 'audio-to-pdf': 'Choose an audio file or record with your microphone',
  'ebook-to-pdf': 'Choose an EPUB, TXT or HTML eBook', 'text-to-handwriting': 'Type or paste your text', 'thumbmark-maker': 'Photograph your thumb or choose a photo', 'handwriting-to-pdf': 'Choose photos or a PDF of handwritten pages',
  'fingerprint-generator': 'Choose any files', 'compare-pdfs': 'Choose the original and the changed PDF', 'repair-pdf': 'Choose the damaged PDF', 'gst-invoice-generator': 'Enter your business, customer and item details',
  'pos-bill-generator': 'Add your products once', 'p2p-file-share': 'Create an invite link and send it to the other person', 'collab-whiteboard': 'Create an invite link and share it', 'pdf-workflow': 'Choose one or more PDFs',
}

const ACTION: Partial<Record<string, string>> = {
  'pdf-workflow': 'Add steps such as compress, watermark and page numbers, then run them in one click', 'compress-pdf': 'Pick a compression level', 'split-pdf': 'Choose ranges, every N pages or one file per page', 'split-pdf-by-text': 'Type the phrase that starts each new document',
  'split-pdf-by-bookmarks': 'Pick the bookmark level to split at', 'split-pdf-by-size': 'Enter the maximum size per part', 'split-pdf-in-half': 'Choose to slice pages down the middle or cut the file in two', 'organize-pdf': 'Drag pages into order, rotate or delete them',
  'rotate-pdf': 'Select pages and rotate them left, right or 180°', 'flip-pdf': 'Choose horizontal, vertical or both', 'pages-per-sheet': 'Choose 2, 4, 6, 9 or 16 pages per sheet', 'crop-resize-pdf': 'Set the margins to remove or the paper size',
  'sign-pdf': 'Draw, type or upload your signature and click where it goes', 'fill-pdf-form': 'Fill in the fields and choose whether to lock them', 'redact-pdf': 'Draw boxes over the content or search for words to remove', 'add-watermark': 'Type the text or choose a logo, then set position and opacity',
  'add-page-numbers': 'Pick a format and position', 'headers-footers': 'Type left, centre and right header and footer text', 'flatten-pdf': 'Choose forms, annotations and scripts', 'invert-pdf-colours': 'Pick dark mode, sepia, grayscale or high contrast',
  'encrypt-pdf': 'Enter a password and choose permissions', 'remove-password': 'Enter the current password', 'unlock-pdf': 'Confirm you own the document', 'auto-redact-pii': 'Choose which personal data to find and review the matches',
  'privacy-risk-scanner': 'Scan for personal data and hidden information', 'chat-with-pdf': 'Ask questions in plain language', 'ai-pdf-summarizer': 'Pick a summary length', 'ocr-pdf': 'Choose the document language', 'edit-pdf': 'Click text to edit it, add text, images and signatures',
  'pdf-to-jpg': 'Choose JPG, PNG or WebP and a resolution up to 600 dpi', 'pdf-to-html': 'Choose pixel-accurate or semantic HTML', 'pdf-to-audio': 'Pick a voice and speed and press play',
}

const RESULT: Record<string, string> = {
  scan: 'Download the finished PDF', pages: 'Download the result (several output files are offered as one ZIP)', edit: 'Download the updated PDF', 'to-pdf': 'Download your PDF', 'from-pdf': 'Download the converted file',
  security: 'Download the protected or cleaned PDF', ai: 'Read the result on screen or download it', business: 'Download or print the document', collab: 'Transfer or draw together – directly, browser to browser',
}

const SPECIFIC: Partial<Record<string, { q: string; a: string }[]>> = {
  'compress-pdf': [{ q: 'How much smaller will my PDF get?', a: 'Scanned and image-heavy PDFs often shrink by 50–80%. Text-only PDFs are usually already small; the tool tells you the real before/after size and never returns a bigger file.' }],
  'merge-pdf': [{ q: 'Is there a limit on the number of files?', a: 'No. Merge as many PDFs as your device’s memory allows. There is no watermark.' }],
  'pdf-to-word': [{ q: 'Will the Word file keep the layout?', a: 'Yes. Every line keeps its position, font, size, weight and colour, each page keeps its size, and images and graphics stay in place – while all text remains editable. A “Flowing text” mode rebuilds headings, paragraphs and tables instead. Scanned pages need OCR first to become editable.' }],
  'encrypt-pdf': [{ q: 'How strong is the encryption?', a: 'AES-256, the strongest standard PDF encryption, supported by Adobe Acrobat and all modern readers. AES-128 is available for older readers.' }],
  'auto-redact-pii': [{ q: 'Is the redaction permanent?', a: 'Yes. Pages with redactions are re-rendered with the black boxes burned in, and the original text underneath is removed from the file – not just covered.' }, { q: 'Does it work on a scanned Aadhaar card?', a: 'Yes. Pages without a text layer are read with on-device OCR, and Aadhaar numbers are validated with the official Verhoeff checksum.' }],
  'chat-with-pdf': [{ q: 'Is my document sent to ChatGPT or another AI service?', a: 'No. A small AI model runs inside your browser. Answers are quoted from your PDF with page references, so it cannot invent facts.' }],
  'audio-to-pdf': [{ q: 'Which languages are supported?', a: 'Whisper recognises English, Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati and dozens more. Auto-detection is available.' }],
  'gst-invoice-generator': [{ q: 'When is CGST + SGST used instead of IGST?', a: 'When the supplier’s state and the place of supply are the same (intra-state). For inter-state supply, IGST is charged. The tool decides this automatically from the state codes.' }],
  'text-to-handwriting': [{ q: 'Can it use my own handwriting?', a: 'Yes. Write each letter once on the drawing pad and the generator uses your own letters, with natural variation, stored only in your browser.' }],
  'scan-document': [{ q: 'Does it detect the page edges automatically?', a: 'Yes. The page corners are found automatically and the photo is straightened; you can drag the corners to fine-tune before exporting.' }],
  'p2p-file-share': [{ q: 'Is there a file size limit?', a: 'No server is involved, so there is no upload limit – keep both tabs open until the transfer finishes.' }],
}

function make(t: ToolDef): ToolSeo {
  const cat = CATEGORIES.find((c) => c.id === t.category)!
  const name = t.name.replace(/ – .*$/, '').replace(/ \(AI\)$/, '')
  const inputs = INPUT[t.slug] ?? (t.category === 'from-pdf' || t.category === 'pages' || t.category === 'edit' || t.category === 'security' || t.category === 'ai' ? 'Choose your PDF (or drop it on the page)' : 'Choose your file')
  const action = ACTION[t.slug] ?? 'Adjust the options – the defaults work for most files'
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  return {
    // keyword first, the way people search: "merge pdf online free"
    title: `${name} Online Free – No Upload`,
    description: [`${t.description.replace(/\.$/, '')}. Free, no sign-up, works offline – files never leave your device.`, `${t.description.replace(/\.$/, '')}. Free and private – nothing is uploaded.`, t.description].find((d) => d.length <= 200) ?? t.description.slice(0, 199),
    intro: `${t.description} OurPDF ${lower.startsWith('pdf') ? 'handles' : 'does'} this entirely inside your browser: nothing is uploaded, there is no account and no watermark.`,
    steps: [`${inputs}.`, `${action}.`, `${RESULT[t.category]}.`],
    points: ['100% in your browser – no upload', 'Free, no sign-up, no watermark', 'Works offline once loaded', `Part of ${TOOLS.length} private PDF tools`],
    faq: [
      ...(SPECIFIC[t.slug] ?? []),
      { q: `Is ${name} free?`, a: 'Yes, completely free with no limits on the number of files and no watermark.' },
      { q: 'Are my files uploaded to a server?', a: 'No. Everything runs in your browser on your own device. Your documents are processed locally and never leave your computer or phone.' },
      { q: `Does ${name} work on mobile?`, a: `Yes. It works in any modern browser on Android, iPhone, Windows, macOS and Linux. ${cat.title} tools also work offline after your first visit.` },
    ],
  }
}

export const TOOL_SEO = new Map(TOOLS.map((t) => [t.slug, make(t)]))
