import { expect, test, type Page } from '@playwright/test'

import { TOOLS as ALL } from '../src/tools/registry'

const TOOLS = ALL.map((t) => t.slug)
const PAGES = ['/', '/features', '/privacy', '/other-tools', ...TOOLS.map((t) => `/${t}`)]

async function meta(page: Page) {
  return page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name=description]')?.getAttribute('content') ?? '',
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') ?? '',
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
    twitter: document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') ?? '',
    lang: document.documentElement.lang,
    h1: document.querySelectorAll('h1').length,
  }))
}

test.describe('SEO @cross', () => {
  test('every page has unique title/description, canonical, social tags and one h1', async ({ page }) => {
    const titles = new Set<string>()
    const descs = new Set<string>()
    for (const path of PAGES) {
      const res = await page.goto(path)
      expect([200, 304], path).toContain(res?.status())
      const m = await meta(page)
      expect(m.title.length, `${path} title`).toBeGreaterThan(20)
      expect(m.title.length, `${path} title too long`).toBeLessThanOrEqual(80)
      expect(m.description.length, `${path} description`).toBeGreaterThanOrEqual(80)
      expect(m.description.length, `${path} description too long`).toBeLessThanOrEqual(200)
      expect(m.canonical, path).toBe(`https://ourpdf.space${path === '/' ? '' : path}`.replace(/\/$/, path === '/' ? '/' : ''))
      expect(m.ogImage, `${path} og:image`).toContain('opengraph-image')
      expect(m.twitter).toBe('summary_large_image')
      expect(m.lang).toBe('en')
      expect(m.h1, `${path} h1`).toBe(1)
      expect(titles.has(m.title), `duplicate title ${m.title}`).toBe(false)
      expect(descs.has(m.description), `duplicate description on ${path}`).toBe(false)
      titles.add(m.title)
      descs.add(m.description)
      expect(m.title).toContain('OurPDF')
    }
  })

  test('heading hierarchy never skips levels, images have alt text, JSON-LD parses', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path)
      const levels = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => Number(h.tagName[1])))
      let prev = 0
      for (const l of levels) {
        expect(l - prev, `${path}: heading jump ${prev}→${l}`).toBeLessThanOrEqual(1)
        prev = l
      }
      expect(await page.locator('img:not([alt])').count(), `${path} images without alt`).toBe(0)
      const scripts = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(scripts.length, `${path} JSON-LD`).toBeGreaterThan(0)
      for (const s of scripts) expect(() => JSON.parse(s), `${path} JSON-LD valid`).not.toThrow()
    }
  })

  test('structured data is rich: FAQ, HowTo, breadcrumbs, featureList', async ({ page }) => {
    await page.goto('/')
    const home = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!)['@graph']
    const types = home.map((n: { '@type': string }) => n['@type'])
    expect(types).toEqual(expect.arrayContaining(['WebSite', 'SoftwareApplication', 'FAQPage', 'ItemList']))
    expect(home.find((n: { '@type': string }) => n['@type'] === 'ItemList').itemListElement.length).toBe(TOOLS.length)
    await page.goto('/compress-pdf')
    const g = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!)['@graph']
    expect(g.map((n: { '@type': string }) => n['@type'])).toEqual(expect.arrayContaining(['WebApplication', 'HowTo', 'FAQPage', 'BreadcrumbList']))
  })

  test('/features lists every feature (hundreds) grouped by category with anchors', async ({ page }) => {
    await page.goto('/features')
    expect(await page.locator('main section li').count()).toBeGreaterThan(280)
    for (const id of ['viewing', 'text', 'annotate', 'images', 'pages', 'forms', 'sign', 'ocr', 'search', 'security', 'convert', 'optimize', 'stamp', 'export', 'projects', 'productivity']) await expect(page.locator(`#${id}`)).toBeAttached()
    for (const t of ['Bates numbering', 'AES-256 password protection', 'Create searchable PDFs', 'Permanent redaction that removes underlying content', 'Edit existing text using the exact font embedded in the PDF', 'Works offline after the first visit']) await expect(page.getByText(t, { exact: false }).first()).toBeAttached()
  })

  test('no broken internal links anywhere (crawl)', async ({ page, request }) => {
    const seen = new Set<string>()
    for (const path of PAGES) {
      await page.goto(path)
      const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).getAttribute('href')!))
      for (const h of hrefs) {
        if (!h.startsWith('/') || h.startsWith('//')) continue
        seen.add(h.split('#')[0] || '/')
      }
    }
    expect(seen.size).toBeGreaterThan(15)
    for (const link of seen) {
      const res = await request.get(link.split('?')[0])
      expect(res.status(), `link ${link}`).toBe(200)
    }
    // hash targets exist
    await page.goto('/')
    for (const id of ['tools', 'faq', 'pages', 'security']) await expect(page.locator(`#${id}`)).toBeAttached()
  })

  test('home page links the popular tools from the hero and describes the site for search results', async ({ page }) => {
    await page.goto('/')
    const popular = page.getByTestId('popular-tools')
    for (const [name, href] of [['Edit PDF', '/edit-pdf'], ['Merge PDF', '/merge-pdf'], ['Compress PDF', '/compress-pdf'], ['Split PDF', '/split-pdf'], ['PDF to Word', '/pdf-to-word'], ['Sign PDF', '/sign-pdf']]) {
      await expect(popular.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
    }
    await expect(page).toHaveTitle(/Free PDF Editor/)
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!)
    const site = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'WebSite')
    expect(site.alternateName).toContain('ourpdf.space')
    expect(ld['@graph'].some((n: { '@type': string }) => n['@type'] === 'SiteNavigationElement')).toBe(true)
    await page.goto('/merge-pdf')
    await expect(page).toHaveTitle('Merge PDFs Online Free – No Upload | OurPDF')
  })

  test('sitemap lists every page; OG image renders; robots allows crawling', async ({ request }) => {
    const sm = await (await request.get('/sitemap.xml')).text()
    for (const p of PAGES.filter((p) => p !== '/')) expect(sm, p).toContain(`https://ourpdf.space${p}`)
    const og = await request.get('/opengraph-image')
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toContain('image/png')
    expect((await og.body()).length).toBeGreaterThan(5000)
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Allow: /')
    expect(robots).toContain('Sitemap: https://ourpdf.space/sitemap.xml')
  })

  test('the editor is not indexed but marketing pages are', async ({ page }) => {
    await page.goto('/editor')
    expect(await page.locator('meta[name=robots]').getAttribute('content')).toContain('noindex')
    await page.goto('/features')
    expect((await page.locator('meta[name=robots]').getAttribute('content')) ?? '').not.toContain('noindex')
  })

  test('theme toggle exists on every marketing page', async ({ page }) => {
    for (const p of ['/', '/features', '/privacy', '/split-pdf']) {
      await page.goto(p)
      await expect(page.getByTestId('theme-toggle')).toBeVisible()
    }
  })
})

test.describe('responsive marketing pages', () => {
  for (const [name, w, h] of [['phone', 375, 800], ['small phone', 320, 700], ['tablet', 820, 1100], ['laptop', 1280, 800], ['wide', 1920, 1080]] as const) {
    test(`${name} (${w}px): no horizontal overflow, header usable`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } })
      const page = await ctx.newPage()
      for (const path of ['/', '/features', '/privacy', '/merge-pdf', '/ocr-pdf']) {
        await page.goto(path)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(over, `${path} at ${w}px`).toBeLessThanOrEqual(1)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (w < 1024) await expect(page.getByTestId('mobile-nav-trigger')).toBeVisible()
        else await expect(page.getByRole('navigation', { name: 'Tools', exact: true })).toBeVisible()
      }
      await ctx.close()
    })
  }

  test('mobile navigation opens, lists tools and navigates', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.getByTestId('mobile-nav-trigger').click()
    const nav = page.getByTestId('mobile-nav')
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Merge PDFs' })).toBeVisible()
    // the search box is not focused on open (no keyboard popping up), but tapping it still works
    const search = nav.getByPlaceholder('Find a tool…')
    await expect(search).not.toBeFocused()
    await expect(nav).toBeFocused()
    await search.click()
    await expect(search).toBeFocused()
    await search.fill('merge')
    await expect(nav.getByRole('link', { name: 'Merge PDFs' })).toBeVisible()
    await search.fill('')
    await nav.getByRole('link', { name: 'Features' }).click()
    await expect(page).toHaveURL(/\/features$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('feature list')
    await ctx.close()
  })

  test('tap targets on mobile are large enough for primary actions', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto('/')
    for (const sel of ['[data-testid=tool-merge-pdf]', '[data-testid=theme-toggle]', '[data-testid=mobile-nav-trigger]']) {
      const b = (await page.locator(sel).boundingBox())!
      expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(28)
    }
    await ctx.close()
  })
})
