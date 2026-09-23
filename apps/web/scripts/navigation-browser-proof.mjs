/** Real Next history fixture, independent of API/database. Full product acceptance is separate.
 * NAVIGATION_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node this-file.mjs
 * PLAYWRIGHT_BROWSERS_PATH can point to disposable browser installations.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const {chromium,firefox,webkit}=await import(process.env.NAVIGATION_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.NAVIGATION_PLAYWRIGHT_MODULE).href : 'playwright');
const web=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let server;
let base=process.env.NAVIGATION_PROOF_URL;
if(!base) {
 const fixture=await mkdtemp(join(tmpdir(),'reomi-navigation-next-'));
 await mkdir(join(fixture,'app','[section]'),{recursive:true});
 await symlink(join(web,'node_modules'),join(fixture,'node_modules'),'dir');
 await writeFile(join(fixture,'package.json'),JSON.stringify({name:'navigation-proof',private:true}));
 await writeFile(join(fixture,'tsconfig.json'),JSON.stringify({compilerOptions:{jsx:'preserve',module:'esnext',moduleResolution:'bundler',target:'es2022',paths:{'@/*':[join(web,'src/*')]}},include:['**/*.tsx']}));
 await writeFile(join(fixture,'next.config.mjs'),`export default { devIndicators:false, transpilePackages:['@neuronexus/shared'], experimental:{externalDir:true}, webpack(config) {config.resolve.alias['@']=${JSON.stringify(join(web,'src'))};return config;} };`);
 await writeFile(join(fixture,'app','layout.tsx'),`import { Suspense } from 'react'; import {Frame} from '../fixture'; import {NAVIGATION_HISTORY_INIT_SCRIPT} from '@/lib/navigation-history'; export default function Layout({children}) {return <html><head><script dangerouslySetInnerHTML={{__html:NAVIGATION_HISTORY_INIT_SCRIPT}}/></head><body><Suspense fallback={<p>Loading</p>}><Frame>{children}</Frame></Suspense></body></html>}`);
 await writeFile(join(fixture,'app','[section]','page.tsx'),`import {Screen} from '../../fixture';export default function Page(){return <Screen/>}`);
 await writeFile(join(fixture,'fixture.tsx'),"\"use client\";\nimport React from 'react';\nimport { usePathname, useSearchParams } from 'next/navigation';\nimport { AppNavigationProvider, useAppNavigation, useWorkspaceState, useNavigationWorkspace, useNavigationGuard } from '@/components/navigation';\nimport { useNN } from '@/lib/store';\nuseNN.setState({profile:{userId:'navigation-test'} as any});\nexport function Frame({children}) { return <AppNavigationProvider>{children}</AppNavigationProvider> }\nexport function Screen() {\n const path=usePathname(), params=useSearchParams(), router=useAppNavigation();\n const scope=path.slice(1);\n const [search,setSearch]=useWorkspaceState(scope,scope==='cards'?'query':'search',params.get('q')??'');\n const ctx=useNavigationWorkspace();\n const [guard,setGuard]=React.useState(false);\n const [deferred,setDeferred]=React.useState(false);const [asking,setAsking]=React.useState(false);const [asks,setAsks]=React.useState(0);const decision=React.useRef(null);\n useNavigationGuard(async()=>{if(!guard)return true;if(!deferred)return window.confirm('Leave?');return new Promise(resolve=>{decision.current=resolve;setAsking(true);setAsks(n=>n+1);});});\n return <main><h1>{path}</h1><input aria-label=\"Search\" value={search} onChange={e=>setSearch(e.target.value)}/>\n <button onClick={()=>router.push('/cards?q=B')}>Cards B</button>\n <button onClick={()=>router.push('/library')}>Library</button>\n <button onClick={()=>router.push('/cards',{intent:'section'})}>Cards section</button>\n <button onClick={()=>router.replace(path)}>Consume query</button>\n <button onClick={()=>router.returnTo('/library')}>Return</button>\n <button onClick={()=>setGuard(!guard)}>Guard {String(guard)}</button>\n <button onClick={()=>{setDeferred(true);setGuard(true);}}>Deferred guard</button>\n {asking&&<div role=\"dialog\"><button onClick={()=>{setAsking(false);decision.current?.(false);}}>Stay here</button><button onClick={()=>{setAsking(false);decision.current?.(true);}}>Leave now</button></div>}\n <output data-asks>{asks}</output>\n <output data-entry>{ctx?.entry?.id}</output><output data-parent>{ctx?.entry?.parent}</output>\n </main>\n}");
 const port=process.env.NAVIGATION_PROOF_PORT??'3218';
 base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[join(web,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',port,fixture],{cwd:fixture,stdio:['ignore','pipe','pipe']});
 await new Promise((done,fail)=>{const timeout=setTimeout(()=>fail(Error('Next startup timeout')),30000);server.on('exit',code=>{clearTimeout(timeout);fail(Error(`Next exited: ${code}`));});server.stdout.on('data',data=>{if(String(data).includes('Ready')){clearTimeout(timeout);done();}});server.stderr.on('data',data=>process.stderr.write(data));});
}
try {
const results=[];
for (const engine of [chromium,firefox,webkit]) {
 let browser;
 try { browser=engine===firefox && process.env.NAVIGATION_FIREFOX_WS ? await firefox.connect(process.env.NAVIGATION_FIREFOX_WS,{exposeNetwork:'<loopback>'}) : await engine.launch({headless:true}); } catch(error) { results.push({engine:engine.name(),passed:false,error:error.message}); continue; }
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const field=page.getByRole('textbox',{name:'Search'});
 const button=name=>page.getByRole('button',{name,exact:true});
 const settle=async(path,value)=>{await page.waitForFunction(({path,value})=>location.pathname+location.search===path&&document.querySelector('input')?.value===value&&document.querySelector('[data-entry]')?.textContent?.startsWith('nav-'),{path,value});};
 try {
 await page.goto(`${base}/cards?q=A`);await settle('/cards?q=A','A');
 await field.fill('A saved'); const a=await page.locator('[data-entry]').textContent();
 await button('Library').click();await settle('/library','');await field.fill('library saved');
 await button('Cards B').click();await settle('/cards?q=B','B');
 await page.evaluate(()=>history.back());await settle('/library','library saved');
 await page.evaluate(()=>history.back());await settle('/cards?q=A','A saved');assert.equal(await page.locator('[data-entry]').textContent(),a);
 await page.reload();await settle('/cards?q=A','A saved');assert.equal(await page.locator('[data-entry]').textContent(),a);
 await page.evaluate(()=>history.forward());await settle('/library','library saved');
 await button('Cards section').click();await settle('/cards?q=A','A saved');
 await button('Consume query').click();await settle('/cards','A saved');
 await page.reload();await settle('/cards','A saved');
 await button('Library').click();await settle('/library','');await field.fill('draft');
 await button('Guard false').click();
 let dialogCount=0;page.once('dialog',async d=>{dialogCount++;await d.dismiss();});
 await page.evaluate(()=>history.back());
 await page.waitForFunction(()=>document.querySelector('input')?.value==='draft'&&location.pathname==='/library');
 await page.waitForTimeout(150);assert.equal(dialogCount,1);assert.equal(await field.inputValue(),'draft');
 page.once('dialog',async d=>{dialogCount++;await d.accept();});
 await page.evaluate(()=>history.back());await settle('/cards','A saved');assert.equal(dialogCount,2);
 await button('Library').click();await settle('/library','');
 await button('Cards B').click();await settle('/cards?q=B','B');
 await button('Deferred guard').click();
 await page.evaluate(()=>history.back());await page.getByRole('dialog').waitFor();
 await page.evaluate(()=>history.go(-2));await page.waitForTimeout(100);
 assert.equal(await page.locator('[data-asks]').textContent(),'1');
 await button('Leave now').click();await settle('/cards','A saved');
 assert.deepEqual(errors,[]);
 results.push({engine:engine.name(),version:browser.version(),passed:true});
 } catch(error) { results.push({engine:engine.name(),version:browser.version(),passed:false,error:error.message}); } finally {await browser.close();}
}
console.log(JSON.stringify(results,null,2));
if(results.some(result=>!result.passed)) process.exitCode=1;

} finally {server?.kill("SIGTERM");}
