// ACR Automobile - enquiry logger + reader + booking emailer
var SHEET_NAME = 'Sheet1';           // change if your tab is named differently
var SENDER = 'info@acrautomobile.com';      // shown as "From" (only if it's a verified send-as alias)
var NOTIFY = 'geoffreypf@acrautomobile.com'; // your REAL inbox - gets a copy + the test email

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // marketing console (marketing.gs): list, import, campaign save, unsubscribe.
    // typeof-guarded: if that file is missing, this must degrade rather than
    // take the whole endpoint down with it.
    if (data.action && data.action.indexOf('mkt') === 0 && typeof mktPost_ === 'function') {
      var mr = mktPost_(data); if (mr) return mr;
    }

    // 1) Send a booking confirmation email to the customer (from the Booking Console)
    if (data.action === 'sendBookingEmail') {
      /* MailApp.sendEmail does NOT support a `from` option - that belongs to
         GmailApp.sendEmail. Setting it on a MailApp call is silently ignored,
         which is why booking confirmations were reaching customers from the
         account owner rather than info@acrautomobile.com. */
      var useAlias = false;
      try { useAlias = GmailApp.getAliases().indexOf(SENDER) !== -1; } catch (ignore) {}
      if (useAlias) {
        GmailApp.sendEmail(data.to, data.subject, data.body, {
          name: 'ACR Automobile', from: SENDER, replyTo: SENDER, bcc: NOTIFY
        });
      } else {
        MailApp.sendEmail({
          to: data.to, subject: data.subject, body: data.body,
          name: 'ACR Automobile', replyTo: SENDER, bcc: NOTIFY
        });
      }
      return ContentService.createTextOutput('emailed');
    }

    // 1a) Draft a reply INSIDE an existing Gmail thread.
    //     A compose URL cannot do this: there is no way to set In-Reply-To from a
    //     link, so every "Gmail" quick reply started a new conversation with the
    //     same subject. This replies into the real thread.
    //     It creates a DRAFT rather than sending: the CRM opens the thread straight
    //     after, so the reply can be read before it goes. A button that silently
    //     emails a customer is one mis-tap from an apology.
    if (data.action === 'replyDraft') {
      try {
        var th = GmailApp.getThreadById(data.threadId);
        if (!th) return ContentService.createTextOutput('notfound');
        th.createDraftReply(data.body || '');
        return ContentService.createTextOutput('drafted');
      } catch (err) {
        return ContentService.createTextOutput('error: ' + err);
      }
    }

    // 1b) Update a lead's CRM fields (status / value / follow-up / owner / notes)
    if (data.action === 'updateEnquiry') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
      var vals = sheet.getDataRange().getValues();
      var header = vals[0].map(function (h) { return String(h).trim(); });
      // make sure the CRM columns exist (added once, to the right)
      // 'updated' and 'chasedAt' are written by the CRM on every change and every
      // chase. Apps Script only writes columns that exist, so they are listed here
      // and created on first use - no hand-editing of the sheet header.
      ['status', 'value', 'followup', 'followups', 'owner', 'notes', 'deleted', 'category', 'foundVia',
       'updated', 'chasedAt', 'deposit'].forEach(function (c) {
        if (header.indexOf(c) === -1) { header.push(c); sheet.getRange(1, header.length).setValue(c); }
      });
      var tsCol = header.indexOf('timestamp');
      var rowIdx = -1;
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][tsCol]) === String(data.key)) { rowIdx = i + 1; break; }
      }
      if (rowIdx === -1) return ContentService.createTextOutput('notfound');
      var f = data.fields || {};
      Object.keys(f).forEach(function (k) {
        var c = header.indexOf(k);
        if (c !== -1) sheet.getRange(rowIdx, c + 1).setValue(f[k]);
      });
      return ContentService.createTextOutput('updated');
    }

    // 2) Otherwise log a website enquiry into the sheet.
    //    Columns are matched by header name, so new fields land in the right place
    //    and any missing (known) column is created automatically - no code edits
    //    needed when the website starts sending a new field.
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
             || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var COLS = ['timestamp', 'name', 'mobile', 'email', 'postcode', 'make', 'model',
                'trim', 'fuel', 'registration', 'service', 'preferredReply', 'source',
                'year', 'location', 'urgency', 'details', 'foundVia'];
    var lastCol = sh.getLastColumn();
    var header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    if (!header.length) { header = COLS.slice(); sh.getRange(1, 1, 1, header.length).setValues([header]); }
    // make sure every known enquiry column exists (added once, to the right)
    COLS.forEach(function (c) { if (header.indexOf(c) === -1) { header.push(c); sh.getRange(1, header.length).setValue(c); } });
    // build the row by header, so it stays correct even if columns are reordered
    var incoming = { timestamp: data.timestamp || new Date().toISOString(), service: data.service || data.interested || '' };
    COLS.forEach(function (c) { if (c !== 'timestamp' && c !== 'service' && data[c] != null && data[c] !== '') incoming[c] = data[c]; });
    sh.appendRow(header.map(function (h) { return incoming[h] != null ? incoming[h] : ''; }));
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

function doGet(e) {
  // marketing console + unsubscribe links (marketing.gs). Returns null for
  // anything it does not own, so the CRM's own actions fall through untouched.
  //
  // The typeof guard is not optional. Without it, deploying Code.gs before
  // marketing.gs exists throws "mktGet_ is not defined" for EVERY request that
  // carries an action - which took the CRM's own ?action=sync down with it.
  // One file missing must never break the other.
  if (e && e.parameter && e.parameter.action && typeof mktGet_ === 'function') {
    var mg = mktGet_(e); if (mg) return mg;
  }

  // Force pull - the CRM calls this with ?action=sync to import new email
  // enquiries and missed calls on demand. run_() and missedCalls_() live in
  // gmailToCrm.gs in this same project.
  if (e && e.parameter && e.parameter.action === 'sync') {
    var out;
    try {
      out = { ok: true, email: run_(false), calls: missedCalls_(false), at: new Date().toISOString() };
    } catch (err) {
      out = { ok: false, error: String(err && err.message ? err.message : err) };
    }
    return ContentService.createTextOutput(JSON.stringify(out))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
           || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rows = sh.getDataRange().getValues();
  var head = rows.shift().map(function (h) { return String(h).trim(); });
  var out = rows.filter(function (r) { return r.join('').trim() !== ''; })
    .map(function (r) {
      var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o;
    });
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
