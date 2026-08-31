/* The shared console switcher, checked on all three real pages.
   The interesting parts: Pipeline/Dashboard are two views of ONE file, so the
   deep link has to set the view BEFORE the CRM boots; and the external SEO
   entry must not lie about where you are once it opens a new tab. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HOME + '/acr-testkit/node_modules/jsdom');

const REPO = '/Users/geoffreyfernandez/Documents/ACR Automobile Website/acr-website';
const NAV = fs.readFileSync(path.join(REPO, 'console-nav.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('   FAIL: ' + m); } };

function boot(page, hash, store) {
  const html = fs.readFileSync(path.join(REPO, page), 'utf8');
  const url = 'https://acrautomobile.com/' + page + (hash || '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const w = dom.window;
  const mem = Object.assign({}, store || {});
  Object.defineProperty(w, 'localStorage', {
    value: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); },
             removeItem: k => { delete mem[k]; } }, configurable: true });
  const opened = [], navs = [];
  w.open = u => { opened.push(String(u)); return null; };
  w.prompt = () => w.__promptReply;
  w.alert = () => {};
  /* window.location is non-configurable in jsdom, so it can be neither patched
     nor replaced. console-nav.js is an IIFE referencing a bare `location`, so
     shadow it with a function parameter - the script sees the stub, the rest of
     the page keeps the real one. */
  let _hash = hash || '';
  w.__loc = {
    pathname: '/' + page,
    get hash() { return _hash; },
    set hash(v) { _hash = String(v).charAt(0) === '#' ? String(v) : '#' + v; },
    get href() { return url; },
    set href(v) { navs.push(String(v)); },
    reload() { navs.push('[reload]'); },
    toString() { return url; }
  };
  w.eval('(function (location) {\n' + NAV + '\n})(window.__loc);');
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d: w.document, mem, opened, navs };
}

const EXPECT = ['Pipeline', 'Dashboard', 'Marketing', 'Booking', 'ACR SEO'];

/* ---------- mounts on all three consoles ---------- */
for (const page of ['crm-a7c93f.html', 'marketing-console-a7c93f.html', 'booking-console-a7c93f.html']) {
  console.log(page);
  const { d } = boot(page);
  const sel = d.querySelector('[data-console-nav] select');
  ok(!!sel, '  the switcher mounted');
  if (!sel) continue;
  const labels = [...sel.options].map(o => o.textContent.replace(/\s*↗$/, '').trim());
  ok(labels.join(',') === EXPECT.join(','), '  all five destinations, in order (got ' + labels.join(',') + ')');
  ok(/Console/i.test(d.querySelector('[data-console-nav]').textContent), '  labelled "Console"');
}

/* ---------- it knows where you are ---------- */
console.log('current-page detection');
{
  ok(boot('marketing-console-a7c93f.html').d.querySelector('[data-console-nav] select').value === 'marketing',
     'marketing console selects Marketing');
  ok(boot('booking-console-a7c93f.html').d.querySelector('[data-console-nav] select').value === 'booking',
     'booking console selects Booking');
  ok(boot('crm-a7c93f.html', '', { acr_crm_dash: '0' }).d.querySelector('[data-console-nav] select').value === 'pipeline',
     'CRM in board view selects Pipeline');
  ok(boot('crm-a7c93f.html', '', { acr_crm_dash: '1' }).d.querySelector('[data-console-nav] select').value === 'dashboard',
     'CRM in dashboard view selects Dashboard');
  ok(boot('crm-a7c93f.html', '#dashboard', { acr_crm_dash: '0' }).d.querySelector('[data-console-nav] select').value === 'dashboard',
     'the #dashboard hash wins over the stored view');
}

/* ---------- the deep link must set the view BEFORE the CRM boots ---------- */
console.log('deep links');
{
  const a = boot('crm-a7c93f.html', '#dashboard', { acr_crm_dash: '0' });
  ok(a.mem.acr_crm_dash === '1',
     '#dashboard writes acr_crm_dash=1 at parse time, so the CRM opens on the dashboard (got ' + a.mem.acr_crm_dash + ')');
  const b = boot('crm-a7c93f.html', '#pipeline', { acr_crm_dash: '1' });
  ok(b.mem.acr_crm_dash === '0', '#pipeline writes 0 (got ' + b.mem.acr_crm_dash + ')');
  const c = boot('marketing-console-a7c93f.html', '#dashboard', { acr_crm_dash: '0' });
  ok(c.mem.acr_crm_dash === '0', 'the hash is ignored on a non-CRM page — it must not hijack another console');
}

/* ---------- navigating ---------- */
console.log('navigation');
{
  const m = boot('marketing-console-a7c93f.html');
  const sel = m.d.querySelector('[data-console-nav] select');
  sel.value = 'booking'; sel.dispatchEvent(new m.w.Event('change'));
  ok(m.navs.some(u => /booking-console-a7c93f\.html/.test(u)), 'Marketing -> Booking navigates');

  const c = boot('crm-a7c93f.html', '', { acr_crm_dash: '0' });
  const s2 = c.d.querySelector('[data-console-nav] select');
  s2.value = 'dashboard'; s2.dispatchEvent(new c.w.Event('change'));
  ok(c.mem.acr_crm_dash === '1', 'Pipeline -> Dashboard flips the stored view');
  ok(c.navs.indexOf('[reload]') > -1, 'and reloads in place rather than a pointless round trip');

  const same = boot('booking-console-a7c93f.html');
  const s3 = same.d.querySelector('[data-console-nav] select');
  s3.value = 'booking'; s3.dispatchEvent(new same.w.Event('change'));
  ok(same.navs.length === 0, 'selecting the page you are already on does nothing');
}

/* ---------- the external SEO entry ---------- */
console.log('ACR SEO (external)');
{
  // no URL stored yet -> asks once, remembers, opens in a new tab
  const a = boot('crm-a7c93f.html', '', { acr_crm_dash: '0' });
  a.w.__promptReply = 'https://acr-seo.vercel.app';
  const s = a.d.querySelector('[data-console-nav] select');
  s.value = 'seo'; s.dispatchEvent(new a.w.Event('change'));
  ok(a.mem.acr_seo_url === 'https://acr-seo.vercel.app', 'the URL is asked for once and remembered');
  ok(a.opened.length === 1 && /acr-seo\.vercel\.app/.test(a.opened[0]), 'it opens in a new tab');
  ok(a.navs.length === 0, 'the current console is not navigated away from');
  ok(s.value === 'pipeline', 'the dropdown snaps back — it must not claim you are on the SEO dashboard');

  // stored -> no prompt
  const b = boot('crm-a7c93f.html', '', { acr_crm_dash: '0', acr_seo_url: 'https://seo.example.com' });
  b.w.__promptReply = null;
  const s2 = b.d.querySelector('[data-console-nav] select');
  s2.value = 'seo'; s2.dispatchEvent(new b.w.Event('change'));
  ok(b.opened.length === 1 && /seo\.example\.com/.test(b.opened[0]), 'a stored URL opens without asking again');

  // cancelled prompt -> nothing happens
  const c = boot('crm-a7c93f.html', '', { acr_crm_dash: '0' });
  c.w.__promptReply = null;
  const s3 = c.d.querySelector('[data-console-nav] select');
  s3.value = 'seo'; s3.dispatchEvent(new c.w.Event('change'));
  ok(c.opened.length === 0 && !c.mem.acr_seo_url, 'cancelling the prompt opens nothing and stores nothing');
  ok(s3.value === 'pipeline', 'and the dropdown still shows where you actually are');

  // rubbish -> rejected
  const e = boot('crm-a7c93f.html', '', { acr_crm_dash: '0' });
  e.w.__promptReply = 'not a url';
  const s4 = e.d.querySelector('[data-console-nav] select');
  s4.value = 'seo'; s4.dispatchEvent(new e.w.Event('change'));
  ok(!e.mem.acr_seo_url && e.opened.length === 0, 'a non-URL is rejected rather than stored');
}

/* ---------- no double mount ---------- */
console.log('idempotence');
{
  const { w, d } = boot('crm-a7c93f.html');
  w.__consoleNav(); w.__consoleNav();
  ok(d.querySelectorAll('[data-console-nav] select').length === 1,
     're-mounting does not stack a second dropdown');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
