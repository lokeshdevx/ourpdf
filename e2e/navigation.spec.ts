import { expect, test } from '@playwright/test'
import { gotoEditor } from './helpers'

const scrollY = (page: import('@playwright/test').Page) => page.evaluate(() => Math.round(window.scrollY))

test.describe('navigation lands where you expect @cross', () => {
  test('following a link from the bottom of a page opens the next page at its top (no long scroll animation)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
    await page.locator('footer a[href="/privacy"]').first().click()
    await page.waitForURL('**/privacy')
    await expect.poll(() => scrollY(page), { timeout: 1500 }).toBeLessThan(120)
    await page.goto('/')
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }))
    const link = page.locator('main a[href="/merge-pdf"]').first()
    await link.scrollIntoViewIfNeeded()
    await link.click()
    await page.waitForURL('**/merge-pdf')
    await expect.poll(() => scrollY(page), { timeout: 1500 }).toBeLessThan(120)
    await ctx.close()
  })

  test('in-page links keep their heading visible below the sticky header', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Jump to category' }).getByRole('link', { name: 'Security & Privacy' }).click()
    await page.waitForFunction(() => location.hash === '#security')
    // the page glides to the section and stops with its heading below the 64px sticky header
    await expect.poll(() => page.locator('#security').evaluate((e) => Math.round(e.getBoundingClientRect().top)), { timeout: 5000 }).toBeLessThan(200)
    expect(await page.locator('#security').evaluate((e) => e.getBoundingClientRect().top)).toBeGreaterThanOrEqual(56)
  })

  test('section links from another page also land on the section, below the header', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/features')
    await page.locator('footer a[href="/#business"]').click()
    await page.waitForURL('**/#business')
    await expect.poll(() => page.locator('#business').evaluate((e) => Math.round(e.getBoundingClientRect().top)), { timeout: 6000 }).toBeLessThan(200)
    expect(await page.locator('#business').evaluate((e) => e.getBoundingClientRect().top)).toBeGreaterThanOrEqual(56)
  })

  test('the editor start screen is never clipped at the top, even on a very short phone screen', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 480 }, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto('/editor?tool=annotate')
    const o = page.getByTestId('onboarding')
    await expect(o).toBeVisible()
    await expect(page.getByTestId('launch-hint')).toBeVisible()
    const geo = await o.evaluate((el) => {
      const card = el.querySelector('h1')!.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return { scrollTop: el.scrollTop, h1Top: card.top - box.top, canScroll: el.scrollHeight > el.clientHeight }
    })
    expect(geo.scrollTop).toBe(0)
    expect(geo.h1Top).toBeGreaterThan(0) // heading and hint are visible without scrolling
    await expect(page.getByTestId('onboarding-open')).toBeAttached()
    // and everything can be reached by scrolling: the Open button and, further down, the recent-PDFs panel
    await page.getByTestId('onboarding-open').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('onboarding-open')).toBeInViewport()
    await o.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }))
    await expect(page.getByTestId('recent-projects')).toBeInViewport()
    await ctx.close()
  })

  test('long pages offer a back-to-top button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByTestId('back-to-top')).toHaveCount(0)
    await page.evaluate(() => window.scrollTo({ top: 6000, behavior: 'instant' }))
    await page.getByTestId('back-to-top').click()
    await expect.poll(() => scrollY(page), { timeout: 8000 }).toBeLessThan(5)
  })

  test('the interface uses the bundled UI typeface instead of the device font', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const r = await page.evaluate(() => ({ family: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check('600 16px "Jakarta UI"') }))
    expect(r.family).toContain('Jakarta UI')
    expect(r.loaded).toBe(true)
    await gotoEditor(page)
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Jakarta UI')
  })
})
