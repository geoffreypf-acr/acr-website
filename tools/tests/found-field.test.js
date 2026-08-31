/* Verifies the "How did you find us?" field on the real pages:
   - it is genuinely mandatory (submission is blocked and nothing is sent)
   - once answered, the value reaches the WhatsApp text, the email copy and the CRM row
   Runs the shipped form.js / wiz.js against the shipped HTML in jsdom. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HOME + '/acr-testkit/node_modules/jsdom');

const REPO = '/Users/geoffreyfernandez/Documents/ACR Automobile Website/acr-website';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('   FAIL: ' + m); } };

function boot(page, script) {
  const html = fs.readFileSync(path.join(REPO, page), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://acrautomobile.com/' + page });
  const w = dom.window;
  const posts = [];
  w.fetch = (url, opt) => {
    posts.push({ url: String(url), body: opt && opt.body });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
  const opened = [];
  w.open = (url) => { opened.push(String(url)); return null; };
  let navigated = null;
  Object.defineProperty(w, 'onbeforeunload', { value: null, writable: true });
  w.lucide = { createIcons() {} };
  // location.href assignment (the dash-cam handoff) must not throw
  try {
    Object.defineProperty(w.location, 'href', {
      set(v) { navigated = v; }, get() { return 'https://acrautomobile.com/' + page }, configurable: true
    });
  } catch (e) {}
  w.eval(fs.readFileSync(path.join(REPO, script), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d: w.document, posts, opened, nav: () => navigated };
}

function setSel(el, v) { el.value = v; el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true })); }

/* ---------- 1. form.js form (contact.html) ---------- */
console.log('form.js — contact.html');
{
  const { d, posts, opened } = boot('contact.html', 'form.js');
  const form = d.querySelector('#assessForm');
  const found = form.querySelector('[data-found]');
  ok(!!found, 'the found field exists on contact.html');
  ok(found.tagName === 'SELECT', 'it is a select');
  const WANT = ['Google', 'ChatGPT', 'Claude', 'Gemini', 'Referral', 'Other'];
  ok(WANT.every(o => [...found.options].some(x => x.text === o)), 'all six options present');
  ok(![...found.options].some(x => x.text === 'Website'), 'Website is not offered on the form');
  ok([...found.options].slice(1).map(o => o.text).join(',') === WANT.join(','),
     'options are in the agreed order (got ' + [...found.options].slice(1).map(o => o.text).join(',') + ')');
  ok(found.options[0].disabled && found.options[0].value === '', 'placeholder option is unselectable');

  // fill everything EXCEPT the found field
  form.querySelector('[data-title]').value = 'Mr';
  form.querySelector('[data-first]').value = 'Alex';
  form.querySelector('[data-surname]').value = 'Marin';
  form.querySelector('input[type="email"]').value = 'alex@example.com';
  const tel = form.querySelector('input[type="tel"]'); if (tel) tel.value = '07700 900000';

  const btn = form.querySelector('button, .btn');
  d.querySelector('#assessForm').querySelectorAll('button').forEach(() => {});
  const send = [...form.querySelectorAll('a,button')].find(e => /whatsapp|send|email/i.test(e.textContent)) || btn;
  send.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));

  const err = d.getElementById('formErr');
  ok(posts.length === 0, 'BLOCKED: nothing posted while the found field is empty (posts=' + posts.length + ')');
  ok(opened.length === 0, 'BLOCKED: WhatsApp not opened while the found field is empty');
  ok(!!err && /how you found us|found us/i.test(d.body.textContent), 'an error mentioning how they found us is shown');

  // now answer it and resend
  setSel(found, 'Other');
  send.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(/How did you find us\?: Other/.test(decodeURIComponent(opened[0] || '')),
     '"Other" round-trips into the message');
  opened.length = 0; posts.length = 0;
  setSel(found, 'ChatGPT');
  send.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(opened.length === 1, 'SENT: WhatsApp opened once after answering (' + opened.length + ')');
  const wa = decodeURIComponent(opened[0] || '');
  ok(/How did you find us\?: ChatGPT/.test(wa), 'the answer is in the WhatsApp message');

  const crm = posts.find(p => /script\.google\.com/.test(p.url));
  ok(!!crm, 'a CRM row was posted');
  if (crm) {
    const row = JSON.parse(crm.body);
    ok(row.foundVia === 'ChatGPT', 'CRM row carries foundVia=ChatGPT (got ' + JSON.stringify(row.foundVia) + ')');
    ok(row.email === 'alex@example.com', 'CRM row still carries the other fields');
  }
  const mail = posts.find(p => /formsubmit/.test(p.url));
  if (mail) ok(/ChatGPT/.test(mail.body), 'the email copy carries the answer');
}

/* ---------- 2. wizard (index.html) ---------- */
console.log('wiz.js — index.html hero wizard');
{
  const { d, posts, opened } = boot('index.html', 'wiz.js');
  const form = d.querySelector('#quote-form-hero');
  const found = form.querySelector('[data-found]');
  ok(!!found, 'the found field exists in the hero wizard');
  ok(found.hasAttribute('data-req'), 'it is marked data-req');
  ok(found.getAttribute('data-field') === 'found', 'it exposes data-field="found" for get()');

  const g = sel => form.querySelector(sel);
  g('[data-title]').value = 'Mr';
  g('[data-field="name"]').value = 'Alex';
  g('[data-field="surname"]').value = 'Marin';
  g('[data-field="email"]').value = 'alex@example.com';
  g('[data-field="mobile"]').value = '07700 900000';
  const pc = g('[data-field="postcode"]'); if (pc) pc.value = 'SW3';
  const mk = g('[data-field="make"]'); if (mk) mk.value = 'Porsche';
  const md = g('[data-field="model"]'); if (md) md.value = '911';
  const yr = g('[data-field="year"]'); if (yr) yr.value = '2001';
  const ck = form.querySelector('input[data-interest]'); if (ck) ck.checked = true;

  const sub = form.querySelector('[data-submit-label]') ?
              form.querySelector('[data-submit-label]').closest('button, a') :
              form.querySelector('button');
  sub.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(posts.length === 0 && opened.length === 0,
     'BLOCKED: wizard sends nothing while the found field is empty (posts=' + posts.length + ' opened=' + opened.length + ')');
  ok(/found us/i.test(d.body.textContent), 'wizard shows an error about how they found us');

  setSel(found, 'Gemini');
  sub.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
  const crm = posts.find(p => /script\.google\.com/.test(p.url));
  ok(!!crm, 'wizard posted a CRM row after answering');
  if (crm) ok(JSON.parse(crm.body).foundVia === 'Gemini',
              'wizard CRM row carries foundVia=Gemini (got ' + JSON.stringify(JSON.parse(crm.body).foundVia) + ')');
  const wa = decodeURIComponent(opened[0] || '');
  ok(/How did you find us\?: Gemini/.test(wa), 'wizard WhatsApp message carries the answer');
  ok(wa.indexOf('How did you find us?') > wa.indexOf('Registration') || !/Registration/.test(wa),
     'the answer sits after the vehicle details, before Preferred reply');
}

/* ---------- 3. every form on the site has the field ---------- */
console.log('coverage');
{
  const pages = fs.readdirSync(REPO).filter(f => f.endsWith('.html') && !/^(crm-|booking-console)/.test(f));
  let forms = 0, withField = 0, missing = [];
  pages.forEach(p => {
    const doc = new JSDOM(fs.readFileSync(path.join(REPO, p), 'utf8')).window.document;
    doc.querySelectorAll('form').forEach(f => {
      if (!f.querySelector('input, select, textarea')) return;
      forms++;
      if (f.querySelector('[data-found]')) withField++; else missing.push(p + '#' + (f.id || '?'));
    });
  });
  ok(missing.length === 0, 'forms without the field: ' + missing.join(', '));
  console.log('   ' + withField + '/' + forms + ' forms carry the field');
  // ids must be unique per page
  let dupes = [];
  pages.forEach(p => {
    const doc = new JSDOM(fs.readFileSync(path.join(REPO, p), 'utf8')).window.document;
    const ids = [...doc.querySelectorAll('[data-found]')].map(e => e.id);
    if (new Set(ids).size !== ids.length) dupes.push(p);
  });
  ok(dupes.length === 0, 'duplicate element ids on: ' + dupes.join(', '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
