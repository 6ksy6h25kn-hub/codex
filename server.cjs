const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const WIDTH = 1280, HEIGHT = 900;
const publicFiles = new Map([
  ['/viewer.js', ['viewer.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);
const script = fs.readFileSync(path.join(__dirname, 'navigator.js'), 'utf8');
const login = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Flowrix viewer</title><link rel="stylesheet" href="/style.css"><main><h1>Private Flowrix viewer</h1><form method="post" action="/login"><label>Viewer password <input type="password" name="password" autocomplete="current-password" required></label><button>Open viewer</button></form><p>Use the password set in Replit Secrets as REPLIT_ACCESS_PASSWORD. Log into the game on the next screen.</p></main>';

async function createApp({password = process.env.REPLIT_ACCESS_PASSWORD, gameURL = 'https://flowrix.sussybite.dev/', profileDir = path.join(__dirname, '.browser-profile'), executablePath = process.env.CHROMIUM_PATH, secureCookie = true} = {}) {
  if (!password || password.length < 16) throw new Error('Set REPLIT_ACCESS_PASSWORD to a private password of at least 16 characters in Replit Secrets.');
  // Prefer the system Chromium supplied by replit.nix; otherwise use Playwright's browser.
  if (!executablePath) executablePath = (process.env.PATH || '').split(path.delimiter).flatMap(dir => ['chromium','chromium-browser'].map(name => path.join(dir,name))).find(p => fs.existsSync(p));
  let context, page, frame, lastError = '', ready = false, injected = false, capturing = false, closed = false;
  const sessions = new Map(), attempts = new Map(), keys = new Set();
  let pending = 0, queue = Promise.resolve(), lastViewed = 0;
  const equalPassword = value => crypto.timingSafeEqual(crypto.createHash('sha256').update(value).digest(), crypto.createHash('sha256').update(password).digest());
  const json = (res, status, data) => {res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const authenticated = req => {
    const id = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('flowrix_session='))?.slice(16);
    const expiry = sessions.get(id);if (!expiry || expiry < Date.now()) {sessions.delete(id);return false;}return true;
  };
  function validOrigin(req) {
    try {
      const origin=new URL(req.headers.origin);
      if(!['https:','http:'].includes(origin.protocol))return false;
      const hosts=new Set([req.headers.host]);
      for(const domain of [process.env.REPLIT_DEV_DOMAIN,...(process.env.REPLIT_DOMAINS||'').split(',')]) {
        if(domain?.trim())hosts.add(domain.trim());
      }
      return hosts.has(origin.host);
    } catch {return false;}
  }
  async function readBody(req) {
    let body = '';for await (const chunk of req) {body += chunk;if (body.length > 16384) throw new Error('Request too large');}return body;
  }
  const serial = action => {
    if (pending >= 100) return Promise.reject(new Error('Too many pending controls'));
    pending++;const result = queue.then(action);queue = result.catch(() => {}).finally(() => pending--);return result;
  };
  async function inject() {
    if (!page || page.isClosed()) throw new Error('Browser is not ready');
    await page.bringToFront();
    if (!await page.evaluate(() => !!document.querySelector('canvas') && !!window.Module)) throw new Error('Wait for the game canvas and runtime to load, then use Reload script.');
    await page.evaluate(script);injected = true;lastError = '';
  }
  async function releaseManual() {
    for (const key of [...keys]) {await page.keyboard.up(key).catch(() => {});keys.delete(key);}
    await page.mouse.up().catch(() => {});
  }
  async function control(data) {
    if (!page || page.isClosed()) throw new Error('Browser is not ready');
    await page.bringToFront();
    const coordinate = (value, max) => {if (!Number.isFinite(value)) throw new Error('Invalid pointer coordinate');return Math.max(0, Math.min(max - 1, value));};
    if (data.type === 'pointer') {
      const x = coordinate(data.x, WIDTH), y = coordinate(data.y, HEIGHT);
      await page.mouse.move(x,y);
      if (data.action === 'down') await page.mouse.down();
      else if (data.action === 'up') await page.mouse.up();
      else if (data.action !== 'move') throw new Error('Invalid pointer action');
    } else if (data.type === 'key') {
      if (typeof data.key !== 'string' || data.key.length > 40) throw new Error('Invalid key');
      if (data.action === 'down') {await page.keyboard.down(data.key);keys.add(data.key);}
      else if (data.action === 'up') {await page.keyboard.up(data.key);keys.delete(data.key);}
      else throw new Error('Invalid key action');
    } else if (data.type === 'text') {
      if (typeof data.text !== 'string' || data.text.length > 4096) throw new Error('Invalid text');
      await page.keyboard.insertText(data.text);
    } else if (data.type === 'wheel') {
      const x=coordinate(data.x,WIDTH),y=coordinate(data.y,HEIGHT);
      if (!Number.isFinite(data.deltaY)) throw new Error('Invalid scroll');
      await page.mouse.move(x,y);await page.mouse.wheel(0,Math.max(-1000,Math.min(1000,data.deltaY)));
    } else if (data.type === 'release') await releaseManual();
    else if (data.type === 'inject') await inject();
    else if (data.type === 'stop') {await releaseManual();await page.evaluate(() => window.flowrixNav?.stop());}
    else if (data.type === 'start') {
      if (!await page.evaluate(() => !!window.flowrixNav)) await inject();
      await page.evaluate(() => {
        const root = [...document.querySelectorAll('div')].map(e => e.shadowRoot).find(r => r?.querySelector('.panel'));
        const button = [...(root?.querySelectorAll('button') || [])].find(b => b.textContent === 'Start automatic loop');
        if (!button) throw new Error('Navigator controls not found');button.click();
      });
    } else if (data.type === 'settings') {
      await page.evaluate(values => {
        const root = [...document.querySelectorAll('div')].map(e => e.shadowRoot).find(r => r?.querySelector('.panel'));
        if (!root) throw new Error('Load the navigator first');
        for (const [name, value] of Object.entries(values)) {
          const select = [...root.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === value));
          if (!['biome','rarity'].includes(name) || typeof value !== 'string' || !select) throw new Error('Unknown farming setting');
          select.value = value;select.dispatchEvent(new Event('change',{bubbles:true}));
        }
      }, data.values || {});
    } else throw new Error('Unknown control');
  }
  const server = http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    try {
      const url = new URL(req.url,'http://localhost'), file = publicFiles.get(url.pathname);
      if (file && req.method === 'GET') {res.writeHead(200,{'Content-Type':file[1]});return res.end(fs.readFileSync(path.join(__dirname,'public',file[0])));}
      if (url.pathname === '/health') return json(res,200,{server:true,browser:ready,script:injected});
      if (url.pathname === '/login' && req.method === 'GET') {res.writeHead(303,{Location:'/'});return res.end();}
      if (url.pathname === '/login' && req.method === 'POST') {
        if (req.headers.origin && !validOrigin(req)) return json(res,403,{error:'Open the full HTTPS viewer URL in a separate browser tab, reload the login page, then try again.'});
        const ip = req.socket.remoteAddress, now = Date.now(), attempt = attempts.get(ip) || {count:0,until:now+60000};
        if (attempt.until < now) {attempt.count = 0;attempt.until = now+60000;}attempt.count++;attempts.set(ip,attempt);
        if (attempt.count > 10) return json(res,429,{error:'Too many attempts. Wait one minute.'});
        const supplied = new URLSearchParams(await readBody(req)).get('password') || '';
        if (!equalPassword(supplied)) return json(res,401,{error:'Incorrect viewer password'});
        const id = crypto.randomBytes(32).toString('hex');sessions.set(id,now+24*60*60*1000);
        res.writeHead(303,{'Location':'/','Set-Cookie':`flowrix_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secureCookie?'; Secure':''}`});return res.end();
      }
      if (!authenticated(req)) {
        if (url.pathname !== '/') return json(res,401,{error:'Open the viewer and sign in'});
        res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(login);
      }
      if (url.pathname === '/' && req.method === 'GET') {res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'public','index.html')));}
      if (url.pathname === '/frame' && req.method === 'GET') {
        lastViewed = Date.now();if (!frame) return json(res,503,{error:lastError||'Launching game…'});
        res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(frame);
      }
      if (url.pathname === '/api/status' && req.method === 'GET') {
        let state = null;if (ready && page && !page.isClosed()) state = await page.evaluate(() => window.flowrixNav?.state()).catch(() => null);
        return json(res,200,{ready,injected,error:lastError,state,width:WIDTH,height:HEIGHT});
      }
      if (url.pathname === '/api/control' && req.method === 'POST') {
        if (!validOrigin(req) || !/^application\/json\b/.test(req.headers['content-type'] || '')) return json(res,403,{error:'Invalid control origin'});
        const data = JSON.parse(await readBody(req));await serial(() => control(data));return json(res,200,{ok:true});
      }
      json(res,404,{error:'Not found'});
    } catch (error) {json(res,400,{error:error.message});}
  });
  const housekeeping = setInterval(() => {
    const now = Date.now();for (const [id,expiry] of sessions) if (expiry < now) sessions.delete(id);
    for (const [ip,attempt] of attempts) if (attempt.until < now) attempts.delete(ip);
  },60000);
  const captureTimer = setInterval(async () => {
    if (closed || capturing || !ready || Date.now()-lastViewed > 3000) return;
    capturing = true;try {frame = await page.screenshot({type:'jpeg',quality:65,timeout:10000});}catch {}finally {capturing = false;}
  },250);
  const injectTimer = setInterval(() => {
    if (!ready || injected || pending) return;
    serial(async () => {if (await page.evaluate(() => !!window.Module && !!document.querySelector('canvas') && !window.flowrixNav)) await inject();}).catch(() => {});
  },2000);
  async function launch() {
    try {
      context = await chromium.launchPersistentContext(profileDir,{
        executablePath,headless:true,viewport:{width:WIDTH,height:HEIGHT},
        args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']
      });
      page = context.pages()[0] || await context.newPage();
      page.on('close',() => {ready=false;lastError='Browser page closed. Restart the Replit server.';});
      page.on('framenavigated',f => {if (f === page.mainFrame()) injected=false;});
      await page.goto(gameURL,{waitUntil:'domcontentloaded',timeout:60000});await page.bringToFront();ready=true;
      frame = await page.screenshot({type:'jpeg',quality:65});
    } catch (error) {lastError=error.message;ready=false;console.error('Browser launch failed:',error.message);}
  }
  async function close() {closed=true;clearInterval(captureTimer);clearInterval(injectTimer);clearInterval(housekeeping);await context?.close();await new Promise(resolve=>server.listening?server.close(resolve):resolve());}
  return {server,launch,close,browserPage:()=>page};
}

if (require.main === module) {
  createApp().then(app => {
    app.server.listen(Number(process.env.PORT)||3000,'0.0.0.0',() => {console.log('Private Flowrix viewer listening.');app.launch();});
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => app.close().finally(() => process.exit(0)));
  }).catch(error => {console.error(error.message);process.exitCode=1;});
}
module.exports={createApp};
