const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5184';
const output=path.resolve(process.argv[2] || '.qa-workspace-preview/operations-evidence');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_USE_BUNDLED ? {headless:true} : {channel:'msedge',headless:true});
  const context=await browser.newContext();
  const errors=[],remote=[],results=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remote.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  const check=(label,value=true)=>{assert.ok(value,label);results.push(label);};
  const go=async(screen,role='superAdmin')=>{await page.goto(origin+'/#/'+screen);await page.getByLabel('Preview role').selectOption(role);await page.waitForLoadState('networkidle');};
  const reset=()=>page.getByRole('button',{name:'Reset sample data',exact:true}).click();
  const panel=title=>page.locator('section.bw-panel').filter({has:page.getByRole('heading',{name:title,exact:true})});
  try{
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      for(const screen of ['tools','diagnostics','support','support/example','deliveries','moderation','moderation/case-conversation','moderation/case-appeal']){
        await go(screen,screen.startsWith('support')?'user':'superAdmin');
        check(`${screen} fits ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        if([390,1440].includes(width))await page.screenshot({path:path.join(output,screen.replaceAll('/','-')+'-'+width+'.png'),fullPage:true});
      }
    }
    await page.setViewportSize({width:1280,height:900});
    await go('tools');await reset();
    await page.getByLabel('Category name',{exact:true}).fill('Arts & Crafts');
    await page.getByLabel('Fail next action').check();await page.getByRole('button',{name:'Add category',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Simulated save failure'}).first().waitFor();
    check('failed category save preserves name',await page.getByLabel('Category name',{exact:true}).inputValue()==='Arts & Crafts');
    await page.getByRole('button',{name:'Add category',exact:true}).click();await page.getByText('Category added. It is available in listing forms.',{exact:true}).waitFor();
    await page.getByLabel('Service name',{exact:true}).fill('Pottery');await page.getByRole('button',{name:'Add service',exact:true}).click();await page.getByText('Service added to the category.',{exact:true}).waitFor();
    await page.getByLabel('Category name',{exact:true}).fill('Arts and Crafts');await page.getByRole('button',{name:'Add category',exact:true}).click();await page.getByText('Arts and Crafts already exists.',{exact:true}).waitFor();check('duplicate category rejected');
    await go('listing','user');await page.getByLabel('Arts & Crafts',{exact:true}).check();await page.getByLabel('Pottery',{exact:true}).check();check('added category and service available to owner');
    await go('diagnostics');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Unavailable'))}}));
    await page.getByRole('button',{name:'Copy diagnostic summary'}).click();
    await page.getByText('Select and copy the summary below.',{exact:true}).waitFor();
    const summaryField=page.getByLabel('Diagnostic summary',{exact:true});
    check('diagnostic fallback remains read-only',await summaryField.getAttribute('readonly')!==null);
    const summary=await summaryField.inputValue();
    JSON.parse(summary); // The fallback must remain copyable, valid diagnostic JSON.
    check('diagnostics copy fallback excludes private data',!summary.includes('@example.test')&&!summary.includes('10 Example Street')&&summary.includes('synthetic-directory-session'));
    await go('support/example','user');await reset();
    await page.getByRole('button',{name:'Submit report',exact:true}).click();await page.getByRole('alert').filter({hasText:'valid email'}).waitFor();check('report validates required detail');
    await page.getByLabel('Report details').fill('Please review the opening times in this synthetic report.');
    await page.getByLabel('Fail next action').check();await page.getByRole('button',{name:'Submit report',exact:true}).click();await page.getByRole('alert').filter({hasText:'Simulated save failure'}).first().waitFor();
    check('failed support submission retains draft',(await page.getByLabel('Report details').inputValue()).includes('opening times'));
    await page.getByRole('button',{name:'Submit report',exact:true}).click();await page.getByRole('heading',{name:'Submission recorded'}).waitFor();check('synthetic receipt explicitly says no email sent',await page.getByText(/Simulated submission recorded. No email was sent/).isVisible());
    await go('deliveries','admin');check('city delivery view excludes central and other-city records',await page.getByRole('heading',{name:'Technical problem',exact:true}).count()===0&&await page.getByRole('heading',{name:'Business closed',exact:true}).count()===0);
    await go('moderation/case-melbourne','admin');await page.getByRole('heading',{name:'Moderation case unavailable'}).waitFor();check('direct other-city case denied');
    await go('deliveries');await page.getByLabel('Delivery status').selectOption('failed');await page.getByText(/Delivery failed. Quote this reference/).waitFor();check('failed delivery offers reference without resend');
    await go('moderation/case-conversation');await reset();
    await page.getByLabel('Moderation decision',{exact:true}).selectOption('conversation-blocked');await page.getByRole('button',{name:'Review decision',exact:true}).click();
    check('decision requires reason',await page.getByRole('dialog').getByRole('button',{name:'Record decision',exact:true}).isDisabled());
    await page.keyboard.press('Escape');check('Escape closes decision dialog',await page.getByRole('dialog').count()===0);
    await page.getByRole('button',{name:'Review decision',exact:true}).click();await page.getByRole('dialog').getByLabel('Reason').fill('Reviewed the synthetic conversation conduct report.');await page.getByRole('dialog').getByRole('button',{name:'Record decision',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});check('decision history appends reason',await panel('Decision history').getByText('Reviewed the synthetic conversation conduct report.',{exact:true}).isVisible());
    await go('inbox/thread','user');check('staff block removes member reply composer',await page.getByLabel('Write a reply').count()===0);
    await go('moderation/case-business');await page.getByLabel('Moderation decision',{exact:true}).selectOption('takedown');await page.getByRole('button',{name:'Review decision',exact:true}).click();await page.getByRole('dialog').getByLabel('Reason').fill('Listing withdrawn pending correction of the supplied details.');await page.getByRole('dialog').getByRole('button',{name:'Record decision',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await go('home','user');check('takedown removes public listing',await page.getByRole('heading',{name:'Example Community Catering',exact:true}).count()===0);
    await go('moderation/case-appeal');check('archived appeal cannot directly republish',await page.getByText(/An appeal decision does not automatically republish/).isVisible()&&await page.getByLabel('Moderation decision',{exact:true}).locator('option[value="takedown"]').count()===0);
    for(const screen of ['tools','diagnostics','deliveries','moderation']){
      await go(screen,'user');await page.getByRole('heading',{name:'Administrator access required'}).waitFor();check(`${screen} denies ordinary member`);
    }
    await go('support','guest');await page.getByRole('heading',{name:'Member access required'}).waitFor();check('guest support follows held member gate');
    await go('tools');await page.getByLabel('Preview state').selectOption('cached');check('cached state disables category mutation',await page.getByLabel('Category name',{exact:true}).isDisabled());
    await page.getByLabel('Preview state').selectOption('error');await page.getByRole('button',{name:'Retry screen'}).click();await page.getByLabel('Category name',{exact:true}).waitFor();check('error state retries');
    await go('moderation');await page.getByLabel('Preview state').selectOption('empty');await page.getByRole('heading',{name:'No matching moderation cases'}).waitFor();check('empty queue handled');
    check('no browser runtime errors',errors.length===0);check('no remote page requests',remote.length===0);
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({passed:results.length,results,errors,remote},null,2));console.log(`Passed ${results.length} operations browser checks.`);
  }catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,results,errors,remote},null,2));throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
