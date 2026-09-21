import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// WCAG 2 A/AA (including colour contrast) on every kind of marketing page in both themes.
for (const theme of ['light', 'dark']) {
  test(`marketing pages have no serious accessibility violations (${theme}) @cross`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
    for (const path of ['/', '/features', '/privacy', '/merge-pdf', '/ocr-pdf']) {
      await page.goto(path)
      const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const bad = a.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
      expect(bad, `${path} (${theme})`).toEqual([])
    }
  })
}
