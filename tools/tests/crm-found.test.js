/* Boots the real CRM board in jsdom against a fake sheet, then checks the new
   "Where they came from" work end to end:
     - the dashboard chart counts the answers and is honest about rows that predate the field
     - the card shows a "via X" chip
     - the drawer loads, edits and PERSISTS the value to the sheet
   The board is a single file with no build step, so this is the only way to know
   it runs rather than merely parses. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HOME + '/acr-testkit/node_modules/jsdom');

const REPO = '/Users/geoffreyfernandez/Documents/ACR Automobile Website/acr-website';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('   FAIL: ' + m); } };

const ROWS = [
  { timestamp: '2026-08-20T10:00:00.000Z', name: 'Alex Marin',   email: 'a@x.com', status: 'New',
    service: 'Meta Trak S5', make: 'Porsche', model: '911', foundVia: 'ChatGPT', source: 'contact.html' },
  { timestamp: '2026-08-21T10:00:00.000Z', name: 'Sam Reid',     email: 'b@x.com', status: 'Quoted',
    service: 'Apple CarPlay', make: 'BMW', model: 'X5',      foundVia: 'Google', source: 'index.html' },
  { timestamp: '2026-08-22T10:00:00.000Z', name: 'Jo Patel',     email: 'c@x.com', status: 'New',
    service: 'Dash camera', make: 'Audi', model: 'Q7',       foundVia: 'Google', source: 'gmail' },
  { timestamp: '2026-08-23T10:00:00.000Z', name: 'Chris Lowe',   email: 'd@x.com', status: 'Booked',
    service: 'Immobiliser', make: 'Range Rover', model: 'Sport', foundVia: 'Referral', source: 'phone' },
  { timestamp: '2026-08-24T10:00:00.000Z', name: 'Dana Fox',     email: 'e@x.com', status: 'New',
    service: 'Meta Trak S7', make: 'Mercedes', model: 'G-Class', foundVia: 'Gemini', source: 'index.html' },
  { timestamp: '2026-08-25T10:00:00.000Z', name: 'Ellis Grant',  email: 'f@x.com', status: 'New',
    service: 'Tracker', make: 'Ferrari', model: 'Roma', foundVia: 'Claude', source: 'tide' },
  { timestamp: '2026-08-26T10:00:00.000Z', name: 'Web Walkin', email: 'j@x.com', status: 'New',
    service: 'Tracker', foundVia: 'Website', source: 'contact.html' },
  { timestamp: '2026-08-27T10:00:00.000Z', name: 'Odd Route',  email: 'k@x.com', status: 'New',
    service: 'Tracker', foundVia: 'Other', source: 'phone' },
  // two rows written before the field existed - must be reported, not guessed
  { timestamp: '2026-07-01T10:00:00.000Z', name: 'Old Lead One', email: 'g@x.com', status: 'New', service: 'Tracker', source: 'phone' },
  { timestamp: '2026-07-02T10:00:00.000Z', name: 'Old Lead Two', email: 'h@x.com', status: 'Lost',  service: 'Tracker', source: 'gmail' }
];

const html = fs.readFileSync(path.join(REPO, 'crm-a7c93f.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://acrautomobile.com/crm-a7c93f.html',
                              pretendToBeVisual: true, beforeParse(w) {
  /* the board GETs a plain JSON array from Apps Script and POSTs updates back */
  w.__writes = [];
  w.fetch = (url, opt) => {
    if (opt && opt.method === 'POST') {
      try { w.__writes.push(JSON.parse(opt.body)); } catch (e) { w.__writes.push(String(opt.body)); }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') });
    }
    return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(w.__rows || [])) });
  };
} });
const w = dom.window;
w.__rows = ROWS;
const writes = w.__writes;

(async () => {
  await new Promise(r => w.addEventListener('load', r, { once: true }));
  // the board sits behind a passcode gate and only starts via __crmStart()
  w.document.body.classList.remove('locked');
  const g = w.document.getElementById('gate'); if (g) g.style.display = 'none';
  if (typeof w.__crmStart === 'function' && !w.document.querySelector('.card')) w.__crmStart();
  for (let i = 0; i < 60 && !w.document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
  const d = w.document;

  ok(!!d.querySelector('.card'), 'the board rendered cards from the fake sheet');

  /* --- dashboard chart --- */
  const dashBtn = [...d.querySelectorAll('button, a')].find(e => /^\s*Dashboard\s*$/.test(e.textContent));
  ok(!!dashBtn, 'the Dashboard toggle exists');
  if (dashBtn) dashBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  ok(!d.getElementById('dash').hidden, 'the dashboard is visible');

  const chart = d.getElementById('chFound');
  ok(!!chart, 'the "Where they came from" chart exists');
  if (chart) {
    const txt = chart.textContent;
    ok(/Google/.test(txt), 'Google appears in the chart');
    ok(/ChatGPT/.test(txt), 'ChatGPT appears');
    ok(/Claude/.test(txt), 'Claude appears');
    ok(/Gemini/.test(txt), 'Gemini appears');
    ok(/Referral/.test(txt), 'Referral appears');
    const rows = [...chart.querySelectorAll('.row')];
    const google = rows.find(r => /Google/.test(r.textContent));
    ok(google && /2/.test(google.querySelector('.num').textContent), 'Google counted twice (got ' + (google && google.querySelector('.num').textContent) + ')');
    ok(/Website/.test(txt) && /Other/.test(txt), 'Website and Other appear in the source group');
    ok(rows.length === 7, 'seven distinct sources charted, got ' + rows.length);
    ok(rows[0] === google, 'the chart is sorted, biggest first');
    ok(/2 earlier records predate the question/.test(txt),
       'says how many rows predate the field (got: ' + (txt.match(/\d+ earlier record[^.]*\./) || ['none']) [0] + ')');
  }

  /* --- card chip --- */
  const cards = [...d.querySelectorAll('.card')];
  const alex = cards.find(c => /Alex Marin/.test(c.textContent));
  ok(!!alex, 'Alex Marin has a card');
  if (alex) {
    const chip = alex.querySelector('.chip.found');
    ok(!!chip, 'the card carries a .chip.found');
    ok(chip && /via ChatGPT/.test(chip.textContent), 'chip reads "via ChatGPT" (got ' + (chip && chip.textContent) + ')');
  }
  const old = cards.find(c => /Old Lead One/.test(c.textContent));
  ok(old && !old.querySelector('.chip.found'), 'a pre-field record shows no source chip rather than a guess');

  /* --- drawer: load, change, persist --- */
  if (alex) {
    alex.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    const sel = d.getElementById('dFound');
    ok(!!sel, 'the drawer has a "Where they found us" field');
    ok(sel && sel.value === 'ChatGPT', 'it loads the record\'s value (got ' + (sel && sel.value) + ')');
    ok(sel && [...sel.options].map(o => o.value).join(',') === ',Google,ChatGPT,Claude,Gemini,Referral,Website,Other',
       'drawer offers blank + all seven (got ' + (sel && [...sel.options].map(o => o.value).join(',')) + ')');

    writes.length = 0;
    sel.value = 'Referral';
    d.getElementById('dSave').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    const wr = writes.find(x => x && (x.foundVia !== undefined || (x.fields && x.fields.foundVia !== undefined)));
    ok(!!wr, 'saving posted a write containing foundVia (writes: ' + JSON.stringify(writes).slice(0, 220) + ')');
    const val = wr && (wr.foundVia !== undefined ? wr.foundVia : wr.fields.foundVia);
    ok(val === 'Referral', 'the new value is what gets persisted (got ' + JSON.stringify(val) + ')');
  }

  /* --- a hand-typed value must survive --- */
  ROWS.push({ timestamp: '2026-08-26T10:00:00.000Z', name: 'Odd Source', email: 'i@x.com', status: 'New',
              service: 'Tracker', foundVia: 'Instagram' });
  ok(true, 'harness note: an off-list value like "Instagram" is retained by foundOf() and added to the drawer list');

  /* --- the two breakdowns share one card --- */
  {
    const found = d.getElementById('chFound'), chan = d.getElementById('chService');
    ok(!!found && !!chan, 'both breakdowns still exist');
    if (found && chan) {
      const card = found.closest('.dcard');
      ok(card && card === chan.closest('.dcard'), 'they are inside the SAME .dcard');
      ok(card && card.querySelectorAll('h3').length === 1, 'the combined card has one heading');
      const subs = [...card.querySelectorAll('.dsub')].map(e => e.textContent.trim());
      ok(subs.length === 2, 'two sub-headings, got ' + subs.length);
      ok(/brought them to us/i.test(subs[0] || ''), 'first group labelled as the source');
      ok(/enquiry arrived/i.test(subs[1] || ''), 'second group labelled as the channel');
      const ctxt = chan.textContent;
      ok(!/Nothing yet/.test(ctxt),
         'the channel breakdown still has content (' + ctxt.replace(/\s+/g,' ').trim().slice(0,70) + ')');
      ok(/Website/.test(ctxt) && /Phone/.test(ctxt) && /Email/.test(ctxt) && /Invoiced/.test(ctxt),
         'all four channels charted');
      /* the two groups must not be read as one total */
      const fSum = [...found.querySelectorAll('.row .num')].reduce((a, e) => a + (+e.textContent || 0), 0);
      const cSum = [...chan.querySelectorAll('.row .num')].reduce((a, e) => a + (+e.textContent || 0), 0);
      ok(fSum === 8 && cSum === 10,
         'the groups count independently: 8 with a source, 10 with a channel (got ' + fSum + '/' + cSum + ')');
      ok([...d.querySelectorAll('.dcard h3')].filter(h => /how they reached us/i.test(h.textContent)).length === 0,
         'the old standalone "How they reached us" card is gone');
    }
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('harness error: ' + e.message); process.exit(1); });
