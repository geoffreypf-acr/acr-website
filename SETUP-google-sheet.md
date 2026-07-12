# Connect the Booking Console to Google Sheets — 5-minute setup

This lets every website enquiry (quote / assessment form) drop into a Google Sheet,
and makes those enquiries appear in your **Booking Console** under "Incoming enquiries".
No coding, no monthly cost. You only do this once.

---

## Step 1 — Create the Sheet
1. Go to https://sheets.google.com and create a **blank spreadsheet**.
2. Name it e.g. `ACR Enquiries`.
3. In row 1, add these column headers **exactly**, left to right:

   `timestamp` · `name` · `mobile` · `email` · `postcode` · `make` · `model` · `trim` · `fuel` · `registration` · `service` · `preferredReply` · `source`

---

## Step 2 — Add the script
1. In the sheet menu: **Extensions → Apps Script**.
2. Delete anything in the editor and paste **all** of the code below.
3. Click the **Save** (disk) icon.

```javascript
// ACR Automobile — enquiry logger + reader + booking emailer
var SHEET_NAME = 'Sheet1';           // change if your tab is named differently
var SENDER = 'info@acrautomobile.com';      // shown as "From" (only if it's a verified send-as alias)
var NOTIFY = 'geoffreypf@acrautomobile.com'; // your REAL inbox — gets a copy + the test email

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // 1) Send a booking confirmation email to the customer (from the Booking Console)
    if (data.action === 'sendBookingEmail') {
      var opts = {
        to: data.to,
        subject: data.subject,
        body: data.body,
        name: 'ACR Automobile',
        replyTo: SENDER,
        bcc: NOTIFY
      };
      try {
        var aliases = GmailApp.getAliases();
        if (aliases.indexOf(SENDER) !== -1) opts.from = SENDER;
      } catch (ignore) {}
      MailApp.sendEmail(opts);
      return ContentService.createTextOutput('emailed');
    }

    // 1b) Update a lead's CRM fields (status / value / follow-up / owner / notes)
    if (data.action === 'updateEnquiry') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
      var vals = sheet.getDataRange().getValues();
      var header = vals[0].map(function (h) { return String(h).trim(); });
      // make sure the CRM columns exist (added once, to the right)
      ['status', 'value', 'followup', 'followups', 'owner', 'notes', 'deleted'].forEach(function (c) {
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

    // 2) Otherwise log a website enquiry into the sheet
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
             || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    sh.appendRow([
      data.timestamp || new Date().toISOString(),
      data.name || '', data.mobile || '', data.email || '', data.postcode || '',
      data.make || '', data.model || '', data.trim || '', data.fuel || '',
      data.registration || '', data.service || data.interested || '',
      data.preferredReply || '', data.source || ''
    ]);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

function doGet() {
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
```

> **Already set up an earlier version?** Just replace all the code with the block above,
> Save, then **Deploy → Manage deployments → (edit, pencil) → Version: New version → Deploy**.
> The first time it sends an email Google will ask you to authorise the Gmail permission — allow it.
>
> **Sending FROM info@acrautomobile.com:** the `from: SENDER` line only works if the Google
> account running this script can already send as that address. Two ways to ensure that:
> 1. **Best:** run the script under the Google/Workspace account whose email *is*
>    `info@acrautomobile.com` (open the Sheet while signed in as that account).
> 2. Or add `info@acrautomobile.com` as a verified **"Send mail as"** alias in that account's
>    Gmail settings (Gmail → Settings → Accounts → "Send mail as" → Add).
>
> If neither is set up, Gmail will just send from the owning account's own address instead —
> everything still works, only the visible "from" differs. Remove the `from: SENDER` line if you
> want to avoid the alias requirement entirely.

---

## Step 3 — Deploy it
1. Top-right: **Deploy → New deployment**.
2. Click the gear next to "Select type" → choose **Web app**.
3. Set:
   - **Description:** ACR enquiries
   - **Execute as:** Me
   - **Who has access:** **Anyone**  ← important, so the website can post to it
4. Click **Deploy**. Authorise when Google asks (choose your account → Advanced → Go to project → Allow).
5. Copy the **Web app URL** — it looks like
   `https://script.google.com/macros/s/AKfy…/exec`

---

## Step 4 — Paste the URL in two files
Open each file and paste your URL between the quotes:

- **`booking-console-a7c93f.html`** — near the bottom of the script:
  `var SHEET_ENDPOINT = 'PASTE_URL_HERE';`
- **`wiz.js`** — near the top:
  `var SHEET_ENDPOINT = 'PASTE_URL_HERE';`

(Or just send me the URL and I'll paste it in for you.)

---

## Done
- New website enquiries now append to your Sheet **and** show in the console's
  "Incoming enquiries" list. Click **Use** on any row to fill the booking form.
- The forms still email you and open WhatsApp exactly as before — the Sheet is an extra copy.

### Notes
- **Privacy:** "Who has access: Anyone" means anyone with the long random URL could read the
  data. Keep the URL private (it's only in your site's JS). For stronger control, tell me and
  I can add a shared secret key to the script.
- If you rename the sheet tab, update `SHEET_NAME` at the top of the script and redeploy
  (**Deploy → Manage deployments → Edit → New version**).
