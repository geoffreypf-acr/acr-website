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

/* ---------- 4. the wire()-built forms ---------- */
/* These have a shared bespoke handler that assembles `fields` from an explicit
   list. Two of them were silently dropping the found-us answer, which the
   coverage check above could not see: it proved the FIELD exists on 26 forms,
   not that every handler sends it. */
console.log('wire()-built forms (referral, trade, dealership)');
{
  const CASES = [
    { page: 'referrals.html', form: 'referralForm', btn: 'referralSubmit', found: 'found-2',
      /* "what they need" is a mandatory tick-box group, so it has to be ticked
         or the form correctly refuses to send */
      check: 'input[name="rfneed"]',
      fill: { 'rf-title':'Mr','rf-name':'Alex','rf-sur':'Marin','rf-tel':'07700 900000',
              'rf-email':'alex@example.com',
              'rf-ftitle':'Mrs','rf-fname':'Sam','rf-fsur':'Reid',
              'rf-femail':'sam@example.com','rf-ftel':'07700 900111',
              'rf-fveh':'Range Rover Sport','rf-reward':'Cash by bank transfer' } },
    { page: 'referrals.html', form: 'tradeForm', btn: 'tradeSubmit', found: 'found-1',
      fill: { 'tr-biz':'Acme Cars','tr-title':'Mr','tr-name':'Alex','tr-sur':'Marin',
              'tr-tel':'07700 900000','tr-email':'alex@example.com','tr-pc':'W11',
              'tr-type':'Car dealership','tr-vol':'6\u201310 per month' } }
  ];

  CASES.forEach(c => {
    const { d, posts, opened } = boot(c.page, 'form.js');
    Object.entries(c.fill).forEach(([id, v]) => { const el = d.getElementById(id); if (el) el.value = v; });
    if (c.check) { const cb = d.querySelector(c.check); if (cb) cb.checked = true; }
    const btn = d.getElementById(c.btn);

    // blocked while the answer is missing
    btn.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
    ok(posts.length === 0 && opened.length === 0,
       c.form + ': BLOCKED while "how did you find us" is empty');
    ok(/found us/i.test((d.getElementById(c.form + 'Err') || {}).textContent || ''),
       c.form + ': the error names the field');

    // and sends it once answered
    d.getElementById(c.found).value = 'Claude';
    btn.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
    ok(opened.length === 1, c.form + ': sends once answered');
    const wa = decodeURIComponent(opened[0] || '');
    ok(/How did you find us\?: Claude/.test(wa), c.form + ': the answer is in the WhatsApp message');
    ok(wa.indexOf('How did you find us?') < wa.indexOf('Preferred reply'),
       c.form + ': it sits just before "Preferred reply", as on every other form');
    const crm = posts.find(p => /script\.google\.com/.test(p.url));
    ok(crm && JSON.parse(crm.body).foundVia === 'Claude',
       c.form + ': foundVia reaches the CRM (got ' + (crm && JSON.stringify(JSON.parse(crm.body).foundVia)) + ')');
  });

  /* the referral form's new question - tick boxes, so more than one can apply */
  const { d, posts, opened } = boot('referrals.html', 'form.js');
  const boxes = [...d.querySelectorAll('input[name="rfneed"]')];
  ok(boxes.length === 4, 'the referral form asks what they need, as four tick boxes (got ' + boxes.length + ')');
  ok(boxes.map(b => b.value).join('|')
      === 'Vehicle security|Dash camera|Apple CarPlay & Android Auto|Other',
     'with the four options, in order (got ' + boxes.map(b => b.value).join('|') + ')');
  ok(boxes.every(b => b.type === 'checkbox'), 'they are checkboxes, not a single-choice select');

  Object.entries({ 'rf-title':'Mr','rf-name':'Alex','rf-sur':'Marin','rf-tel':'07700 900000',
                   'rf-email':'alex@example.com','rf-ftitle':'Mrs','rf-fname':'Sam','rf-fsur':'Reid',
                   'rf-femail':'sam@example.com','rf-ftel':'07700 900111',
                   'found-2':'Google' }).forEach(([id, v]) => { d.getElementById(id).value = v; });
  d.getElementById('referralSubmit').dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(opened.length === 0, 'it is mandatory - a referral with no idea what they want is a blind phone call');
  ok(/what they need/i.test((d.getElementById('referralFormErr') || {}).textContent || ''),
     'and the error names it rather than saying "at least one option"');

  // two at once: someone can want security AND a dash camera
  boxes[0].checked = true; boxes[1].checked = true;
  d.getElementById('referralSubmit').dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
  const wa = decodeURIComponent(opened[0] || '');
  ok(/What they need: Vehicle security, Dash camera/.test(wa),
     'both ticks reach the WhatsApp message');
  const crm = posts.find(p => /script\.google\.com/.test(p.url));
  ok(crm && JSON.parse(crm.body).details === 'Vehicle security, Dash camera',
     'and land in the CRM details column, where the card shows them (got '
     + (crm && JSON.stringify(JSON.parse(crm.body).details)) + ')');
}

/* ---------- 4b. the referred person's own details ---------- */
console.log('the referred person');
{
  const { d, posts, opened } = boot('referrals.html', 'form.js');
  ok(!d.getElementById('rf-reg'), 'the referrer\'s own registration field is gone');
  ['rf-ftitle', 'rf-fname', 'rf-fsur', 'rf-femail'].forEach(id =>
    ok(!!d.getElementById(id), 'the referred person has ' + id));

  const set = (id, v) => { const e = d.getElementById(id); if (e) e.value = v; };
  set('rf-title', 'Mr'); set('rf-name', 'Alex'); set('rf-sur', 'Marin');
  set('rf-tel', '07700 900000'); set('rf-email', 'alex@example.com');
  set('rf-ftitle', 'Mrs'); set('rf-fname', 'Sam'); set('rf-fsur', 'Reid');
  set('rf-ftel', '07700 900111'); set('rf-fveh', 'Range Rover Sport');
  set('rf-reward', 'Cash by bank transfer'); set('found-2', 'Claude');
  d.querySelector('input[name="rfneed"]').checked = true;
  const btn = d.getElementById('referralSubmit');
  const click = () => btn.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));

  click();
  ok(opened.length === 0 && /their email address/i.test((d.getElementById('referralFormErr') || {}).textContent || ''),
     'their email is mandatory');

  set('rf-femail', 'not-an-email');
  click();
  ok(opened.length === 0 && /valid email/i.test((d.getElementById('referralFormErr') || {}).textContent || ''),
     'and validated - a mistyped address is a referral we cannot act on');

  set('rf-femail', 'sam@example.com');
  click();
  const wa = decodeURIComponent(opened[0] || '');
  ok(opened.length === 1, 'sends once complete');
  ok(/Referred name: Mrs Sam Reid/.test(wa),
     'their title, first name and surname come through as one name (got: '
     + (wa.match(/Referred name: [^\n]*/) || [''])[0] + ')');
  ok(/Referred email: sam@example\.com/.test(wa), 'their email comes through');
  ok(!/Registration/.test(wa), 'and the removed registration field is not in the message');

  /* the referrer's own name must not be overwritten by the referred person's */
  ok(/Name: Mr Alex Marin/.test(wa), 'the referrer\'s name is still their own');
}

/* ---------- 5. the referral rewards are stated consistently ---------- */
/* CarPlay and dash cameras now earn up to £20. That fact was stated in eleven
   places on the page, one of which answered "No" to exactly this question, so
   the risk here is a page that contradicts itself. */
console.log('referral reward copy');
{
  const doc = new JSDOM(fs.readFileSync(path.join(REPO, 'referrals.html'), 'utf8')).window.document;
  const text = doc.body.textContent.replace(/\s+/g, ' ');
  ok(/up to £20/.test(text), 'the £20 tier is stated');
  ok(/£50/.test(text) && /£75/.test(text), 'the security tiers are still stated');
  ok(!/immobilisers? (installations? )?only/i.test(text),
     'no surviving "trackers and immobilisers only" claim');
  ok(!/no reward attached/i.test(text), 'the FAQ no longer says CarPlay earns nothing');
  const faqYes = /Does the reward apply to CarPlay or dash cameras\?\s*Yes/.test(text);
  ok(faqYes, 'the FAQ now answers Yes to CarPlay and dash cameras');
  const dsc = doc.querySelector('meta[name=description]').content;
  ok(/up to £20/.test(dsc) && dsc.length <= 175, 'the meta description mentions it and is within length (' + dsc.length + 'c)');

  // schema must still match the visible answers
  const norm = t => t.replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase();
  const body = norm(doc.body.textContent);
  const sc = [...doc.querySelectorAll('script[type="application/ld+json"]')]
               .map(x => JSON.parse(x.textContent)).find(o => o['@type'] === 'FAQPage');
  const mismatched = sc.mainEntity.filter(q =>
    !body.includes(norm(q.name)) || !body.includes(norm(q.acceptedAnswer.text).slice(0, 70)));
  ok(mismatched.length === 0,
     'the FAQ schema still matches the visible answers (' + mismatched.map(q => q.name).join('; ') + ')');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
