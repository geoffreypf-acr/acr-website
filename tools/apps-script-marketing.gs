// ACR Automobile - marketing list + campaign sender
//
// Paste this as a NEW file in the same Apps Script project as Code.gs and
// gmailToCrm.gs (File > New > Script, name it "marketing"). Then add the two
// one-line dispatchers to Code.gs shown at the bottom of this file.
//
// Pure ASCII on purpose: this file is pasted into the editor by hand, and a
// mangled encoding is invisible until a regex or a pound sign stops matching.
//
// WHY IT IS BUILT THIS WAY
// - A campaign is SAVED first (doPost), then sent in batches (doGet). Sending
//   through GET keeps the progress readable in the browser - Apps Script POST
//   responses are not reliably readable cross-origin - while the body itself
//   never travels in a URL, so there is no length limit and no truncated email.
// - Batches are resumable. If a run dies half way, the offset says exactly
//   where it stopped, and nobody gets a second copy.
// - Every send records the address in the campaign's sent log BEFORE the next
//   batch starts, so a retry cannot double-send.

var MKT_SHEET   = 'Marketing';    // the contact list (imports + consent state)
var MKT_CAMP    = 'Campaigns';    // saved campaigns
var MKT_LOG     = 'CampaignLog';  // one row per address per campaign
var MKT_FROM    = 'info@acrautomobile.com';
var MKT_NAME    = 'ACR Automobile';
var MKT_SECRET  = 'acr-unsub-4f19b2';   // change this and every old unsubscribe link stops working
var MKT_BATCH   = 25;                   // addresses per request
var MKT_PHOTOS  = 'ACR marketing images';   // Drive folder for uploaded photos

/* Whether info@acrautomobile.com can be used as the From address. Gmail only
   allows it if it is a verified "send mail as" alias on this account; otherwise
   MailApp silently sends as the account owner instead, which is not something
   you want to discover from a customer. Surfaced in the console so it is
   visible rather than assumed. */
function mktFromOk_() {
  try { return GmailApp.getAliases().indexOf(MKT_FROM) !== -1; } catch (e) { return false; }
}

/* ------------------------------------------------------------------ cache */

/* Building the contact list costs two full-sheet reads plus a Gmail quota
   lookup - 3 to 5 seconds every time the console opened. Cached for 60s, which
   makes reopening it instant.
   Invalidated by hand on every write, so an import or an unsubscribe shows up
   immediately rather than up to a minute later. */
var MKT_CACHE_KEY = 'mkt_contacts_v1';
var MKT_CACHE_TTL = 60;

function mktCacheBust_() {
  try { CacheService.getScriptCache().remove(MKT_CACHE_KEY); } catch (e) {}
}

/* ---------------------------------------------------------------- helpers */

function mktSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    return sh;
  }
  var last = sh.getLastColumn();
  var head = last ? sh.getRange(1, 1, 1, last).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  if (!head.length) { sh.getRange(1, 1, 1, header.length).setValues([header]); return sh; }
  header.forEach(function (c) {
    if (head.indexOf(c) === -1) { head.push(c); sh.getRange(1, head.length).setValue(c); }
  });
  return sh;
}

function mktRows_(sh) {
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var head = vals.shift().map(function (h) { return String(h).trim(); });
  return vals.filter(function (r) { return r.join('').trim() !== ''; }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o;
  });
}

function mktNorm_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function mktValidEmail_(v) {
  v = String(v == null ? '' : v).trim();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(v) ? v : '';
}

function mktFirst_(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  // drop a leading title so a merge field never produces "Hi Mr,"
  if (parts.length > 1 && /^(mr|mrs|ms|miss|mx|dr|prof)\.?$/i.test(parts[0])) parts.shift();
  return parts[0] || '';
}

function mktToken_(email) {
  var sig = Utilities.computeHmacSha256Signature(mktNorm_(email), MKT_SECRET);
  return sig.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 16);
}

function mktJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* -------------------------------------------------------------- the sender */

/* MailApp.sendEmail does NOT support a `from` option - that belongs to
   GmailApp.sendEmail. Passing it to MailApp is silently ignored, which is why
   marketing was arriving from the account owner even though info@ is a verified
   alias. GmailApp honours it, and also leaves a copy in Sent, which for a
   campaign is useful rather than noise.
   Falls back to MailApp when the alias is not available, so a missing alias
   degrades to "sent from the owner" rather than "not sent". */
function mktSend_(to, subject, plain, html) {
  if (mktFromOk_()) {
    GmailApp.sendEmail(to, subject, plain, {
      htmlBody: html, name: MKT_NAME, from: MKT_FROM, replyTo: MKT_FROM
    });
    return MKT_FROM;
  }
  MailApp.sendEmail({
    to: to, subject: subject, body: plain, htmlBody: html,
    name: MKT_NAME, replyTo: MKT_FROM
  });
  return Session.getActiveUser().getEmail() || '(account owner)';
}

/* ------------------------------------------------------------ the contacts */

/* One row per PERSON, built from two places:
   - Sheet1, the CRM: every enquiry, so the same person appears many times
   - Marketing, the imported/edited list: consent state and anything pasted in
   The CRM supplies who exists; Marketing overrides consent and unsubscribes. */
function mktContacts_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var crm = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var mkt = mktSheet_(MKT_SHEET, ['email', 'name', 'consent', 'unsubscribed', 'tags', 'addedAt', 'source', 'lastSent']);

  var by = {};
  mktRows_(crm).forEach(function (r) {
    var em = mktValidEmail_(r.email); if (!em) return;
    var k = mktNorm_(em);
    var status = String(r.status || '').trim();
    var prev = by[k];
    var row = {
      email: em,
      name: String(r.name || '').trim(),
      status: status,
      service: String(r.service || '').trim(),
      foundVia: String(r.foundVia || '').trim(),
      lastEnquiry: String(r.timestamp || ''),
      enquiries: prev ? prev.enquiries + 1 : 1,
      /* a customer is someone we have actually done work for - that distinction
         decides who may lawfully be marketed to under the soft opt-in */
      customer: (prev && prev.customer) || /^(completed|invoice sent|booked)$/i.test(status),
      imported: false,
      consent: '', unsubscribed: false, tags: '', source: 'crm'
    };
    if (prev && String(prev.lastEnquiry) > String(row.lastEnquiry)) {
      row.lastEnquiry = prev.lastEnquiry;
      row.name = prev.name || row.name;
      row.status = prev.status || row.status;
    }
    by[k] = row;
  });

  mktRows_(mkt).forEach(function (r) {
    var em = mktValidEmail_(r.email); if (!em) return;
    var k = mktNorm_(em);
    if (!by[k]) {
      by[k] = { email: em, name: String(r.name || '').trim(), status: '', service: '', foundVia: '',
                lastEnquiry: '', enquiries: 0, customer: false, imported: true,
                consent: '', unsubscribed: false, tags: '', source: String(r.source || 'import') };
    } else {
      by[k].imported = true;
      if (!by[k].name) by[k].name = String(r.name || '').trim();
    }
    by[k].consent      = String(r.consent || '').trim();
    by[k].unsubscribed = /^(1|true|yes|y)$/i.test(String(r.unsubscribed || '').trim());
    by[k].tags         = String(r.tags || '').trim();
    by[k].lastSent     = String(r.lastSent || '');
  });

  return Object.keys(by).map(function (k) {
    var c = by[k];
    c.first = mktFirst_(c.name);
    /* mailable = a real address that has not opted out. Whether it SHOULD be
       mailed is the segment's job, not this flag's. */
    c.mailable = !c.unsubscribed;
    return c;
  }).sort(function (a, b) { return String(b.lastEnquiry).localeCompare(String(a.lastEnquiry)); });
}

/* ------------------------------------------------------------------ import */

function mktImport_(data) {
  var sh = mktSheet_(MKT_SHEET, ['email', 'name', 'consent', 'unsubscribed', 'tags', 'addedAt', 'source', 'lastSent']);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var have = {};
  mktRows_(sh).forEach(function (r) { var e = mktNorm_(r.email); if (e) have[e] = true; });
  /* also treat an address already in the CRM as known, so an import cannot
     create a duplicate person */
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var crm = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var inCrm = {};
  mktRows_(crm).forEach(function (r) { var e = mktNorm_(r.email); if (e) inCrm[e] = true; });

  var stamp = new Date().toISOString();
  var added = 0, dupe = 0, bad = 0, seen = {};
  var out = [];
  (data.rows || []).forEach(function (r) {
    var em = mktValidEmail_(r && r.email);
    if (!em) { bad++; return; }
    var k = mktNorm_(em);
    if (seen[k]) { dupe++; return; }
    seen[k] = true;
    if (have[k] || inCrm[k]) { dupe++; return; }
    var rec = {
      email: em, name: String((r && r.name) || '').trim(),
      consent: String((r && r.consent) || '').trim(),
      unsubscribed: '', tags: String((r && r.tags) || '').trim(),
      addedAt: stamp, source: String((r && r.source) || 'import'), lastSent: ''
    };
    out.push(head.map(function (h) { return rec[h] != null ? rec[h] : ''; }));
    added++;
  });
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, head.length).setValues(out);
  mktCacheBust_();
  return { ok: true, added: added, duplicates: dupe, invalid: bad };
}

/* ------------------------------------------------------------- unsubscribe */

function mktSetUnsub_(email, on) {
  var sh = mktSheet_(MKT_SHEET, ['email', 'name', 'consent', 'unsubscribed', 'tags', 'addedAt', 'source', 'lastSent']);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var vals = sh.getDataRange().getValues();
  var eCol = head.indexOf('email'), uCol = head.indexOf('unsubscribed');
  for (var i = 1; i < vals.length; i++) {
    if (mktNorm_(vals[i][eCol]) === mktNorm_(email)) {
      sh.getRange(i + 1, uCol + 1).setValue(on ? '1' : '');
      mktCacheBust_();
      return true;
    }
  }
  /* not on the list yet - an unsubscribe from a CRM-sourced address. Add the
     row so the opt-out is recorded permanently. */
  var rec = { email: email, name: '', consent: '', unsubscribed: on ? '1' : '',
              tags: '', addedAt: new Date().toISOString(), source: 'unsubscribe', lastSent: '' };
  sh.appendRow(head.map(function (h) { return rec[h] != null ? rec[h] : ''; }));
  mktCacheBust_();
  return true;
}

function mktUnsubPage_(e) {
  var em = (e.parameter.e || '').trim();
  var tk = (e.parameter.t || '').trim();
  var okTok = em && tk && tk === mktToken_(em);
  if (okTok) mktSetUnsub_(em, true);
  var msg = okTok
    ? '<h1>You have been unsubscribed</h1><p>' + em.replace(/[<>&]/g, '') +
      ' will not receive any further marketing email from ACR Automobile.</p>' +
      '<p>This does not affect replies about a booking or an enquiry you have with us.</p>'
    : '<h1>Link not recognised</h1><p>Please forward the email to ' + MKT_FROM +
      ' and we will remove you by hand.</p>';
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;' +
    'margin:12vh auto;padding:0 22px;color:#111">' + msg +
    '<p style="color:#666;font-size:14px">ACR Automobile, Addison Avenue, Holland Park, London W11 4QR</p></div>');
}

/* --------------------------------------------------------------- campaigns */

function mktSaveCampaign_(data) {
  var sh = mktSheet_(MKT_CAMP, ['id', 'createdAt', 'subject', 'body', 'image', 'imageAlt', 'recipients', 'status', 'sent', 'failed']);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var c = data.campaign || {};
  var list = (c.recipients || []).map(mktValidEmail_).filter(Boolean);
  if (!list.length) return { ok: false, error: 'no valid recipients' };
  if (!String(c.subject || '').trim()) return { ok: false, error: 'no subject' };
  if (!String(c.body || '').trim()) return { ok: false, error: 'no body' };
  /* The console supplies the id. Apps Script POST responses are not reliably
     readable cross-origin, so if the server invented the id the console would
     have no way to learn it and could never send the campaign it just saved. */
  var id = String(c.id || '').trim() || ('C' + Date.now());
  if (mktCampaign_(id)) return { ok: true, id: id, total: list.length, already: true };
  var rec = { id: id, createdAt: new Date().toISOString(), subject: String(c.subject),
              body: String(c.body),
              /* https only: a data: URI is stripped by Gmail and an http image
                 triggers a mixed-content warning in some clients */
              image: /^https:\/\//i.test(String(c.image || '')) ? String(c.image) : '',
              imageAlt: String(c.imageAlt || ''),
              recipients: list.join(','), status: 'ready', sent: 0, failed: 0 };
  sh.appendRow(head.map(function (h) { return rec[h] != null ? rec[h] : ''; }));
  return { ok: true, id: id, total: list.length };
}

function mktCampaign_(id) {
  var sh = mktSheet_(MKT_CAMP, ['id', 'createdAt', 'subject', 'body', 'image', 'imageAlt', 'recipients', 'status', 'sent', 'failed']);
  var rows = mktRows_(sh);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) { rows[i].__row = i + 2; return rows[i]; }
  return null;
}

function mktLogged_(id) {
  var sh = mktSheet_(MKT_LOG, ['campaignId', 'email', 'at', 'result']);
  var done = {};
  mktRows_(sh).forEach(function (r) {
    if (String(r.campaignId) === String(id)) done[mktNorm_(r.email)] = true;
  });
  return done;
}

/* Sends ONE batch and reports back. Called repeatedly by the console so a long
   list cannot hit the 6-minute execution limit, and so progress is visible. */
function mktSendBatch_(e) {
  var id = (e.parameter.id || '').trim();
  var camp = mktCampaign_(id);
  if (!camp) return mktJson_({ ok: false, error: 'campaign not found' });

  var all = String(camp.recipients || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var already = mktLogged_(id);
  /* Deliberately NOT cached. This is the check that stops a customer who opted
     out two minutes ago from receiving the next batch, so it has to read the
     sheet. Correctness beats the second it costs. */
  var contacts = {};
  mktContacts_().forEach(function (c) { contacts[mktNorm_(c.email)] = c; });

  var quota = MailApp.getRemainingDailyQuota();
  var logSh = mktSheet_(MKT_LOG, ['campaignId', 'email', 'at', 'result']);
  var logHead = logSh.getRange(1, 1, 1, logSh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });

  var sent = 0, failed = 0, skipped = 0, logRows = [];
  for (var i = 0; i < all.length && sent + failed < MKT_BATCH; i++) {
    var em = all[i], k = mktNorm_(em);
    if (already[k]) continue;                       // never send twice
    var c = contacts[k];
    if (c && c.unsubscribed) {                      // opted out since the campaign was saved
      skipped++;
      logRows.push({ campaignId: id, email: em, at: new Date().toISOString(), result: 'skipped: unsubscribed' });
      continue;
    }
    if (quota - sent <= 0) break;                   // out of quota for today
    var first = (c && c.first) || mktFirst_(c && c.name) || 'there';
    var body = String(camp.body).replace(/\{\{\s*first\s*\}\}/gi, first)
                                .replace(/\{\{\s*name\s*\}\}/gi, (c && c.name) || first);
    var unsub = ScriptApp.getService().getUrl() + '?action=unsub&e=' + encodeURIComponent(em) + '&t=' + mktToken_(em);
    var pic = String(camp.image || '');
    var picAlt = String(camp.imageAlt || '');
    var picHtml = pic
      ? '<img src="' + pic + '" alt="' + picAlt.replace(/"/g, '&quot;')
        + '" width="620" style="max-width:100%;height:auto;border-radius:6px;margin:0 0 18px;display:block">'
      : '';
    var html = '<div style="font:16px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:620px">'
             + picHtml
             + body.split(/\n{2,}/).map(function (p) {
                 return '<p style="margin:0 0 16px">' + p.replace(/\n/g, '<br>') + '</p>';
               }).join('')
             + '<hr style="border:none;border-top:1px solid #e3e3e3;margin:26px 0 14px">'
             + '<p style="font-size:12.5px;color:#666;margin:0">ACR Automobile, Addison Avenue, Holland Park, London W11 4QR'
             + ' &middot; <a href="' + unsub + '" style="color:#666">Unsubscribe</a></p></div>';
    var plain = body
              + (pic ? '\n\n[Photo' + (picAlt ? ': ' + picAlt : '') + ']\n' + pic : '')
              + '\n\n---\nACR Automobile, Addison Avenue, Holland Park, London W11 4QR\nUnsubscribe: ' + unsub;
    try {
      mktSend_(em, String(camp.subject), plain, html);
      sent++;
      logRows.push({ campaignId: id, email: em, at: new Date().toISOString(), result: 'sent' });
    } catch (err) {
      failed++;
      logRows.push({ campaignId: id, email: em, at: new Date().toISOString(), result: 'failed: ' + err });
    }
  }

  if (logRows.length) {
    logSh.getRange(logSh.getLastRow() + 1, 1, logRows.length, logHead.length)
         .setValues(logRows.map(function (r) { return logHead.map(function (h) { return r[h] != null ? r[h] : ''; }); }));
  }

  var doneNow = mktLogged_(id);
  var remaining = all.filter(function (em) { return !doneNow[mktNorm_(em)]; }).length;
  var campSh = mktSheet_(MKT_CAMP, ['id', 'createdAt', 'subject', 'body', 'image', 'imageAlt', 'recipients', 'status', 'sent', 'failed']);
  var cHead = campSh.getRange(1, 1, 1, campSh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  campSh.getRange(camp.__row, cHead.indexOf('sent') + 1).setValue(Number(camp.sent || 0) + sent);
  campSh.getRange(camp.__row, cHead.indexOf('failed') + 1).setValue(Number(camp.failed || 0) + failed);
  campSh.getRange(camp.__row, cHead.indexOf('status') + 1).setValue(remaining ? 'sending' : 'done');

  return mktJson_({ ok: true, sent: sent, failed: failed, skipped: skipped,
                    remaining: remaining, total: all.length,
                    quotaLeft: MailApp.getRemainingDailyQuota() });
}

/* Reads the body from the saved campaign rather than the query string: a real
   newsletter is far longer than a URL may safely be, and a truncated test send
   would give false confidence. */
function mktTest_(e) {
  var to = mktValidEmail_(e.parameter.to);
  if (!to) return mktJson_({ ok: false, error: 'bad address' });
  var camp = mktCampaign_((e.parameter.id || '').trim());
  if (!camp) return mktJson_({ ok: false, error: 'campaign not found' });
  var subject = String(camp.subject || '(no subject)');
  var body = String(camp.body || '').replace(/\{\{\s*first\s*\}\}/gi, 'Alex')
                                    .replace(/\{\{\s*name\s*\}\}/gi, 'Alex Marin');
  var unsub = ScriptApp.getService().getUrl() + '?action=unsub&e=' + encodeURIComponent(to) + '&t=' + mktToken_(to);
  var html = '<div style="font:16px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:620px">'
           + '<p style="background:#fff4d6;padding:10px 12px;border-radius:6px;margin:0 0 18px;font-size:13px">'
           + 'TEST SEND - merge fields show sample values.</p>'
           + (String(camp.image || '')
               ? '<img src="' + String(camp.image) + '" alt="' + String(camp.imageAlt || '').replace(/"/g, '&quot;')
                 + '" width="620" style="max-width:100%;height:auto;border-radius:6px;margin:0 0 18px;display:block">'
               : '')
           + body.split(/\n{2,}/).map(function (p) { return '<p style="margin:0 0 16px">' + p.replace(/\n/g, '<br>') + '</p>'; }).join('')
           + '<hr style="border:none;border-top:1px solid #e3e3e3;margin:26px 0 14px">'
           + '<p style="font-size:12.5px;color:#666;margin:0">ACR Automobile, Addison Avenue, Holland Park, London W11 4QR'
           + ' &middot; <a href="' + unsub + '" style="color:#666">Unsubscribe</a></p></div>';
  try {
    /* the test has to go out the same way the real thing does, or it is not a
       test of the real thing - this path previously set no `from` at all */
    var sentAs = mktSend_(to, '[TEST] ' + subject, body, html);
    return mktJson_({ ok: true, to: to, sentAs: sentAs, quotaLeft: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return mktJson_({ ok: false, error: String(err) });
  }
}

/* ------------------------------------------------------------------ photos */

/* Saves an uploaded photo to Drive and records its URL against the id the
   console generated, which is how the console learns the URL: it cannot read a
   POST response, so it polls mktPhoto instead.

   Drive is a convenience, not the best host for email. Some clients are wary of
   googleusercontent image URLs, so a photo already on acrautomobile.com is more
   reliable - the console says so. */
function mktUpload_(data) {
  var sh = mktSheet_('Photos', ['id', 'url', 'name', 'at']);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  try {
    var id = String(data.id || '').trim();
    if (!id) return { ok: false, error: 'no id' };
    var name = String(data.name || 'photo.jpg').replace(/[^\w.\- ]/g, '');
    var mime = String(data.mime || 'image/jpeg');
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(mime)) return { ok: false, error: 'not an image' };

    var it = DriveApp.getFoldersByName(MKT_PHOTOS);
    var folder = it.hasNext() ? it.next() : DriveApp.createFolder(MKT_PHOTOS);
    var blob = Utilities.newBlob(Utilities.base64Decode(data.dataB64 || ''), mime, name);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    /* lh3 serves the bytes directly; the older uc?export=view form now often
       returns an interstitial instead of an image */
    var url = 'https://lh3.googleusercontent.com/d/' + file.getId();
    var rec = { id: id, url: url, name: name, at: new Date().toISOString() };
    sh.appendRow(head.map(function (h) { return rec[h] != null ? rec[h] : ''; }));
    return { ok: true, id: id, url: url };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function mktPhoto_(e) {
  var id = String(e.parameter.id || '').trim();
  if (!id) return mktJson_({ ok: false, error: 'no id' });
  var rows = mktRows_(mktSheet_('Photos', ['id', 'url', 'name', 'at']));
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === id) return mktJson_({ ok: true, url: String(rows[i].url) });
  }
  return mktJson_({ ok: false, pending: true });
}

/* ---------------------------------------------------------------- dispatch */

/* Readable operations, called with ?action=... from the console. */
function mktGet_(e) {
  var a = e.parameter.action;
  if (a === 'unsub')    return mktUnsubPage_(e);
  if (a === 'mktList') {
    var cache = null;
    try { cache = CacheService.getScriptCache(); } catch (e) {}
    if (cache && e.parameter.fresh !== '1') {
      var hit = cache.get(MKT_CACHE_KEY);
      if (hit) {
        return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
      }
    }
    var payload = JSON.stringify({ ok: true, contacts: mktContacts_(),
                                   quotaLeft: MailApp.getRemainingDailyQuota(),
                                   from: MKT_FROM, fromOk: mktFromOk_() });
    /* A payload over 100KB will not fit in the cache; store what fits and
       simply recompute next time rather than failing the request. */
    if (cache) { try { cache.put(MKT_CACHE_KEY, payload, MKT_CACHE_TTL); } catch (e) {} }
    return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  }
  if (a === 'mktSend')  return mktSendBatch_(e);
  if (a === 'mktTest')  return mktTest_(e);
  if (a === 'mktPhoto') return mktPhoto_(e);
  return null;
}

/* Writes that need no response body. */
function mktPost_(data) {
  if (data.action === 'mktImport')   return mktJson_(mktImport_(data));
  if (data.action === 'mktSave')     return mktJson_(mktSaveCampaign_(data));
  if (data.action === 'mktUpload')   return mktJson_(mktUpload_(data));
  if (data.action === 'mktUnsub')    { mktSetUnsub_(data.email, data.on !== false); return mktJson_({ ok: true }); }
  return null;
}

/* ============================================================
   ADD THESE TWO LINES TO Code.gs
   ============================================================

   PASTE THIS FILE FIRST, then add the dispatchers, then deploy. The typeof
   guards mean the order cannot break anything, but doing it in this order means
   the feature works on the first deploy rather than the second.

   In doPost(e), immediately after   var data = JSON.parse(e.postData.contents);

     if (data.action && data.action.indexOf('mkt') === 0 && typeof mktPost_ === 'function') {
       var r = mktPost_(data); if (r) return r;
     }

   In doGet(e), as the FIRST line inside the function:

     if (e && e.parameter && e.parameter.action && typeof mktGet_ === 'function') {
       var g = mktGet_(e); if (g) return g;
     }

   The typeof checks matter: without them, deploying Code.gs while this file is
   missing throws "mktGet_ is not defined" on every request carrying an action,
   which also breaks the CRM's own ?action=sync.

   Then Deploy > Manage deployments > pencil > New version.
   ============================================================ */
