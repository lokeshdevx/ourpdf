/** Every capability that is actually implemented, grouped for the landing page, /features and SEO pages. */
export interface FeatureCategory {
  id: string
  title: string
  icon: string
  blurb: string
  items: string[]
}

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    id: 'viewing', title: 'Viewing & navigation', icon: 'Eye', blurb: 'A fast, virtualized viewer that stays smooth on 500-page documents.',
    items: [
      'Virtualized page rendering – only visible pages are drawn', 'Continuous scrolling', 'Single-page mode', 'Two-page mode', 'Two-page cover mode', 'Vertical scrolling', 'Horizontal scrolling',
      'Zoom in / zoom out / custom zoom', 'Fit width, fit page, fit height', 'Pinch-to-zoom and Ctrl + wheel zoom', 'Rotate view clockwise / counter-clockwise / reset', 'First / previous / next / last page and jump to page',
      'Page thumbnails sidebar', 'Bookmarks / outline panel', 'Attachments panel', 'PDF layers (optional content) toggle', 'Full-screen mode', 'Presentation mode',
      'Dark, light and system themes', 'High-contrast mode', 'Reduced-motion mode', 'Render-quality control (low → ultra)', 'High-resolution rendering on retina screens', 'Low-memory rendering mode',
      'Hand tool and Space-to-pan', 'Multi-document tabs', 'Progressive rendering with cancellation', 'Page render cache with memory limits',
    ],
  },
  {
    id: 'text', title: 'Text editing', icon: 'Type', blurb: 'Add, replace and format text – with honest handling of what PDFs can and cannot edit.',
    items: [
      'Add text boxes anywhere', 'Edit existing text using the exact font embedded in the PDF (cover-and-replace overlay)', 'Automatic matching of font size, line height and letter spacing when editing text', 'Falls back to the closest standard font when a glyph is missing from an embedded subset', 'Paragraph editing by drag-selecting lines', 'Add headings', 'Bulleted and numbered lists', 'Replace text with Find & Replace',
      'Font families: Helvetica, Times, Courier', 'Load custom TTF / OTF fonts (embedded as subsets)', 'Font size', 'Bold', 'Italic', 'Underline', 'Strikethrough', 'Text colour', 'Text highlight / background colour',
      'Left, centre, right and justified alignment', 'Line height', 'Character spacing', 'Auto-fit text to box', 'Automatic text wrapping', 'Add, edit and remove hyperlinks on text',
      'Copy, cut and paste text', 'Select and copy page text', 'Unlimited undo / redo', 'Callout text boxes with speech tails',
    ],
  },
  {
    id: 'annotate', title: 'Annotations & drawing', icon: 'Highlighter', blurb: 'Every markup tool you expect, with full control over colour, opacity and thickness.',
    items: [
      'Highlight text', 'Underline text', 'Strikeout text', 'Squiggly underline', 'Area highlight for scanned pages', 'Sticky notes', 'Freehand pen', 'Pencil', 'Marker', 'Brush', 'Eraser',
      'Line', 'Arrow', 'Double arrow', 'Rectangle', 'Rounded rectangle', 'Circle and ellipse', 'Polygon', 'Star', 'Revision cloud', 'Bézier curve / path', 'Callouts',
      'Stamps: Approved, Rejected, Draft, Confidential, For Review, Final, Void', 'Date stamps', 'Dynamic stamps with date and time', 'Custom image stamps',
      'Fill colour, border colour, border width, dash style and opacity', 'Move, resize, rotate and duplicate any object', 'Bring forward / send backward / front / back', 'Multi-select and group move',
      'Lock and unlock objects', 'Layers: create, rename, hide, lock, reorder, delete and move objects between layers', 'Export annotations as Instant-JSON-style JSON',
    ],
  },
  {
    id: 'images', title: 'Images', icon: 'Image', blurb: 'Place and retouch images without leaving the page.',
    items: [
      'Insert PNG, JPG, WEBP and TIFF images', 'Replace image', 'Resize image', 'Crop image', 'Rotate image', 'Flip horizontally / vertically', 'Adjust opacity', 'Brightness', 'Contrast', 'Saturation',
      'Grayscale', 'Blur', 'Sharpen', 'Per-image JPEG compression', 'Copy and paste images (including from the system clipboard)', 'Drag images to reposition', 'Lock and unlock images', 'Delete images',
    ],
  },
  {
    id: 'pages', title: 'Page management', icon: 'Layers', blurb: 'Organize documents visually or by exact numbers.',
    items: [
      'Add blank pages', 'Delete pages', 'Duplicate pages', 'Move pages', 'Drag-and-drop page reordering (touch friendly)', 'Rotate pages', 'Bulk rotate, delete, duplicate and extract',
      'Select multiple pages (Ctrl / Shift)', 'Odd / even page selection', 'Extract pages', 'Extract odd pages', 'Extract even pages', 'Split PDF by page ranges', 'Split every N pages', 'Split into single pages',
      'Merge PDFs', 'Merge open documents', 'Insert pages from another PDF', 'Replace a page', 'Copy and paste pages (across documents)', 'Reverse page order', 'Sort pages',
      'Page labels (roman, alphabetic, prefixes)', 'Custom page numbering', 'Bates numbering', 'Visual crop tool', 'Crop margins', 'Crop selected / all pages', 'Centre crop with custom dimensions', 'Auto-trim white margins',
      'Resize pages (A3, A4, A5, Letter, Legal, custom)', 'Change page dimensions', 'Add or remove margins', 'Centre and align content', 'Normalize mixed page sizes',
    ],
  },
  {
    id: 'forms', title: 'Forms', icon: 'FormInput', blurb: 'Fill existing forms and build new ones with real AcroForm fields.',
    items: [
      'Fill existing PDF form fields', 'Text field', 'Checkbox', 'Radio buttons', 'Dropdown', 'List box', 'Button', 'Date field', 'Signature field', 'Edit, move, resize and duplicate fields', 'Delete fields',
      'Required fields', 'Read-only fields', 'Field tooltips', 'Default values', 'Validation: number, email, max length, regular expression', 'Tab order', 'Reset form', 'Export form data (JSON, CSV)', 'Import form data', 'Flatten forms',
    ],
  },
  {
    id: 'sign', title: 'Signatures', icon: 'PenLine', blurb: 'Visual e-signatures, stored only in your browser.',
    items: ['Draw a signature', 'Type a signature in several styles', 'Upload a signature image with background removal', 'Save signatures locally', 'Delete saved signatures', 'Initials', 'Date field', 'Name field', 'Resize, rotate and move signatures', 'Multiple signatures per document', 'Clear notice: visual signature, not certificate-based'],
  },
  {
    id: 'ocr', title: 'OCR', icon: 'ScanText', blurb: 'Tesseract runs locally in a Web Worker – scans never leave your device.',
    items: ['OCR a single page', 'OCR the whole document', 'OCR selected pages', 'English, Spanish, French, German, Italian, Portuguese', 'Combine several languages', 'Language detection', 'Progress indicator', 'Cancel any time', 'Search OCR text', 'Copy OCR text', 'Export OCR text (.txt)', 'Create searchable PDFs', 'Works offline'],
  },
  {
    id: 'search', title: 'Search', icon: 'Search', blurb: 'Find anything across every page – including scanned text.',
    items: ['Search the whole document', 'Exact phrase search', 'Case-sensitive search', 'Whole-word search', 'Highlighted results on the page', 'Previous / next result', 'Result count and context snippets', 'Search inside OCR results', 'Replace text (overlay)', 'Replace all'],
  },
  {
    id: 'security', title: 'Security & privacy tools', icon: 'ShieldCheck', blurb: 'Real encryption and real redaction.',
    items: [
      'AES-256 password protection', 'Open (user) and owner passwords', 'Permission flags: printing, copying, editing, annotating', 'Open password-protected PDFs', 'Remove a password (when you know it)', 'Metadata viewer and editor',
      'Title, author, subject, keywords, creator, producer, dates', 'Remove all metadata', 'Permanent redaction that removes underlying content', 'Redact by rectangle', 'Redact by text search', 'Redact with patterns (emails, phone numbers, IDs)',
      'Redaction preview', 'Redaction colour, reason and label', 'Deleted pages are purged from saved files',
    ],
  },
  {
    id: 'convert', title: 'Conversion', icon: 'FileOutput', blurb: 'In and out of PDF, entirely in the browser.',
    items: [
      'PDF → PNG', 'PDF → JPG', 'PDF → text', 'PDF → HTML', 'Images → PDF (single or multiple)', 'HTML → PDF (sanitised)', 'Text → PDF', 'DOCX → PDF (best effort)', 'XLSX → PDF (best effort)',
      'Canvas snapshot → PDF', 'Create a PDF from scratch', 'Open TXT, HTML, DOCX and XLSX directly', 'Choose DPI and image quality', 'ZIP download for multi-page exports',
    ],
  },
  {
    id: 'optimize', title: 'Optimization', icon: 'Minimize2', blurb: 'Make PDFs smaller – and see the real result before you download.',
    items: ['Compress PDF', 'Lossless, balanced and smallest presets', 'Custom compression', 'JPEG quality control', 'Downsample images', 'Optimize images', 'Remove unused objects', 'Remove metadata', 'Flatten annotations', 'Flatten forms', 'Measured output size', 'Compression ratio'],
  },
  {
    id: 'stamp', title: 'Watermarks, headers & footers', icon: 'Droplets', blurb: 'Brand and number documents in one step.',
    items: ['Text watermark', 'Image watermark', 'Tiled watermarks', 'Position, rotate and set opacity', 'Watermark font, size and colour', 'Apply to all or selected pages', 'Headers', 'Footers', 'Page numbers', 'Total page count', 'Dates and times', 'Custom header/footer text', 'Left, centre and right alignment', 'Exclude the first page', 'Remove watermarks and headers later'],
  },
  {
    id: 'export', title: 'Import, export & printing', icon: 'FolderOpen', blurb: 'Every way in and out of your documents.',
    items: [
      'Open PDF files', 'Drag and drop files', 'Import multiple PDFs at once', 'Merge mode when dropping several PDFs', 'Import from the clipboard', 'File System Access API with input fallback', 'Content-based file-type validation',
      'Download PDF', 'Save As', 'Save all', 'Download selected pages', 'Export images, text and HTML', 'Export annotations and form data', 'Print current, selected or all pages', 'Print annotations and form values', 'Print preview',
    ],
  },
  {
    id: 'projects', title: 'Projects, history & offline', icon: 'HardDrive', blurb: 'Your work survives reloads – and never touches a server.',
    items: [
      'Autosave to IndexedDB', 'Restore your last session', 'Multiple local projects', 'Rename, duplicate and delete projects', 'Project version history', 'Export project files', 'Import project files', 'Installable PWA',
      'Works offline after the first visit', 'Service-worker cached engine and OCR data', 'Command-based undo / redo (not PDF snapshots)', 'Per-object history', 'Page-operation history', 'History limit and clear history',
    ],
  },
  {
    id: 'productivity', title: 'Productivity & accessibility', icon: 'Keyboard', blurb: 'Built for keyboards, screen readers and small screens.',
    items: [
      'Searchable command palette (Ctrl / ⌘ + K)', 'Customisable keyboard shortcuts', 'Context menus for pages, text, images, annotations and forms', 'Context-sensitive properties panel', 'Screen-reader labels and ARIA roles', 'Focus management and accessible dialogs',
      'Accessible menus and tooltips', 'Keyboard-navigable interface', 'Responsive layout for desktop, tablet and mobile', 'Status bar with page, zoom, selection, processing and autosave state', 'Memory warnings for very large files', 'Task progress with cancel and retry',
    ],
  },
]

export const TOTAL_FEATURES = FEATURE_CATEGORIES.reduce((n, c) => n + c.items.length, 0)

/** A compact list used in structured data. */
export const FEATURE_LIST = FEATURE_CATEGORIES.flatMap((c) => c.items.slice(0, 4))
