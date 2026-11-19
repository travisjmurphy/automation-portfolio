import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';

const root = await mkdtemp(join(tmpdir(), 'shelf-qa-'));
const csvFile = 'shelf-match-observations.csv';
let browser;
try {
  browser = await puppeteer.launch({headless:false, dumpio:true, pipe:true, enableExtensions:true,
    userDataDir:join(root,'profile')});
  await browser.defaultBrowserContext().setDownloadBehavior({policy:'allow',downloadPath:root});
  const id = await browser.installExtension(resolve(process.argv[2]));
  const ext = (await browser.extensions()).get(id);
  assert.equal(ext.version,'0.1.1'); assert.equal(ext.enabled,true);
  console.log('Loaded exact extension version '+ext.version+' in '+await browser.version());
  const page = await browser.newPage();
  const fixtures = [
    {url:'https://www.bestbuy.ca/en-ca/product/shelf-qa/123', title:'Headphones, "Studio"', model:'QA-12', price:'349.99',
     markup:'<div data-automation="product-pricing"><div data-automation="product-price"><span>$349.99</span></div></div><div data-automation="MODEL_NUMBER_ID">Model: QA-12</div>'},
    {url:'https://www.canadiantire.ca/en/pdp/shelf-qa.html', title:'Drill &amp; driver', model:'QA-22', price:'359.99',
     markup:'<div id="nl-buy-box"><div data-testid="priceTotal">$359.99</div></div><div class="nl-features__information">Model: QA-22</div>'}
  ];
  const live = process.argv.includes('--live');
  const livePages = [
    { url:'https://www.bestbuy.ca/en-ca/product/sony-wh-1000xm5-over-ear-noise-cancelling-bluetooth-headphones-black/16162187',model:'WH1000XM5/B',priceSelector:'[data-automation="product-pricing"] [data-automation="product-price"]'},
    { url:'https://www.canadiantire.ca/en/pdp/dewalt-dcd996b-20v-max-xr-brushless-cordless-3-speed-hammer-drill-driver-tool-only-0548765p.html',model:'DCD996B',priceSelector:'#nl-buy-box [data-testid="priceTotal"]'}
  ];
  if(!live) {
  await page.setRequestInterception(true);
  page.on('request', req => {
    const f = fixtures.find(x=>req.url().split('?')[0]===x.url && req.isNavigationRequest());
    if (!f) { void req.abort(); return; }
    void req.respond({status:200,contentType:'text/html',body:'<!doctype html><html><main><h1 class="nl-product__title">'+f.title+'</h1>'+f.markup+'</main></html>'});
  });
  }
  const rows=[];
  let blocked = 0;
  let csvVerified = false;
  for (const f of live ? livePages : fixtures) {
    if(live) {
      const resp=await page.goto(f.url,{waitUntil:'domcontentloaded',timeout:20000}).catch(err=>{console.log('LIVE UNAVAILABLE '+new URL(f.url).hostname+': '+err.message); return null;});
      if(!resp || resp.status()>=400) {
        if(resp)console.log('LIVE UNAVAILABLE '+new URL(f.url).hostname+': HTTP '+resp.status());
        blocked++; continue;
      }
      const body=await page.$eval('body',e=>e.innerText.slice(0,1600)).catch(()=>'');
      if(/verify you are human|checking your browser|just a moment|access denied|request blocked/i.test(body)){
        console.log('LIVE BLOCKED '+new URL(f.url).hostname+': challenge or denial'); blocked++; continue;
      }
      const priceTarget=await page.waitForSelector(f.priceSelector,{timeout:10000,visible:true}).catch(()=>null);
      if(!priceTarget){console.log('LIVE UNAVAILABLE '+new URL(f.url).hostname+': price not visible');blocked++;continue;}
      const rendered = await page.$$eval(f.priceSelector, nodes => [...new Set(nodes.filter(e=>e.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(e).visibility==='visible').map(e=>e.innerText.trim()).filter(Boolean))]);
      const plain = /^(?:CAD\s*)?\$?\s*([0-9,]+\.\d{2})(?:\s*CAD)?$/i;
      const shown = rendered.map(s=>[...new Set(s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))]).filter(lines=>lines.length===1).map(lines=>lines[0].match(plain)?.[1]?.replaceAll(',','')).filter(Boolean);
      f.price = shown.length===1 ? shown[0] : '';
      console.log('LIVE RENDERED '+new URL(f.url).hostname+': '+JSON.stringify(rendered).slice(0,350));
    } else await page.goto(f.url+'?tracking=ignore#fragment');
    let popup;
    try {
    await page.bringToFront();
    assert.equal(new URL(page.url()).pathname,new URL(f.url).pathname);
    const title=await page.$eval('h1',e=>e.innerText);
    const popupURL='chrome-extension://'+id+'/popup.html';
    await page.triggerExtensionAction(ext);
    const target=await browser.waitForTarget(t=>t.url()===popupURL,{timeout:10000});
    popup=await target.asPage();
    await popup.waitForSelector('#capture');
    await popup.click('#capture');
    await popup.waitForFunction(()=>document.querySelector('#save')?.disabled===false,{timeout:10000}).catch(async err=>{ throw new Error('Capture did not populate: '+await popup.$eval('#status',e=>e.textContent),{cause:err}); });
    const get=name=>popup.$eval('[name="'+name+'"]',el=>el.value);
    const ts=await get('capturedAt');
    assert.equal(await get('title'),title); assert.equal(await get('price'),f.price);
    assert.equal(await get('model'),f.model); if (!live) assert.equal(await get('currency'),'');
    assert.equal(await get('url'),f.url); assert.equal(new Date(ts).toISOString(),ts);
    assert.ok(Math.abs(Date.now()-Date.parse(ts))<60_000,'fresh capture timestamp');
    if (live) console.log('LIVE POPUP '+new URL(f.url).hostname+': model='+await get('model')+' price='+await get('price'));
    if (live && !f.price) {
      console.log('LIVE SAFE ABSTENTION '+new URL(f.url).hostname+': price not captured; no single explicit purchase price in primary visible wrapper.');
      blocked++; await popup.keyboard.press('Escape'); continue;
    }
    await popup.select('[name="currency"]','CAD');
    await popup.click('#save');
    rows.push([title,f.model,f.price,'CAD',f.url,ts]);
    await popup.waitForFunction(n => document.querySelector('#count')?.textContent===n+' saved',{timeout:10000},rows.length);
    const stored=await popup.evaluate(()=>chrome.storage.local.get('shelfMatchObservations'));
    assert.deepEqual(stored.shelfMatchObservations.map(x=>[x.title,x.model,x.price,x.currency,x.url,x.capturedAt]),rows);
    if (live) console.log('LIVE PASS '+new URL(f.url).hostname+': '+f.model+' CAD '+f.price+' saved');
    if ((!live&&rows.length===2) || (live&&f===livePages.at(-1))) {
      await popup.click('#export');
      const end=Date.now()+10_000;
      while (!(await readdir(root)).includes(csvFile) && Date.now()<end) await delay(100);
      const csv=await readFile(join(root,csvFile),'utf8');
      const quote=x=>'"'+x.replaceAll('"','""')+'"';
      assert.equal(csv,'title,model,price,currency,url,capturedAt\r\n'+rows.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n');
      csvVerified = true;
    } else {
      await popup.keyboard.press('Escape');
      await popup.waitForSelector('#capture',{hidden:true,timeout:2000}).catch(()=>{});
    }
    } catch(err) {
      if(!live)throw err;
      console.log('LIVE CHECK NOT PASSED '+new URL(f.url).hostname+': '+err.message);
      blocked++; if (popup) await popup.keyboard.press('Escape').catch(()=>{});
    }
  }
  if(live) console.log('LIVE SUMMARY '+rows.length+' live pages saved; '+blocked+' not fully checked; CSV '+(csvVerified?'verified':'not checked'));
  else console.log('PASS: exact 0.1.1 loaded; two native action captures, real local storage, and byte-exact CSV verified against controlled fixtures.');
} finally {
  await browser?.close();
  await rm(root,{recursive:true,force:true});
}
