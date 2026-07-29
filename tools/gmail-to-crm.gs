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

  // Senders that are never a customer enquiry.
  IGNORE_SENDERS: [
    'formsubmit.co',        // already captured by the website forms
    'noreply', 'no-reply', 'donotreply', 'do-not-reply',
    'notification@slack.com', 'slack.com',
    'google.com', 'googlemail.com', 'gmail-noreply',
    'vercel.com', 'netlify.com', 'github.com',
    'stripe.com', 'paypal', 'xero.com', 'quickbooks',
    'mailchimp', 'sendgrid', 'hubspot', 'squareup.com',
    'acrautomobile.com'     // ourselves
  ],

  // Subjects that are clearly not enquiries.
  IGNORE_SUBJECTS: [
    'invoice', 'receipt', 'statement', 'subscription',
    'security alert', 'sign-in', 'password', 'verify your',
    'newsletter', 'unsubscribe', 'delivery', 'dispatched',
    'out of office', 'automatic reply'
  ]
};

// ─────────────────────────── Entry points ───────────────────────────

/** Import for real. */
function syncGmailToCrm() { return run_(false); }

/** Log what WOULD be imported, write nothing. Run this first. */
function dryRunGmailToCrm() { return run_(true); }

/** Run automatically every hour. Run once. */
function installGmailTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncGmailToCrm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncGmailToCrm').timeBased().everyHours(1).create();
  Logger.log('Hourly sync installed.');
}

/** Stop the automatic run. */
function removeGmailTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncGmailToCrm') ScriptApp.deleteTrigger(t);
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

  var query = 'to:info@acrautomobile.com -in:chats -in:draft newer_than:' + CFG.DAYS_BACK + 'd';
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

    var email = (from.match(/<([^>]+)>/) || [null, from])[1].trim().toLowerCase();
    var name  = (from.replace(/<[^>]*>/, '').replace(/["']/g, '').trim()) || email.split('@')[0];
    var body  = (first.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, 500);

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
