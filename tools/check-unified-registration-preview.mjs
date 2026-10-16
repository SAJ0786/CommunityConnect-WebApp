import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ channel:'msedge', headless:true });
const context = await browser.newContext();
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return ['127.0.0.1','localhost'].includes(url.hostname) || url.protocol === 'data:' ? route.continue() : route.abort();
});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const start = async (width, screen = 'home') => {
  await page.setViewportSize({ width, height:850 });
  await page.goto(`http://127.0.0.1:5182/?registration=1&screen=${screen}`);
  await page.locator('.cc-page-panel').first().waitFor();
};
try {
  for (const width of [390,1440]) {
    await start(width);
    await page.getByLabel('Review role').selectOption('member');
    const card = page.locator('#event-registration-approved');
    await card.waitFor();
    assert.equal(await page.getByText('Pending Workshop', { exact:true }).count(), 0);
    await page.getByRole('button', { name:'Registration only events', exact:true }).click();
    assert.equal(await page.locator('.event-card').count(), 1);
    await page.getByRole('button', { name:'All events', exact:true }).click();
    assert.ok(await page.locator('.event-card').count() > 1);
    await card.getByRole('button', { name:'Expand event details', exact:true }).last().click();
    await card.getByText('(confirmed registration required for full address and poster)', { exact:true }).waitFor();
    assert.equal(await card.getByText('1 Fictional Street, Parramatta NSW', { exact:false }).count(), 0);
    assert.equal(await page.evaluate(() => window.__registrationCalls.some(call => call[0] === 'poster')), false);
    assert.equal(await card.getByRole('button', { name:'Directions', exact:true }).isDisabled(), true);
    assert.equal(await card.getByRole('button', { name:'Go Live', exact:true }).isDisabled(), true);
    await card.getByRole('button', { name:'Register for event', exact:true }).click();
    await page.getByRole('heading', { name:'Register · Registration Workshop', exact:true }).waitFor();
    assert.equal(await page.getByRole('button', { name:'Event list', exact:true }).count(), 0);
    await page.getByLabel('Your name').fill('Example attendee');
    await page.getByRole('button', { name:'Confirm registration', exact:true }).click();
    await page.getByRole('heading', { name:'Registration confirmed', exact:true }).waitFor();
    await page.getByRole('button', { name:'Back to Events', exact:true }).click();
    await page.locator('#event-registration-approved').getByRole('button', { name:'Expand event details', exact:true }).last().click();
    await page.locator('#event-registration-approved').getByRole('button', { name:'Edit registrations', exact:true }).waitFor();
    await page.waitForFunction(() => window.__registrationCalls.some(call => call[0] === 'poster'));

    await start(width, 'my');
    await page.getByRole('note').filter({ hasText:'UnApproved' }).waitFor();
    await page.getByLabel('Review screen').selectOption('home');
    assert.equal(await page.getByText('UnApproved', { exact:true }).count(), 0);
    const ownerCard = page.locator('#event-registration-approved');
    await ownerCard.getByRole('button', { name:'Expand event details', exact:true }).last().click();
    await ownerCard.getByRole('button', { name:'Edit Registration form', exact:true }).click();
    await page.getByText('Add a question', { exact:true }).waitFor();
    assert.equal(await page.getByRole('button', { name:'Cancel whole event', exact:true }).count(), 0);
    await page.getByRole('button', { name:'Event details', exact:true }).click();
    await page.getByRole('button', { name:'Delete existing poster', exact:true }).click();
    await page.getByRole('button', { name:'Confirm remove poster', exact:true }).click();
    await page.getByText('Poster removed.', { exact:true }).waitFor();
    assert.equal(await page.getByRole('button', { name:'Delete existing poster', exact:true }).count(), 0);
    assert.ok(await page.getByLabel('Start time (optional, event city timezone)').inputValue() === '18:00');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));

    await start(width, 'admin');
    await page.getByRole('button', { name:/^User Management/ }).click();
    const approvals = page.getByRole('region', { name:'Pending event approvals' });
    await approvals.getByText('UnApproved', { exact:true }).waitFor();
    await approvals.getByRole('button', { name:'Review for approval', exact:true }).click();
    await approvals.getByRole('button', { name:'Approve event', exact:true }).click();
    await approvals.getByText('No events awaiting approval.', { exact:true }).waitFor();
    assert.equal(await page.evaluate(() => window.__registrationCalls.filter(call => call[0] === 'list' && call[1] === 'review').every(call => call[2] === undefined)), true);
    await page.getByLabel('Review screen').selectOption('home');
    await page.getByRole('heading', { name:'Workshop - Pending Workshop', exact:true }).waitFor();
    assert.equal(await page.getByText('UnApproved', { exact:true }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));

    await start(width);
    const deletionCard = page.locator('#event-registration-approved');
    await deletionCard.getByRole('button', { name:'Expand event details', exact:true }).last().click();
    await deletionCard.getByRole('button', { name:'Registration responses', exact:true }).click();
    await page.getByRole('heading', { name:'Registration responses', exact:true }).first().waitFor();
    assert.equal(await page.evaluate(() => window.__registrationCalls.some(call => call[0] === 'responses')), true);
    await page.getByRole('button', { name:'Back to Events', exact:true }).click();
    await deletionCard.getByRole('button', { name:'Expand event details', exact:true }).last().click();
    page.once('dialog', dialog => dialog.accept());
    await deletionCard.getByRole('button', { name:'Delete', exact:true }).click();
    await deletionCard.waitFor({ state:'detached' });
    assert.equal(await page.evaluate(() => window.__registrationCalls.some(call => call[0] === 'delete' && call[1] === 'registration-approved' && call[2] === 1)), true);

    await start(width);
    await page.getByLabel('Guest layout').check();
    const guestCard = page.locator('#event-registration-approved');
    await guestCard.getByRole('button', { name:'Expand event details', exact:true }).last().click();
    await guestCard.getByRole('button', { name:'Register for event', exact:true }).click();
    assert.equal(await page.evaluate(() => window.__registrationGuestPrompt), true);
  }
  assert.deepEqual(errors, []);
  console.log('Unified registration phone/desktop checks passed: filtering, private posters/address, attendee edit, host form/poster, global approval and guest sign-in.');
} finally {
  await context.close(); await browser.close();
}
