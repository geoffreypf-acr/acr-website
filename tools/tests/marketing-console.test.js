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
    imported: true, unsubscribed: false, mailable: true, consent: 'Existing customer', tags: 'dealer-list' },
  { email: 'dashcam@example.com', name: 'Dee Cam', first: 'Dee', status: 'Completed', service: 'Dash camera installation',
    foundVia: 'Google', lastEnquiry: '2026-08-16T10:00:00.000Z', enquiries: 1, customer: true,
    imported: false, unsubscribed: false, mailable: true },
  { email: 'carplay@example.com', name: 'Cam Play', first: 'Cam', status: 'Completed', service: 'Apple CarPlay retrofit',
    foundVia: 'ChatGPT', lastEnquiry: '2026-08-15T10:00:00.000Z', enquiries: 1, customer: true,
    imported: false, unsubscribed: false, mailable: true }
];

/* raw enquiry rows, as the CRM sheet returns them - the Ideas tab counts these */
const recent = n => new Date(Date.now() - n * 864e5).toISOString();
const ENQUIRIES = [
  { timestamp: recent(3),  name: 'A', service: 'Meta Trak S5 tracker', make: 'Range Rover', source: 'tracker-installation-kensington', foundVia: 'ChatGPT' },
  { timestamp: recent(6),  name: 'B', service: 'Meta Trak S7 tracker', make: 'Range Rover', source: 'tracker-installation-kensington', foundVia: 'Google' },
  { timestamp: recent(9),  name: 'C', service: 'Immobiliser',          make: 'Range Rover', source: 'tracker-installation-chelsea',    foundVia: 'Google' },
  { timestamp: recent(12), name: 'D', service: 'Apple CarPlay',        make: 'BMW',         source: 'bmw-apple-carplay-london',        foundVia: 'Referral' },
  { timestamp: recent(15), name: 'E', service: 'Dash camera',          make: 'Audi',        source: 'dash-camera-installation-london', foundVia: '' },
  { timestamp: recent(400), name: 'Old', service: 'Tracker',           make: 'Ferrari',     source: 'tracker-installation-mayfair',    foundVia: '' }
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
          { ok: true, contacts: JSON.parse(JSON.stringify(CONTACTS)), quotaLeft: 1500,
            from: 'info@acrautomobile.com', fromOk: true })) });
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
      // plain GET = the raw enquiry sheet, used by the Ideas tab
      return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(ENQUIRIES)) });
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

  await wait(420);                       // the tile counters animate for 260ms
  const tiles = d.getElementById('tiles').textContent;
  ok(/Unsubscribed/.test(tiles), 'an unsubscribed tile is shown');
  /* read the tile's own value element - in textContent the value and the
     subtitle run together ("Contacts76 can be emailed") */
  const tileVal = label => {
    const t = [...d.querySelectorAll('#tiles .tile2')].find(x => new RegExp(label, 'i').test(x.querySelector('.k').textContent));
    return t ? t.querySelector('.v').textContent.trim() : null;
  };
  ok(tileVal('Contacts') === '7', 'all seven contacts counted (got ' + tileVal('Contacts') + ')');
  ok(tileVal('Customers') === '4', 'four mailable customers (got ' + tileVal('Customers') + ')');
  ok(tileVal('Unsubscribed') === '1', 'one unsubscribed (got ' + tileVal('Unsubscribed') + ')');

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
  ok(selectedAll === 6, '"Select all shown" picks the 6 mailable contacts, never the opted-out one (got ' + selectedAll + ')');

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
  const n = +d.getElementById('sendBtn').textContent.match(/\d+/)[0];
  ok(n === 4, 'the Customers segment selects the 4 mailable customers, excluding the opted-out one (got ' + n + ')');
  ok(/Send to 4 people/.test(d.getElementById('sendBtn').textContent),
     'the button states who it is about to email (got: ' + d.getElementById('sendBtn').textContent.trim() + ')');

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
  ok(saves[0].campaign.recipients.length === 4 &&
     saves[0].campaign.recipients.indexOf('gone@example.com') === -1,
     'the saved recipient list excludes the opted-out address (got '
     + JSON.stringify(saves[0].campaign.recipients) + ')');
  ok(sendState.sent.length === 4 && new Set(sendState.sent).size === 4,
     'each address was sent exactly once across the batches (got ' + JSON.stringify(sendState.sent) + ')');
  ok(/4\/4 done/.test(log), 'progress was reported per batch, in batches of 2');

  /* ---------- file upload: the exports people actually have ---------- */
  console.log('contact upload');
  {
    const tabs0 = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs0.find(b => /import/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    ok(!!d.getElementById('drop'), 'a drop zone exists');
    ok(!!d.getElementById('impFile'), 'a file picker exists');

    const feed = async (name, text) => {
      d.getElementById('impText').value = '';
      d.getElementById('impFileNote').hidden = true;
      const f = new w.File([text], name, { type: 'text/csv' });
      const dt = { files: [f] };
      const ev = new w.Event('drop', { bubbles: true, cancelable: true });
      ev.dataTransfer = dt;
      d.getElementById('drop').dispatchEvent(ev);
      for (let i = 0; i < 40 && !d.getElementById('impText').value; i++) await wait(30);
      return d.getElementById('impText').value;
    };

    // Google Contacts: quoted commas in a field, "E-mail 1 - Value", Given/Family Name
    let v = await feed('google.csv',
      'Given Name,Family Name,Organization Name,E-mail 1 - Value\n' +
      'Alex,Marin,"Marin, Holdings Ltd",alex@example.com\n' +
      'Sam,Reid,,sam@example.com\n');
    ok(/alex@example\.com, Alex Marin/.test(v), 'Google Contacts export: address + Given/Family name (got: ' + v.replace(/\n/g,' | ') + ')');
    ok(/sam@example\.com, Sam Reid/.test(v), 'second row too');
    ok(!/Holdings/.test(v), 'a quoted comma inside a field did not shift the columns');

    // Outlook
    v = await feed('outlook.csv', 'First Name,Last Name,E-mail Address\nJo,Patel,jo@example.com\n');
    ok(/jo@example\.com, Jo Patel/.test(v), 'Outlook export mapped');

    // Mailchimp
    v = await feed('mc.csv', 'Email Address,First Name,Last Name\nchris@example.com,Chris,Lowe\n');
    ok(/chris@example\.com, Chris Lowe/.test(v), 'Mailchimp export mapped');

    // semicolon delimiter + BOM (European spreadsheet export)
    v = await feed('euro.csv', '\ufeffName;Email\nDana Fox;dana@example.com\n');
    ok(/dana@example\.com, Dana Fox/.test(v), 'semicolon delimiter and a BOM both handled');

    // several addresses in one cell
    v = await feed('multi.csv', 'Name,E-mail 1 - Value\nEllis Grant,"ellis@example.com ::: old@example.com"\n');
    ok(/ellis@example\.com/.test(v) && !/old@example\.com/.test(v), 'takes the first address when a cell holds several');

    // plain txt list, no header
    v = await feed('list.txt', 'one@example.com\ntwo@example.com, Two Person\n');
    ok(/one@example\.com/.test(v) && /two@example\.com, Two Person/.test(v), 'a plain .txt list still works');

    // rows with no usable address are reported, not silently dropped
    v = await feed('messy.csv', 'Name,Email\nGood One,good@example.com\nNo Address,\nAlso Bad,nonsense\n');
    ok(/good@example\.com/.test(v), 'the good row is kept');
    ok(/2 rows had no usable address/.test(d.getElementById('impFileNote').textContent),
       'the two unusable rows are reported (got: ' + d.getElementById('impFileNote').textContent.slice(0,90) + ')');

    // upload MERGES with anything pasted rather than wiping it
    d.getElementById('impText').value = 'pasted@example.com';
    const f2 = new w.File(['Email\nuploaded@example.com\n'], 'u.csv', { type: 'text/csv' });
    const ev2 = new w.Event('drop', { bubbles: true, cancelable: true }); ev2.dataTransfer = { files: [f2] };
    d.getElementById('drop').dispatchEvent(ev2);
    for (let i = 0; i < 40 && !/uploaded/.test(d.getElementById('impText').value); i++) await wait(30);
    const merged = d.getElementById('impText').value;
    ok(/pasted@example\.com/.test(merged) && /uploaded@example\.com/.test(merged),
       'an upload merges with a pasted list instead of replacing it');
  }

  /* ---------- offer builder: exact, not paraphrased ---------- */
  console.log('offer builder');
  {
    const tabs = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs.find(b => /offer/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(!d.getElementById('pOffer').hidden, 'the Offer builder tab opens');

    d.getElementById('ofService').value = 'Meta Trak S5 tracker';
    d.getElementById('ofKind').value = 'amount';
    d.getElementById('ofValue').value = '150';
    d.getElementById('ofWho').value = 'Range Rover owners';
    d.getElementById('ofEnds').value = '2026-09-30';
    d.getElementById('ofTerms').value = 'One per vehicle. Cannot be combined with another offer.';
    d.getElementById('ofBuild').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);

    const subj = d.getElementById('subj').value, body = d.getElementById('body').value;
    ok(/£150 off Meta Trak S5 tracker/.test(subj), 'subject states the exact amount (got: ' + subj + ')');
    ok(/£150 off/.test(body), 'the body states the exact amount, not "up to"');
    ok(!/up to/i.test(body), 'it does NOT soften the discount to "up to"');
    ok(/30 September 2026/.test(body), 'the end date is spelled out in UK form');
    ok(body.indexOf('One per vehicle. Cannot be combined with another offer.') > -1,
       'the terms appear word for word');
    ok(/Range Rover owners/.test(body), 'the audience is named');
    ok(/confirmed against your registration/.test(body),
       'it keeps the site\'s "from price" language rather than implying a fixed total');
    ok(/come to you/.test(body), 'it does not offer a workshop visit');
    ok(/\{\{first\}\}/.test(body), 'the merge field survives into Compose');
    ok(!d.getElementById('pSend').hidden, 'it switches you to Compose');

    // percentage + bundle
    tabs.find(b => /offer/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.getElementById('ofKind').value = 'percent'; d.getElementById('ofValue').value = '10';
    d.getElementById('ofBuild').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(/10% off/.test(d.getElementById('body').value), 'percentage offers render as a percentage');

    // refuses to build without the essentials
    tabs.find(b => /offer/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.getElementById('ofService').value = ''; d.getElementById('subj').value = 'UNCHANGED';
    w.alert = () => {};
    d.getElementById('ofBuild').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(d.getElementById('subj').value === 'UNCHANGED', 'it will not build without a service');
  }

  /* ---------- ideas: calendar + their own data, nothing invented ---------- */
  console.log('ideas');
  {
    const tabs = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs.find(b => /ideas/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 60 && !/your data/i.test(d.getElementById('ideaList').textContent); i++) await wait(50);
    const txt = d.getElementById('ideaList').textContent;

    ok(d.getElementById('ideaMonth').options.length === 12, 'all twelve months offered');
    ok(/Timing/.test(txt), 'calendar-based suggestions shown');
    ok(/your data/i.test(txt), 'suggestions from their own enquiries shown');
    ok(/Range Rover/.test(txt), 'it names the most-enquired marque from the real rows');
    ok(/Kensington/.test(txt), 'it names the top area, derived from the source page');
    ok(/ChatGPT|Google|Referral/.test(txt), 'it reports where those people found them');
    ok(!/40%|up \d+%|rising|surge/i.test(txt),
       'no invented statistics or trend claims anywhere in the suggestions');

    const btn = d.getElementById('ideaList').querySelector('[data-idea]');
    ok(!!btn, 'each suggestion has a "Use this" button');
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);
    ok(!d.getElementById('pSend').hidden, 'using an idea switches to Compose');
    ok(/\{\{first\}\}/.test(d.getElementById('body').value), 'the seed includes the merge field');
    ok(/\[Write the useful part here/.test(d.getElementById('body').value),
       'it leaves an explicit gap for you to write, rather than pretending to be finished');
  }

  /* ---------- the UI additions ---------- */
  console.log('ui');
  {
    const tabs = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs.find(b => /contacts/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);

    // segment chips with visible counts
    const chips = [...d.querySelectorAll('#segChips .chip2')];
    ok(chips.length === 5, 'five segment chips (got ' + chips.length + ')');
    ok(chips.every(c => /\d/.test(c.textContent)), 'every chip shows its count without a click');
    const onChip = chips.find(c => c.classList.contains('on'));
    ok(onChip && /Customers/.test(onChip.textContent), 'Customers is the chip selected by default');
    ok(onChip.getAttribute('aria-checked') === 'true', 'the selected chip is marked aria-checked');
    ok(/soft opt-in/i.test(d.getElementById('segNote').textContent), 'the note explains why that segment is the default');

    chips.find(c => /Everyone/.test(c.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);
    ok(d.getElementById('segSel').value === 'all', 'a chip click updates the state holder too');
    ok(d.querySelector('#segChips .chip2.on').textContent.match(/Everyone/), 'and the chip highlight moves');

    // whole-row selection
    d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    const row = [...d.querySelectorAll('#tbody tr')].find(r => /alex@example/.test(r.textContent));
    row.querySelector('td:nth-child(3)').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(row.querySelector('input[type=checkbox]').checked, 'clicking the row selects it');
    ok(row.classList.contains('sel'), 'and the row is visibly marked');
    ok(/1 selected/.test(d.getElementById('selCount').textContent), 'the count follows');

    // a click on a button inside the row must not toggle selection
    const unsubBtn = row.querySelector('[data-unsub]');
    if (unsubBtn) {
      w.confirm = () => false;
      const before = row.querySelector('input[type=checkbox]').checked;
      unsubBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await wait(40);
      const after = d.querySelector('#tbody tr input[type=checkbox]');
      ok(!after || after.checked === before, 'clicking Unsubscribe inside a row does not also toggle selection');
    }

    // an unsubscribed row is not clickable at all
    d.getElementById('segSel').value = 'unsub';
    d.getElementById('segSel').dispatchEvent(new w.Event('change'));
    await wait(60);
    const offRow = d.querySelector('#tbody tr');
    offRow.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    ok(!offRow.querySelector('input[type=checkbox]'), 'an unsubscribed row has no checkbox to toggle');

    // readiness checklist
    tabs.find(b => /compose/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    const items = () => [...d.querySelectorAll('#ready li')].map(li => li.className.indexOf('done') > -1);
    // a genuinely blank slate: no subject, no message, nobody selected
    d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.getElementById('subj').value = ''; d.getElementById('subj').dispatchEvent(new w.Event('input'));
    d.getElementById('body').value = ''; d.getElementById('body').dispatchEvent(new w.Event('input'));
    await wait(50);
    ok(d.querySelectorAll('#ready li').length === 4, 'four readiness items');
    ok(items().every(x => !x), 'nothing ticked on a blank draft with nobody selected (got ' + JSON.stringify(items()) + ')');
    ok(d.getElementById('sendBtn').disabled, 'and Send is disabled in that state');

    d.getElementById('subj').value = 'A subject';
    d.getElementById('subj').dispatchEvent(new w.Event('input'));
    await wait(40);
    ok(items()[0] === true, 'writing a subject ticks the first item');
    ok(items()[1] === false, 'a short message does not tick "Message written"');

    d.getElementById('body').value = 'Hi {{first}},\n\nThis is a long enough message to count as written properly.';
    d.getElementById('body').dispatchEvent(new w.Event('input'));
    await wait(40);
    ok(items()[1] === true, 'a real message ticks it');
    ok(items()[3] === false, 'the test-sent item stays unticked until a test actually goes');
  }

  /* ---------- referral template + photos ---------- */
  console.log('referral template and photos');
  {
    const tabs = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs.find(b => /compose/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    w.confirm = () => true;

    const tpl = d.getElementById('tpl');
    ok([...tpl.options].some(o => o.value === 'referral'), 'a referral template is offered');
    tpl.value = 'referral'; tpl.dispatchEvent(new w.Event('change'));
    await wait(50);
    const body = d.getElementById('body').value;
    ok(/£50/.test(body) && /£75/.test(body), 'it states both reward tiers');
    ok(/under £1,000/.test(body) && /£1,000 and above/.test(body), 'and the threshold that separates them');
    ok(/bank transfer/.test(body) && /completed/.test(body), 'and that it is paid after completion');
    ok(/up to £20/.test(body), 'and the CarPlay / dash camera tier');
    ok(!/trackers and immobilisers only/i.test(body),
       'and it does NOT still claim the reward is security-only');
    ok(/no limit on how many/i.test(body), 'and that referrals are uncapped');
    ok(/\{\{first\}\}/.test(body), 'personalised');

    // photo validation
    const url = d.getElementById('imgUrl'), alt = d.getElementById('imgAlt'), note = d.getElementById('imgNote');
    url.value = '/Users/geoff/photo.jpg'; url.dispatchEvent(new w.Event('input')); await wait(40);
    ok(/https:\/\//.test(note.textContent) && !note.hidden, 'a local file path is rejected with an explanation');

    url.value = 'https://acrautomobile.com/gallery'; url.dispatchEvent(new w.Event('input')); await wait(40);
    ok(/image file/i.test(note.textContent), 'a page link is rejected — it would show as a broken image');

    url.value = 'https://acrautomobile.com/assets/og-image.jpg'; url.dispatchEvent(new w.Event('input')); await wait(40);
    ok(/description/i.test(note.textContent), 'a valid URL with no description asks for one');

    alt.value = 'Meta Trak S5 fitted to a Range Rover'; alt.dispatchEvent(new w.Event('input')); await wait(50);
    ok(/hide images/i.test(note.textContent), 'once valid it warns that clients hide images by default');
    ok(!!d.querySelector('#prev img'), 'the photo appears in the preview');
    ok(d.querySelector('#prev img').getAttribute('alt') === 'Meta Trak S5 fitted to a Range Rover',
       'with the description as alt text');

    // changing the photo must invalidate the "tested" tick
    const readyAt = () => [...d.querySelectorAll('#ready li')].map(li => li.className.indexOf('done') > -1)[3];
    d.getElementById('selAll').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    calls.post.length = 0;
    d.getElementById('testBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 80 && !readyAt(); i++) await wait(60);
    ok(readyAt() === true, 'sending a test ticks the last item');
    const saved = calls.post.filter(p => p.action === 'mktSave').pop();
    ok(saved && saved.campaign.image === 'https://acrautomobile.com/assets/og-image.jpg',
       'the photo travels with the campaign so the test shows what would really go out');
    ok(saved && saved.campaign.imageAlt === 'Meta Trak S5 fitted to a Range Rover', 'and its description');

    alt.value = 'A different description'; alt.dispatchEvent(new w.Event('input')); await wait(50);
    ok(readyAt() === false, 'changing the photo un-ticks "test sent" — the test no longer covers what would go out');
  }

  /* ---------- interest and status filters ---------- */
  console.log('interest and status filters');
  {
    const tabs = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs.find(b => /contacts/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);

    const intChips = [...d.querySelectorAll('#intChips .chip2')];
    ok(intChips.length === 4, 'four interest chips: Any, security, CarPlay, dash camera (got ' + intChips.length + ')');
    ok(intChips.map(c => c.textContent.replace(/\s*\d+$/, '').trim()).join('|')
        === 'Any|Vehicle security|CarPlay & Android Auto|Dash camera',
       'named as asked (got ' + intChips.map(c => c.textContent.trim()).join('|') + ')');

    // switch to Everyone so the filter is what narrows, not the segment
    d.querySelector('#segChips [data-seg="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    d.querySelector('#intChips [data-int="dc"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);
    let rows = [...d.querySelectorAll('#tbody tr')];
    ok(rows.length === 2 && rows.every(r => /dashcam@|jo@example/.test(r.textContent)),
       'the dash camera filter shows only dash camera enquiries (got ' + rows.map(r => (r.textContent.match(/\S+@\S+/) || [''])[0]).join(', ') + ')');

    d.querySelector('#intChips [data-int="cp"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);
    rows = [...d.querySelectorAll('#tbody tr')];
    ok(rows.length === 2 && rows.some(r => /carplay@/.test(r.textContent)),
       'the CarPlay filter picks CarPlay enquiries (got ' + rows.length + ')');

    d.querySelector('#intChips [data-int="sec"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);
    rows = [...d.querySelectorAll('#tbody tr')];
    ok(rows.some(r => /alex@example/.test(r.textContent)), 'the security filter picks tracker enquiries');
    ok(!rows.some(r => /carplay@/.test(r.textContent)), 'and excludes CarPlay ones');

    // status
    d.querySelector('#intChips [data-int=""]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    const stChips = [...d.querySelectorAll('#stChips .chip2')];
    ok(stChips.length >= 4, 'a chip per pipeline status, plus Any (got ' + stChips.length + ')');
    ok(stChips.some(c => /Completed/.test(c.textContent)), 'Completed is offered');
    ok(stChips.some(c => /Quoted/.test(c.textContent)), 'Quoted is offered');

    const completed = stChips.find(c => /Completed/.test(c.textContent));
    completed.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);
    rows = [...d.querySelectorAll('#tbody tr')];
    ok(rows.length === 3, 'filtering by Completed shows the three completed, mailable contacts (got ' + rows.length + ')');
    ok(!rows.some(r => /gone@example/.test(r.textContent)),
       'and STILL excludes the unsubscribed one, even though their status is Completed');

    // the two filters combine
    d.querySelector('#intChips [data-int="cp"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);
    rows = [...d.querySelectorAll('#tbody tr')];
    ok(rows.length === 1 && /carplay@/.test(rows[0].textContent),
       'Completed AND CarPlay narrows to one (got ' + rows.length + ')');

    // select-all must respect the filters, not the whole list
    d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.getElementById('selAll').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(/1 selected/.test(d.getElementById('selCount').textContent),
       '"Select all shown" selects only the filtered set (got ' + d.getElementById('selCount').textContent + ')');
  }

  /* ---------- the From address is stated, not assumed ---------- */
  console.log('From address');
  {
    ok(/info@acrautomobile\.com/.test(d.getElementById('fromLine').textContent),
       'the header says which address it sends as');
    ok(/Sending as/.test(d.getElementById('fromLine').textContent),
       'and that it is actually working when the alias is verified');
  }

  /* ---------- review template ---------- */
  console.log('review template');
  {
    const tabs = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs.find(b => /compose/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    w.confirm = () => true;
    const tpl = d.getElementById('tpl');
    ok([...tpl.options].some(o => o.value === 'review'), 'a review template is offered');
    tpl.value = 'review'; tpl.dispatchEvent(new w.Event('change'));
    await wait(80);
    const body = d.getElementById('body').value;
    /* wording supplied by ACR - checked verbatim rather than paraphrased */
    ok(/ACR Automobile would love your feedback\. Post a review to our profile\./.test(body),
       'the opening line is exactly as supplied');
    ok(/Google\nhttps:\/\/g\.page\/r\/CZPh91CpyERvEBE\/review/.test(body),
       'the Google link is labelled and correct');
    ok(/Trustpilot\nhttps:\/\/uk\.trustpilot\.com\/review\/acrautomobile\.com/.test(body),
       'the Trustpilot link is labelled and correct');
    ok(/Please let us know when you\u2019ve done it\. This would help our business a lot\./.test(body),
       'the follow-up line is intact, with a typographic apostrophe');
    ok(/We would like to thank you and appreciate you for using our services\./.test(body),
       'and the closing line');
    ok(!/discount|voucher|free|reward|£/i.test(body),
       'it offers NO incentive - paying for reviews breaches Google\'s policies and can get existing reviews removed');
    ok(d.getElementById('segSel').value === 'cust' && /Completed/.test(
         (d.querySelector('#stChips .chip2.on') || {}).textContent || ''),
       'choosing it points the filters at Completed, so a live enquiry is not asked to review work that has not happened');
    ok(/0 selected/.test(d.getElementById('selCount').textContent) || d.getElementById('sendBtn').disabled,
       'but selects nobody automatically - the send is still a deliberate act');
  }

  /* ---------- photo upload ---------- */
  console.log('photo upload');
  {
    ok(!!d.getElementById('imgUp') && !!d.getElementById('imgFile'), 'Compose has an upload button');
    ok(!!d.getElementById('ofImgUp') && !!d.getElementById('ofImgFile'), 'the Offer builder has one too');
    ok(d.getElementById('imgFile').getAttribute('accept').indexOf('image/') === 0,
       'the picker only offers images');
  }

  /* ---------- changing status from here ---------- */
  console.log('status changes');
  {
    const tabs = [...d.getElementById('tabs').querySelectorAll('button')];
    tabs.find(b => /contacts/i.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    // clear the filters the review template set
    d.querySelector('#stChips [data-st=""]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.querySelector('#segChips [data-seg="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(60);

    const rowFor = em => [...d.querySelectorAll('#tbody tr')].find(r => new RegExp(em).test(r.textContent));
    const jo = rowFor('jo@example');
    const sel = jo.querySelector('.stsel');
    ok(!!sel, 'each row has a status select');
    ok(sel.value === 'Quoted', 'it shows the current status (got ' + sel.value + ')');
    ok([...sel.options].map(o => o.textContent).join('|')
        === 'New|Call back|Follow Up 1|Follow Up 2|Quoted|Booked|Invoice sent|Completed|On Hold|Not Serious|Lost|Archive',
       'with the CRM stages in the CRM order');

    // an imported contact has no enquiry row to write to
    const imp = rowFor('imported@example');
    ok(imp && !imp.querySelector('.stsel'),
       'an imported contact has no status select - there is no enquiry to attach one to');

    // changing it writes through the CRM's own action
    calls.post.length = 0;
    sel.value = 'Completed';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(80);
    const upd = calls.post.find(p => p.action === 'updateEnquiry');
    ok(!!upd, 'it posts updateEnquiry, the same action the CRM board uses');
    ok(upd && upd.key === '2026-08-18T10:00:00.000Z',
       'keyed on the most recent enquiry row (got ' + (upd && upd.key) + ')');
    ok(upd && upd.fields && upd.fields.status === 'Completed',
       'with the new status (got ' + (upd && JSON.stringify(upd.fields)) + ')');

    // and the screen updates without waiting for a round trip
    await wait(60);
    ok(/Completed/.test(rowFor('jo@example').querySelector('.stsel').value),
       'the row reflects it immediately');
    const stChip = [...d.querySelectorAll('#stChips .chip2')].find(c => /Quoted/.test(c.textContent));
    ok(!stChip || !/Quoted <b>1/.test(stChip.innerHTML),
       'the status counts recount rather than going stale');

    // clicking the select must not toggle the row selection
    d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    rowFor('jo@example').querySelector('.stsel').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(40);
    ok(/0 selected/.test(d.getElementById('selCount').textContent),
       'clicking the status select does not also select the row');

    /* bulk */
    const bulkSel = d.getElementById('bulkStatus'), bulkBtn = d.getElementById('bulkApply');
    ok(!!bulkSel && !!bulkBtn, 'there is a bulk status control');

    /* A disabled button must say WHY. All four states are checked because the
       screen previously showed a greyed "Set came-for" with a value chosen and
       gave no clue that nothing was selected. */
    d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    bulkSel.value = ''; bulkSel.dispatchEvent(new w.Event('change'));
    await wait(50);
    ok(bulkBtn.disabled && /Set status/.test(bulkBtn.textContent) && /Choose a status/.test(bulkBtn.title),
       'nothing chosen, nothing selected -> asks for both (title: ' + bulkBtn.title + ')');

    d.getElementById('selAll').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(bulkBtn.disabled && /Choose a status/.test(bulkBtn.textContent),
       'selected but no value -> the LABEL asks for a value (got ' + bulkBtn.textContent + ')');
    ok(/now pick a status/.test(bulkBtn.title), 'and the tooltip says the selection is already made');

    d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    bulkSel.value = 'Lost'; bulkSel.dispatchEvent(new w.Event('change'));
    await wait(50);
    ok(bulkBtn.disabled && /Tick some contacts/.test(bulkBtn.textContent),
       'THE REPORTED CASE: value chosen but nothing ticked -> the label says to tick some (got '
       + bulkBtn.textContent + ')');
    ok(/Nothing is selected/.test(bulkBtn.title), 'and the tooltip explains it');

    d.getElementById('selAll').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(!bulkBtn.disabled, 'enabled once both are set');
    ok(/Set status — \d+/.test(bulkBtn.textContent), 'and it says how many (got ' + bulkBtn.textContent + ')');
    ok(/Applies "Lost" to \d+/.test(bulkBtn.title), 'and exactly what it will do (title: ' + bulkBtn.title + ')');

    /* the came-for button behaves the same way */
    const catSel = d.getElementById('bulkCat'), catBtn = d.getElementById('bulkCatApply');
    catSel.value = 'Vehicle security'; catSel.dispatchEvent(new w.Event('change'));
    await wait(40);
    ok(!catBtn.disabled && /Set came-for — \d+/.test(catBtn.textContent),
       'the came-for button enables with a selection (got ' + catBtn.textContent + ')');
    d.getElementById('selNone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);
    ok(catBtn.disabled && /Tick some contacts/.test(catBtn.textContent),
       'and explains itself the same way when the selection is cleared (got ' + catBtn.textContent + ')');
    d.getElementById('selAll').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(50);

    calls.post.length = 0;
    w.confirm = () => true;
    bulkBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(120);
    const updates = calls.post.filter(p => p.action === 'updateEnquiry');
    /* 7 contacts, minus the unsubscribed one (never selectable), minus the
       imported one (no enquiry row to write to) = 5 */
    ok(updates.length === 5,
       'one write per selected contact WITH an enquiry row; the unsubscribed and imported ones are skipped (got ' + updates.length + ')');
    ok(updates.every(u => u.fields.status === 'Lost'), 'all set to the chosen status');
    ok(new Set(updates.map(u => u.key)).size === updates.length, 'no row written twice');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('harness error: ' + e.message + '\n' + e.stack); process.exit(1); });
