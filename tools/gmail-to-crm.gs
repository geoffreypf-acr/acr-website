/**
 * ACR — Gmail → CRM lead capture
 * ================================================================
 * Catches enquiries that never touch a website form: people who email
 * info@acrautomobile.com directly, or who reply to something and start a new
 * conversation. Those currently live only in the inbox and never reach the
 * CRM board — which is how enquiries get missed.
 *
 * Form submissions are NOT re-imported: FormSubmit is excluded below, because
 * those already write to the sheet through the website.
 *
 * HOW TO INSTALL
 *   1. Open the CRM sheet → Extensions → Apps Script
 *   2. File → + → Script, name it "gmailToCrm", paste this whole file in
 *   3. Save, then run  dryRunGmailToCrm  once and click "Review permissions"
 *      (it needs Gmail read + Sheets write). Check the Execution log — it will
 *      list what it WOULD add, without writing anything.
 *   4. Happy? Run  syncGmailToCrm  once to import for real.
 *   5. Run  installGmailTrigger  once to have it run automatically every hour.
 *
 * TO UNDO an import: sort the sheet by the `source` column and delete the rows
 * marked "gmail". Nothing else is touched.
 */

// ─────────────────────────── Configuration ───────────────────────────

var CFG = {
  SHEET_ID:   '1MszFXo--wsC5ozeh6SLnzqG2LG2fcoA4ZoNhwsOp29o',
  SHEET_NAME: '',           // leave blank to use the first sheet
  DAYS_BACK:  30,           // how far back to look on each run
  MAX_THREADS: 100,         // safety cap per run

  // Only mail Gmail itself classifies as Primary. This alone removes
  // Promotions, Social, Updates and Forums - i.e. most marketing.
  PRIMARY_ONLY: true,

  // Skip anything carrying a List-Unsubscribe header. Bulk senders are
  // legally obliged to include it, genuine person-to-person mail never does.
  // This is the filter that catches newsletters no denylist would predict.
  SKIP_BULK: true,

  // Require some sign the message is actually about our work. Set to false if
  // you would rather see everything and triage it yourself.
  REQUIRE_KEYWORDS: true,
  KEYWORDS: [
    'tracker', 'track', 'immobiliser', 'immobilizer', 'ghost', 'meta trak',
    'carplay', 'car play', 'android auto', 'dash cam', 'dashcam', 'dash camera',
    'idrive', 'i-drive', 'retrofit', 'reverse camera', 'parking sensor',
    'thatcham', 's5', 's7', 'deadlock', 'security', 'stolen', 'theft', 'keyless',
    'quote', 'price', 'cost', 'how much', 'fitting', 'fit a', 'install',
    'booking', 'book in', 'appointment', 'enquiry', 'enquire', 'availability'
  ],

  // ── Missed calls ──
  // Your phone already emails info@ every missed call, subject "Missed Call",
  // body "+447xxxxxxxxx[Name] HHMM". Those are inbound leads with nowhere to go.
  MISSED_CALL_SUBJECT: 'Missed Call',
  MISSED_CALL_DAYS: 30,
  // Your own handsets - never create a lead for these.
  OWN_NUMBERS: ['+447818080205', '07818080205', '+447468844431', '07468844431'],
  // Suppliers and known contacts: still imported, but tagged so you can filter.
  KNOWN_CONTACTS: {
    '+447411086500': 'Bajram Auto Electrician'
  },
  // Don't raise a second lead if that number is already open on the board.
  SKIP_IF_OPEN: true,

  // Senders that are never a customer enquiry.
  IGNORE_SENDERS: [
    'formsubmit.co',        // already captured by the website forms
    'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'notifications@',
    'notification@slack.com', 'slack.com',
    'google.com', 'googlemail.com', 'gmail-noreply', 'accounts.google',
    'vercel.com', 'netlify.com', 'github.com', 'supabase',
    'stripe.com', 'paypal', 'xero.com', 'quickbooks', 'capitalontap',
    'mailchimp', 'sendgrid', 'hubspot', 'squareup.com', 'square.com',
    'virginmedia', 'vodafone', 'ee.co.uk', 'o2.co.uk', 'bt.com',
    'metatrak.co.uk', 'meta-trak',   // supplier newsletters, not customers
    'linkedin', 'facebook', 'instagram', 'tiktok', 'x.com',
    'acrautomobile.com'     // ourselves
  ],

  // Subjects that are clearly not enquiries.
  IGNORE_SUBJECTS: [
    'invoice', 'receipt', 'statement', 'subscription', 'direct debit',
    'payment', 'quickpay', 'bill', 'renewal notice', 'top up',
    'security alert', 'sign-in', 'password', 'verify your', 'confirm your',
    'newsletter', 'unsubscribe', 'webinar', 'offer', 'sale', 'discount',
    'delivery', 'dispatched', 'shipped', 'order confirmation',
    'out of office', 'automatic reply', 'undeliverable', 'mail delivery'
  ]
};

// ─────────────────────────── Entry points ───────────────────────────

/** Import for real. */
function syncGmailToCrm() { return run_(false); }

/** Log what WOULD be imported, write nothing. Run this first. */
function dryRunGmailToCrm() { return run_(true); }

/** Import missed calls only. */
function syncMissedCalls() { return missedCalls_(false); }

/** Log which missed calls WOULD become leads, write nothing. */
function dryRunMissedCalls() { return missedCalls_(true); }

/** Everything: email enquiries + missed calls. This is what the trigger runs. */
function syncAll() {
  var a = run_(false), b = missedCalls_(false);
  Logger.log('Total imported: %s email, %s missed calls.', a, b);
  return a + b;
}

/** Run automatically every hour. Run once. */
function installGmailTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'syncGmailToCrm' || f === 'syncAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  Logger.log('Hourly sync installed.');
}

/** Stop the automatic run. */
function removeGmailTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'syncGmailToCrm' || f === 'syncAll') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Hourly sync removed.');
}

// ─────────────────────────── Implementation ───────────────────────────

function run_(dryRun) {
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sheet = CFG.SHEET_NAME ? ss.getSheetByName(CFG.SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('Sheet not found — check CFG.SHEET_NAME.');

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });

  // A column to remember which Gmail threads we have already imported.
  var tidCol = headers.indexOf('threadId');
  if (tidCol === -1) {
    if (dryRun) {
      Logger.log('NOTE: a "threadId" column would be added at the end (for de-duplication).');
    } else {
      sheet.getRange(1, lastCol + 1).setValue('threadId');
      headers.push('threadId');
      tidCol = headers.length - 1;
      lastCol = headers.length;
    }
  }

  // Everything already imported.
  var seen = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1 && tidCol > -1) {
    sheet.getRange(2, tidCol + 1, lastRow - 1, 1).getValues().forEach(function (r) {
      if (r[0]) seen[String(r[0]).trim()] = true;
    });
  }

  var query = 'to:info@acrautomobile.com -in:chats -in:draft -in:spam -in:trash'
            + (CFG.PRIMARY_ONLY ? ' category:primary' : '')
            + ' newer_than:' + CFG.DAYS_BACK + 'd';
  var threads = GmailApp.search(query, 0, CFG.MAX_THREADS);
  var added = [], skipped = 0;

  threads.forEach(function (thread) {
    var id = thread.getId();
    if (seen[id]) { skipped++; return; }

    var msgs = thread.getMessages();
    var first = msgs[0];
    var from    = first.getFrom() || '';
    var subject = (thread.getFirstMessageSubject() || '').trim();

    if (isIgnoredSender_(from) || isIgnoredSubject_(subject)) { skipped++; return; }
    if (CFG.SKIP_BULK && isBulk_(first)) { skipped++; return; }

    var email = (from.match(/<([^>]+)>/) || [null, from])[1].trim().toLowerCase();
    var name  = (from.replace(/<[^>]*>/, '').replace(/["']/g, '').trim()) || email.split('@')[0];
    var body  = (first.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, 500);

    if (CFG.REQUIRE_KEYWORDS && !hasKeyword_(subject + ' ' + body)) { skipped++; return; }

    added.push({
      id: id,
      row: {
        timestamp:      first.getDate().toISOString(),
        name:           name,
        email:          email,
        mobile:         findPhone_(body),
        service:        'Email enquiry',
        source:         'gmail',
        status:         'New',
        details:        subject + (body ? ' — ' + body : ''),
        preferredReply: 'Email',
        threadId:       id
      }
    });
  });

  if (dryRun) {
    Logger.log('DRY RUN — %s new enquiries would be imported, %s skipped.', added.length, skipped);
    added.forEach(function (a) {
      Logger.log('  + %s <%s>  |  %s', a.row.name, a.row.email, a.row.details.slice(0, 90));
    });
    return added.length;
  }

  if (!added.length) { Logger.log('Nothing new. %s skipped.', skipped); return 0; }

  var rows = added.map(function (a) {
    return headers.map(function (h) {
      return a.row.hasOwnProperty(h) ? a.row[h] : '';
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  Logger.log('Imported %s new enquiries, skipped %s.', added.length, skipped);
  return added.length;
}

/** Bulk mail carries List-Unsubscribe (or Precedence: bulk). People do not. */
function missedCalls_(dryRun) {
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sheet = CFG.SHEET_NAME ? ss.getSheetByName(CFG.SHEET_NAME) : ss.getSheets()[0];
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h||'').trim(); });

  var tidCol = headers.indexOf('threadId');
  if (tidCol === -1 && !dryRun) {
    sheet.getRange(1, lastCol + 1).setValue('threadId');
    headers.push('threadId'); tidCol = headers.length - 1;
  }
  var mobCol = headers.indexOf('mobile'), stCol = headers.indexOf('status');

  var seen = {}, openNums = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var all = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    all.forEach(function (r) {
      if (tidCol > -1 && r[tidCol]) seen[String(r[tidCol]).trim()] = true;
      if (CFG.SKIP_IF_OPEN && mobCol > -1 && r[mobCol]) {
        var st = stCol > -1 ? String(r[stCol]||'').trim() : '';
        if (st !== 'Completed' && st !== 'Lost') openNums[digits_(r[mobCol])] = true;
      }
    });
  }

  var threads = GmailApp.search('subject:"' + CFG.MISSED_CALL_SUBJECT + '" newer_than:' + CFG.MISSED_CALL_DAYS + 'd', 0, 200);
  var added = [], skipped = 0;

  threads.forEach(function (thread) {
    var id = thread.getId();
    if (seen[id]) { skipped++; return; }
    var msg  = thread.getMessages()[0];
    var parsed = parseMissedCall_(msg.getPlainBody() || '');
    if (!parsed) { skipped++; return; }

    var num  = parsed.number;
    var who  = parsed.name;
    var when = parsed.time;

    if (CFG.OWN_NUMBERS.some(function (o) { return digits_(o) === digits_(num); })) { skipped++; return; }
    if (CFG.SKIP_IF_OPEN && openNums[digits_(num)]) { skipped++; return; }

    var known = CFG.KNOWN_CONTACTS[num] || '';
    var name  = who || known || 'Missed call ' + num;
    openNums[digits_(num)] = true;   // don't add the same number twice in one run

    added.push({ id: id, row: {
      timestamp:      msg.getDate().toISOString(),
      name:           name,
      mobile:         num,
      service:        'Missed call',
      source:         'phone',
      status:         'New',
      preferredReply: 'Phone',
      details:        'Missed call' + (when ? ' at ' + when.slice(0,-2) + ':' + when.slice(-2) : '') + (known ? ' — known contact: ' + known : ''),
      threadId:       id
    }});
  });

  if (dryRun) {
    Logger.log('DRY RUN (missed calls) — %s would become leads, %s skipped.', added.length, skipped);
    added.forEach(function (a) { Logger.log('  + %s  %s', a.row.mobile, a.row.details); });
    return added.length;
  }
  if (!added.length) { Logger.log('No new missed calls. %s skipped.', skipped); return 0; }

  var rows = added.map(function (a) {
    return headers.map(function (h) { return a.row.hasOwnProperty(h) ? a.row[h] : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  Logger.log('Imported %s missed calls, skipped %s.', added.length, skipped);
  return added.length;
}

/**
 * Read a missed-call notification.
 *
 * Current format is two lines - number and optional caller name, then the time:
 *     +447818080205 Geoffrey Fernandez
 *     1510
 *
 * An earlier format put everything on one line with the name glued straight
 * onto the number:
 *     +447411086500Bajram Auto Electrican 1006
 *
 * Both are handled. Taking the time from its own line matters: flattening the
 * body first made a name ending in digits look like a timestamp.
 */
function parseMissedCall_(raw) {
  var lines = String(raw || '').split(/\r?\n/).map(function (l) { return l.trim(); })
                               .filter(function (l) { return l.length; });
  if (!lines.length) return null;

  // Leading run of digits/space/()/- , then anything else is the caller name.
  var g = lines[0].match(/^(\+?[\d\s()-]+)(.*)$/);
  if (!g) return null;
  var numPart = g[1];
  var name    = (g[2] || '').trim();
  var time    = '';

  // Preferred: a line that is nothing but the time.
  for (var i = 1; i < lines.length; i++) {
    var t = lines[i].match(/^(\d{3,4})$/);
    if (t) { time = t[1]; break; }
  }
  // Older single-line formats: the time trails either the number or the name.
  if (!time) {
    var a = numPart.match(/\s(\d{3,4})\s*$/);
    if (a) { time = a[1]; numPart = numPart.slice(0, a.index); }
    else {
      var b = name.match(/(\d{3,4})\s*$/);
      if (b) { time = b[1]; name = name.slice(0, b.index).trim(); }
    }
  }

  var number = numPart.replace(/[\s()-]/g, '');
  if (number.replace(/\D/g, '').length < 7) return null;
  return { number: number, name: name, time: time };
}

/** Compare numbers ignoring +44 / 0 / spacing. */
function digits_(n) {
  var d = String(n || '').replace(/\D/g, '');
  if (d.indexOf('44') === 0) d = d.slice(2);
  if (d.indexOf('0') === 0) d = d.slice(1);
  return d;
}

function isBulk_(msg) {
  try {
    if (msg.getHeader('List-Unsubscribe')) return true;
    if (msg.getHeader('List-Id')) return true;
    var p = (msg.getHeader('Precedence') || '').toLowerCase();
    if (p === 'bulk' || p === 'list' || p === 'junk') return true;
    var a = (msg.getHeader('Auto-Submitted') || '').toLowerCase();
    if (a && a !== 'no') return true;
  } catch (e) { /* older runtimes lack getHeader - fall through */ }
  return false;
}

/** Does the message actually mention anything we do? */
function hasKeyword_(text) {
  var t = (text || '').toLowerCase();
  return CFG.KEYWORDS.some(function (k) { return t.indexOf(k) > -1; });
}

function isIgnoredSender_(from) {
  var f = from.toLowerCase();
  return CFG.IGNORE_SENDERS.some(function (bad) { return f.indexOf(bad) > -1; });
}

function isIgnoredSubject_(subject) {
  var s = subject.toLowerCase();
  return CFG.IGNORE_SUBJECTS.some(function (bad) { return s.indexOf(bad) > -1; });
}

/** Pull a UK mobile out of the message body if one is there. */
function findPhone_(text) {
  var m = text.match(/(?:\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/);
  return m ? m[0].trim() : '';
}
