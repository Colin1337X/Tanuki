import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {chromium} from 'playwright';

test('Tauri launcher is responsive, labels its inputs and rejects insecure addresses',async()=>{
  const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/Jua-Regular.ttf':'../../public/assets/Jua-Regular.ttf'};
  const server=http.createServer((req,res)=>{
    const file=files[req.url];if(!file){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':'text/html');
    res.end(fs.readFileSync(new URL('../../clients/web/'+file,import.meta.url)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
      await page.setViewportSize(viewport);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      assert.equal(await page.getByRole('heading',{level:1}).count(),1);
      assert.equal(await page.getByLabel('Your Tanuki Server').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.getByLabel('Your Tanuki Server').fill('http://school.test');
    await page.getByRole('button',{name:'Open my workspace'}).click();
    await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('HTTPS'));
    assert.match(await page.getByRole('alert').textContent(),/HTTPS/);
    assert.equal(await page.getByRole('button').isEnabled(),true);
    await page.getByLabel('Your Tanuki Server').fill('https://school.test');
    await page.getByRole('button').click();
    await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('installed'));
    assert.match(await page.getByRole('alert').textContent(),/installed Tanuki client/);
    assert.equal(new URL(page.url()).hostname,'127.0.0.1');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
