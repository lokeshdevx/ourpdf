import { expect, test, type Page } from '@playwright/test'
import { COMMAND_HELP, FIELD_HELP } from '../src/features/command-help'
import { FIX, clickPage, gotoEditor, openFiles, runCommand } from './helpers'

const VIEWPORTS: [string, number, number][] = [['320', 320, 640], ['phone', 390, 844], ['tablet', 768, 1024], ['small laptop', 1024, 700], ['laptop', 1366, 768], ['desktop', 1920, 1080]]
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const within = async (page: Page, sel: string) => {
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement | null
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: innerWidth, h: innerHeight }
  }, sel)
  return r
}

test.describe('editor layout at every screen size', () => {
  for (const [name, w, h] of VIEWPORTS) {
    test(`${name} (${w}px): no sideways overflow, menu and bars usable`, async ({ browser }) => {
      test.setTimeout(120000)
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 })
      const page = await ctx.newPage()
      await gotoEditor(page)
      expect(await noOverflow(page), 'onboarding').toBeLessThanOrEqual(1)
      await openFiles(page, [FIX('sample.pdf')])
      expect(await noOverflow(page), 'with document').toBeLessThanOrEqual(1)
      // the menu is reachable: full menu bar on wide screens, a searchable sheet below 1024px
      if (w >= 1024) {
        await page.getByRole('menuitem', { name: 'Annotate' }).click()
        await page.getByRole('menuitem', { name: 'Shapes' }).click()
        const sub = await within(page, '[data-slot=menubar-sub-content]')
        expect(sub && sub.r <= sub.w + 1 && sub.l >= 0 && sub.b <= sub.h + 1, JSON.stringify(sub)).toBe(true)
        await page.keyboard.press('Escape')
      } else {
        await page.getByRole('button', { name: 'Menu' }).click()
        await page.waitForTimeout(450) // slide-in animation
        const menu = await within(page, '[data-testid=mobile-menu]')
        expect(menu && menu.r <= menu.w + 1 && menu.l >= 0, JSON.stringify(menu)).toBe(true)
        await page.getByTestId('mobile-menu').getByRole('button', { name: 'Tools' }).click()
        await expect(page.getByTestId('mobile-menu').getByText('Compress PDF…')).toBeVisible()
        // every summary line is fully inside the sheet (no clipped text)
        const clipped = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid=mobile-menu] [data-command]')).filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length)
        expect(clipped).toBe(0)
        await page.keyboard.press('Escape')
      }
      // grouped tool dropdown: wide enough for its text and inside the viewport
      await page.getByRole('button', { name: 'Form fields tools' }).scrollIntoViewIfNeeded()
      await page.getByRole('button', { name: 'Form fields tools' }).click()
      const dd = await within(page, '[data-slot=dropdown-menu-content]')
      expect(dd && dd.r <= dd.w + 1 && dd.l >= -1 && dd.r - dd.l >= 200, JSON.stringify(dd)).toBe(true)
      await expect(page.getByRole('menuitem', { name: /Add checkbox/ })).toBeVisible()
      await page.keyboard.press('Escape')
      // bottom bar stays one row and never widens the page
      const bb = await page.getByTestId('bottombar').evaluate((e) => ({ h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth }))
      expect(bb.h).toBeLessThan(50)
      await ctx.close()
    })
  }
})

test.describe('dialogs fit every screen', () => {
  const DIALOGS = ['file.merge', 'pages.split', 'pages.extract', 'pages.setup', 'pages.crop', 'pages.labels', 'hf.header', 'hf.footer', 'hf.bates', 'wm.add', 'sign.create', 'sec.security', 'sec.redactText', 'ocr.run', 'opt.compress', 'convert.dialog', 'file.export', 'file.print', 'file.metadata', 'view.settings', 'help.tools', 'help.about', 'text.font', 'form.data', 'annotate.stampDialog', 'file.projects', 'file.new']
  for (const [name, w, h] of [['320', 320, 640], ['phone', 390, 844], ['tablet', 768, 1024], ['laptop', 1366, 768]] as const) {
    test(`${name}: every dialog stays inside the screen with its buttons reachable`, async ({ browser }) => {
      test.setTimeout(300000)
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 })
      const page = await ctx.newPage()
      await gotoEditor(page)
      await openFiles(page, [FIX('sample.pdf')])
      const bad: string[] = []
      for (const id of DIALOGS) {
        await runCommand(page, id)
        const dlg = page.locator('[role=dialog]').first()
        await dlg.waitFor({ state: 'visible', timeout: 8000 })
        await page.waitForTimeout(200)
        const r = await page.evaluate(() => {
          const d = document.querySelector('[role=dialog]') as HTMLElement
          const b = d.getBoundingClientRect()
          const sc = d.querySelector('.scroll-thin') as HTMLElement | null
          const foot = d.querySelector('[data-slot=dialog-footer]') as HTMLElement | null
          const fb = foot?.getBoundingClientRect()
          return { l: b.left, r: b.right, t: b.top, b: b.bottom, over: (sc ?? d).scrollWidth - (sc ?? d).clientWidth, footIn: fb ? fb.bottom <= innerHeight + 1 && fb.right <= innerWidth + 1 : true }
        })
        if (r.l < -1 || r.r > w + 1 || r.t < -1 || r.b > h + 1) bad.push(`${id}: outside viewport`)
        if (r.over > 2) bad.push(`${id}: scrolls sideways by ${r.over}px`)
        if (!r.footIn) bad.push(`${id}: footer buttons off-screen`)
        await page.keyboard.press('Escape')
        await expect(page.locator('[role=dialog]')).toHaveCount(0)
      }
      expect(bad).toEqual([])
      await ctx.close()
    })
  }
})

test.describe('tooltips explain every tool @cross', () => {
  test('hovering any toolbar tool shows its title and a plain-language summary', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    const ids = await page.locator('[data-testid=ribbon] button[data-command]').evaluateAll((els) => els.map((e) => e.getAttribute('data-command')!))
    expect(ids.length).toBeGreaterThan(15)
    for (const id of ids) {
      const btn = page.locator(`[data-testid=ribbon] button[data-command="${id}"]`).first()
      await btn.hover({ force: true }) // disabled buttons (Undo/Redo) still explain themselves
      const tip = page.locator('[data-slot=tooltip-content]').last()
      await expect(tip, id).toContainText(COMMAND_HELP[id].slice(0, 30), { timeout: 3000 })
      await page.mouse.move(700, 500, { steps: 8 })
      await expect(page.locator('[data-slot=tooltip-content]'), `${id} tooltip closes`).toHaveCount(0, { timeout: 3000 })
    }
  })

  test('grouped tools list each tool with its description; menu items have tooltips', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await page.getByRole('button', { name: 'Shapes tools' }).click()
    for (const id of ['tool.rect', 'tool.cloud', 'tool.path']) await expect(page.locator(`[data-command="${id}"]`).last()).toContainText(COMMAND_HELP[id].slice(0, 25))
    await page.keyboard.press('Escape')
    await page.getByRole('menuitem', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Compress PDF…' }).hover()
    await expect(page.locator('[data-slot=tooltip-content]').last()).toContainText('Before/after sizes are measured')
  })

  test('property labels and options-bar fields have hints', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await runCommand(page, 'tool.rect')
    await page.getByLabel('Opacity').first().hover()
    await expect(page.locator('[data-slot=tooltip-content]').last()).toContainText(FIELD_HELP.Opacity.slice(0, 20))
    await page.mouse.move(700, 600)
    // properties panel row labels
    await runCommand(page, 'tool.select')
    await runCommand(page, 'tool.rect')
    await page.mouse.move(400, 300)
    await page.mouse.down()
    await page.mouse.move(520, 380, { steps: 5 })
    await page.mouse.up()
    await runCommand(page, 'tool.select')
    await page.getByTestId('properties-panel').getByText('Opacity', { exact: true }).first().hover()
    await expect(page.locator('[data-slot=tooltip-content]').last()).toContainText('see-through')
  })

  test('touch: press and hold a tool to read what it does (tap still uses it)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const page = await ctx.newPage()
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    const btn = page.locator('[data-testid=ribbon] button[data-command="text.add"]')
    await btn.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true })
    await page.waitForTimeout(650)
    await expect(page.locator('[data-slot=tooltip-content]').last()).toContainText('Click or drag on the page and type')
    await btn.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true })
    await btn.click() // the click that follows a long-press is swallowed…
    await expect(page.locator('[data-testid=ribbon] button[data-command="text.add"]')).toHaveAttribute('aria-pressed', 'false')
    await btn.click() // …a normal tap selects the tool
    await expect(page.locator('[data-testid=ribbon] button[data-command="text.add"]')).toHaveAttribute('aria-pressed', 'true')
    await ctx.close()
  })
})

test.describe('tool guide & mobile menu', () => {
  test('Help → Tool guide lists every tool with a description, is searchable and can start a tool', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await runCommand(page, 'help.tools')
    const dlg = page.getByTestId('dialog-toolGuide')
    await expect(dlg).toBeVisible()
    expect(await dlg.locator('[data-guide-item]').count()).toBeGreaterThan(150)
    await dlg.getByTestId('guide-search').fill('watermark')
    await expect(dlg.locator('[data-guide-item="wm.add"]')).toContainText('Stamp text or an image')
    await expect(dlg.locator('[data-guide-item="tool.rect"]')).toHaveCount(0)
    await dlg.getByTestId('guide-search').fill('blur nothing-like-this')
    await expect(dlg.getByText('No tool matches')).toBeVisible()
    await dlg.getByTestId('guide-search').fill('watermark')
    await dlg.locator('[data-guide-item="wm.add"]').getByRole('button', { name: 'Use' }).click()
    await expect(page.getByTestId('dialog-watermark')).toBeVisible()
  })

  test('phone: the menu sheet shows summaries, searches all tools and runs them', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true })
    const page = await ctx.newPage()
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await page.getByRole('button', { name: 'Menu' }).click()
    const menu = page.getByTestId('mobile-menu')
    await expect(menu.locator('[data-command="file.open"]')).toContainText('Open one or more PDFs')
    await menu.getByLabel('Search tools').fill('compress')
    await expect(menu.locator('[data-command="opt.compress"]')).toContainText('Shrink the file')
    await menu.locator('[data-command="opt.compress"]').click()
    await expect(page.getByTestId('dialog-compress')).toBeVisible()
    await expect(menu).toBeHidden()
  })
})
