const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [], remote = [];
  const base = 'http://127.0.0.1:5186';
  const filters = '?city=melbourne&category=Food+%26+Catering&service=Niaz+Preparation+and+supply';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => {
    if (!route.request().url().startsWith(base + '/')) { remote.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const directoryTab = () => page.getByRole('navigation', { name: 'Choose community experience' }).getByRole('button', { name: 'Business Directory' });
  const eventsTab = () => page.getByRole('navigation', { name: 'Choose community experience' }).getByRole('button', { name: 'Events', exact: true });
  const workspace = () => page.getByRole('navigation', { name: 'Business workspace', includeHidden: true });
  const memberMenu = async () => {
    await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    await menu.getByText('Existing Member', { exact: true }).waitFor();
    assert.equal(await menu.getByText('Guest', { exact: true }).count(), 0);
    await menu.getByRole('button', { name: 'Close menu' }).click();
  };
  const niazContext = async () => {
    await workspace().waitFor({ state: 'attached' });
    await page.getByLabel('Your city', { exact: true }).waitFor();
    assert.match(await page.getByLabel('Your city', { exact: true }).innerText(), /Melbourne/);
    assert.equal(await page.getByLabel(/Select service/).inputValue(), 'Niaz Preparation and supply');
    assert.equal(await directoryTab().getAttribute('aria-pressed'), 'true');
    await memberMenu();
  };
  try {
    await page.goto(base + '/?scenario=complete');
    await page.getByRole('button', { name: 'Niaz Arrangement', exact: true }).waitFor();
    await directoryTab().click();
    await workspace().waitFor({ state: 'attached' });
    await memberMenu();
    await eventsTab().click();
    await page.evaluate(() => { window.__navigationSentinel = 'still-mounted'; });
    await page.getByRole('button', { name: 'Niaz Arrangement', exact: true }).click();
    await niazContext();
    assert.equal(await page.evaluate(() => window.__navigationSentinel), 'still-mounted');
    assert.equal(new URL(page.url()).pathname, '/businesses');
    console.log('PASS: tab and Niaz use the same member shell without a document reload');
    await page.reload();
    await niazContext();
    console.log('PASS: reload restores real member identity and Niaz city/service over profile defaults');
    await eventsTab().click();
    assert.equal(new URL(page.url()).pathname, '/');
    await page.goBack();
    await niazContext();
    await page.goForward();
    await page.getByRole('button', { name: 'Niaz Arrangement', exact: true }).waitFor();
    console.log('PASS: Events switch and history restore the correct experience');
    await page.goto(base + '/businesses/promotions?city=melbourne');
    await workspace().waitFor({ state: 'attached' });
    await page.getByRole('heading', { name: 'Current promotions', exact: true }).waitFor();
    await memberMenu();
    await page.goto(base + '/businesses/view/example');
    await page.locator('.public-directory-shell').waitFor();
    assert.equal(await workspace().count(), 0);
    console.log('PASS: promotions restore the member shell; shared detail links remain public');
    for (const scenario of ['guest', 'signed-out']) {
      await page.goto(base + '/businesses' + filters + '&scenario=' + scenario);
      await page.locator('.public-directory-shell').waitFor();
      assert.equal(await workspace().count(), 0);
      await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
      await page.getByRole('dialog').getByText('Guest', { exact: true }).waitFor();
      console.log('PASS: ' + scenario + ' stays public without member tools');
    }
    await page.goto(base + '/businesses' + filters);
    await niazContext();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await memberMenu();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow at ' + width);
      if (process.env.DIRECTORY_SCREENSHOT_DIR) {
        await page.screenshot({ path: path.join(process.env.DIRECTORY_SCREENSHOT_DIR, `niaz-directory-${width}.png`), fullPage: true });
      }
    }
    console.log('PASS: direct Niaz URL and member menus at phone/desktop widths without overflow');
    await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign Out', exact: true }).click();
    await page.locator('.public-directory-shell').waitFor();
    assert.equal(await workspace().count(), 0);
    console.log('PASS: signing out of a direct Directory entry returns to public browsing');
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
