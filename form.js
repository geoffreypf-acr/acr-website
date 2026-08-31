/* ACR Automobile — enquiry form delivery.
   Primary: opens WhatsApp prefilled to the number the team monitors (07468 844431).
   Backup: silently emails a copy of every enquiry to ENQUIRY_EMAIL via FormSubmit
   (https://formsubmit.co) — no account needed. The FIRST submission triggers a
   one-time activation email to that address; click the link in it once to switch
   delivery on. To change the inbox, edit ENQUIRY_EMAIL below.

   CRM: in addition to WhatsApp + email, EVERY enquiry is also pushed into the ACR
   CRM \u2014 the same Google-Sheet backend behind crm-a7c93f.html and the booking
   console \u2014 via crmUpload() below (same SHEET_ENDPOINT as wiz.js). Each row's
   `service` field carries a label identifying WHICH form the enquiry came from,
   so the CRM board can be searched/filtered by form. */
(function () {
  var WA_NUMBER = '447468844431';
  var ENQUIRY_EMAIL = 'info@acrautomobile.com';

  // ---- CRM upload (Google-Sheet backend, same endpoint as wiz.js) ----------
  // Enquiries land in the sheet and appear in crm-a7c93f.html / booking-console.
  var SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyH3AZWwJwRs-guZUHtQdZG_-9wfajGhrkiFv2JMN_BrnB6KCJaJR4NQJdN69cSZOQRog/exec';
  function crmUpload(fields, serviceLabel, sourceRef) {
    if (!SHEET_ENDPOINT) return;
    function F() {
      for (var i = 0; i < arguments.length; i++) {
        var v = fields[arguments[i]];
        if (v != null && v !== '' && v !== '\u2014') return v;
      }
      return '';
    }
    var make = F('Make', 'Vehicle make'), model = F('Model'), vehicle = F('Vehicle');
    if (!make && vehicle) { var parts = String(vehicle).trim().split(/\s+/); make = parts.shift() || ''; model = parts.join(' '); }
    var mobile = F('Mobile', 'Mobile number', 'Contact', 'Tel', 'Phone'), email = F('Email');
    // some forms collect mobile-or-email in one box \u2014 route an @ value to email
    if (!email && /@/.test(mobile)) { email = mobile; mobile = ''; }
    var row = {
      timestamp: new Date().toISOString(),
      name: F('Name', 'Full name'),
      mobile: mobile,
      email: email,
      postcode: F('Postcode'),
      make: make,
      model: model,
      trim: F('Trim / variant', 'Trim'),
      fuel: F('Fuel type', 'Fuel'),
      registration: F('Registration', 'Reg'),
      service: serviceLabel || '',   // identifies which form/enquiry this is (CRM filter)
      preferredReply: F('Preferred reply'),
      source: sourceRef || (location.pathname.replace(/^.*\//, '') || 'index.html'),
      // extended CRM columns (blank when a form doesn't collect them)
      year: F('Year'),
      location: F('Location'),
      urgency: F('Urgency'),
      details: F('Details', 'Message', 'Subject', 'Also interested in', 'What they need'),
      foundVia: F('How did you find us?')
    };
    /* text/plain avoids a CORS preflight so Apps Script accepts it */
    try {
      fetch(SHEET_ENDPOINT, {
        method: 'POST', keepalive: true, mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(row)
      }).catch(function () {});
    } catch (e) {}
    return row.timestamp;   // the CRM's row key, so a later step can enrich it
  }

  /* Fill in a row we already wrote rather than adding a second one for the same
     enquiry. Used by the dash cam handoff: the first form logs the lead so it
     cannot be lost, then the configurator completes that same row. Keys must be
     sheet column names; Apps Script ignores anything it does not recognise. */
  function crmUpdate(key, cols) {
    if (!SHEET_ENDPOINT || !key) return;
    try {
      fetch(SHEET_ENDPOINT, {
        method: 'POST', keepalive: true, mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'updateEnquiry', key: key, fields: cols })
      }).catch(function () {});
    } catch (e) {}
  }
  /* One name, assembled from the three fields every form now has: a title, a
     first name and a surname. It travels as a single "Mr Alex Marin" so the CRM's
     name column and the WhatsApp message read the same, and no sheet column had
     to be added. */
  function personName(form) {
    if (!form) return '';
    var pick = function (sel) { var el = form.querySelector(sel); return el ? (el.value || '').trim() : ''; };
    return [pick('[data-title]'), pick('[data-first]'), pick('[data-surname]')]
             .filter(Boolean).join(' ');
  }

  /* Title, first name and surname are all required. Accented letters, hyphens
     and apostrophes pass; a blank or a stray initial does not. */
  /* Deliberately permissive: compound first names ("Mary Jane", "Anne-Marie"),
     apostrophes and accents all have to pass. It only rejects blanks, digits and
     a single stray letter. */
  function badPart(v, what) {
    v = (v || '').trim();
    if (!v) return 'Please add your ' + what + '.';
    if (/\d/.test(v)) return 'Please check the ' + what + ' \u2014 it should not contain numbers.';
    if (v.replace(/[^a-z\u00c0-\u024f]/gi, '').length < 2) return 'Please check the ' + what + ' \u2014 it looks incomplete.';
    return '';
  }
  function badTitle(form) {
    var t = form && form.querySelector('[data-title]');
    if (!t) return '';
    return (t.value || '').trim() ? '' : 'Please choose a title \u2014 Mr, Mrs, Ms, Miss and so on.';
  }

  /* Every form marks its three name fields with data-title / data-first /
     data-surname, so one check covers all of them regardless of layout. */
  function badPerson(form) {
    var t = badTitle(form);
    if (t) return { msg: t, el: form.querySelector('[data-title]') };
    var checks = [
      ['[data-first]', 'first name'],
      ['[data-surname]',  'surname']
    ];
    for (var i = 0; i < checks.length; i++) {
      var el = form.querySelector(checks[i][0]);
      if (!el) continue;
      var bad = badPart(el.value, checks[i][1]);
      if (bad) return { msg: bad, el: el };
    }
    return null;
  }

  /* Every form now requires an email address. A mobile alone left us unable to
     send a written quote, and phone tag is where enquiries went quiet. */
  /* How they found us is mandatory too. It is the only field that tells us
     whether an enquiry came from search or from an AI assistant, and once a
     lead is in the CRM there is no way to recover it retrospectively. */
  function badFound(form) {
    var el = form && form.querySelector('[data-found]');
    if (!el) return null;
    if ((el.value || '').trim()) return null;
    return { msg: 'Please tell us how you found us \u2014 it helps us more than you\u2019d think.', el: el };
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function badEmail(v) {
    v = (v || '').trim();
    if (!v) return 'Please add your email address so we can send your quote in writing.';
    if (!EMAIL_RE.test(v)) return 'Please enter a valid email address.';
    return '';
  }

  // Friendly labels for known field ids (falls back to the <label> text)
  var LABELS = {
    n: 'Name', e: 'Email', t: 'Mobile', pc: 'Postcode', v: 'Vehicle',
    mk: 'Make', md: 'Model', tr: 'Trim / variant', fuel: 'Fuel type',
    r: 'Registration', s: 'Interested in', y: 'Year',
    cn: 'Name', ce: 'Email', ct: 'Mobile', cv: 'Vehicle', cs: 'Subject', cm: 'Message',
    // CarPlay enquiry forms (cp* ids) — map to the CRM's canonical columns
    cpn: 'Name', cpt: 'Mobile', cpe: 'Email', cpy: 'Year', cps: 'Details'
  };

  // Vehicle make → model suggestions. Free text is still allowed; these just power
  // the searchable dropdowns. Curated toward the prestige brands ACR works on.
  var MAKES = ['Abarth','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','BYD','Citroën','Cupra','Dacia','DS','Ferrari','Fiat','Ford','Genesis','Honda','Hyundai','Jaguar','Jeep','Kia','Lamborghini','Land Rover','Lexus','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','MG','MINI','Mitsubishi','Nissan','Peugeot','Polestar','Porsche','Range Rover','Renault','Rolls-Royce','SEAT','Škoda','Smart','SsangYong','Subaru','Suzuki','Tesla','Toyota','Vauxhall','Volkswagen','Volvo','Other'];
  var MODELS = {
    'Abarth': ['595','695','124 Spider','500e'],
    'Alfa Romeo': ['Giulia','Stelvio','Tonale','Junior','Giulietta','4C'],
    'Alpine': ['A110'],
    'Aston Martin': ['DB12','DB11','DBS','DBS Superleggera','DB9','DB7','Vanquish','Virage','Vantage','V8 Vantage','V12 Vantage','DBX','DBX707','Rapide','Valhalla','Valkyrie','One-77','Cygnet','Lagonda'],
    'Audi': ['A1','A2','A3','A4','A4 Allroad','A5','A6','A6 Allroad','A7','A8','Q2','Q3','Q4 e-tron','Q5','Q7','Q8','e-tron','Q8 e-tron','e-tron GT','TT','TT RS','R8','S3','S4','S5','S6','S7','S8','SQ5','SQ7','SQ8','RS3','RS4','RS5','RS6','RS7','RS Q3','RS Q8'],
    'Bentley': ['Continental GT','Continental GTC','Continental Flying Spur','Flying Spur','Bentayga','Bentayga EWB','Mulsanne','Arnage','Azure','Brooklands','Batur'],
    'BMW': ['1 Series','1M','2 Series','2 Series Active Tourer','2 Series Gran Coupe','3 Series','4 Series','5 Series','6 Series','7 Series','8 Series','X1','X2','X3','X4','X5','X6','X7','Z4','i3','i4','i5','i7','i8','iX','iX1','iX2','iX3','M2','M3','M4','M5','M6','M8','XM','Z3'],
    'BYD': ['Atto 3','Dolphin','Seal','Sealion 7','Han'],
    'Citroën': ['C3','C3 Aircross','C4','ë-C4','C5 Aircross','Berlingo'],
    'Cupra': ['Born','Formentor','Leon','Ateca','Tavascan','Terramar'],
    'Dacia': ['Sandero','Duster','Jogger','Spring'],
    'DS': ['DS 3','DS 4','DS 7','DS 9'],
    'Ferrari': ['Roma','Roma Spider','Portofino','Portofino M','296 GTB','296 GTS','SF90 Stradale','SF90 Spider','F8 Tributo','F8 Spider','488 GTB','488 Pista','488 Spider','458 Italia','458 Speciale','458 Spider','812 Superfast','812 GTS','12Cilindri','Purosangue','California','California T','GTC4Lusso','FF','F12berlinetta','599 GTB','612 Scaglietti','LaFerrari'],
    'Fiat': ['500','500e','Panda','Tipo','600','Doblo'],
    'Ford': ['Fiesta','Focus','Puma','Kuga','Mustang','Mustang Mach-E','Explorer','Ranger','Transit','Tourneo','Ka','S-Max'],
    'Genesis': ['G70','G80','G90','GV60','GV70','GV80'],
    'Honda': ['Jazz','Civic','HR-V','CR-V','ZR-V','e:Ny1'],
    'Hyundai': ['i10','i20','i30','Kona','Tucson','Santa Fe','Ioniq 5','Ioniq 6','Bayon','Nexo'],
    'Jaguar': ['XE','XF','XJ','XK','XK8','XKR','XKR-S','E-Pace','F-Pace','I-Pace','F-Type','S-Type','X-Type'],
    'Jeep': ['Renegade','Compass','Wrangler','Grand Cherokee','Avenger'],
    'Kia': ['Picanto','Rio','Ceed','XCeed','Stonic','Soul','Sportage','Sorento','Niro','EV6','EV9'],
    'Lamborghini': ['Huracan','Huracan Sterrato','Urus','Revuelto','Temerario','Aventador','Gallardo','Murcielago','Sian','Countach'],
    'Land Rover': ['Defender','Defender 90','Defender 110','Defender 130','Discovery','Discovery Sport','Discovery 4','Freelander','Range Rover','Range Rover Sport','Range Rover Velar','Range Rover Evoque'],
    'Lexus': ['CT','IS','ES','LS','UX','NX','RX','RZ','LC','LBX'],
    'Lotus': ['Emira','Eletre','Emeya','Evija'],
    'Maserati': ['Ghibli','Quattroporte','Levante','Grecale','MC20','MC20 Cielo','GranTurismo','GranCabrio','Coupe','Spyder','3200 GT'],
    'Mazda': ['2','3','6','CX-3','CX-30','CX-5','CX-60','CX-80','MX-5','MX-30'],
    'McLaren': ['Artura','720S','750S','765LT','GT','GTS','570S','570GT','600LT','540C','650S','675LT','12C','620R','P1','Senna','Elva','Speedtail'],
    'Mercedes-Benz': ['A-Class','B-Class','C-Class','CLA','CLE','CLK','CL','CLS','E-Class','S-Class','Maybach S-Class','SL','SLC','SLK','SLS AMG','SLR McLaren','AMG GT','AMG GT 4-Door','G-Class','GLA','GLB','GLC','GLE','GLS','GLK','ML','R-Class','V-Class','Vito','X-Class','Citan','EQA','EQB','EQC','EQE','EQE SUV','EQS','EQS SUV','EQV'],
    'MG': ['MG3','MG4','MG5','ZS','HS','Cyberster','Marvel R'],
    'MINI': ['Cooper','Cooper SE','Clubman','Countryman','Convertible','Aceman'],
    'Mitsubishi': ['Mirage','ASX','Eclipse Cross','Outlander'],
    'Nissan': ['Micra','Juke','Qashqai','X-Trail','Leaf','Ariya','Townstar','GT-R','370Z'],
    'Peugeot': ['208','e-208','308','408','508','2008','e-2008','3008','5008','Rifter'],
    'Polestar': ['Polestar 2','Polestar 3','Polestar 4'],
    'Porsche': ['911','718 Cayman','718 Boxster','718 Spyder','718 Cayman GT4','Cayman','Boxster','Panamera','Macan','Macan Electric','Cayenne','Cayenne Coupe','Taycan','Carrera GT','918 Spyder','944','928','968'],
    'Range Rover': ['Range Rover','Range Rover Sport','Range Rover Velar','Range Rover Evoque'],
    'Renault': ['Clio','Captur','Megane','Megane E-Tech','Austral','Arkana','Scenic','Espace','Zoe'],
    'Rolls-Royce': ['Ghost','Phantom','Cullinan','Spectre','Wraith','Dawn','Corniche','Park Ward','Silver Seraph','Silver Shadow'],
    'SEAT': ['Ibiza','Leon','Arona','Ateca','Tarraco'],
    'Škoda': ['Fabia','Octavia','Scala','Kamiq','Karoq','Kodiaq','Superb','Enyaq','Elroq'],
    'Smart': ['#1','#3','ForTwo','ForFour'],
    'SsangYong': ['Tivoli','Korando','Rexton','Musso','Torres'],
    'Subaru': ['Impreza','XV','Forester','Outback','Solterra','BRZ'],
    'Suzuki': ['Ignis','Swift','Vitara','S-Cross','Jimny','Across','Swace'],
    'Tesla': ['Model 3','Model Y','Model S','Model X','Cybertruck'],
    'Toyota': ['Aygo X','Yaris','Yaris Cross','Corolla','C-HR','RAV4','Camry','Highlander','bZ4X','Prius','GR86','GR Yaris','GR Supra','Hilux','Land Cruiser','Proace'],
    'Vauxhall': ['Corsa','Corsa Electric','Astra','Mokka','Crossland','Grandland','Combo','Vivaro'],
    'Volkswagen': ['Up','Polo','Polo GTI','Golf','Golf GTI','Golf R','Scirocco','Beetle','CC','Arteon','Passat','Phaeton','Eos','Taigo','T-Cross','T-Roc','Tiguan','Touareg','Touran','Sharan','Amarok','Caddy','ID.3','ID.4','ID.5','ID.7','ID.Buzz'],
    'Volvo': ['XC40','XC60','XC90','S60','S90','V60','V90','C40','EX30','EX40','EC40','EX90'],
    'Other': []
  };

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var form = document.getElementById('assessForm');
    var btn  = document.getElementById('assessSubmit');
    var ok   = document.getElementById('formOk');
    if (!form || !btn) return; // page has no enquiry form

    // ---- Vehicle make / model searchable dropdowns ----
    var mk = document.getElementById('mk');
    var md = document.getElementById('md');
    var makeList = document.getElementById('makeList');
    var modelList = document.getElementById('modelList');
    function fill(list, items) {
      if (!list) return;
      list.innerHTML = '';
      (items || []).forEach(function (v) {
        var o = document.createElement('option');
        o.value = v;
        list.appendChild(o);
      });
    }
    if (makeList) fill(makeList, MAKES);
    function refreshModels() {
      var key = (mk && mk.value || '').trim();
      var match = Object.keys(MODELS).filter(function (k) { return k.toLowerCase() === key.toLowerCase(); })[0];
      fill(modelList, MODELS[match] || []);
    }
    if (mk) { mk.addEventListener('input', refreshModels); mk.addEventListener('change', refreshModels); }

    // ---- Delivery method toggle (WhatsApp / Email) drives the submit button ----
    function selectedVia() {
      var r = form.querySelector('input[name="via"]:checked');
      return r ? r.value : 'whatsapp';
    }
    var labelEl = btn.querySelector('[data-submit-label]');
    var icWa = btn.querySelector('[data-ic-wa]');
    var icMail = btn.querySelector('[data-ic-mail]');
    /* Same dash cam handoff as the homepage wizard: this form has no camera or
       coverage questions, so ticking Dash Camera continues to the configurator
       with everything prefilled instead of ending the enquiry here. */
    var DASHCAM = /dash ?cam/i;
    function toDashCam() {
      return Array.prototype.slice.call(form.querySelectorAll('input[name="interest"]:checked'))
                  .some(function (c) { return DASHCAM.test(c.value); });
    }
    function syncBtn() {
      var via = selectedVia();
      var wa = via === 'whatsapp';
      var dash = toDashCam();
      var waTxt = btn.getAttribute('data-wa-label') || 'Send on WhatsApp';
      var emTxt = btn.getAttribute('data-email-label') || 'Send by email';
      if (labelEl) labelEl.textContent = dash ? 'Dash cam options' : (wa ? waTxt : emTxt);
      if (icWa) icWa.style.display = (!dash && wa) ? '' : 'none';
      if (icMail) icMail.style.display = (!dash && !wa) ? '' : 'none';
      btn.classList.toggle('btn-wa', !dash && wa);
      btn.classList.toggle('btn-silver', dash || !wa);
      if (window.lucide) lucide.createIcons();
    }
    form.querySelectorAll('input[name="via"]').forEach(function (r) {
      r.addEventListener('change', syncBtn);
    });
    form.querySelectorAll('input[name="interest"]').forEach(function (c) {
      c.addEventListener('change', syncBtn);
    });
    syncBtn();

    // ---- Multi-step wizard ----
    var STEP_TITLES = ['Your details', 'Your vehicle', 'What you need'];
    var TOTAL = 3, cur = 1;
    var backBtn = form.querySelector('[data-wiz-back]');
    var nextBtn = form.querySelector('[data-wiz-next]');
    var titleEl = form.querySelector('[data-step-title]');
    var numEl   = form.querySelector('[data-step-num]');
    var fillEl  = form.querySelector('[data-prog-fill]');
    var dots    = form.querySelectorAll('.wiz-dots li');
    var panels  = form.querySelectorAll('[data-step-panel]');

    function showStep(n) {
      cur = n;
      panels.forEach(function (p) { p.hidden = (+p.getAttribute('data-step-panel') !== n); });
      if (titleEl) titleEl.textContent = STEP_TITLES[n - 1];
      if (numEl) numEl.textContent = n;
      if (fillEl) fillEl.style.width = (n / TOTAL * 100) + '%';
      dots.forEach(function (d, i) { d.classList.toggle('cur', i === n - 1); d.classList.toggle('done', i < n - 1); });
      var last = (n === TOTAL);
      if (backBtn) backBtn.hidden = (n === 1);
      if (nextBtn) nextBtn.hidden = last;
      btn.hidden = !last; // submit shows only on the final step
      clearError();
      // move focus to first field of the new step for keyboard/AT users
      var first = panels[n - 1] && panels[n - 1].querySelector('input, select, textarea');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
      if (window.lucide) lucide.createIcons();
    }

    function stepValid(n) {
      function need(id, label) {
        var el = document.getElementById(id);
        if (!el || !el.value.trim()) { showError('Please add ' + label + '.', el); return false; }
        return true;
      }
      if (n === 1) {
        if (!need('n', 'your name')) return false;
        if (!need('e', 'your email')) return false;
        var em = document.getElementById('e');
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim())) { showError('Please enter a valid email address.', em); return false; }
        if (!need('t', 'your mobile number')) return false;
        if (!need('pc', 'your postcode')) return false;
        return true;
      }
      if (n === 2) {
        if (!need('mk', 'the vehicle make')) return false;
        if (!need('md', 'the model')) return false;
        if (!need('y', 'the year')) return false;
        var yr = document.getElementById('y');
        if (yr && !/^(19|20)\d{2}$/.test(yr.value.trim())) { showError('Please enter a valid 4-digit year, e.g. 2021.', yr); return false; }
        if (!need('fuel', 'the fuel type')) return false;
        if (!need('r', 'the registration')) return false;
        return true;
      }
      return true;
    }

    // Only wire the wizard on pages that actually use the stepped markup.
    if (panels.length) {
      if (nextBtn) nextBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!stepValid(cur)) return;
        showStep(Math.min(cur + 1, TOTAL));
      });
      if (backBtn) backBtn.addEventListener('click', function (e) {
        e.preventDefault();
        showStep(Math.max(cur - 1, 1));
      });
      // Enter advances through steps (and submits on the last)
      form.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (cur < TOTAL) { if (stepValid(cur)) showStep(cur + 1); }
        else btn.click();
      });
      showStep(1);
    }

    function labelFor(el) {
      if (LABELS[el.id]) return LABELS[el.id];
      var lab = form.querySelector('label[for="' + el.id + '"]');
      return lab ? lab.textContent.trim() : (el.name || el.id || 'Field');
    }

    function clearError() {
      var e = document.getElementById('formErr');
      if (e) e.remove();
      form.querySelectorAll('input, select, textarea').forEach(function (el) {
        el.style.borderColor = '';
      });
    }

    function showError(msg, focusEl) {
      if (focusEl) { focusEl.style.borderColor = '#d35a5e'; focusEl.focus(); }
      var e = document.getElementById('formErr');
      if (!e) {
        e = document.createElement('div');
        e.id = 'formErr';
        e.style.cssText = 'margin-top:12px;font-size:13.5px;line-height:1.5;color:#e07b7e';
        btn.parentNode.insertBefore(e, btn.nextSibling);
      }
      e.textContent = msg;
    }

    function deliver(text) {
      // WhatsApp delivery — opens in a new tab / the WhatsApp app, prefilled.
      window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text),
                  '_blank', 'noopener');
    }

    function emailBackup(fields, pageRef) {
      // Silent email copy via FormSubmit — fire-and-forget, never blocks the UX.
      var payload = {};
      for (var k in fields) { if (fields.hasOwnProperty(k)) payload[k] = fields[k]; }
      payload._subject = 'New website enquiry — ' + pageRef;
      payload._template = 'table';
      payload._captcha = 'false';
      try {
        fetch('https://formsubmit.co/ajax/' + ENQUIRY_EMAIL, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function () {});
      } catch (e) { /* offline / blocked — WhatsApp copy still delivered */ }
    }

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      clearError();

      var bad = badPerson(form);
      if (bad) { showError(bad.msg, bad.el); return; }

      var controls = form.querySelectorAll('input, select, textarea');
      var lines = [], fields = {}, filledCount = 0, hasContact = false, firstEmpty = null;

      var titleEl = form.querySelector('[data-title]');
      var surEl = form.querySelector('[data-surname]');
      controls.forEach(function (el) {
        if (el.name === 'via' || el.type === 'checkbox' || el.type === 'hidden') return; // toggle / honeypot
        if (el === titleEl || el === surEl) return;    // merged into the name below
        var val = (el.value || '').trim();
        if (!val) { if (!firstEmpty) firstEmpty = el; return; }
        filledCount++;
        var label = labelFor(el);
        if (/^(name|full name|first name|your name|contact name)$/i.test(label)) { label = 'Name'; val = personName(form); }
        if (el.type === 'email' || el.type === 'tel' || /mail|mobile|phone/i.test(label)) {
          hasContact = true;
        }
        lines.push(label + ': ' + val);
        fields[label] = val;
      });

      if (filledCount === 0) {
        showError('Please add your details so we can get back to you.', form.querySelector('input'));
        return;
      }
      if (!hasContact) {
        showError('Please add a phone number or email so we can reply.',
                  form.querySelector('input[type="tel"], input[type="email"]') || firstEmpty);
        return;
      }
      var emEl = form.querySelector('input[type="email"]');
      if (emEl) {
        var emBad = badEmail(emEl.value);
        if (emBad) { showError(emBad, emEl); return; }
      }

      var noFound = badFound(form);
      if (noFound) { showError(noFound.msg, noFound.el); return; }

      var interest = Array.prototype.slice.call(form.querySelectorAll('input[name="interest"]:checked')).map(function (c) { return c.value; });
      if (form.querySelector('input[name="interest"]') && !interest.length) {
        showError('Please choose at least one service you\u2019re interested in.');
        return;
      }
      if (interest.length) { fields['Interested in'] = interest.join(', '); lines.push('Interested in: ' + interest.join(', ')); }

      var photoCb = form.querySelector('#cpphoto');
      if (photoCb && photoCb.checked) {
        fields['Photos'] = 'Customer will send dashboard & infotainment menu photos';
        lines.push('Photos: dashboard & infotainment menu to follow');
      }

      var via = selectedVia();
      fields['Preferred reply'] = via === 'whatsapp' ? 'WhatsApp' : 'Email';
      lines.push('Preferred reply: ' + fields['Preferred reply']);

      var pageRef = (document.title || '').split('|')[0].trim() || location.pathname;
      var text = 'New enquiry from acrautomobile.com (' + pageRef + ')\n\n' + lines.join('\n');

      // service label identifies WHICH enquiry in the CRM: interests, else the form's eyebrow (e.g. "Apple CarPlay enquiry"), else a sensible default
      var ebEl = form.querySelector('.eyebrow');
      var svcLabel = fields['Interested in'] || (ebEl && ebEl.textContent.trim()) || 'Vehicle Security Assessment';
      var crmKey = crmUpload(fields, svcLabel); // → CRM (Google Sheet)

      /* Dash cam: hand over with the details prefilled. The row above means the
         lead cannot be lost if they stop there; the configurator then completes
         that same row and sends the one email, so a single enquiry stays a
         single entry in the CRM and a single message in the inbox. */
      if (toDashCam()) {
        var pick = function (sel) { var el = form.querySelector(sel); return el ? (el.value || '').trim() : ''; };
        var hq = new URLSearchParams();
        var carry = {
          title: pick('[data-title]'), first: pick('[data-first]'), surname: pick('[data-surname]'),
          email: fields['Email'], mobile: fields['Mobile'],
          postcode: fields['Postcode'], make: fields['Make'], model: fields['Model'],
          year: fields['Year'], via: via, key: crmKey,
          found: fields['How did you find us?'],
          also: interest.filter(function (v) { return !DASHCAM.test(v); }).join(', ')
        };
        Object.keys(carry).forEach(function (k) { if (carry[k] && carry[k] !== '—') hq.set(k, carry[k]); });
        location.href = '/dash-camera-installation-london#' + hq.toString();
        return;
      }

      if (via === 'whatsapp') {
        deliver(text);               // opens WhatsApp prefilled (keeps the user gesture)
        emailBackup(fields, pageRef); // + silent email copy to ACR
      } else {
        emailBackup(fields, pageRef); // email only
      }

      // Tailor the confirmation to the chosen channel
      if (ok) {
        var okMsg = ok.querySelector('[data-ok-msg]');
        if (okMsg) {
          okMsg.textContent = via === 'whatsapp'
            ? 'We\u2019ve opened WhatsApp with your details — just hit send. A security specialist will reply the same day with your Meta Trak recommendation, price and fitting slot.'
            : 'Thanks — your request is on its way to our team. A security specialist will email you back the same day with your Meta Trak recommendation, price and fitting slot.';
        }
      }

      form.style.display = 'none';
      if (ok) ok.style.display = 'block';
      if (window.lucide) lucide.createIcons();
    });
  });

  // ---- Dash cam configurator (dash-camera page) ----
  ready(function () {
    var form = document.getElementById('dashForm');
    if (!form) return;
    var btn = document.getElementById('dashSubmit');
    var ok  = document.getElementById('dashOk');
    var dmk = document.getElementById('dmk');
    var dmd = document.getElementById('dmd');
    var dy  = document.getElementById('dy');
    var dn  = document.getElementById('dn');
    var dsur = document.getElementById('dsur');
    var de  = document.getElementById('de');
    var dt  = document.getElementById('dt');
    var dpc = document.getElementById('dpc');

    /* Arriving from the homepage wizard: it has already taken their details and
       logged the lead, and passes them here in the URL hash (never the query
       string, so nothing extra can be crawled or indexed). All they have left to
       do is pick the camera and coverage. */
    var alsoWanted = '', carriedKey = '';
    (function prefill() {
      var raw = (location.hash || '').replace(/^#/, '');
      if (!raw || raw.indexOf('=') === -1) return;
      var q;
      try { q = new URLSearchParams(raw); } catch (e) { return; }
      var set = function (el, v) { if (el && v && !el.value) el.value = v; };
      set(dmk, q.get('make')); set(dmd, q.get('model')); set(dy, q.get('year'));
      set(dn, q.get('first') || q.get('name'));  set(dsur, q.get('surname'));
      set(de, q.get('email'));
      set(dt, q.get('mobile')); set(dpc, q.get('postcode'));
      var tEl = form.querySelector('[data-title]');
      if (tEl && q.get('title') && !tEl.value) tEl.value = q.get('title');
      var fEl = form.querySelector('[data-found]');
      if (fEl && q.get('found') && !fEl.value) fEl.value = q.get('found');
      alsoWanted = q.get('also') || '';
      carriedKey = q.get('key') || '';
      var viaWanted = q.get('via');
      if (viaWanted) {
        var r = form.querySelector('input[name="dvia"][value="' + viaWanted + '"]');
        if (r) r.checked = true;
      }
      if (!q.get('make') && !q.get('first') && !q.get('name')) return;

      /* The enquiry is already logged and on the board by the time they land
         here, so say so and list back what we have. Without that, being asked
         for the same details twice reads as though the first form did nothing.
         Built with textContent rather than innerHTML: these values come from the
         URL. */
      var note = document.createElement('div');
      note.className = 'cfg-prefill';
      note.style.cssText = 'margin:0 0 18px;padding:14px 16px;border-radius:10px;font-size:13.5px;line-height:1.55;'
        + 'background:var(--secure-soft,rgba(47,161,204,.08));border:1px solid rgba(47,161,204,.3);color:var(--text-secondary)';

      var head = document.createElement('strong');
      head.style.cssText = 'display:block;color:var(--text-primary);margin-bottom:6px';
      head.textContent = 'Got it — your enquiry is already with us.';
      note.appendChild(head);

      var noted = [];
      var who = [q.get('title'), q.get('first') || q.get('name'), q.get('surname')].filter(Boolean).join(' ');
      var reach = [q.get('mobile'), q.get('email')].filter(Boolean).join(' · ');
      if (who || reach) noted.push('Your details' + (who ? ' — ' + who : '') + (reach ? ' (' + reach + ')' : ''));
      var veh = [q.get('make'), q.get('model'), q.get('year')].filter(Boolean).join(' ');
      if (veh) noted.push('Your vehicle — ' + veh + (q.get('postcode') ? ', ' + q.get('postcode') : ''));
      if (alsoWanted) noted.push('Also noted — ' + alsoWanted);

      if (noted.length) {
        var ul = document.createElement('ul');
        ul.style.cssText = 'margin:0 0 8px;padding-left:18px';
        noted.forEach(function (line) {
          var li = document.createElement('li');
          li.style.margin = '2px 0';
          li.textContent = line;                     /* never innerHTML - URL data */
          ul.appendChild(li);
        });
        note.appendChild(ul);
      }

      var ask = document.createElement('span');
      ask.textContent = 'A dash cam quote needs two more answers — pick your camera and coverage below and send, '
        + 'and we\u2019ll reply about ' + (alsoWanted ? 'all of it together.' : 'it the same day.');
      note.appendChild(ask);
      form.parentNode.insertBefore(note, form);
      if (form.scrollIntoView) { try { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    })();

    function dfill(list, items) {
      if (!list) return;
      list.innerHTML = '';
      (items || []).forEach(function (v) { var o = document.createElement('option'); o.value = v; list.appendChild(o); });
    }
    dfill(document.getElementById('dashMakeList'), MAKES);
    function refreshModels() {
      var key = (dmk && dmk.value || '').trim();
      var match = Object.keys(MODELS).filter(function (k) { return k.toLowerCase() === key.toLowerCase(); })[0];
      dfill(document.getElementById('dashModelList'), MODELS[match] || []);
    }
    if (dmk) dmk.addEventListener('input', refreshModels);

    var liveCb = form.querySelector('input[name="live"]');
    var liveWrap = form.querySelector('[data-liveview-wrap]');
    function sum(key, val) { var el = form.querySelector('[data-sum="' + key + '"]'); if (el) el.textContent = val; }
    function get(name) { var r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }

    function refresh() {
      var camEl = form.querySelector('input[name="cam"]:checked');
      sum('cam', camEl ? camEl.value : '\u2014');
      sum('cov', get('cov') || '\u2014');
      sum('bat', get('bat') || 'None');
      var isU = !!(camEl && camEl.getAttribute('data-liveview') === '1');
      if (liveCb) liveCb.disabled = !isU;
      if (!isU && liveCb) liveCb.checked = false;
      if (liveWrap) liveWrap.classList.toggle('dis', !isU);
      sum('live', (liveCb && liveCb.checked) ? 'Yes' : (isU ? 'No' : 'U3000 PRO only'));
      sum('price', camEl ? ('\u00a3' + camEl.getAttribute('data-base')) : '\u00a3159.99');
      var mk = (dmk && dmk.value || '').trim(), md = (dmd && dmd.value || '').trim();
      var yr = (dy && dy.value || '').trim();
      sum('veh', (mk || md || yr) ? [mk, md, yr].filter(Boolean).join(' ') : '\u2014');
    }
    form.addEventListener('change', refresh);
    form.addEventListener('input', refresh);
    refresh();

    function derr(msg, el) {
      var e = document.getElementById('dashErr');
      if (!e) { e = document.createElement('div'); e.id = 'dashErr'; e.style.cssText = 'margin-top:12px;font-size:13.5px;color:#e07b7e'; btn.parentNode.insertBefore(e, btn.nextSibling); }
      e.textContent = msg;
      if (el) el.focus();
    }
    function deliverWA(text) { window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text), '_blank', 'noopener'); }
    function dashVia() { var r = form.querySelector('input[name="dvia"]:checked'); return r ? r.value : 'whatsapp'; }
    var dashLabel = btn.querySelector('[data-dash-label]');
    function syncDash() {
      var wa = dashVia() === 'whatsapp';
      if (dashLabel) dashLabel.textContent = wa ? 'Send on WhatsApp' : 'Send by email';
      btn.classList.toggle('btn-wa', wa); btn.classList.toggle('btn-silver', !wa);
    }
    form.querySelectorAll('input[name="dvia"]').forEach(function (r) { r.addEventListener('change', syncDash); });
    syncDash();
    function emailCopy(fields) {
      var payload = {}; for (var k in fields) if (fields.hasOwnProperty(k)) payload[k] = fields[k];
      payload._subject = 'New dash cam enquiry \u2014 acrautomobile.com';
      payload._template = 'table'; payload._captcha = 'false';
      try {
        fetch('https://formsubmit.co/ajax/' + ENQUIRY_EMAIL, {
          method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload)
        }).catch(function () {});
      } catch (e) {}
    }

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      var pe = document.getElementById('dashErr'); if (pe) pe.remove();
      var cam = get('cam'), cov = get('cov');
      var email = (de && de.value || '').trim();
      var mob   = (dt && dt.value || '').trim();
      var mk = (dmk && dmk.value || '').trim();
      var yr = (dy && dy.value || '').trim();
      if (!cam) { derr('Please choose a camera \u2014 Q200 or U3000 PRO.'); return; }
      if (!cov) { derr('Please choose front, or front & rear.'); return; }
      if (!mk) { derr('Please tell us the vehicle make the camera is for.', dmk); return; }
      /* The year decides the wiring and where the camera can be hidden, so it is
         asked for here as well as in the wizard. */
      if (!yr) { derr('Please add the vehicle year.', dy); return; }
      if (!/^(19|20)\d{2}$/.test(yr)) { derr('Please enter a valid 4-digit year, e.g. 2021.', dy); return; }
      var pBad = badPerson(form);
      if (pBad) { derr(pBad.msg, pBad.el); return; }
      var eBad = badEmail(email);
      if (eBad) { derr(eBad, de); return; }
      /* This handler builds its own fields object, so it needs its own check -
         the generic one in the assessment handler does not run here. Without it
         the field was mandatory on 25 forms and optional on this one. */
      var fBad = badFound(form);
      if (fBad) { derr(fBad.msg, fBad.el); return; }
      var foundEl = form.querySelector('[data-found]');
      var foundVal = foundEl ? (foundEl.value || '').trim() : '';
      var live = (liveCb && !liveCb.disabled && liveCb.checked) ? 'Yes' : 'No';
      /* Same order as the security assessment's message \u2014 who they are, how to
         reach them, the vehicle, then what they want \u2014 so an enquiry that came
         through both forms reads identically. */
      var fields = {
        Name: personName(form) || '\u2014',
        Email: email, Mobile: mob || '\u2014',
        Postcode: (dpc && dpc.value || '').trim() || '\u2014',
        Make: mk, Model: (dmd && dmd.value || '').trim() || '\u2014', Year: yr,
        Camera: cam, Coverage: cov, 'External battery': get('bat') || 'None',
        'Live remote view': live
      };
      /* Anything else they ticked on the form that sent them here. */
      if (alsoWanted) fields['Also interested in'] = alsoWanted;
      /* Last, matching where the other forms put it, so an enquiry that came
         through both reads identically. crmUpload() picks it up from here by
         label, so the direct-visitor path needs no extra wiring. */
      if (foundVal) fields['How did you find us?'] = foundVal;
      var lines = [];
      for (var k in fields) if (fields.hasOwnProperty(k)) lines.push(k + ': ' + fields[k]);
      var text = 'New dash cam enquiry from acrautomobile.com\n\n' + lines.join('\n');
      fields['Preferred reply'] = dashVia() === 'whatsapp' ? 'WhatsApp' : 'Email';
      var svc = 'Dash Cam' + (fields.Camera ? ' \u2014 ' + fields.Camera : '');
      if (carriedKey) {
        /* Complete the row the previous form already wrote \u2014 one enquiry, one CRM
           entry. The camera spec has no columns of its own, so it goes into
           details, where the CRM card shows it. */
        crmUpdate(carriedKey, {
          service: svc, email: email, mobile: mob,
          postcode: (dpc && dpc.value || '').trim(),
          make: mk, model: (dmd && dmd.value || '').trim(), year: yr,
          preferredReply: fields['Preferred reply'],
          foundVia: foundVal,
          details: ['Coverage: ' + cov, 'Battery: ' + (get('bat') || 'None'), 'Live view: ' + live]
                     .concat(alsoWanted ? ['Also interested in: ' + alsoWanted] : []).join(' \u00b7 ')
        });
      } else {
        crmUpload(fields, svc);                   // → CRM (Google Sheet)
      }
      emailCopy(fields);                          // the one email copy to ACR
      if (dashVia() === 'whatsapp') deliverWA(text); // + open WhatsApp prefilled when chosen
      form.style.display = 'none';
      if (ok) ok.style.display = 'block';
      if (window.lucide) lucide.createIcons();
    });
  });

  // ---- Concierge enquiry form (concierge page) ----
  ready(function () {
    var form = document.getElementById('conciergeForm');
    if (!form) return;
    var btn = document.getElementById('conciergeSubmit');
    var ok  = document.getElementById('conciergeOk');
    var labelEl = btn.querySelector('[data-submit-label]');
    var icWa = btn.querySelector('[data-ic-wa]'), icMail = btn.querySelector('[data-ic-mail]');
    function selVia() { var r = form.querySelector('input[name="cvia"]:checked'); return r ? r.value : 'whatsapp'; }
    function syncB() {
      var wa = selVia() === 'whatsapp';
      if (labelEl) labelEl.textContent = wa ? 'Send on WhatsApp' : 'Send by email';
      if (icWa) icWa.style.display = wa ? '' : 'none';
      if (icMail) icMail.style.display = wa ? 'none' : '';
      btn.classList.toggle('btn-wa', wa); btn.classList.toggle('btn-silver', !wa);
      if (window.lucide) lucide.createIcons();
    }
    form.querySelectorAll('input[name="cvia"]').forEach(function (r) { r.addEventListener('change', syncB); });
    syncB();
    function cerr(msg, el) {
      var e = document.getElementById('cErr');
      if (!e) { e = document.createElement('div'); e.id = 'cErr'; e.style.cssText = 'margin-top:12px;font-size:13.5px;color:#e07b7e'; btn.parentNode.insertBefore(e, btn.nextSibling); }
      e.textContent = msg; if (el) el.focus();
    }
    function deliverWA(t) { window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(t), '_blank', 'noopener'); }
    function emailCopy(f) {
      var p = {}; for (var k in f) if (f.hasOwnProperty(k)) p[k] = f[k];
      p._subject = 'New concierge enquiry \u2014 acrautomobile.com'; p._template = 'table'; p._captcha = 'false';
      try { fetch('https://formsubmit.co/ajax/' + ENQUIRY_EMAIL, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(p) }).catch(function () {}); } catch (e) {}
    }
    var V = function (id) { return (document.getElementById(id).value || '').trim(); };
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      var pe = document.getElementById('cErr'); if (pe) pe.remove();
      var name = personName(form), tel = V('cc-tel'), email = V('cc-email');
      var svcs = Array.prototype.slice.call(form.querySelectorAll('input[name="cservice"]:checked')).map(function (c) { return c.value; });
      var pBad = badPerson(form);
      if (pBad) { cerr(pBad.msg, pBad.el); return; }
      var eBad = badEmail(email);
      if (eBad) { cerr(eBad, document.getElementById('cc-email')); return; }
      if (!svcs.length) { cerr('Please select at least one service.'); return; }
      var via = selVia();
      var fields = {
        Name: name, Mobile: tel || '\u2014', Email: email || '\u2014',
        Vehicle: V('cc-veh') || '\u2014', Postcode: V('cc-pc') || '\u2014',
        Services: svcs.join(', '), Details: V('cc-msg') || '\u2014',
        'Preferred reply': via === 'whatsapp' ? 'WhatsApp' : 'Email'
      };
      var lines = []; for (var k in fields) if (fields.hasOwnProperty(k)) lines.push(k + ': ' + fields[k]);
      var text = 'New concierge enquiry from acrautomobile.com\n\n' + lines.join('\n');
      crmUpload(fields, 'Concierge' + (fields.Services ? ': ' + fields.Services : '')); // → CRM (Google Sheet)
      if (via === 'whatsapp') { deliverWA(text); emailCopy(fields); } else { emailCopy(fields); }
      form.style.display = 'none'; if (ok) ok.style.display = 'block';
      if (window.lucide) lucide.createIcons();
    });
  });
// ---- Battery & Recovery enquiry form (battery-recovery-concierge page) ----
  ready(function () {
    var form = document.getElementById('batteryForm');
    if (!form) return;
    var btn = document.getElementById('batterySubmit');
    var ok  = document.getElementById('batteryOk');
    // make/model searchable dropdowns
    var mk = document.getElementById('bt-make'), md = document.getElementById('bt-model');
    function bfill(list, items){ if(!list) return; list.innerHTML=''; (items||[]).forEach(function(v){var o=document.createElement('option');o.value=v;list.appendChild(o);}); }
    bfill(document.getElementById('makeList'), MAKES);
    function refreshM(){ var key=(mk&&mk.value||'').trim(); var match=Object.keys(MODELS).filter(function(k){return k.toLowerCase()===key.toLowerCase();})[0]; bfill(document.getElementById('modelList'), MODELS[match]||[]); }
    if (mk){ mk.addEventListener('input',refreshM); mk.addEventListener('change',refreshM); }
    var labelEl = btn.querySelector('[data-submit-label]');
    var icWa = btn.querySelector('[data-ic-wa]'), icMail = btn.querySelector('[data-ic-mail]');
    function selVia(){ var r=form.querySelector('input[name="bvia"]:checked'); return r?r.value:'whatsapp'; }
    function syncB(){ var wa=selVia()==='whatsapp'; if(labelEl)labelEl.textContent=wa?'Request assistance':'Send by email'; if(icWa)icWa.style.display=wa?'':'none'; if(icMail)icMail.style.display=wa?'none':''; btn.classList.toggle('btn-wa',wa); btn.classList.toggle('btn-silver',!wa); if(window.lucide)lucide.createIcons(); }
    form.querySelectorAll('input[name="bvia"]').forEach(function(r){ r.addEventListener('change',syncB); });
    syncB();
    function berr(msg, el){ var e=document.getElementById('batErr'); if(!e){e=document.createElement('div');e.id='batErr';e.style.cssText='margin-top:12px;font-size:13.5px;color:#e07b7e';btn.parentNode.insertBefore(e,btn.nextSibling);} e.textContent=msg; if(el)el.focus(); }
    function deliverWA(t){ window.open('https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(t),'_blank','noopener'); }
    function emailCopy(f){ var p={}; for(var k in f)if(f.hasOwnProperty(k))p[k]=f[k]; p._subject='New battery & recovery enquiry \u2014 acrautomobile.com'; p._template='table'; p._captcha='false'; try{ fetch('https://formsubmit.co/ajax/'+ENQUIRY_EMAIL,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(p)}).catch(function(){}); }catch(e){} }
    var V=function(id){ var el=document.getElementById(id); return el?(el.value||'').trim():''; };
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      var pe=document.getElementById('batErr'); if(pe)pe.remove();
      var name=personName(form), tel=V('bt-tel'), email=V('bt-email');
      var svcs=Array.prototype.slice.call(form.querySelectorAll('input[name="bservice"]:checked')).map(function(c){return c.value;});
      var urg=(form.querySelector('input[name="burgency"]:checked')||{}).value||'\u2014';
      var pBad = badPerson(form);
      if (pBad) { berr(pBad.msg, pBad.el); return; }
      var eBad = badEmail(email);
      if (eBad) { berr(eBad, document.getElementById('bt-email')); return; }
      var via=selVia();
      var fields={
        Name:name, Mobile:tel||'\u2014', Email:email||'\u2014',
        'Preferred contact': V('bt-cmethod')||'\u2014',
        Vehicle: (V('bt-make')+' '+V('bt-model')).trim()||'\u2014',
        Registration: V('bt-reg')||'\u2014', Year: V('bt-year')||'\u2014',
        'Assistance required': svcs.length?svcs.join(', '):'\u2014',
        Postcode: V('bt-pc')||'\u2014', Location: V('bt-loc')||'\u2014',
        Urgency: urg, Details: V('bt-msg')||'\u2014',
        'Preferred reply': via==='whatsapp'?'WhatsApp':'Email'
      };
      var lines=[]; for(var k in fields)if(fields.hasOwnProperty(k))lines.push(k+': '+fields[k]);
      var text='New battery & recovery enquiry from acrautomobile.com\n\n'+lines.join('\n');
      crmUpload(fields, 'Battery & Recovery' + (fields['Assistance required'] && fields['Assistance required'] !== '\u2014' ? ': ' + fields['Assistance required'] : '')); // → CRM
      if(via==='whatsapp'){ deliverWA(text); emailCopy(fields); } else { emailCopy(fields); }
      form.style.display='none'; if(ok)ok.style.display='block';
      if(window.lucide)lucide.createIcons();
    });
  });

  // ---- BMW & MINI enquiry form (BMW/MINI specialist pages) ----
  ready(function () {
    var form = document.getElementById('bmwForm');
    if (!form) return;
    var btn = document.getElementById('bmwSubmit');
    var ok  = document.getElementById('bmwOk');
    var labelEl = btn.querySelector('[data-submit-label]');
    var icWa = btn.querySelector('[data-ic-wa]'), icMail = btn.querySelector('[data-ic-mail]');
    function selVia(){ var r=form.querySelector('input[name="bmvia"]:checked'); return r?r.value:'whatsapp'; }
    function syncB(){ var wa=selVia()==='whatsapp'; if(labelEl)labelEl.textContent=wa?'Request assistance':'Send by email'; if(icWa)icWa.style.display=wa?'':'none'; if(icMail)icMail.style.display=wa?'none':''; btn.classList.toggle('btn-wa',wa); btn.classList.toggle('btn-silver',!wa); if(window.lucide)lucide.createIcons(); }
    form.querySelectorAll('input[name="bmvia"]').forEach(function(r){ r.addEventListener('change',syncB); });
    syncB();
    function berr(msg, el){ var e=document.getElementById('bmwErr'); if(!e){e=document.createElement('div');e.id='bmwErr';e.style.cssText='margin-top:12px;font-size:13.5px;color:#e07b7e';btn.parentNode.insertBefore(e,btn.nextSibling);} e.textContent=msg; if(el)el.focus(); }
    function deliverWA(t){ window.open('https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(t),'_blank','noopener'); }
    function emailCopy(f){ var p={}; for(var k in f)if(f.hasOwnProperty(k))p[k]=f[k]; p._subject='New BMW & MINI enquiry \u2014 acrautomobile.com'; p._template='table'; p._captcha='false'; try{ fetch('https://formsubmit.co/ajax/'+ENQUIRY_EMAIL,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(p)}).catch(function(){}); }catch(e){} }
    var V=function(id){ var el=document.getElementById(id); return el?(el.value||'').trim():''; };
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      var pe=document.getElementById('bmwErr'); if(pe)pe.remove();
      var name=personName(form), tel=V('bm-tel'), email=V('bm-email');
      var issues=Array.prototype.slice.call(form.querySelectorAll('input[name="bmissue"]:checked')).map(function(c){return c.value;});
      var pBad = badPerson(form);
      if (pBad) { berr(pBad.msg, pBad.el); return; }
      var eBad = badEmail(email);
      if (eBad) { berr(eBad, document.getElementById('bm-email')); return; }
      var via=selVia();
      var fields={
        Name:name, Mobile:tel||'\u2014', Email:email||'\u2014',
        Vehicle: (V('bm-make')+' '+V('bm-model')).trim()||'\u2014',
        Registration: V('bm-reg')||'\u2014', Year: V('bm-year')||'\u2014',
        'Issue type': issues.length?issues.join(', '):'\u2014',
        Details: V('bm-msg')||'\u2014',
        'Preferred reply': via==='whatsapp'?'WhatsApp':'Email'
      };
      var lines=[]; for(var k in fields)if(fields.hasOwnProperty(k))lines.push(k+': '+fields[k]);
      var text='New BMW & MINI enquiry from acrautomobile.com\n\n'+lines.join('\n');
      crmUpload(fields, 'BMW & MINI' + (fields['Issue type'] && fields['Issue type'] !== '\u2014' ? ': ' + fields['Issue type'] : '')); // → CRM
      if(via==='whatsapp'){ deliverWA(text); emailCopy(fields); } else { emailCopy(fields); }
      form.style.display='none'; if(ok)ok.style.display='block';
      if(window.lucide)lucide.createIcons();
    });
  });

  // ---- Referral, trade-rate and dealership enquiry forms ----
  ready(function () {
    function emailCopy(f, subject) {
      var p = {}; for (var k in f) if (f.hasOwnProperty(k)) p[k] = f[k];
      p._subject = 'New website enquiry \u2014 ' + subject;
      p._template = 'table'; p._captcha = 'false';
      try {
        fetch('https://formsubmit.co/ajax/' + ENQUIRY_EMAIL, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(p)
        }).catch(function () {});
      } catch (e) {}
    }
    function wire(cfg) {
      var form = document.getElementById(cfg.form);
      if (!form) return;
      var btn = document.getElementById(cfg.btn), ok = document.getElementById(cfg.ok);
      if (!btn) return;
      var labelEl = btn.querySelector('[data-submit-label]');
      var icWa = btn.querySelector('[data-ic-wa]'), icMail = btn.querySelector('[data-ic-mail]');
      function selVia() { var r = form.querySelector('input[name="' + cfg.via + '"]:checked'); return r ? r.value : 'whatsapp'; }
      function syncB() {
        var wa = selVia() === 'whatsapp';
        if (labelEl) labelEl.textContent = wa ? cfg.waLabel : 'Send by email';
        if (icWa) icWa.style.display = wa ? '' : 'none';
        if (icMail) icMail.style.display = wa ? 'none' : '';
        btn.classList.toggle('btn-wa', wa); btn.classList.toggle('btn-silver', !wa);
        if (window.lucide) lucide.createIcons();
      }
      form.querySelectorAll('input[name="' + cfg.via + '"]').forEach(function (r) { r.addEventListener('change', syncB); });
      syncB();
      function err(msg, id) {
        var e = document.getElementById(cfg.form + 'Err');
        if (!e) { e = document.createElement('div'); e.id = cfg.form + 'Err'; e.style.cssText = 'margin-top:12px;font-size:13.5px;line-height:1.5;color:#e07b7e'; btn.parentNode.insertBefore(e, btn.nextSibling); }
        e.textContent = msg;
        var el = id && document.getElementById(id);
        if (el) { el.style.borderColor = '#d35a5e'; el.focus(); }
      }
      function V(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var pe = document.getElementById(cfg.form + 'Err'); if (pe) pe.remove();
        form.querySelectorAll('input,select').forEach(function (el) { el.style.borderColor = ''; });
        var pBad = badPerson(form);
        if (pBad) { err(pBad.msg, pBad.el && pBad.el.id); return; }
        for (var i = 0; i < cfg.required.length; i++) {
          if (!V(cfg.required[i][0])) { err('Please add ' + cfg.required[i][1] + '.', cfg.required[i][0]); return; }
        }
        var em = V(cfg.emailId);
        var emBad = badEmail(em);
        if (emBad) { err(emBad, cfg.emailId); return; }
        /* Every form built by wire() gets this check, rather than each config
           remembering to ask for it. The referral and trade forms were silently
           dropping the answer because wire() assembles `fields` from an explicit
           list and this was not on it. */
        var fBad = badFound(form);
        if (fBad) { err(fBad.msg, fBad.el && fBad.el.id); return; }
        var via = selVia(), fields = {};
        cfg.fields.forEach(function (f) { fields[f[1]] = V(f[0]) || '—'; });
        if (fields['Name']) fields['Name'] = personName(form) || fields['Name'];
        if (cfg.checkboxes) {
          var picked = Array.prototype.slice.call(form.querySelectorAll('input[name="' + cfg.checkboxes[0] + '"]:checked')).map(function (c) { return c.value; });
          if (!picked.length) { err('Please choose at least one option.'); return; }
          fields[cfg.checkboxes[1]] = picked.join(', ');
        }
        var foundEl = form.querySelector('[data-found]');
        var foundVal = foundEl ? (foundEl.value || '').trim() : '';
        /* crmUpload() reads it by label, so this one line covers the message,
           the email copy and the CRM column. */
        if (foundVal) fields['How did you find us?'] = foundVal;
        fields['Preferred reply'] = via === 'whatsapp' ? 'WhatsApp' : 'Email';
        var lines = []; for (var k in fields) if (fields.hasOwnProperty(k)) lines.push(k + ': ' + fields[k]);
        var text = cfg.heading + '\n\n' + lines.join('\n');
        crmUpload(fields, cfg.service);                 // -> CRM (Google Sheet)
        emailCopy(fields, cfg.service);                 // ALWAYS a silent email copy to ACR
        if (via === 'whatsapp') window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        form.style.display = 'none'; if (ok) ok.style.display = 'block';
        if (window.lucide) lucide.createIcons();
      });
    }

    wire({
      form: 'referralForm', btn: 'referralSubmit', ok: 'referralOk', via: 'rvia',
      waLabel: 'Send referral', service: 'Customer Referral',
      heading: 'New customer referral from acrautomobile.com',
      emailId: 'rf-email', telId: 'rf-tel',
      required: [['rf-name', 'your name'], ['rf-fname', 'the name of the person you are referring'],
                 ['rf-ftel', 'their mobile number'], ['rf-need', 'what they need']],
      fields: [['rf-name', 'Name'], ['rf-tel', 'Mobile'], ['rf-email', 'Email'], ['rf-reg', 'Registration'],
               ['rf-fname', 'Referred name'], ['rf-ftel', 'Referred mobile'], ['rf-fveh', 'Referred vehicle'],
               ['rf-need', 'What they need'], ['rf-reward', 'Reward preference']]
    });

    wire({
      form: 'dealerForm', btn: 'dealerSubmit', ok: 'dealerOk', via: 'dlvia',
      waLabel: 'Send enquiry', service: 'Dealership Enquiry',
      heading: 'New dealership enquiry from acrautomobile.com',
      emailId: 'dl-email', telId: 'dl-tel',
      checkboxes: ['dlinterest', 'Interested in'],
      required: [['dl-biz', 'your dealership name'], ['dl-name', 'a contact name'], ['dl-type', 'the type of dealership'], ['dl-vol', 'how many vehicles you prepare each month (minimum 3)']],
      fields: [['dl-biz', 'Dealership'], ['dl-name', 'Name'], ['dl-role', 'Role'], ['dl-tel', 'Mobile'],
               ['dl-email', 'Email'], ['dl-pc', 'Postcode'], ['dl-vol', 'Vehicles per month'],
               ['dl-type', 'Dealership type'], ['dl-msg', 'Details']]
    });

    wire({
      form: 'tradeForm', btn: 'tradeSubmit', ok: 'tradeOk', via: 'tvia',
      waLabel: 'Send enquiry', service: 'Trade Rates Enquiry',
      heading: 'New trade rates enquiry from acrautomobile.com',
      emailId: 'tr-email', telId: 'tr-tel',
      required: [['tr-biz', 'your business name'], ['tr-name', 'a contact name'], ['tr-type', 'the type of business'], ['tr-vol', 'how many vehicles you handle each month (minimum 3)']],
      fields: [['tr-biz', 'Business'], ['tr-name', 'Name'], ['tr-tel', 'Mobile'], ['tr-email', 'Email'],
               ['tr-pc', 'Postcode'], ['tr-type', 'Business type'], ['tr-vol', 'Vehicles per month'], ['tr-msg', 'Details']]
    });
  });


  // ---- Referrals page: choose customer vs business before showing a form ----
  ready(function () {
    var cards = document.getElementById('whoCards');
    if (!cards) return;
    var radios = cards.querySelectorAll('input[name="who"]');
    function show(panelId, scroll) {
      radios.forEach(function (r) {
        var el = document.getElementById(r.getAttribute('data-panel'));
        if (!el) return;
        var on = r.getAttribute('data-panel') === panelId;
        el.hidden = !on;
        if (on) r.checked = true;
      });
      if (window.lucide) lucide.createIcons();
      if (scroll) {
        var t = document.getElementById(panelId);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    radios.forEach(function (r) {
      r.addEventListener('change', function () { show(r.getAttribute('data-panel'), false); });
    });
    function fromHash(scroll) {
      var h = (location.hash || '').replace('#', '');
      if (h === 'refer-form' || h === 'trade-form') { show(h, scroll); return true; }
      return false;
    }
    fromHash(false);
    window.addEventListener('hashchange', function () { fromHash(true); });
    // the two summary-card buttons link to #refer-form / #trade-form
    document.querySelectorAll('a[href="#refer-form"], a[href="#trade-form"]').forEach(function (a) {
      a.addEventListener('click', function () { show(a.getAttribute('href').replace('#', ''), true); });
    });
  });

})();