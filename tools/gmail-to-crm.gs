/**
 * ACR - Gmail -> CRM lead capture
 * ================================================================
 * Catches enquiries that never touch a website form: people who email
 * info@acrautomobile.com directly, or who reply to something and start a new
 * conversation. Those currently live only in the inbox and never reach the
 * CRM board - which is how enquiries get missed.
 *
 * Form submissions are NOT re-imported: FormSubmit is excluded below, because
 * those already write to the sheet through the website.
 *
 * HOW TO INSTALL
 *   1. Open the CRM sheet -> Extensions -> Apps Script
 *   2. File -> + -> Script, name it "gmailToCrm", paste this whole file in
 *   3. Save, then run  dryRunGmailToCrm  once and click "Review permissions"
 *      (it needs Gmail read + Sheets write). Check the Execution log - it will
 *      list what it WOULD add, without writing anything.
 *   4. Happy? Run  syncGmailToCrm  once to import for real.
 *   5. Run  installGmailTrigger  once to have it run automatically every hour.
 *
 * TO UNDO an import: sort the sheet by the `source` column and delete the rows
 * marked "gmail". Nothing else is touched.
 *
 * TIDE INVOICES
 *   Run  dryRunTideInvoices  first. It prints which invoices it found, which
 *   enquiry each would attach to, and which it could not match - WITHOUT writing
 *   anything. Send that log over and the matcher can be tuned to Tide's real
 *   wording before it touches the sheet.
 *   Then  syncTideInvoices  files the invoice number and a link to the Gmail
 *   thread in two new columns, invoiceRef and invoiceLink. The PDF is never
 *   copied: the CRM and the booking console open the original email.
 *   TO UNDO: clear those two columns. Nothing else is touched.
 */

// --------------------------- Configuration ---------------------------

var CFG = {
  SHEET_ID:   '1MszFXo--wsC5ozeh6SLnzqG2LG2fcoA4ZoNhwsOp29o',
  SHEET_NAME: '',           // leave blank to use the first sheet
  DAYS_BACK:  7,            // how far back to look on each run (the hourly
                            // trigger only needs a few days; raise it for a backfill)
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

  // -- Missed calls --
  // Your phone already emails info@ every missed call, subject "Missed Call",
  // body "+447xxxxxxxxx[Name] HHMM". Those are inbound leads with nowhere to go.
  MISSED_CALL_SUBJECT: 'Missed Call',
  MISSED_CALL_DAYS: 7,
  // Your own handsets - never create a lead for these.
  OWN_NUMBERS: ['+447818080205', '07818080205', '+447468844431', '07468844431'],
  // Suppliers and known contacts: still imported, but tagged so you can filter.
  KNOWN_CONTACTS: {
    '+447411086500': 'Bajram Auto Electrician'
  },
  // Don't raise a second lead if that number is already open on the board.
  SKIP_IF_OPEN: true,

  // Historic calls you have already dealt with shouldn't land in "New".
  // Anything older than this many days is imported with BACKFILL_STATUS
  // instead, so the New column only holds calls that still need returning.
  BACKFILL_AFTER_DAYS: 3,
  BACKFILL_STATUS: 'On Hold',

  // -- Tide invoices --
  // Invoices are raised in Tide and land in Gmail. This finds them and files a
  // link to the email against the matching CRM row, so the invoice is one click
  // from the enquiry and from the booking console.
  // Nothing is copied out of Gmail: the row stores the invoice number and a
  // deep link to the thread, so the PDF stays where it already is.
  TIDE_SENDERS: ['tide.co', 'tide.com', 'no-reply@tide.co'],
  TIDE_DAYS: 60,
  // A Tide invoice email is matched to an enquiry by, in order of trust:
  //   1. the customer's email address appearing in the invoice email
  //   2. the customer's name appearing in the subject or body
  // If neither matches, it is reported and skipped rather than guessed at.
  TIDE_SET_STATUS: 'Invoice sent',   // set '' to leave the stage alone
  // Print subject / To: / what was parsed for each invoice email during a dry
  // run. Turn off once matching is behaving.
  TIDE_DEBUG: false,                 // set true to print what each invoice parsed to
  TIDE_DEBUG_MAX: 12,                // don't flood the log
  // The dry run showed 52 invoiced customers with NO record on the board at all -
  // people who came by phone or WhatsApp and were invoiced without ever filling a
  // form. Turn this on and each one becomes a record, built from the invoice:
  // name from Tide's "Hi <name>,", email from the To: line, the total as the
  // value. Source is 'tide', so to undo it you sort by source and delete them.
  TIDE_CREATE_MISSING: false,

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

// --------------------------- Entry points ---------------------------

/** Import for real. */
function syncGmailToCrm() { return run_(false); }

/** Log what WOULD be imported, write nothing. Run this first. */
function dryRunGmailToCrm() { return run_(true); }

/** Import missed calls only. */
function syncMissedCalls() { return missedCalls_(false); }

/** Log which missed calls WOULD become leads, write nothing. */
function dryRunMissedCalls() { return missedCalls_(true); }

/** Attach Tide invoices found in Gmail to the matching CRM rows. */
function syncTideInvoices() { return tideInvoices_(false); }

/** Log which Tide invoices WOULD be attached, and to whom. Run this first. */
function dryRunTideInvoices() { return tideInvoices_(true); }

/** Everything: email enquiries + missed calls + Tide invoices. The trigger runs this. */
function syncAll() {
  var a = run_(false), b = missedCalls_(false), c = tideInvoices_(false);
  Logger.log('Total: %s email, %s missed calls, %s invoices attached.', a, b, c);
  return a + b + c;
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

/**
 * Adds an "ACR CRM" menu to the spreadsheet so you can pull new data on demand
 * without opening the script editor.
 *
 * This only appears if the script is BOUND to the sheet - i.e. you created it
 * from the sheet via Extensions -> Apps Script. If you made a standalone script
 * the menu will not show, and you run the functions from the editor instead.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ACR CRM')
    .addItem('Sync now (email + calls + invoices)', 'syncAll')
    .addSeparator()
    .addItem('Dry run - email enquiries', 'dryRunGmailToCrm')
    .addItem('Dry run - missed calls', 'dryRunMissedCalls')
    .addItem('Dry run - Tide invoices', 'dryRunTideInvoices')
    .addSeparator()
    .addItem('Turn hourly sync ON', 'installGmailTrigger')
    .addItem('Turn hourly sync OFF', 'removeGmailTrigger')
    .addToUi();
}

/**
 * FORCE PULL - one small edit in Code.gs
 * ================================================================
 * This project already contains the CRM's own doGet (in Code.gs), so a second
 * doGet here would simply be ignored. Instead, add these five lines as the
 * FIRST thing inside the existing doGet in Code.gs:
 *
 *   function doGet(e) {
 *     if (e && e.parameter && e.parameter.action === 'sync') {        // <-- add
 *       var out;                                                     // <-- add
 *       try { out = { ok:true, email: run_(false), calls: missedCalls_(false) }; }   // <-- add
 *       catch (err) { out = { ok:false, error: String(err) }; }       // <-- add
 *       return ContentService.createTextOutput(JSON.stringify(out))   // <-- add
 *         .setMimeType(ContentService.MimeType.JSON);                 // <-- add
 *     }                                                              // <-- add
 *     ...the existing code that returns the rows stays exactly as it is...
 *   }
 *
 * Save. Nothing needs redeploying - an existing deployment always runs the
 * latest saved code. The CRM's Force pull button then works immediately,
 * because it calls the endpoint it already uses.
 */

// --------------------------- Implementation ---------------------------

function run_(dryRun) {
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sheet = CFG.SHEET_NAME ? ss.getSheetByName(CFG.SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('Sheet not found - check CFG.SHEET_NAME.');

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
  var found = GmailApp.search(query, 0, CFG.MAX_THREADS);

  // Only fetch bodies for threads we have not imported before, and fetch them
  // in one batched call. Calling thread.getMessages() per thread is a separate
  // round trip each time and is what made a pull take a minute.
  var threads = found.filter(function (t) { return !seen[t.getId()]; });
  var skipped = found.length - threads.length;
  var bulk = threads.length ? GmailApp.getMessagesForThreads(threads) : [];
  var added = [];

  threads.forEach(function (thread, idx) {
    var id = thread.getId();

    var msgs = bulk[idx] || thread.getMessages();
    var first = msgs[0];
    if (!first) { skipped++; return; }
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
        details:        subject + (body ? ' - ' + body : ''),
        preferredReply: 'Email',
        threadId:       id
      }
    });
  });

  if (dryRun) {
    Logger.log('DRY RUN - %s new enquiries would be imported, %s skipped.', added.length, skipped);
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
        if (st !== 'Completed' && st !== 'Lost' && st !== 'Archive') openNums[digits_(r[mobCol])] = true;
      }
    });
  }

  var found = GmailApp.search('subject:"' + CFG.MISSED_CALL_SUBJECT + '" newer_than:' + CFG.MISSED_CALL_DAYS + 'd', 0, 200);

  var threads = found.filter(function (t) { return !seen[t.getId()]; });
  var skipped = found.length - threads.length;
  var bulk = threads.length ? GmailApp.getMessagesForThreads(threads) : [];
  var added = [];

  threads.forEach(function (thread, idx) {
    var id = thread.getId();
    var msg  = (bulk[idx] || thread.getMessages())[0];
    if (!msg) { skipped++; return; }
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
      status:         ageDays_(msg.getDate()) > CFG.BACKFILL_AFTER_DAYS ? CFG.BACKFILL_STATUS : 'New',
      preferredReply: 'Phone',
      details:        'Missed call' + (when ? ' at ' + when.slice(0,-2) + ':' + when.slice(-2) : '') + (known ? ' - known contact: ' + known : ''),
      threadId:       id
    }});
  });

  if (dryRun) {
    Logger.log('DRY RUN (missed calls) - %s would become leads, %s skipped.', added.length, skipped);
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

/**
 * Tide invoices -> CRM rows.
 *
 * Nothing is copied out of Gmail. Each matched row gets the invoice number and a
 * deep link to the Gmail thread, so the PDF stays where it already lives and the
 * CRM and booking console both open the real thing.
 *
 * Matching is deliberately conservative: an email address match, else a full-name
 * match, else it is reported and left alone. A wrongly attached invoice is worse
 * than one you attach by hand.
 */
function tideInvoices_(dryRun) {
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sheet = CFG.SHEET_NAME ? ss.getSheetByName(CFG.SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('Sheet not found - check CFG.SHEET_NAME.');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                     .map(function (h) { return String(h || '').trim(); });
  function needCol(name) {
    var i = headers.indexOf(name);
    if (i > -1) return i;
    if (dryRun) { Logger.log('NOTE: a "%s" column would be added.', name); return -1; }
    sheet.getRange(1, headers.length + 1).setValue(name);
    headers.push(name);
    return headers.length - 1;
  }
  var refCol  = needCol('invoiceRef');
  var linkCol = needCol('invoiceLink');
  var stCol   = headers.indexOf('status');
  var nameCol = headers.indexOf('name');
  var mailCol = headers.indexOf('email');
  var mobCol  = headers.indexOf('mobile');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('No enquiries to match against.'); return 0; }
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  var query = '(' + CFG.TIDE_SENDERS.map(function (f) { return 'from:' + f; }).join(' OR ') + ')'
            + ' newer_than:' + CFG.TIDE_DAYS + 'd -in:chats -in:draft -in:spam -in:trash';
  var threads = GmailApp.search(query, 0, 200);
  if (!threads.length) { Logger.log('No Tide mail in the last %s days. Query: %s', CFG.TIDE_DAYS, query); return 0; }
  var bulk = GmailApp.getMessagesForThreads(threads);

  var attached = 0, unmatched = [], skipped = 0, shown = 0, seenRef = {}, cancelled = [], created = 0, newRows = [];

  threads.forEach(function (thread, idx) {
    var msgs = bulk[idx] || thread.getMessages();
    var msg  = msgs[msgs.length - 1];                 // the most recent in the thread
    if (!msg) { skipped++; return; }
    var subject = thread.getFirstMessageSubject() || '';
    var body    = bodyText_(msg);
    var inv     = parseInvoice_(subject, body);
    inv.cancelled = /\bcancell?ed\b/i.test(subject);
    /* Tide addresses the invoice to the customer and copies us, so the To: line
       is often the only place the customer appears. */
    var to      = '';
    try { to = (msg.getTo() || '') + ' ' + (msg.getCc() || ''); } catch (e) {}
    if (to) { inv.hay += '\n' + to; if (!inv.email) inv.email = firstOutsideEmail_(to); }
    if (!inv.ref && !/invoice/i.test(subject + ' ' + body)) { skipped++; return; }
    /* Tide mails the same invoice more than once - issued, reminder, paid,
       cancelled. Threads come back newest first, so the first sighting of a
       number is the current one and later ones are history. */
    if (inv.ref && seenRef[inv.ref]) { skipped++; return; }
    if (inv.ref) seenRef[inv.ref] = true;
    if (inv.cancelled) {
      cancelled.push((inv.ref || subject.slice(0, 30)) + (inv.name ? ' (' + inv.name + ')' : ''));
      skipped++; return;
    }

    var link = 'https://mail.google.com/mail/u/0/#all/' + thread.getId();
    var m    = matchRow_(rows, inv, nameCol, mailCol, mobCol);
    var hit  = m.i;

    if (dryRun && CFG.TIDE_DEBUG && shown < CFG.TIDE_DEBUG_MAX) {
      shown++;
      Logger.log('--- %s', subject.slice(0, 80));
      Logger.log('    to=%s', to.slice(0, 90) || '(none)');
      Logger.log('    ref=%s total=%s email=%s name=%s match=%s',
                 inv.ref || '-', inv.total || '-', inv.email || '-', inv.name || '-',
                 hit < 0 ? 'NONE' : (nameCol > -1 ? rows[hit][nameCol] : 'row ' + (hit + 2)) + ' [' + m.how + ']');
      Logger.log('    body[0..160]=%s', body.replace(/\s+/g, ' ').slice(0, 160));
    }

    if (hit < 0) {
      unmatched.push((inv.ref || '(no number)') + ' - '
                     + (inv.name ? inv.name + ' <' + (inv.email || '?') + '>' : (inv.email || subject)).slice(0, 70)
                     + (m.near && m.near.length ? '   [same first name on the board: ' + m.near.join(', ') + ']' : ''));
      /* An invoice with no record means a paying customer who is not on the board
         at all. Optionally put them there rather than losing them. */
      if (CFG.TIDE_CREATE_MISSING && (inv.email || inv.name)) {
        newRows.push({
          timestamp:      msg.getDate().toISOString(),
          name:           inv.name || inv.email,
          email:          inv.email || '',
          service:        'Invoiced job',
          source:         'tide',
          status:         CFG.TIDE_SET_STATUS || 'Invoice sent',
          value:          inv.total ? inv.total.replace(/[^\d.]/g, '') : '',
          details:        subject,
          preferredReply: 'Email',
          invoiceRef:     inv.ref || '',
          invoiceLink:    link
        });
        created++;
      }
      return;
    }
    /* already filed? */
    if (refCol > -1 && String(rows[hit][refCol] || '').trim() === (inv.ref || '') &&
        linkCol > -1 && String(rows[hit][linkCol] || '').trim() === link) { skipped++; return; }

    var who = nameCol > -1 ? rows[hit][nameCol] : '(row ' + (hit + 2) + ')';
    if (dryRun) {
      Logger.log('  would attach %s%s -> %s   (matched on %s)', inv.ref || '(no number)',
                 inv.total ? ' (' + inv.total + ')' : '', who, m.how);
      attached++;
      return;
    }
    if (refCol  > -1) sheet.getRange(hit + 2, refCol + 1).setValue(inv.ref || '');
    if (linkCol > -1) sheet.getRange(hit + 2, linkCol + 1).setValue(link);
    if (CFG.TIDE_SET_STATUS && stCol > -1) {
      var cur = String(rows[hit][stCol] || '').trim();
      /* never drag a finished job backwards */
      if (cur !== 'Completed' && cur !== 'Lost' && cur !== 'Archive') {
        sheet.getRange(hit + 2, stCol + 1).setValue(CFG.TIDE_SET_STATUS);
      }
    }
    Logger.log('Attached %s to %s (matched on %s)', inv.ref || '(no number)', who, m.how);
    attached++;
  });

  if (cancelled.length) {
    Logger.log('%s cancelled invoice(s) ignored: %s', cancelled.length, cancelled.join(', '));
  }
  if (unmatched.length) {
    Logger.log('%s invoice(s) matched no enquiry%s:', unmatched.length,
               CFG.TIDE_CREATE_MISSING ? ' - added as new records' : ' - attach these by hand, or set TIDE_CREATE_MISSING');
    unmatched.forEach(function (u) { Logger.log('  ? %s', u); });
  }
  /* Write any new records in one go rather than a row at a time. */
  if (newRows.length && !dryRun) {
    var out = newRows.map(function (r) {
      return headers.map(function (h) { return r.hasOwnProperty(h) ? r[h] : ''; });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, out.length, headers.length).setValues(out);
  }
  Logger.log('%s%s invoice(s) attached, %s new record(s), %s skipped, %s unmatched.',
             dryRun ? 'DRY RUN - ' : '', attached, created, skipped, unmatched.length);
  return attached + created;
}

/**
 * Pull what we need out of a Tide invoice email. Written permissively because
 * Tide's wording varies between "invoice sent", "invoice paid" and reminders:
 * anything that looks like an invoice number, a total, and the customer's own
 * email address if it appears.
 */
function parseInvoice_(subject, body) {
  var hay = subject + '\n' + body;
  /* Keep the number EXACTLY as Tide wrote it, padding included: the real
     invoices are INV-0078, and an earlier version stripped the zeros and
     reported INV-78 - a reference that does not exist. */
  var ref = (hay.match(/\bINV[-\s]?(\d{1,8})\b/i)
          || hay.match(/invoice\s*(?:no\.?|number|#)\s*([A-Z0-9][A-Z0-9-]{0,11})/i)
          || hay.match(/\binvoice\s+([A-Z]{2,4}-?\d{1,8})\b/i));
  var total = hay.match(/(?:total(?:\s+amount)?(?:\s+of)?\s*:?\s*)\u00a3\s?([\d,]+(?:\.\d{2})?)/i)
           || hay.match(/\u00a3\s?([\d,]+(?:\.\d{2})?)/);
  var emails = (hay.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).map(function (a) {
    return a.replace(/[.,;:)\]]+$/, '');            /* a sentence's full stop is not part of the address */
  }).filter(function (a) {
    a = a.toLowerCase();
    return a.indexOf('tide.co') < 0 && a.indexOf('acrautomobile.com') < 0
        && a.indexOf('noreply') < 0 && a.indexOf('no-reply') < 0;
  });
  /* Tide opens every invoice mail with "Hi <customer>," - the one reliable place
     the name appears. "Hi Arya ali-kamal," shows the second word is not always
     capitalised, so do not require it to be. */
  var nm = hay.match(/\bHi\s+([A-Z][\w'\u2019.-]*(?:\s+[\w'\u2019.-]+){0,3})\s*,/)
        || hay.match(/(?:invoice[^\n]{0,40}?\b(?:for|to)\s+)([A-Z][\w'\u2019-]+(?:\s+[A-Z][\w'\u2019-]+){1,3})/);
  var phones = (hay.match(/(?:\+44\s?|0)7\d{3}[\s-]?\d{3}[\s-]?\d{3}/g) || []);
  return {
    phones: phones,
    /* Only call it INV-nnnn when the email actually said INV; otherwise keep the
       number as written, rather than inventing a format Tide may not use. */
    ref:   ref ? (/^INV[-\s]?\d/i.test(ref[0]) ? 'INV-' + ref[1] : ref[1]) : '',
    total: total ? '\u00a3' + total[1] : '',
    email: emails.length ? emails[0].toLowerCase() : '',
    name:  nm ? nm[1].trim() : '',
    hay:   hay
  };
}

/** Plain text if there is any, otherwise the HTML with its tags taken out. */
function bodyText_(msg) {
  var t = '';
  try { t = msg.getPlainBody() || ''; } catch (e) {}
  if (t.replace(/\s+/g, '').length > 40) return t;
  try {
    var h = msg.getBody() || '';
    return h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
            .replace(/[ \t]+/g, ' ');
  } catch (e) { return t; }
}

/** The first address in a string that is not ours, Tide's or a no-reply. */
function firstOutsideEmail_(text) {
  var all = (String(text || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).map(function (a) {
    return a.replace(/[.,;:)\]>]+$/, '').toLowerCase();
  });
  for (var i = 0; i < all.length; i++) {
    var a = all[i];
    if (a.indexOf('tide.co') < 0 && a.indexOf('acrautomobile.com') < 0
        && a.indexOf('noreply') < 0 && a.indexOf('no-reply') < 0) return a;
  }
  return '';
}

/** Names compare badly raw: titles, case, punctuation, double spaces. */
function normName_(v) {
  return String(v || '')
    .replace(/^(mr|mrs|ms|miss|mx|dr|prof)\.?\s+/i, '')
    .replace(/[^A-Za-z\u00c0-\u024f\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** "alex marin" -> "a marin", so "Alex Marin" and "A. Marin" meet. */
function initialSurname_(n) {
  var p = n.split(' ');
  if (p.length < 2) return '';
  return p[0].charAt(0) + ' ' + p[p.length - 1];
}

/**
 * Find the enquiry an invoice belongs to, strongest evidence first, and say which
 * test carried it so the log can be audited:
 *
 *   email  - the invoice's To: address is the address on the record
 *   phone  - a mobile in the invoice is the mobile on the record
 *   name   - the full name matches once titles, case and punctuation are ignored
 *   surname- first initial + surname match ("A Marin" = "Alex Marin")
 *   inbody - the record's full name appears verbatim in the invoice
 *
 * Anything weaker - a lone first name, a surname on its own - is returned as a
 * near miss for you to confirm, never attached automatically. Filing an invoice
 * against the wrong customer is worse than filing it by hand.
 */
function matchRow_(rows, inv, nameCol, mailCol, mobCol) {
  var i, near = [];

  if (inv.email && mailCol > -1) {
    for (i = 0; i < rows.length; i++) {
      if (String(rows[i][mailCol] || '').trim().toLowerCase() === inv.email) return { i: i, how: 'email' };
    }
  }

  if (inv.phones && inv.phones.length && mobCol > -1) {
    for (i = 0; i < rows.length; i++) {
      var rowNum = digits_(rows[i][mobCol]);
      if (rowNum.length < 9) continue;                  /* too short to trust */
      for (var p = 0; p < inv.phones.length; p++) {
        if (digits_(inv.phones[p]) === rowNum) return { i: i, how: 'phone' };
      }
    }
  }

  var want = normName_(inv.name);
  if (want && nameCol > -1) {
    var wantIS = initialSurname_(want);
    for (i = 0; i < rows.length; i++) {
      var got = normName_(rows[i][nameCol]);
      if (!got) continue;
      if (got === want) return { i: i, how: 'name' };
    }
    if (wantIS) {
      for (i = 0; i < rows.length; i++) {
        var gotIS = initialSurname_(normName_(rows[i][nameCol]));
        if (gotIS && gotIS === wantIS) return { i: i, how: 'surname' };
      }
    }
    /* A single word is not enough on its own - record it and move on. */
    if (want.indexOf(' ') < 0) {
      for (i = 0; i < rows.length; i++) {
        var first = normName_(rows[i][nameCol]).split(' ')[0];
        if (first && first === want) near.push(String(rows[i][nameCol]));
      }
    }
  }

  if (nameCol > -1) {
    for (i = 0; i < rows.length; i++) {
      var full = normName_(rows[i][nameCol]);
      if (full.length < 8 || full.indexOf(' ') < 0) continue;   /* needs to be a real full name */
      if (inv.hay.toLowerCase().indexOf(full) > -1) return { i: i, how: 'inbody' };
    }
  }

  return { i: -1, how: '', near: near };
}

/** How many days ago was this? */
function ageDays_(d) {
  return (new Date().getTime() - new Date(d).getTime()) / 86400000;
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
