const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(process.argv[2] || '.qa-ui-preview/evidence');
fs.mkdirSync(output, { recursive: true });
const screens = ['home','calendar','hijri','add','my','favourites','profile','admin','bulk','search','install','videos','directory'];
(async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  const context = await browser.newContext();
  const errors = [], remote = [], results = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5182') { remote.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ url:page.url(), message:error.message }));
  try {
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      for (const screen of screens) {
        await page.goto('http://127.0.0.1:5182/?screen='+screen);
        await page.waitForLoadState('networkidle');
        const measurement = await page.evaluate(() => ({
          content: document.querySelector('main')?.textContent?.trim().length || 0,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          width: document.documentElement.scrollWidth,
          offenders: [...document.querySelectorAll('main *')].filter(el => {
            const r=el.getBoundingClientRect(); return r.width && (r.right > innerWidth+1 || r.left < -1) && getComputedStyle(el).position!=='fixed';
          }).slice(0,5).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,80)})),
        }));
        results.push({screen,width,...measurement});
        console.log(JSON.stringify({screen,width,overflow:measurement.overflow,content:measurement.content}));
        if([390,1440].includes(width)&&['home','calendar','add','profile','admin','directory'].includes(screen)) await page.screenshot({path:path.join(output,`${screen}-${width}.png`)});
      }
    }
    fs.writeFileSync(path.join(output,'layout-results.json'),JSON.stringify({results,errors,remote},null,2));
    assert.deepEqual(errors, [], 'Browser runtime errors');
    assert.deepEqual(remote, [], 'Offline fixture must not attempt remote requests');
    assert.equal(results.filter(r=>r.overflow||r.content<20).length,0,'Overflow or empty screen; see layout-results.json');
    console.log('PASS: 52 screen/viewport combinations; no remote requests or runtime errors.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
