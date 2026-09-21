import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const SLUGS = ['pdf-editor', 'merge-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-jpg', 'jpg-to-pdf', 'pdf-to-png', 'ocr-pdf', 'sign-pdf', 'annotate-pdf', 'crop-pdf', 'watermark-pdf', 'rotate-pdf', 'extract-pdf-pages', 'delete-pdf-pages', 'reorder-pdf-pages']

test.describe('landing & SEO @cross', () => {
  test('landing page has the required hero, sections and a working CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Powerful PDF editing. Completely private.')
    await expect(page.getByText('Edit, organize, annotate, sign and transform PDFs directly in your browser.')).toBeVisible()
    await expect(page.getByText('All processing happens locally in your browser.').first()).toBeVisible()
    for (const id of ['features', 'tools', 'privacy', 'faq', 'shortcuts']) await expect(page.locator(`#${id}`)).toBeAttached()
    await expect(page.getByText('Supported formats')).toBeVisible()
    await page.getByTestId('hero-cta').click()
    await expect(page).toHaveURL(/\/editor$/)
    await expect(page.getByTestId('onboarding')).toBeVisible()
  })

  for (const slug of SLUGS) {
    test(`/${slug} has metadata, structured content, FAQ and internal links`, async ({ page }) => {
      const res = await page.goto(`/${slug}`)
      expect(res?.status()).toBe(200)
      await expect(page).toHaveTitle(/.{20,}/)
      expect(await page.locator('meta[name=description]').getAttribute('content')).toMatch(/.{50,}/)
      expect(await page.locator('link[rel=canonical]').getAttribute('href')).toContain(`/${slug}`)
      expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toBeTruthy()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.locator('article ol li').first()).toBeVisible()
      await expect(page.locator('details').first()).toBeAttached()
      const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}')
      expect(JSON.stringify(ld)).toContain('FAQPage')
      expect(await page.locator('aside a[href^="/"]').count()).toBeGreaterThan(2)
      await expect(page.getByTestId('tool-cta')).toHaveAttribute('href', /\/editor/)
    })
  }

  test('sitemap, robots and manifest are served', async ({ request }) => {
    const sm = await (await request.get('/sitemap.xml')).text()
    for (const s of SLUGS) expect(sm).toContain(`/${s}`)
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap')
    const mf = await (await request.get('/manifest.webmanifest')).json()
    expect(mf.display).toBe('standalone')
    expect(mf.icons.length).toBeGreaterThan(1)
  })

  test('security headers enforce local-only processing', async ({ request }) => {
    const res = await request.get('/editor')
    const csp = res.headers()['content-security-policy']
    expect(csp).toContain("connect-src 'self' blob: data:")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
  })

  test('SEO tool link launches the real tool (merge dialog)', async ({ page }) => {
    await page.goto('/merge-pdf')
    await page.getByTestId('tool-cta').click()
    await expect(page.getByTestId('dialog-merge')).toBeVisible()
  })

  test('landing and editor have no serious accessibility violations', async ({ page }) => {
    await page.goto('/')
    const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(a.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    await page.goto('/editor')
    await expect(page.getByTestId('onboarding')).toBeVisible()
    const b = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()
    expect(b.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
})
