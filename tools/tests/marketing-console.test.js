/* Boots the real marketing console in jsdom against a mock Apps Script endpoint.
   The point of this test is the guardrails: this screen sends real email to real
   customers, so "it renders" is not the interesting part. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HOME + '/acr-testkit/node_modules/jsdom');

const REPO = '/Users/geoffreyfernandez/Documents/ACR Automobile Website/acr-website';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('   FAIL: ' + m); } };

const CONTACTS = [
  { email: 'alex@example.com', name: 'Mr Alex Marin', first: 'Alex', status: 'Completed', service: 'Meta Trak S5',
    foundVia: 'ChatGPT', lastEnquiry: '2026-08-20T10:00:00.000Z', enquiries: 2, customer: true,
    imported: false, unsubscribed: false, mailable: true, consent: '', tags: '' },
  { email: 'sam@example.com', name: 'Sam Reid', first: 'Sam', status: 'Booked', service: 'CarPlay',
    foundVia: 'Google', lastEnquiry: '2026-08-19T10:00:00.000Z', enquiries: 1, customer: true,
    imported: false, unsubscribed: false, mailable: true, consent: '', tags: '' },
  { email: 'jo@example.com', name: 'Jo Patel', first: 'Jo', status: 'Quoted', service: 'Dash camera',
    foundVia: 'Google', lastEnquiry: '2026-08-18T10:00:00.000Z', enquiries: 1, customer: false,
    imported: false, unsubscribed: false, mailable: true, consent: '', tags: '' },
  { email: 'gone@example.com', name: 'Opted Out', first: 'Opted', status: 'Completed', service: 'Tracker',
    foundVia: 'Referral', lastEnquiry: '2026-08-17T10:00:00.000Z', enquiries: 1, customer: true,
    imported: false, unsubscribed: true, mailable: false, consent: '', tags: '' },
  { email: 'imported@example.com', name: 'Pasted Person', first: 'Pasted', status: '', service: '',
    foundVia: '', lastEnquiry: '', enquiries: 0, customer: false,
    imported: true, unsubscribed: false, mailable: true, consent: 'Existing customer', tags: 'dealer-list' }
];

const html = fs.readFileSync(path.join(REPO, 'marketing-console-a7c93f.html'), 'utf8');

const calls = { get: [], post: [] };
let sendState = null;   // simulates the server's per-campaign sent log

const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://acrautomobile.com/marketing-console-a7c93f.html',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = (url, opt) => {
      const u = String(url);
      if (opt && opt.method === 'POST') {
        let body = {}; try { body = JSON.parse(opt.body); } catch (e) {}
        calls.post.push(body);
        if (body.action === 'mktSave') sendState = { id: body.campaign.id, all: body.campaign.recipients.slice(), sent: [] };
        return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') });
      }
      calls.get.push(u);
      if (/action=mktList/.test(u)) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(
          { ok: true, contacts: JSON.parse(JSON.stringify(CONTACTS)), quotaLeft: 1500 })) });
      }
      if (/action=mktTest/.test(u)) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify({ ok: true, to: 'x', quotaLeft: 1499 })) });
      }
      if (/action=mktSend/.test(u)) {
        // send 2 per batch so the batching loop is genuinely exercised
        const left = sendState.all.filter(e => sendState.sent.indexOf(e) === -1);
        const take = left.slice(0, 2);
        take.forEach(e => sendState.sent.push(e));
        return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(
          { ok: true, sent: take.length, failed: 0, skipped: 0,
            remaining: sendState.all.length - sendState.sent.length,
            total: sendState.all.length, quotaLeft: 1500 - sendState.sent.length })) });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') });
    };
    // crypto.subtle for the passcode gate
    w.crypto = w.crypto || {};
    w.crypto.subtle = { digest: async () => new Uint8Array(32) };
  }
});
const w = dom.window;
const d = w.document;
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => w.addEventListener('load', r, { once: true }));

  /* --- the gate --- */
  ok(d.body.classList.contains('locked'), 'the console starts locked');
  ok(d.getElementById('shell').hidden, 'the shell is hidden before unlocking');
  ok(/noindex/.test(html), 'the page is noindex');

  // unlock the way the gate does
  d.body.classList.remove('locked');
  d.getElementById('gate').style.display = 'none';
  d.getElementById('shell').hidden = false;
  w.__mktStart();
  for (let i = 0; i < 60 && !d.querySelector('#tbody tr'); i++) await wait(40);

  /* --- the list --- */
  const rows = [...d.querySelectorAll('#tbody tr')];
  ok(rows.length > 0, 'contacts rendered');
  ok(/Customers/.test(d.getElementById('segSel').value === 'cust' ? 'Customers' : ''), 'default segment is Customers');
  ok(d.getElementById('segSel').value === 'cust', 'the safe segment is selected by default, not everyone');

  const tiles = d.getElementById('tiles').textContent;
  ok(/Unsubscribed/.test(tiles), 'an unsubscribed tile is shown');
  ok(/5/.test(tiles), 'all five contacts counted');

  /* --- unsubscribed must be unselectable, in every segment --- */
  d.getElementById('segSel').value = 'all';
  d.getElementById('segSel').dispatchEvent(new w.Event('change'));
  await wait(60);
  const allRows = [...d.querySelectorAll('#tbody tr')];
  const gone = allRows.find(r => /gone@example\.com/.test(r.textContent));
  ok(!gone, 'an unsubscribed contact does not appear in "Everyone mailable"');

  d.getElementById('selAll').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok(!/gone@example\.com/.test(d.getElementById('selCount').textContent), 'selCount is a number, not addresses');
  const selectedAll = +d.getElementById('selCount').textContent.match(/\d+/)[0];
  ok(selectedAll === 4, '"Select all shown" picks the 4 mailable contacts, never the opted-out one (got ' + selectedAll + ')');

  /* --- the unsubscribed segment shows them, but with no checkbox --- */
  d.getElementById('segSel').value = 'unsub';
  d.getElementById('segSel').dispatchEvent(new w.Event('change'));
  await wait(60);
  const unsubRows = [...d.querySelectorAll('#tbody tr')];
  ok(unsubRows.length === 1 && /gone@example/.test(unsubRows[0].textContent), 'the unsubscribed segment lists them');
  ok(!unsubRows[0].querySelector('input[type=checkbox]'), 'an unsubscribed row has no checkbox at all');
  ok(!!unsubRows[0].querySelector('[data-resub]'), 'it offers Re-subscribe instead');

  /* --- import parsing --- */
  d.getElementById('tabs').querySelectorAll('button')[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(40);
  const imp = d.getElementById('impText');
  imp.value = ['email,name',                       // CSV header, must be ignored
               'new1@example.com, New One',
               'new2@example.com',
               'alex@example.com, Mr Alex Marin',  // already known
               'not-an-email',                     // unreadable
               '"quoted@example.com" , Quoted'
              ].join('\n');
  imp.dispatchEvent(new w.Event('input'));
  await wait(60);
  const pv = d.getElementById('impPrev').textContent;
  ok(/4 addresses read/.test(pv), 'CSV header ignored, 4 addresses read (got: ' + pv.slice(0, 90) + ')');
  ok(/3 new/.test(pv), '3 counted as new — the known address is excluded');
  ok(/1 already known/.test(pv), 'the duplicate is reported');
  ok(/1 unreadable/.test(pv), 'the invalid line is reported rather than silently dropped');

  /* --- compose: merge fields --- */
  d.getElementById('tabs').querySelectorAll('button')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(40);
  d.getElementById('subj').value = 'Test subject';
  d.getElementById('body').value = 'Hi {{first}},\n\nSecond paragraph.\nSame paragraph, new line.';
  d.getElementById('body').dispatchEvent(new w.Event('input'));
  await wait(40);
  const who = d.getElementById('prevWho');
  who.value = 'alex@example.com';
  who.dispatchEvent(new w.Event('change'));
  await wait(40);
  const prev = d.getElementById('prev').textContent;
  ok(/Hi Alex,/.test(prev), '{{first}} resolves to the first name');
  ok(!/Hi Mr,/.test(prev), 'the title is stripped — never "Hi Mr,"');
  ok(!/\{\{/.test(prev), 'no unresolved merge fields remain');
  ok(/Unsubscribe/.test(prev), 'the preview shows the unsubscribe link');
  ok(/W11 4QR/.test(prev), 'the preview shows the postal address (a legal requirement)');
  ok(d.getElementById('prev').querySelectorAll('p').length >= 2, 'blank lines became separate paragraphs');

  /* --- sending: the guardrails --- */
  d.getElementById('segSel').value = 'cust';
  d.getElementById('segSel').dispatchEvent(new w.Event('change'));
  d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(40);
  ok(d.getElementById('sendBtn').disabled, 'Send is disabled with nothing selected');

  d.getElementById('selAll').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(40);
  ok(!d.getElementById('sendBtn').disabled, 'Send enables once recipients are selected');
  const n = +d.getElementById('sendWho').textContent.match(/\d+/)[0];
  ok(n === 2, 'the Customers segment selects 2 (Alex + Sam), excluding the opted-out customer (got ' + n + ')');

  // refuse a wrong confirmation
  calls.post.length = 0;
  w.prompt = () => '1';               // wrong number
  w.confirm = () => true;
  w.alert = () => {};
  d.getElementById('sendBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(120);
  ok(calls.post.filter(p => p.action === 'mktSave').length === 0,
     'a wrong typed confirmation sends nothing at all');

  // correct confirmation -> batches through
  w.prompt = () => String(n);
  d.getElementById('sendBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  for (let i = 0; i < 80 && !/Finished/.test(d.getElementById('log').textContent); i++) await wait(80);
  const log = d.getElementById('log').textContent;
  ok(/Finished/.test(log), 'the campaign completed (log: ' + log.replace(/\n/g, ' | ').slice(0, 120) + ')');
  const saves = calls.post.filter(p => p.action === 'mktSave');
  ok(saves.length === 1, 'exactly one campaign was saved (got ' + saves.length + ')');
  ok(saves[0].campaign.id && /^C\d+/.test(saves[0].campaign.id),
     'the client supplied the campaign id, so it can send what it saved');
  ok(saves[0].campaign.recipients.length === 2 &&
     saves[0].campaign.recipients.indexOf('gone@example.com') === -1,
     'the saved recipient list excludes the opted-out address');
  ok(sendState.sent.length === 2 && new Set(sendState.sent).size === 2,
     'each address was sent exactly once across the batches (got ' + JSON.stringify(sendState.sent) + ')');
  ok(/2\/2 done/.test(log), 'progress was reported per batch');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('harness error: ' + e.message + '\n' + e.stack); process.exit(1); });
