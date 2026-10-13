const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [], remote = [];
  const run = async (scenario, check) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await context.route('**/*', route => {
      if (!route.request().url().startsWith('http://127.0.0.1:5181/')) { remote.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    try { await page.goto('http://127.0.0.1:5181/?scenario=' + scenario); await check(page); console.log('PASS:', scenario); }
    finally { await context.close(); }
  };
  try {
    await run('missing', async page => {
      await page.getByRole('heading', { name: 'Complete your profile' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Destination: Home' }).count(), 0);
      await page.reload();
      await page.getByRole('heading', { name: 'Complete your profile' }).waitFor();
      const submit = page.getByRole('button', { name: 'Save and continue' });
      assert.ok(await submit.isDisabled());
      await page.getByLabel('Full name', { exact: true }).fill('Test Member');
      await page.getByLabel('Email address', { exact: true }).fill('not-an-email');
      await page.getByRole('checkbox').check();
      assert.ok(await submit.isDisabled());
      await page.getByLabel('Email address', { exact: true }).fill('test@example.com');
      assert.equal(await page.getByLabel('Verified mobile').getAttribute('readonly'), '');
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow at ' + width);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.resolve('../outputs/web-milestone-20261001/member-profile-mobile.png'), fullPage: true });
      await page.evaluate(() => { window.__failSave = true; });
      await submit.click();
      await page.getByRole('alert').filter({ hasText: 'Synthetic save failure' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Destination: Home' }).count(), 0);
      await page.evaluate(() => { window.__failSave = false; });
      await submit.click();
      await page.getByRole('heading', { name: 'Destination: Home' }).waitFor();
      assert.equal(await page.evaluate(() => window.__saveCount), 2);
      await page.reload();
      await page.getByRole('heading', { name: 'Destination: Home' }).waitFor();
    });
    await run('read-fail', async page => {
      await page.getByRole('button', { name: 'Try again' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Destination: Home' }).count(), 0);
      await page.evaluate(() => { window.__allowProfileRead = true; });
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.getByRole('heading', { name: 'Complete your profile' }).waitFor();
    });
    await run('inactive', async page => {
      await page.getByRole('alert').filter({ hasText: 'This account is inactive' }).waitFor();
      assert.equal(await page.locator('form').count(), 0);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('heading', { name: /Everything community/ }).waitFor();
    });
    await run('guest', async page => { await page.getByRole('heading', { name: 'Destination: Home' }).waitFor(); });
    await run('slow', async page => {
      await page.getByText('Checking your member profile…').waitFor();
      await page.evaluate(() => window.__syntheticSignOut());
      await page.getByRole('heading', { name: /Everything community/ }).waitFor();
      await page.waitForTimeout(750); // Let the deliberately delayed profile response finish.
      assert.equal(await page.getByRole('heading', { name: 'Complete your profile' }).count(), 0);
      await page.getByRole('heading', { name: /Everything community/ }).waitFor();
    });
    await run('complete', async page => { await page.getByRole('heading', { name: 'Destination: Home' }).waitFor(); });
    await run('signed-out', async page => {
      await page.getByRole('radio', { name: /Business Directory/ }).check();
      await page.getByRole('button', { name: 'Continue to Business Directory' }).click();
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Continue with Mobile Number' }).click();
      await page.getByPlaceholder('04XX XXX XXX').fill('0400000000');
      await page.getByRole('button', { name: /Send Verification Code/ }).click();
      await page.getByPlaceholder('847291').fill('123456');
      await page.getByRole('button', { name: '✅ Verify', exact: true }).click();
      await page.getByRole('heading', { name: 'Complete your profile' }).waitFor();
      await page.getByLabel('Full name', { exact: true }).fill('Test Member');
      await page.getByLabel('Email address', { exact: true }).fill('test@example.com');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await page.getByRole('heading', { name: 'Destination: BusinessDirectory' }).waitFor();
      await page.reload();
      // The mock signed-out scenario remains signed out on reload; selection persists.
      await page.getByRole('button', { name: 'Continue to Business Directory' }).waitFor();
    });
    assert.deepEqual(failures, []);
    assert.deepEqual(remote, []);
    console.log('PASS: real App gate, synthetic OTP, refresh, retry, inactive, guest, destinations; no remote requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
