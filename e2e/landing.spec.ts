import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { TOOLS } from '../src/tools/registry'

test.describe('home & tool pages @cross', () => {
  test('home lists every tool by category and opens a tool', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every PDF tool you need')
    expect(await page.locator('main [data-testid^="tool-"]').count()).toBe(TOOLS.length)
    for (const id of ['scan', 'pages', 'edit', 'to-pdf', 'from-pdf', 'security', 'ai', 'business', 'collab', 'faq']) await expect(page.locator(`#${id}`)).toBeAttached()
    await page.getByTestId('tool-compress-pdf').click()
    await expect(page).toHaveURL(/\/compress-pdf$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compress PDF')
    await expect(page.getByTestId('file-drop')).toBeVisible()
  })

  test('sidebar lists every tool, highlights the current one and filters', async ({ page }) => {
    await page.goto('/split-pdf')
    const nav = page.getByTestId('sidebar-nav').first()
    expect(await nav.locator('a[href^="/"]').count()).toBeGreaterThanOrEqual(TOOLS.length)
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('Split PDF')
    await nav.getByPlaceholder('Find a tool…').fill('aadhaar')
    await expect(nav.getByRole('link', { name: 'Auto-Redact PII' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Merge PDFs' })).toHaveCount(0)
  })

  test('header search jumps to a tool', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Search tools').fill('gst invoice')
    await page.getByLabel('Search tools').press('Enter')
    await expect(page).toHaveURL(/\/gst-invoice-generator$/)
  })

  for (const t of TOOLS) {
    test(`/${t.slug} has metadata, how-to, FAQ, structured data and related links`, async ({ page }) => {
      const res = await page.goto(`/${t.slug}`)
      expect(res?.status()).toBe(200)
      await expect(page).toHaveTitle(/OurPDF/)
      expect(await page.locator('meta[name=description]').getAttribute('content')).toMatch(/.{60,}/)
      expect(await page.locator('link[rel=canonical]').getAttribute('href')).toMatch(new RegExp(`/${t.slug}$`))
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.locator('#how')).toBeAttached()
      await expect(page.locator('details').first()).toBeAttached()
      const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(' ')
      for (const type of ['WebApplication', 'HowTo', 'FAQPage', 'BreadcrumbList']) expect(ld).toContain(type)
      expect(await page.locator('aside[aria-labelledby=related] a[href^="/"]').count()).toBeGreaterThan(0)
      if (t.editor) await expect(page.getByTestId('tool-cta')).toHaveAttribute('href', /\/editor/)
      else await expect(page.locator('main [role=status][aria-label="Loading tool"]')).toHaveCount(0, { timeout: 20_000 })
    })
  }

  test('old URLs redirect permanently to the new tool pages', async ({ request }) => {
    for (const [from, to] of [['/tools', '/'], ['/tools/merge-pdf', '/merge-pdf'], ['/jpg-to-pdf', '/images-to-pdf'], ['/pdf-editor', '/edit-pdf'], ['/reorder-pdf-pages', '/organize-pdf']]) {
      const r = await request.get(from, { maxRedirects: 0 })
      expect(r.status(), from).toBe(308)
      expect(new URL(r.headers().location, 'http://x').pathname, from).toBe(to)
    }
  })

  test('sitemap, robots and manifest are served', async ({ request }) => {
    const sm = await (await request.get('/sitemap.xml')).text()
    for (const t of TOOLS) expect(sm).toContain(`/${t.slug}<`)
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap')
    const mf = await (await request.get('/manifest.webmanifest')).json()
    expect(mf.display).toBe('standalone')
  })

  test('security headers enforce local-only processing', async ({ request }) => {
    const res = await request.get('/editor')
    const csp = res.headers()['content-security-policy']
    expect(csp).toContain("connect-src 'self' blob: data:")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
  })

  test('the Edit PDF page launches the editor', async ({ page }) => {
    await page.goto('/edit-pdf')
    await page.getByTestId('tool-cta').click()
    await expect(page).toHaveURL(/\/editor/)
    await expect(page.getByTestId('onboarding')).toBeVisible()
  })

  test('home and editor have no serious accessibility violations', async ({ page }) => {
    await page.goto('/')
    const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(a.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    await page.goto('/editor')
    await expect(page.getByTestId('onboarding')).toBeVisible()
    const b = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()
    expect(b.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
})
