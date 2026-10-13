const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(process.argv[2] || '.qa-ui-preview/evidence');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const context = await browser.newContext();
  const remote=[],errors=[],checks=[];
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin!=='http://127.0.0.1:5182'){remote.push(r.request().url());return r.abort();}return r.continue();});
  const page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const go=async screen=>{await page.goto('http://127.0.0.1:5182/?screen='+screen);await page.waitForLoadState('networkidle');};
  const layout=async name=>{
    const ok=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    checks.push({name,ok});assert.ok(ok,name+' overflow');
  };
  try {
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      await go('add');
      await page.getByRole('button',{name:/Single Event/}).click();
      await page.locator('.event-form').waitFor();
      await layout(`single form ${width}`);
      if(width===390)await page.screenshot({path:path.join(output,'event-form-390.png'),fullPage:true});
      await go('add');await page.getByRole('button',{name:/Recurring Event/}).click();
      await page.locator('.event-form').waitFor();await layout(`recurring form ${width}`);
      for(const screen of ['edit','series','stream','precheck']){
        await go(screen);await layout(`${screen} ${width}`);
        if(width===390&&['stream','precheck'].includes(screen))await page.screenshot({path:path.join(output,`${screen}-390.png`)});
      }
      await go('admin');
      for(const name of ['Import','Events','🛠 Repair','🏛 Orgs','Settings','Users']){
        await page.getByRole('button',{name,exact:true}).click();
        await page.waitForTimeout(100);await layout(`admin ${name} ${width}`);
      }
      await go('home');
      await page.getByRole('checkbox',{name:'Guest layout'}).check();
      assert.equal(await page.locator('.mobile-bottom-nav button[aria-label="Add Event"]').isDisabled(),true);
      checks.push({name:`guest navigation disabled ${width}`,ok:true});
    }
    await page.setViewportSize({width:320,height:480});await go('home');
    await page.getByRole('button',{name:'Share dialog',exact:true}).click();
    const share=page.getByRole('dialog');await share.waitFor();
    assert.ok(await share.evaluate(el=>el.getBoundingClientRect().top>=0&&el.getBoundingClientRect().bottom<=innerHeight+1));
    for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.ok(await share.evaluate(el=>el.contains(document.activeElement)));}
    await page.screenshot({path:path.join(output,'share-dialog-320.png')});
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByRole('button',{name:'Share dialog',exact:true}).evaluate(el=>el===document.activeElement),true);
    checks.push({name:'share short viewport, keyboard containment, Escape and restored focus',ok:true});
    await page.getByRole('button',{name:'Guest dialog',exact:true}).click();
    assert.ok(await page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().top>=0&&el.getBoundingClientRect().bottom<=innerHeight+1));
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
    await page.getByRole('button',{name:'City dialog',exact:true}).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption('melbourne');
    await page.getByRole('dialog').getByRole('button',{name:'Continue',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    checks.push({name:'guest/city dialog short viewport and controls',ok:true});
    await page.evaluate(()=>{
      document.documentElement.style.setProperty('--cc-primary','rgb(109, 40, 217)');
      document.documentElement.style.setProperty('--cc-surface','rgb(255, 250, 240)');
    });
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.event-card')).backgroundColor==='rgb(255, 250, 240)');
    const palette=await page.evaluate(()=>{
      return {button:getComputedStyle(document.querySelector('.ui-review-bar button')).backgroundColor,
        surface:getComputedStyle(document.querySelector('.event-card')||document.querySelector('.card')).backgroundColor,
        resolved:window.__resolveThemeColor('var(--cc-audience-family)')};
    });
    assert.equal(palette.button,'rgb(109, 40, 217)');assert.equal(palette.resolved,'rgb(109, 40, 217)');assert.equal(palette.surface,'rgb(255, 250, 240)');
    checks.push({name:'central palette affects action, card and standalone marker colour',ok:true});
    await page.getByRole('button',{name:'Share dialog',exact:true}).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button',{name:'Share dialog',exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    checks.push({name:'visible keyboard focus',ok:true});
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
    console.log(`PASS: ${checks.length} interaction/layout checks, no runtime errors or remote requests.`);
  } finally {
    fs.writeFileSync(path.join(output,'interaction-results.json'),JSON.stringify({checks,errors,remote},null,2));
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
