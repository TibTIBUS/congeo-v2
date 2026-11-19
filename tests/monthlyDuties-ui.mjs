import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
import assert from 'node:assert/strict';
import {handleApi} from '../server/index.js';
import {monthlyDuties} from '../src/domain/monthlyDuties.js';
import {seedDb} from '../server/seed.js';
const db=seedDb();
const before=JSON.stringify(db),store={getDoc:async()=>structuredClone(db)};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let path=req.url.split('?')[0];if(path.endsWith('/'))path+='index.html';const bytes=await readFile(join(process.cwd(),'dist',path));res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
let writes=0;const errors=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},locale:'fr-FR'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const req=route.request();if(req.method()!=='GET'){writes++;return route.abort();}const u=new URL(req.url());const out=await handleApi(store,'GET',u,{});await route.fulfill({status:out.code,contentType:'application/json',body:JSON.stringify(out.obj)});});
  await page.goto(base+'/#/employee/dutyTotals');await page.getByText('Sélectionnez votre nom en haut de l’écran pour voir vos horaires.',{exact:true}).waitFor();assert.equal(await page.locator('.monthly-duties tbody tr').count(),0);
  await page.goto(base+'/#/admin/dutyTotals');await page.waitForSelector('.monthly-duties-table tbody tr');
  const expected=monthlyDuties(db,'2026-11');await page.locator('input[type=month]').fill('2026-11');
  assert.equal(await page.locator('.monthly-duties tbody tr').count(),expected.length);
  const cells=await page.locator('.monthly-duties tbody tr').allTextContents();assert(cells.every((x,i)=>x.includes(expected[i].name)));
  await page.screenshot({path:`/tmp/congeo-monthly-fixture-admin-${mobile?'mobile':'desktop'}.png`,fullPage:true});
  await page.locator('input[type=month]').fill('2026-12');await page.waitForFunction(()=>document.querySelector('.monthly-duties-period')?.textContent.includes('décembre 2026'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const emp=db.employees.find(e=>e.active!==false);await page.addInitScript(id=>localStorage.setItem('congeo-v2-qui',id),emp.id);
  await page.goto(base+'/#/employee/dutyTotals');await page.reload();await page.waitForSelector('.monthly-duties tbody tr');await page.locator('input[type=month]').fill('2026-11');
  assert.equal(await page.locator('.monthly-duties tbody tr').count(),1);
  assert((await page.locator('.monthly-duties tbody').innerText()).includes(emp.name));
  for(const other of db.employees.filter(e=>e.id!==emp.id))assert(!(await page.locator('.monthly-duties tbody').innerText()).includes(other.name));
  await page.getByRole('tab',{name:'Mes horaires',exact:true}).click();await page.waitForTimeout(400);await page.getByRole('tab',{name:'Décompte mensuel',exact:true}).click();await page.waitForSelector('.monthly-duties tbody tr');
  await page.screenshot({path:`/tmp/congeo-monthly-fixture-employee-${mobile?'mobile':'desktop'}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const other=db.employees.find(e=>e.id!==emp.id&&e.active!==false);await page.getByRole('combobox',{name:'Sélectionnez votre nom'}).click();await page.getByRole('option',{name:other.name,exact:true}).click();await page.waitForFunction(name=>document.querySelector('.monthly-duties tbody')?.textContent.includes(name),other.name);assert.equal(await page.locator('.monthly-duties tbody tr').count(),1);assert(!(await page.locator('.monthly-duties tbody').innerText()).includes(emp.name));
  await context.close();
 }
 assert.equal(writes,0);assert.deepEqual(errors,[]);assert.equal(JSON.stringify(db),before);console.log('PASS admin/employee desktop/mobile, month selection, personal-only rows, navigation, zero writes, no overflow or JS errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
