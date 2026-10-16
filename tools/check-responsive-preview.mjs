import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Run the isolated Events, workspace and registration previews first.
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext();
context.setDefaultTimeout(10000);
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return ['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol === 'data:'
    ? route.continue() : route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let layouts = 0;
try {
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const [site, port, screens] of [
      ['events', 5182, ['home', 'add', 'edit', 'series', 'calendar', 'hijri', 'my', 'profile', 'admin', 'directory']],
      ['business', 5184, ['home', 'promotions', 'detail/example', 'owner', 'listing', 'promotion/new:example', 'inbox/thread', 'support']],
      ['registration', 5198, ['']],
    ]) {
      for (const screen of screens) {
        const label = `${site}/${screen} at ${width}px`;
        const suffix = site === 'events' ? `?screen=${screen}` : site === 'business' ? `#/${screen}` : '';
        await page.goto(`http://127.0.0.1:${port}/${suffix}`, { waitUntil: 'domcontentloaded' });
        await page.locator(site === 'registration' ? '.registration-workspace' : 'main').first().waitFor();
        if (site === 'events' && screen === 'add') {
          await page.getByRole('button', { name: 'Single Event' }).click();
        }
        if (site === 'registration') {
          await page.getByRole('button', { name: 'Create registration event', exact: true }).click();
        }
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          offenders: [...document.querySelectorAll('main *, .registration-workspace *')].filter(element => {
            const rect = element.getBoundingClientRect();
            if (!rect.width || rect.right <= innerWidth + 2) return false;
            // Horizontal category rails and hidden panels intentionally contain wider children.
            for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) return false;
            }
            return true;
          }).map(element => `${element.tagName}.${element.className}`),
        }));
        assert.ok(layout.overflow <= 2, `${label}: page overflows by ${layout.overflow}px`);
        assert.deepEqual(layout.offenders, [], `${label}: content extends outside the viewport`);
        assert.deepEqual(errors, [], `${label}: browser errors`);
        layouts++;
      }
    }
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('http://127.0.0.1:5184/#/promotions');
    const offer = page.getByRole('link', { name: 'View offer at Example Community Catering' });
    assert.equal(await offer.getAttribute('href'), '#/detail/example');
    await offer.click();
    await page.getByRole('heading', { name: 'Example Community Catering', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(new URL(page.url()).hash, '#/detail/example');
    const actions = page.getByRole('group', { name: 'Member business actions' });
    const sizes = await page.locator('.directory-business-actions').evaluate(element =>
      [...element.querySelectorAll('a,button')].map(control => {
        const rect = control.getBoundingClientRect();
        return [Math.round(rect.width), Math.round(rect.height)];
      }));
    assert.ok(sizes.length >= 7, 'Contact, share and member actions are present');
    assert.ok(sizes.every(([width, height]) => width === 88 && height === 100), 'All business action tiles have identical dimensions');
    const placement = await actions.evaluate(element => {
      const buttons = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect());
      const share = document.querySelector('.directory-share').getBoundingClientRect();
      return {
        belowShare: element.getBoundingClientRect().top >= share.bottom,
        sameRow: buttons.every(button => Math.abs(button.top - buttons[0].top) <= 1),
        compact: buttons.every(button => button.width <= 100 && button.height >= 44 && button.height <= 100),
      };
    });
    assert.deepEqual(placement, { belowShare: true, sameRow: true, compact: true }, 'Member actions are compact tiles below the contact/share controls');
    const saved = await actions.getByRole('button', { name: 'Unsave business', exact: true }).count() > 0;
    await actions.getByRole('button', { name: saved ? 'Unsave business' : 'Save business', exact: true }).click();
    await actions.getByRole('button', { name: saved ? 'Save business' : 'Unsave business', exact: true }).waitFor();
    await actions.getByRole('button', { name: 'Contact business', exact: true }).click();
    await page.waitForURL('**/#/enquiry/example');
    await page.goto('http://127.0.0.1:5184/#/detail/example');
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click();
    await page.waitForURL('**/#/support/example');
    await page.goto('http://127.0.0.1:5184/#/detail/example');
    await page.getByRole('link', { name: 'Back to businesses' }).click();
    await page.waitForURL('**/#/home/');
    assert.match(await page.locator('.bw-workspace-header').textContent(), /Example Member/);
    if (width < 900) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      assert.match(await page.locator('.cc-menu-identity').innerText(), /Example Member/);
      await page.getByRole('button', { name: 'Close menu' }).click();
    }
    await page.goto('http://127.0.0.1:5184/businesses/promotions?city=sydney');
    const publicOffer = page.getByRole('link', { name: 'View offer at Example Community Catering' });
    assert.match(await publicOffer.getAttribute('href'), /^\/businesses\/view\/example\?.*#promotions$/);
  }
  assert.deepEqual(errors, [], 'Browser errors during navigation');
  console.log(`Passed ${layouts} responsive layouts, compact member actions and member/public promotion navigation at phone and desktop widths.`);
} finally {
  await context.close();
  await browser.close();
}
