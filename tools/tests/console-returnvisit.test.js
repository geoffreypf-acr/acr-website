/* Regression test for "Marketing console stuck on Loading contacts...".
 *
 * The gate unlocks EARLY when sessionStorage already holds the passcode hash -
 * and that happens while the first script block is parsing, before the block
 * that defines __mktStart exists. So on a return visit the start function was
 * never called and the console sat on its static placeholder.
 *
 * Typing the passcode always worked, which is why it looked fine in testing:
 * that path unlocks after both blocks have parsed. The only way to catch this is
 * to boot the page as a RETURNING visitor, so that is what this does - no
 * manual __mktStart, no touching the gate.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HOME + '/acr-testkit/node_modules/jsdom');

const REPO = '/Users/geoffreyfernandez/Documents/ACR Automobile Website/acr-website';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('   FAIL: ' + m); } };

const CONTACTS = [
  { email: 'alex@example.com', name: 'Mr Alex Marin', first: 'Alex', status: 'Completed',
    service: 'Meta Trak S5', foundVia: 'ChatGPT', lastEnquiry: '2026-08-20T10:00:00.000Z',
    enquiries: 2, customer: true, imported: false, unsubscribed: false, mailable: true }
];

async function bootAsReturningVisitor(page, sessionKey) {
  const html = fs.readFileSync(path.join(REPO, page), 'utf8');
  const hash = (html.match(/PASS_HASH\s*=\s*'([0-9a-f]{64})'/) || [])[1];
  if (!hash) throw new Error('could not read PASS_HASH from ' + page);

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://acrautomobile.com/' + page,
    pretendToBeVisual: true,
    beforeParse(w) {
      /* Seed the session BEFORE parsing - this is what a return visit looks
         like, and it makes the gate unlock during the first script block. */
      w.sessionStorage.setItem(sessionKey, hash);
      w.fetch = (url, opt) => {
        if (opt && opt.method === 'POST') return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') });
        if (/action=mktList/.test(String(url))) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(
            JSON.stringify({ ok: true, contacts: CONTACTS, quotaLeft: 1500 })) });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('[]') });
      };
      w.crypto = w.crypto || {};
      w.crypto.subtle = { digest: async () => new Uint8Array(32) };
    }
  });
  const w = dom.window;
  await new Promise(r => w.addEventListener('load', r, { once: true }));
  return { w, d: w.document, dom };
}

(async () => {
  /* ---------- marketing console ---------- */
  console.log('marketing console, returning visitor');
  {
    const { w, d, dom } = await bootAsReturningVisitor('marketing-console-a7c93f.html', 'acr_mkt_auth');

    ok(!d.body.classList.contains('locked'), 'the gate let a returning visitor straight through');
    ok(!d.getElementById('shell').hidden, 'the shell is visible');

    // nothing is called by hand here - this is the whole point
    for (let i = 0; i < 80 && !d.querySelector('#tbody tr'); i++) await new Promise(r => setTimeout(r, 40));

    const sub = d.getElementById('sub').textContent;
    ok(!/^Loading contacts/.test(sub),
       'THE REPORTED BUG: it is not stuck on "Loading contacts..." (sub reads: ' + sub.trim().slice(0, 70) + ')');
    ok(!!d.querySelector('#tbody tr'), 'contacts actually rendered without any manual start');
    ok(/\d+ contacts/.test(sub), 'the header reports a contact count');
    ok(d.querySelectorAll('#segChips .chip2').length === 5, 'the rest of the UI built too');
    dom.window.close();
  }

  /* ---------- the CRM, which already had the guard ---------- */
  console.log('CRM, returning visitor');
  {
    const html = fs.readFileSync(path.join(REPO, 'crm-a7c93f.html'), 'utf8');
    const hash = (html.match(/PASS_HASH\s*=\s*'([0-9a-f]{64})'/) || [])[1];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', url: 'https://acrautomobile.com/crm-a7c93f.html',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.sessionStorage.setItem('acr_bk_auth', hash);
        w.fetch = (url, opt) => {
          if (opt && opt.method === 'POST') return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') });
          return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify([
            { timestamp: '2026-08-20T10:00:00.000Z', name: 'Alex Marin', email: 'a@x.com',
              status: 'New', service: 'Tracker', source: 'contact.html' }
          ])) });
        };
        w.crypto = w.crypto || {};
        w.crypto.subtle = { digest: async () => new Uint8Array(32) };
      }
    });
    const w = dom.window, d = w.document;
    await new Promise(r => w.addEventListener('load', r, { once: true }));
    for (let i = 0; i < 80 && !d.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 40));
    ok(!!d.querySelector('.card'), 'the CRM also starts for a returning visitor');
    dom.window.close();
  }

  /* ---------- every gated console must have the guard ---------- */
  console.log('all gated consoles');
  {
    const consoles = fs.readdirSync(REPO).filter(f => /^(crm-|booking-console|marketing-console)/.test(f) && f.endsWith('.html'));
    consoles.forEach(f => {
      const src = fs.readFileSync(path.join(REPO, f), 'utf8');
      const unlocksEarly = /sessionStorage\.getItem\(KEY\)\s*===\s*PASS_HASH/.test(src);
      if (!unlocksEarly) { ok(true, f + ': no early unlock, nothing to guard'); return; }
      /* Either the page has a trailing "start it now" guard, or its main script
         is a self-executing IIFE that does not need one. */
      const hasGuard = /classList\.contains\('locked'\)/.test(src);
      const startsItself = /window\.__(crm|mkt)Start\s*=/.test(src) === false;
      ok(hasGuard || startsItself,
         f + ': defines a start hook but has no trailing guard, so a return visit would hang');
    });
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('harness error: ' + e.message + '\n' + e.stack); process.exit(1); });
