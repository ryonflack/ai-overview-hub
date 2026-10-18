// Records a captioned walkthrough of AI Overview Hub. Sign-up and setup run on the real portal pages with stand-in API data;
// the results section uses the built-in example account (#/demo).
// Usage: start the site (`npx vite --port 4173`), then `node media/demo/record.mjs <output-dir>`; convert the .webm it prints with
//   ffmpeg -i <file>.webm -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart media/demo/ai-overview-hub-demo.mp4
// PLAYWRIGHT_MODULE and CHROMIUM_PATH override where Playwright and the browser are found.
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const S=process.argv[2]||'.';const APP=process.env.APP_URL||'http://localhost:4173';
const b=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
const ctx=await b.newContext({viewport:{width:1280,height:800},recordVideo:{dir:`${S}/video`,size:{width:1280,height:800}}});
const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERR',e.message));
// On-screen caption and cursor, re-added on every page load.
await ctx.addInitScript(()=>{const add=()=>{if(document.getElementById('demo-cap'))return;
  const c=document.createElement('div');c.id='demo-cap';c.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:900px;background:rgba(23,32,59,.94);color:#fff;font:600 19px/1.4 "DM Sans",system-ui,sans-serif;padding:14px 22px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);text-align:center;opacity:0;transition:opacity .35s;pointer-events:none';document.body.appendChild(c);
  const k=document.createElement('div');k.id='demo-cursor';k.style.cssText='position:fixed;left:-40px;top:-40px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(86,157,223,.35);border:2px solid #17203b;z-index:100000;pointer-events:none;transition:transform .12s';document.body.appendChild(k);
  addEventListener('mousemove',e=>{k.style.left=e.clientX+'px';k.style.top=e.clientY+'px'},true);addEventListener('mousedown',()=>k.style.transform='scale(.7)',true);addEventListener('mouseup',()=>k.style.transform='',true);
  window.__cap=t=>{const s=sessionStorage;s.setItem('cap',t||'');c.textContent=t||'';c.style.opacity=t?'1':'0'};const saved=sessionStorage.getItem('cap');if(saved)window.__cap(saved)};
  if(document.body)add();else addEventListener('DOMContentLoaded',add)});
const cap=t=>p.evaluate(t=>window.__cap?.(t),t);const wait=ms=>p.waitForTimeout(ms);
const moveTo=async loc=>{await loc.scrollIntoViewIfNeeded();const bx=await loc.boundingBox();const x=bx.x+bx.width/2,y=bx.y+bx.height/2;await p.mouse.move(x,y,{steps:22});await wait(250)};
const click=async loc=>{await moveTo(loc);await p.mouse.down();await wait(80);await p.mouse.up();await wait(500)};
const type=async(loc,text)=>{await click(loc);await loc.pressSequentially(text,{delay:55});await wait(300)};
const scrollTo=async(sel,offset=0)=>{await p.evaluate(([s,o])=>{const el=document.querySelector(s);scrollTo({top:el.getBoundingClientRect().top+scrollY-o,behavior:'smooth'})},[sel,offset]);await wait(1300)};

// --- Stand-in API for the portal steps (stateful, so saved data shows up on later pages) ---
const plan={id:'starter',name:'AI Visibility Starter',monthlyPrice:6999,maxQueries:100,allowedProviders:['google-ai-overview','google-ai-mode','bing-copilot','duckduckgo-search-assist','naver-ai-overview','chatgpt','perplexity'],addonUnitPrice:null,runsPerPeriod:4,checksPerPeriod:500};
const st={project:null,queries:[]};
const me=()=>({success:true,user:{email:'jordan@northwindcrm.com',name:'Jordan Lee'},account:{id:'acct_demo',name:"Jordan Lee's workspace",role:'owner',notifyRun:true,notifyDrop:true},accounts:[{id:'acct_demo',name:"Jordan Lee's workspace",role:'owner'}],plan,subscription:null,subscriptionId:null,entitled:false,paused:false});
await p.route(/googletagmanager/,r=>r.abort());
await p.route('**/auth/**',r=>r.fulfill({json:{token:'t',session:{token:'t',userId:'u'},user:{id:'u',email:'jordan@northwindcrm.com',name:'Jordan Lee'}}}));
await p.route('**/api/sources',r=>r.fulfill({json:{success:true,providers:plan.allowedProviders.map(id=>({id,methods:(id==='chatgpt'||id==='perplexity'?['api','simulated']:['simulated']).map(method=>({method,available:true}))}))}}));
await p.route('**/api/app/**',async r=>{const u=new URL(r.request().url());const path=u.pathname.replace('/api/app','');const m=r.request().method();
  if(path==='/me')return r.fulfill({json:me()});
  if(path==='/project'&&m==='GET')return r.fulfill({json:{success:true,project:st.project}});
  if(path==='/project'&&m==='PUT'){const i=r.request().postDataJSON();st.project={id:'prj_1',name:i.name||i.primaryDomain,primaryDomain:i.primaryDomain,alternateDomains:[],brands:String(i.brands).split(',').map(x=>x.trim()).filter(Boolean),selection:i.selection,location:{country:'US',language:'en',...i.location},frequency:i.frequency,lastRunAt:null,nextRunAt:null};return r.fulfill({json:{success:true,project:st.project}})}
  if(path==='/queries'&&m==='GET')return r.fulfill({json:{success:true,queries:st.queries}});
  if(path==='/queries'&&m==='POST'){const i=r.request().postDataJSON();const q={id:`q${st.queries.length+1}`,text:i.text,tag:i.tag||null};st.queries.push(q);return r.fulfill({status:201,json:{success:true,query:q}})}
  if(path==='/billing')return r.fulfill({json:{success:true,...me(),usage:{runs:0,checks:0,addonChecks:0},invoices:[],hasCustomer:false}});
  if(path==='/runs')return r.fulfill({json:{success:true,runs:[]}});
  return r.fulfill({json:{success:true}})});

// 1. What it is
await p.goto(APP+'/');await wait(900);await cap('AI Overview Hub shows where your brand appears in AI answers.');await wait(3200);
await scrollTo('#platforms',20);await cap('Every run checks Google AI Overview, AI Mode, ChatGPT, Perplexity, Copilot and more.');await wait(3600);
await scrollTo('body',0);await wait(400);
// 2. Sign up
await cap('Step 1: Create your account.');await click(p.getByRole('button',{name:/Start monitoring your brand/}));await wait(700);
await type(p.getByLabel('Your name'),'Jordan Lee');await type(p.getByLabel('Email'),'jordan@northwindcrm.com');await type(p.getByLabel('Password'),'demo-password-123');
await click(p.getByRole('button',{name:'Create account'}));await p.waitForURL(/\/welcome/);await wait(600);
await cap('Your workspace is ready. Three quick steps to your first report.');await wait(3200);
// 3. Project
await cap('Step 2: Add your website and the brand names to look for.');await click(p.getByRole('link',{name:'Set up project →'}));await wait(900);
await type(p.getByLabel('Your website'),'northwindcrm.com');await type(p.getByLabel(/Brand names/),'Northwind, Northwind CRM');
await scrollTo('.engine-row',140);await cap('Choose which AI answers to check, and from which country.');await wait(1200);
await click(p.getByRole('radio',{name:'Both'}).first());await wait(1400);
await cap('Each run is priced up front: queries × sources = answer checks.');await moveTo(p.locator('.quote'));await wait(2600);
await click(p.getByRole('button',{name:'Create project'}));await p.waitForURL(/#\/queries/);await wait(700);
// 4. Queries
await cap('Step 3: Add the questions your customers ask AI.');
for(const q of ['best crm for small teams','hubspot vs salesforce for startups','crm with built-in email marketing']){await type(p.getByLabel('Add a query'),q);await click(p.getByRole('button',{name:'Add query'}));await wait(500)}
await wait(1500);
// 5. Plan
await cap('Step 4: Choose a plan. Payment is handled securely by Stripe.');await click(p.locator('aside').getByRole('link',{name:/Billing/}));await wait(3600);
// 6. Results (example account)
await cap('Then run monitoring. Here is what you see after a run (example account).');await p.goto(APP+'/#/demo');await wait(3200);
await scrollTo('.metricgrid',90);await cap('AI visibility, citation rate and mention rate, with change since the last run.');await wait(3600);
await scrollTo('.coverage',90);await cap('Coverage by AI source, and which competitors get cited instead of you.');await wait(3800);
await scrollTo('body',0);await cap('Every run is saved as a report. Download it as Excel or CSV.');await click(p.locator('aside').getByText('Reports',{exact:false}).first());await wait(1000);
await moveTo(p.getByRole('button',{name:'XLSX'}).first());await wait(2800);
await cap('Start monitoring your brand at aioverviewhub.com');await wait(3400);
await cap('');await wait(500);
const video=p.video();await ctx.close();await b.close();console.log('VIDEO',await video.path());
