# OurPDF

A private, browser-only PDF editor. **No backend, no accounts, no uploads.** Every operation – rendering, editing,
OCR, compression, encryption, export – runs on the user's device. Files are never sent anywhere, and the production
Content-Security-Policy (`connect-src 'self' blob: data:`) makes the browser itself refuse requests to other origins.

Bundled fonts are OFL-licensed Google Fonts / metric-compatible families installed from `@fontsource/*` (`npm run dev` / `build` copy them to `public/fonts`; regenerate the list with `node scripts/gen-font-manifest.mjs`).

Built with Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, shadcn/ui on Radix UI,
PDF.js, pdf-lib (via the maintained `@cantoo/pdf-lib` fork, aliased as `pdf-lib`, which adds AES-256 encryption and
decryption), Tesseract.js, JSZip, file-saver, mammoth, SheetJS, html-to-image, DOMPurify, Zustand and IndexedDB (`idb`).

## Run it

```bash
npm install
npm run dev          # copies self-hosted assets, bundles the worker, starts Next (http://localhost:3000)
npm run build        # production build (assets + worker + next build)
npm run start        # serve the production build (service worker + strict CSP are only active here)
```

`npm run dev` / `build` first run `scripts/copy-assets.mjs` (PDF.js worker/cmaps/fonts, Tesseract core and language
data → `public/`) and `scripts/build-workers.mjs` (esbuild bundles `src/workers/pdf.worker.ts` →
`public/workers/pdf.worker.js`). While editing engine code in dev, run `npm run dev:workers` in a second terminal to
rebuild the worker on change. Both outputs are generated and git-ignored.

### Quality gates

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (react-hooks compiler rules included)
npm test             # vitest: unit + integration (Node)
npm run build && npm run test:e2e    # Playwright against the production build
```

Playwright projects: `chromium` (all specs), `firefox` and `webkit` (specs tagged `@cross`), `mobile` (Pixel 7,
`@mobile`). Firefox/WebKit need their browsers and system libraries installed (`npx playwright install --with-deps`).

## Architecture

```
src/
  app/                  Next routes. Server-rendered landing + 16 SEO tool pages (generateStaticParams),
                        sitemap/robots/manifest, /offline, /sw.js (service worker generated from the build output),
                        /editor (client-only shell loaded with next/dynamic, ssr:false)
  components/
    ui/                 shadcn/ui (Radix) primitives
    pdf/                PdfViewer (virtualised), PdfPage, PageSurface (frame→rotation→crop geometry), TextLayer, PdfThumbnail
    annotations/        PageOverlay, ObjectView (renders every object type), CreationLayer (all drawing tools),
                        EditTextLayer, CropLayer, MarkupCapture, selection/move/resize/rotate
    editor/             shell, menu bar, ribbon, tabs, sidebar panels, properties panel, organizer, status bar
    dialogs/            ~30 code-split tool dialogs
    command-palette/    cmdk launcher
  features/             command registry (single source of truth for menus, palette, ribbon, shortcuts)
  services/             PdfDocumentService (document-service), PdfRenderer, PdfTextService, PdfPageService,
    pdf/                PdfAnnotationService, PdfImageService, PdfFormService, PdfMerge/Split/Export/Compression
    ocr/                PdfOcrService (Tesseract, self-hosted, cancellable)
    storage/            IndexedDB projects, snapshots, signatures
    convert/            images/text/HTML/DOCX/XLSX → PDF
  engine/               PURE, worker-safe PDF engine (pdf-lib): assemble (export/merge/split), draw, fonts,
                        generate (images/blocks → PDF), compress. Shared by the worker and by unit tests.
  workers/pdf.worker.ts worker entry (bundled to public/workers)
  stores/               Zustand: pdf, page, annotation, history, selection, ui, tool, form, project, search, shortcut, draft, confirm
  lib/                  pure logic: geometry, frame, layout-engine, text-layout, search-engine, object-ops, shape-paths, …
  utils/  types/
```

### Key design decisions

* **PDF bytes never live in React state.** A "source" is an immutable file kept as a `Blob`; PDF.js streams it from
  an object URL with range requests. A document is a *list of page references* (`PageModel`) plus edit objects.
* **Virtualised everything.** `layout-engine.ts` computes page slots for continuous / single / two-page / cover /
  horizontal modes and binary-searches the visible rows; only near-viewport pages are mounted. Renders go through a
  bounded, cancellable priority queue with an LRU bitmap cache (smaller in low-memory mode). Thumbnails and the page
  organizer are virtualised the same way. A 500-page fixture is part of the e2e suite (≤ 6 pages mounted).
* **Coordinates.** All objects live in "base space" (points, y-down, page as PDF.js shows it). One `Placement`
  (intrinsic rotation, view box, scale, offset) maps base space → PDF space, so rotation, crop, margins and resize
  all go through one tested function (`lib/geometry.ts`, `lib/frame.ts`).
* **Crop / margins / resize / align are one model:** a visible `crop` plus an output `frame`. When the frame can be
  expressed with MediaBox/CropBox only, links and form fields are preserved; scaled pages are embedded as form XObjects.
* **Command architecture for undo/redo.** Object edits are reversible *deltas* (add/remove/update ops), page edits
  are structural page-list changes; commands capture only what changes – never PDF bytes. Gestures merge into one
  step; history is per document, limited, clearable and queryable per object.
* **Export = plan + engine.** The main thread prepares a plan (baked image filters, rasterised redaction pages,
  text rasters for characters standard fonts can't encode, source bytes). The **Web Worker** assembles the PDF.
  The same engine runs inline in Node for tests. Before saving, a reachability GC removes every object not referenced
  from the trailer, so deleted pages leave no data behind.
* **WYSIWYG text.** The viewer and the exporter share one layout function (`text-layout.ts`) and measure with the real
  PDF font metrics (pdf-lib), so wrapping/justification match what is exported.
* **Offline.** `/sw.js` is generated from the actual build output (precaches shell, chunks, PDF.js worker/wasm, engine
  worker); OCR data and large resources are cached on first use. User documents are never cached by the service worker.

## What is real, what is approximated (honest capability notes)

| Area | Behaviour |
|---|---|
| **Editing existing text** | *Cover + overlay replacement* that keeps the original typeface. Click a line (or drag over a paragraph): a text object is created exactly on top of the original – same font, size, colour, baseline, line height and letter spacing – and selected, so the Properties panel shows the text and the detected font and you can edit there or on the page. Fonts are detected per run: **embedded** programs (TrueType, OpenType/CFF, Type 1 → CFF, Type 0/CID) are extracted with PDF.js and re-embedded; **non-embedded** fonts are matched by name to a bundled open-licence font of the same family or a metric-compatible clone (Calibri → Carlito, Cambria → Caladea, Georgia → Gelasio, Roboto → Roboto, …; ~50 families, Latin) and otherwise to the closest standard PDF font. Embedded fonts are usually *subsets*: if you type a character the subset lacks, the text switches to the same family from the library (or the closest standard font) and you are told; it switches back when the characters fit again. The original stays underneath (use Redact to remove it). Rotated text is not supported by this tool. |
| **Redaction** | Real. Pages with redaction marks are re-rendered with the boxes burned into the pixels and the originals are dropped; the searchable text layer is rebuilt *without* the redacted text. Verified by e2e (`123-456-789` is absent from the saved bytes). Overlay objects under a redaction are removed too. |
| **Signatures** | Visual e-signatures (drawn / typed / uploaded images). **Not** certificate-based digital signatures – the UI says so. |
| **Encryption** | Genuine AES-256 (Web Crypto) with user/owner passwords. Permission flags (print/copy/edit) are advisory and honoured only by compliant viewers – the UI says so. Encrypted PDFs open with a password prompt; saving produces an unprotected copy unless a password is set. |
| **Forms** | Existing AcroForm fields are imported (values editable, deletable; geometry locked). New fields (text, checkbox, radio, dropdown, list, button, date, signature) are created as real AcroForm fields; validation is enforced in the editor only. Export/import JSON/CSV; flatten supported. |
| **Annotations** | Links, sticky notes and form fields are written as native PDF objects. Everything else is drawn into page content on export; the editable version lives in the local project. Exports also as PSPDFKit-Instant-JSON-style JSON. |
| **Crop** | Sets the visible box (content stays in the file, as in most editors). |
| **OCR** | Tesseract.js, fully self-hosted (English, Spanish, French, German, Italian, Portuguese). Language "detection" runs each model on a downscaled page and ranks confidence. |
| **Fonts** | Standard PDF fonts, ~50 bundled open-licence families (Latin subset, loaded on demand from `/fonts`), fonts found in the open PDF, and your own TTF / OTF / WOFF files (WOFF2 and Type 1 files are not accepted). Characters no font can encode are rasterised on export. |
| **DOCX / XLSX → PDF** | Best-effort via mammoth / SheetJS (no complex layout). **PDF → DOCX/XLSX/PPTX is not offered** – it can't be done reliably without a server, and is listed as unsupported in the UI. |
| **Large files** | Streamed for viewing. Exports need the whole file in memory; the status bar warns when memory gets risky. |
| **Merge** | Form fields of merged documents are flattened to avoid name clashes; outlines of merged files are not carried over. |

Not implemented (deliberately, rather than faked): certificate signing, JavaScript in PDFs (never executed), PDF/A,
PDF → Word/Excel/PowerPoint, TIFF decoding on browsers without native TIFF support.

## Testing

* `tests/unit` – page ranges, geometry/frames, layout engine, search, text layout, object ops, command history,
  filters, file sniffing, LRU, error mapping, and the export engine (page ops, crop math on rotated pages, all object
  types, forms, encryption/decryption, garbage collection, outlines, labels, metadata).
* `tests/integration` – the real pipeline in Node: stores → history → export plan → engine → PDF.js text extraction
  (edit/undo/redo, reorder/delete/duplicate/rotate, decorations, tokens & Bates, layers, forms, native-field
  round-trips, security).
* `e2e` – Playwright on the production build: import (file picker, drag & drop, drop-mode merge, images, encrypted,
  corrupt and spoofed files), large 500-page file, every editing tool, forms, signatures, redaction, OCR, compression,
  conversion, print preview, split/merge/reorder, autosave/reload/restore, offline mode, no-external-requests check,
  keyboard shortcuts & customisation, accessibility (axe), dark/high-contrast modes, mobile viewport.

## Security notes

* Strict CSP (production): no `eval`, `object-src 'none'`, `connect-src 'self' blob: data:`, workers from `self`/`blob:`.
* Imported HTML is sanitised with DOMPurify (scripts, styles, forms, remote resources removed); link targets accept
  only `http(s)`, `mailto`, `tel`; file types are detected from content, never from the extension; downloads use
  sanitised names; object URLs are revoked when no longer needed; PDF JavaScript is never run.
