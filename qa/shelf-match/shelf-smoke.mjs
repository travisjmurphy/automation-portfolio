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
  browser = await puppeteer.launch({headless:false, pipe:true, enableExtensions:true,
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
  await page.setRequestInterception(true);
  page.on('request', req => {
    const f = fixtures.find(x=>req.url().split('?')[0]===x.url && req.isNavigationRequest());
    if (!f) { void req.abort(); return; }
    void req.respond({status:200,contentType:'text/html',body:'<!doctype html><html><main><h1 class="nl-product__title">'+f.title+'</h1>'+f.markup+'</main></html>'});
  });
  const rows=[];
  for (const f of fixtures) {
    await page.goto(f.url+'?tracking=ignore#fragment');
    await page.bringToFront();
    assert.equal(new URL(page.url()).pathname,new URL(f.url).pathname);
    const title=await page.$eval('h1',e=>e.innerText);
    const popupURL='chrome-extension://'+id+'/popup.html';
    await page.triggerExtensionAction(ext);
    const target=await browser.waitForTarget(t=>t.url()===popupURL,{timeout:10000});
    const popup=await target.asPage();
    await popup.waitForSelector('#capture');
    await popup.click('#capture');
    await popup.waitForFunction(()=>document.querySelector('#save')?.disabled===false,{timeout:10000}).catch(async err=>{ throw new Error('Capture did not populate: '+await popup.$eval('#status',e=>e.textContent),{cause:err}); });
    const get=name=>popup.$eval('[name="'+name+'"]',el=>el.value);
    const ts=await get('capturedAt');
    assert.equal(await get('title'),title); assert.equal(await get('price'),f.price);
    assert.equal(await get('model'),f.model); assert.equal(await get('currency'),'');
    assert.equal(await get('url'),f.url); assert.equal(new Date(ts).toISOString(),ts);
    assert.ok(Math.abs(Date.now()-Date.parse(ts))<60_000,'fresh capture timestamp');
    await popup.select('[name="currency"]','CAD');
    await popup.click('#save');
    rows.push([title,f.model,f.price,'CAD',f.url,ts]);
    await popup.waitForFunction(n => document.querySelector('#count')?.textContent===n+' saved',{timeout:10000},rows.length);
    const stored=await popup.evaluate(()=>chrome.storage.local.get('shelfMatchObservations'));
    assert.deepEqual(stored.shelfMatchObservations.map(x=>[x.title,x.model,x.price,x.currency,x.url,x.capturedAt]),rows);
    if (rows.length===2) {
      await popup.click('#export');
      const end=Date.now()+10_000;
      while (!(await readdir(root)).includes(csvFile) && Date.now()<end) await delay(100);
      const csv=await readFile(join(root,csvFile),'utf8');
      const quote=x=>'"'+x.replaceAll('"','""')+'"';
      assert.equal(csv,'title,model,price,currency,url,capturedAt\r\n'+rows.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n');
    } else {
      await popup.keyboard.press('Escape');
      await popup.waitForSelector('#capture',{hidden:true,timeout:2000}).catch(()=>{});
    }
  }
  console.log('PASS: exact 0.1.1 loaded; two native action captures, real local storage, and byte-exact CSV verified against controlled fixtures.');
} finally {
  await browser?.close();
  await rm(root,{recursive:true,force:true});
}
