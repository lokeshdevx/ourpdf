export const SITE = {
  name: 'OurPDF',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ourpdf.space',
  description:
    'Edit, organize, annotate, sign and transform PDFs directly in your browser. Files never leave your device – no uploads, no accounts.',
  /** Public contact address shown in the footer. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'novastudio9895@gmail.com',
  /** Support link shown in the footer. */
  coffeeUrl: process.env.NEXT_PUBLIC_COFFEE_URL ?? 'https://buymeacoffee.com/lokeshdevx',
}

/** Page-level `openGraph`/`twitter` replace the layout's, so every page passes the shared card image explicitly. */
export const SOCIAL_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: 'OurPDF – private, browser-only PDF editor' }
