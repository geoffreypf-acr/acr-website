/* The reported bug: "mobile view not showing complete menu navigation".
 *
 * Two faults compounded. site.css hides nav.main below 980px on EVERY page, and
 * the burger plus off-canvas menu existed only in index.html with its CSS only
 * in home.css - which only index.html loads. So 88 of 89 pages had no
 * navigation at all on a phone. index.html did have one, and it had already
 * drifted: the whole Trade section was missing from it.
 *
 * nav-mobile.js now generates the menu from the desktop nav on the page, so the
 * two cannot disagree. These checks are mostly about that parity.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HOME + '/acr-testkit/node_modules/jsdom');

const REPO = '/Users/geoffreyfernandez/Documents/ACR Automobile Website/acr-website';
const NAVJS = fs.readFileSync(path.join(REPO, 'nav-mobile.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('   FAIL: ' + m); } };

function boot(page) {
  const dom = new JSDOM(fs.readFileSync(path.join(REPO, page), 'utf8'),
    { runScripts: 'outside-only', url: 'https://acrautomobile.com/' + page });
  const w = dom.window;
  w.lucide = { createIcons() {} };
  w.eval(NAVJS);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d: w.document };
}

/* ---------- it builds on every page, not just the homepage ---------- */
console.log('coverage');
{
  const pages = fs.readdirSync(REPO)
    .filter(f => f.endsWith('.html') && !/^(crm-|booking-console|marketing-console)/.test(f));
  let built = 0, noScript = [], noParity = [];
  pages.forEach(p => {
    const src = fs.readFileSync(path.join(REPO, p), 'utf8');
    if (!/nav-mobile\.js/.test(src)) { noScript.push(p); return; }
    const { d } = boot(p);
    const mnav = d.getElementById('mnav');
    if (!mnav) return;
    built++;
    /* parity: every real nav link must be reachable from the phone menu */
    const deskLinks = new Set([...d.querySelectorAll('nav.main a[href]')]
      .map(a => a.getAttribute('href')).filter(h => h && !/^#/.test(h)));
    const mobLinks = new Set([...mnav.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
    const missing = [...deskLinks].filter(h => !mobLinks.has(h));
    if (missing.length) noParity.push(p + ' -> ' + missing.join(', '));
  });
  ok(noScript.length === 0, 'every page loads nav-mobile.js (' + noScript.slice(0, 4).join(', ') + ')');
  ok(built === pages.length, 'a mobile menu is built on all ' + pages.length + ' pages (got ' + built + ')');
  ok(noParity.length === 0,
     'no page has a nav link missing from its phone menu:\n     ' + noParity.slice(0, 4).join('\n     '));
  console.log('   ' + built + '/' + pages.length + ' pages, full parity');
}

/* ---------- the sections that were missing ---------- */
console.log('the previously missing sections');
{
  const { d } = boot('about.html');
  const mnav = d.getElementById('mnav');
  const text = mnav.textContent;
  const hrefs = [...mnav.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));

  ok(/Trade/i.test(text), 'the Trade group is present (it was missing from the old hand-written menu)');
  ok(hrefs.indexOf('referrals.html') > -1, 'Referrals & Trade Rates is reachable');
  ok(hrefs.indexOf('tracker-installation-car-dealerships-london.html') > -1, 'For Car Dealerships is reachable');
  ok(hrefs.indexOf('services.html') > -1, 'the services index is reachable');
  ok(hrefs.indexOf('bmw-mini-specialist-services.html') > -1, 'the BMW/MINI overview is reachable');
  ok(hrefs.indexOf('bmw-idrive-reboot.html') > -1, 'a third-level link is flattened in, not lost');

  const groups = [...mnav.querySelectorAll(':scope > details > summary')].map(s => s.textContent.replace(/\s+/g, ' ').trim());
  const deskGroups = [...d.querySelectorAll('nav.main .nav-item > a')].map(a => {
    let t = ''; a.childNodes.forEach(n => { if (n.nodeType === 3) t += n.nodeValue; });
    return t.replace(/\s+/g, ' ').trim();
  });
  ok(groups.length === deskGroups.length,
     'the same number of groups as the desktop nav (' + groups.join('/') + ' vs ' + deskGroups.join('/') + ')');
}

/* ---------- open and close ---------- */
console.log('behaviour');
{
  const { w, d } = boot('about.html');
  const burger = d.querySelector('.nav-burger');
  const mnav = d.getElementById('mnav');
  ok(!!burger, 'a burger button is created');
  ok(burger.getAttribute('aria-expanded') === 'false', 'it starts collapsed');
  ok(mnav.getAttribute('aria-hidden') === 'true', 'and the panel is hidden from assistive tech');

  burger.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(d.body.classList.contains('menu-open'), 'clicking it opens the menu');
  ok(burger.getAttribute('aria-expanded') === 'true', 'aria-expanded follows');
  ok(mnav.getAttribute('aria-hidden') === 'false', 'aria-hidden follows');

  d.getElementById('mnavClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(!d.body.classList.contains('menu-open'), 'close closes it');

  burger.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!d.body.classList.contains('menu-open'), 'Escape closes it');

  /* a hash link does not reload, so the panel has to close itself */
  burger.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const hashLink = [...mnav.querySelectorAll('a[href]')].find(a => /#/.test(a.getAttribute('href')));
  if (hashLink) {
    hashLink.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(!d.body.classList.contains('menu-open'), 'following an in-page link closes it too');
  }

  /* running twice must not stack two menus */
  w.eval(NAVJS);
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  ok(d.querySelectorAll('#mnav').length === 1, 'building twice does not create a second menu');
  ok(d.querySelectorAll('.nav-burger').length === 1, 'nor a second burger');
}

/* ---------- the CSS has to be where every page can see it ---------- */
console.log('styles');
{
  /* index.html loads home.css instead of site.css, so the check is not "every
     page loads site.css" - it is "every page loads a stylesheet that styles the
     menu it is now being given". */
  const css = {};
  ['site.css', 'home.css'].forEach(f => { css[f] = fs.readFileSync(path.join(REPO, f), 'utf8'); });
  Object.entries(css).forEach(([f, c]) => {
    ok(/\.mnav\s*\{/.test(c) && /\.nav-burger/.test(c) && /body\.menu-open\s+\.mnav/.test(c),
       f + ' styles the mobile menu, the burger and the open state');
  });

  const pages = fs.readdirSync(REPO).filter(f => f.endsWith('.html') && !/^(crm-|booking-console|marketing-console)/.test(f));
  const unstyled = pages.filter(p => {
    const src = fs.readFileSync(path.join(REPO, p), 'utf8');
    return !Object.keys(css).some(f => new RegExp(f.replace('.', '\\.')).test(src));
  });
  ok(unstyled.length === 0,
     'every page loads one of them (' + unstyled.join(', ') + ')');

  /* the burger must not appear on desktop - it was scraped out of a media query
     once already and shown at every width */
  Object.entries(css).forEach(([f, c]) => {
    const rules = [...c.matchAll(/[^\n]*\.nav-burger[^\n]*display:\s*inline-flex[^\n]*/g)].map(m => m[0]);
    const bare = rules.filter(r => {
      const at = c.indexOf(r);
      const before = c.slice(0, at);
      return (before.split('{').length - before.split('}').length) <= 0 && !/@media/.test(r);
    });
    ok(bare.length === 0, f + ': the burger is only shown inside a media query, never on desktop');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
