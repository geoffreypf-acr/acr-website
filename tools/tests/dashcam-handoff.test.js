/* The reported bug: "How did you find us?" was missing from the WhatsApp message
   after switching to the dash camera form. The dash handler builds its own
   fields object by hand, so it needed its own wiring and its own validation.

   Covers both routes into that form:
     A) handed over from the assessment form (value carried in the URL hash)
     B) a visitor who lands on the dash camera page directly */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HOME + '/acr-testkit/node_modules/jsdom');

const REPO = '/Users/geoffreyfernandez/Documents/ACR Automobile Website/acr-website';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('   FAIL: ' + m); } };

function boot(page, hash) {
  const html = fs.readFileSync(path.join(REPO, page), 'utf8');
  const url = 'https://acrautomobile.com/' + page + (hash ? '#' + hash : '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const w = dom.window;
  const posts = [], opened = [];
  w.fetch = (u, o) => { posts.push({ url: String(u), body: o && o.body }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
  w.open = u => { opened.push(String(u)); return null; };
  w.lucide = { createIcons() {} };
  let nav = null;
  try {
    Object.defineProperty(w.location, 'href', { set(v) { nav = v; }, get() { return url; }, configurable: true });
  } catch (e) {}
  w.eval(fs.readFileSync(path.join(REPO, 'form.js'), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d: w.document, posts, opened, nav: () => nav };
}

function fillDash(form, d) {
  const set = (sel, v) => { const el = form.querySelector(sel); if (el) el.value = v; };
  set('[data-title]', 'Mr'); set('[data-first]', 'Alex'); set('[data-surname]', 'Marin');
  set('#de', 'alex@example.com'); set('#dt', '07700 900000'); set('#dpc', 'SW3');
  set('#dmk', 'Porsche'); set('#dmd', '911'); set('#dy', '2021');
  // camera + coverage are radio groups
  const cam = form.querySelector('input[name="cam"]'); if (cam) { cam.checked = true; cam.dispatchEvent(new d.defaultView.Event('change', { bubbles: true })); }
  const cov = form.querySelector('input[name="cov"]'); if (cov) { cov.checked = true; cov.dispatchEvent(new d.defaultView.Event('change', { bubbles: true })); }
}

function submit(form, d) {
  const btn = d.getElementById('dashSubmit')
           || [...form.querySelectorAll('a,button')].find(e => /whatsapp|send|dash/i.test(e.textContent));
  btn.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
  return btn;
}

/* ---------- A) handed over from the assessment form ---------- */
console.log('A) handed over from the assessment form');
{
  const hash = 'title=Mr&first=Alex&surname=Marin&email=alex%40example.com&mobile=07700900000'
             + '&postcode=SW3&make=Porsche&model=911&year=2021&via=whatsapp&found=ChatGPT&key=2026-08-31T00%3A00%3A00.000Z';
  const { d, posts, opened } = boot('dash-camera-installation-london.html', hash);
  const form = d.getElementById('dashForm');
  const found = form.querySelector('[data-found]');

  ok(!!found, 'the dash form has the field');
  ok(found.value === 'ChatGPT', 'the handed-over answer is PREFILLED, so it is not asked twice (got ' + JSON.stringify(found.value) + ')');

  fillDash(form, d);
  submit(form, d);

  const wa = decodeURIComponent(opened[0] || '');
  ok(opened.length === 1, 'WhatsApp opened once (got ' + opened.length + ')');
  ok(/How did you find us\?: ChatGPT/.test(wa),
     'THE REPORTED BUG: the answer is now in the WhatsApp message');
  ok(wa.indexOf('How did you find us?') > wa.indexOf('Year'),
     'it sits after the vehicle details, matching the other forms');

  const crm = posts.find(p => /script\.google\.com/.test(p.url));
  ok(!!crm, 'a CRM write happened');
  if (crm) {
    const body = JSON.parse(crm.body);
    const cols = body.fields || body;
    ok(cols.foundVia === 'ChatGPT',
       'the CRM row is updated with foundVia (got ' + JSON.stringify(cols.foundVia) + ')');
    ok(body.action === 'updateEnquiry',
       'it completes the existing row rather than creating a second enquiry');
  }
  const mail = posts.find(p => /formsubmit/.test(p.url));
  if (mail) ok(/ChatGPT/.test(mail.body), 'the email copy carries it too');
}

/* ---------- B) a direct visitor, nothing handed over ---------- */
console.log('B) direct visitor to the dash camera page');
{
  const { d, posts, opened } = boot('dash-camera-installation-london.html', '');
  const form = d.getElementById('dashForm');
  const found = form.querySelector('[data-found]');
  ok(found.value === '', 'nothing prefilled for a direct visitor');

  fillDash(form, d);
  submit(form, d);
  ok(posts.length === 0 && opened.length === 0,
     'BLOCKED: mandatory here too - nothing sent while the field is empty (posts=' + posts.length + ' opened=' + opened.length + ')');
  ok(/found us/i.test(d.body.textContent), 'an error about how they found us is shown');

  found.value = 'Referral';
  found.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  submit(form, d);
  ok(opened.length === 1, 'sends once the field is answered');
  ok(/How did you find us\?: Referral/.test(decodeURIComponent(opened[0] || '')),
     'the direct-visitor answer reaches the WhatsApp message');
  const crm = posts.find(p => /script\.google\.com/.test(p.url));
  if (crm) {
    const body = JSON.parse(crm.body);
    ok(body.foundVia === 'Referral',
       'a brand new CRM row carries foundVia (got ' + JSON.stringify(body.foundVia) + ')');
    ok(!body.action, 'it is a new enquiry, not an update');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
