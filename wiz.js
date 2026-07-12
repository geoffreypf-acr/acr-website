/* ACR Automobile — multi-step assessment wizard (reusable).
   Drives every <form class="wiz-form"> on the page independently, so the hero
   and the lower assessment card can both run the 3-step flow without id clashes.
   Delivery: opens WhatsApp prefilled + fires a silent email copy via FormSubmit. */
(function () {
  var WA_NUMBER = '447468844431';
  var ENQUIRY_EMAIL = 'info@acrautomobile.com';
  /* Google Sheet logging — paste your Apps Script Web App URL (see SETUP-google-sheet.md). Leave '' to disable. */
  var SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbywkNnoW4Nn5injAeEHZszQZFjwdGxxOJJI1DHmb4Fgud3HUZJfYPQZAsRIdsnwtzsWDw/exec';
  var NL = String.fromCharCode(10);

  var MAKES = ['Aston Martin','Audi','Bentley','BMW','Ferrari','Ford','Jaguar','Lamborghini','Land Rover','Lexus','Maserati','McLaren','Mercedes-Benz','MINI','Porsche','Range Rover','Rolls-Royce','Tesla','Toyota','Volkswagen','Volvo','Other'];
  var MODELS = {
    'Aston Martin':['DB11','DB12','DBX','Vantage','DBS'],
    'Audi':['A3','A4','A6','A7','A8','Q3','Q5','Q7','Q8','e-tron GT','RS6','RS Q8'],
    'Bentley':['Continental GT','Flying Spur','Bentayga','Mulsanne'],
    'BMW':['1 Series','2 Series','3 Series','4 Series','5 Series','7 Series','X3','X5','X6','X7','M3','M4','M5','i4','iX'],
    'Ferrari':['Roma','Portofino','296 GTB','SF90','Purosangue','F8'],
    'Ford':['Fiesta','Focus','Puma','Kuga','Mustang','Ranger'],
    'Jaguar':['XE','XF','F-Pace','E-Pace','I-Pace','F-Type'],
    'Lamborghini':['Huracan','Urus','Revuelto'],
    'Land Rover':['Defender','Discovery','Discovery Sport','Range Rover','Range Rover Sport','Range Rover Velar','Range Rover Evoque'],
    'Lexus':['IS','ES','RX','NX','UX','LC','LS'],
    'Maserati':['Ghibli','Quattroporte','Levante','Grecale','MC20'],
    'McLaren':['570S','720S','750S','GT','Artura'],
    'Mercedes-Benz':['A-Class','C-Class','E-Class','S-Class','CLA','GLA','GLC','GLE','GLS','G-Class','AMG GT','EQE','EQS'],
    'MINI':['Cooper','Clubman','Countryman','Electric'],
    'Porsche':['911','718 Cayman','718 Boxster','Panamera','Macan','Cayenne','Taycan'],
    'Range Rover':['Range Rover','Range Rover Sport','Range Rover Velar','Range Rover Evoque'],
    'Rolls-Royce':['Ghost','Phantom','Cullinan','Spectre','Wraith','Dawn'],
    'Tesla':['Model 3','Model Y','Model S','Model X'],
    'Toyota':['Yaris','Corolla','C-HR','RAV4','Hilux','Land Cruiser'],
    'Volkswagen':['Polo','Golf','T-Roc','Tiguan','Touareg','ID.3','ID.4','ID.Buzz'],
    'Volvo':['XC40','XC60','XC90','V60','V90','EX30','EX90'],
    'Other':[]
  };

  function validEmail(v) {
    v = (v || '').trim();
    var at = v.indexOf('@'), dot = v.lastIndexOf('.');
    return at > 0 && dot > at + 1 && dot < v.length - 1;
  }

  function initWizard(form) {
    var card = form.parentElement;
    var ok = card.querySelector('[data-wiz-ok]');
    var panels = form.querySelectorAll('[data-step-panel]');
    if (!panels.length) return;
    var dots = form.querySelectorAll('.wiz-dots li');
    var backBtn = form.querySelector('[data-wiz-back]');
    var nextBtn = form.querySelector('[data-wiz-next]');
    var subBtn = form.querySelector('[data-wiz-submit]');
    var titleEl = form.querySelector('[data-step-title]');
    var numEl = form.querySelector('[data-step-num]');
    var fillEl = form.querySelector('[data-prog-fill]');
    var TITLES = ['Your details', 'Your vehicle', 'What you need'];
    var TOTAL = 3, cur = 1;

    // Make / model searchable lists
    var mk = form.querySelector('[data-field="make"]');
    var md = form.querySelector('[data-field="model"]');
    var makeList = mk && document.getElementById(mk.getAttribute('list'));
    var modelList = md && document.getElementById(md.getAttribute('list'));
    function fill(list, items) {
      if (!list) return;
      list.innerHTML = '';
      (items || []).forEach(function (v) { var o = document.createElement('option'); o.value = v; list.appendChild(o); });
    }
    fill(makeList, MAKES);
    function refreshModels() {
      var key = (mk && mk.value || '').trim();
      var m = Object.keys(MODELS).filter(function (k) { return k.toLowerCase() === key.toLowerCase(); })[0];
      fill(modelList, MODELS[m] || []);
    }
    if (mk) { mk.addEventListener('input', refreshModels); mk.addEventListener('change', refreshModels); }

    // Delivery toggle
    function via() { var r = form.querySelector('[data-via]:checked'); return r ? r.value : 'whatsapp'; }
    var labelEl = subBtn.querySelector('[data-submit-label]');
    var icWa = subBtn.querySelector('[data-ic-wa]');
    var icMail = subBtn.querySelector('[data-ic-mail]');
    function syncBtn() {
      var wa = via() === 'whatsapp';
      if (labelEl) labelEl.textContent = wa ? 'Send on WhatsApp' : 'Send by email';
      if (icWa) icWa.style.display = wa ? '' : 'none';
      if (icMail) icMail.style.display = wa ? 'none' : '';
      subBtn.classList.toggle('btn-wa', wa);
      subBtn.classList.toggle('btn-silver', !wa);
      if (window.lucide) lucide.createIcons();
    }
    form.querySelectorAll('[data-via]').forEach(function (r) { r.addEventListener('change', syncBtn); });
    syncBtn();

    function clearErr() { var e = form.querySelector('.wiz-err'); if (e) e.remove(); }
    function showErr(msg, el) {
      clearErr();
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
      var nav = form.querySelector('.wiz-nav');
      var e2 = document.createElement('div');
      e2.className = 'wiz-err';
      e2.style.cssText = 'margin-top:10px;font-size:13px;line-height:1.5;color:var(--alert-400);text-align:center';
      nav.parentNode.insertBefore(e2, nav.nextSibling);
      e2.textContent = msg;
    }

    function stepValid(n) {
      var panel = panels[n - 1];
      var reqs = panel.querySelectorAll('[data-req]');
      for (var i = 0; i < reqs.length; i++) {
        var el = reqs[i];
        if (!el.value.trim()) { showErr('Please add ' + (el.getAttribute('data-label') || 'this field') + '.', el); return false; }
        if (el.getAttribute('data-field') === 'email' && !validEmail(el.value)) { showErr('Please enter a valid email address.', el); return false; }
      }
      return true;
    }

    function showStep(n) {
      cur = n;
      panels.forEach(function (p) { p.hidden = (+p.getAttribute('data-step-panel') !== n); });
      if (titleEl) titleEl.textContent = TITLES[n - 1];
      if (numEl) numEl.textContent = n;
      if (fillEl) fillEl.style.width = (n / TOTAL * 100) + '%';
      dots.forEach(function (d, i) { d.classList.toggle('cur', i === n - 1); d.classList.toggle('done', i < n - 1); });
      if (backBtn) backBtn.hidden = (n === 1);
      if (nextBtn) nextBtn.hidden = (n === TOTAL);
      subBtn.hidden = (n !== TOTAL);
      clearErr();
      if (window.lucide) lucide.createIcons();
    }

    if (nextBtn) nextBtn.addEventListener('click', function () { if (stepValid(cur)) showStep(Math.min(cur + 1, TOTAL)); });
    if (backBtn) backBtn.addEventListener('click', function () { showStep(Math.max(cur - 1, 1)); });
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (cur < TOTAL) { if (stepValid(cur)) showStep(cur + 1); } else subBtn.click();
    });
    showStep(1);

    function get(f) { var el = form.querySelector('[data-field="' + f + '"]'); return el ? (el.value || '').trim() : ''; }

    function emailBackup(d) {
      try {
        var p = {}; for (var k in d) if (d.hasOwnProperty(k)) p[k] = d[k];
        p._subject = 'New website enquiry — ' + (d.Make || '') + ' ' + (d.Model || '');
        p._template = 'table'; p._captcha = 'false';
        fetch('https://formsubmit.co/ajax/' + ENQUIRY_EMAIL, {
          method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(p)
        }).catch(function () {});
      } catch (e) {}
    }

    function sheetBackup(d) {
      if (!SHEET_ENDPOINT) return;
      try {
        var p = {
          timestamp: new Date().toISOString(),
          name: d.Name || '', mobile: d.Mobile || '', email: d.Email || '', postcode: d.Postcode || '',
          make: d.Make || '', model: d.Model || '', trim: d.Trim || '', fuel: d.Fuel || '', registration: d.Registration || '',
          interested: d['Interested in'] || '', service: d['Interested in'] || '', preferredReply: d['Preferred reply'] || '',
          source: location.pathname.replace(/^.*\//, '') || 'index.html'
        };
        /* text/plain avoids a CORS preflight so Apps Script accepts it; we don't need to read the response */
        fetch(SHEET_ENDPOINT, {
          method: 'POST', keepalive: true, mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(p)
        }).catch(function () {});
      } catch (e) {}
    }

    subBtn.addEventListener('click', function () {
      var interest = Array.prototype.slice.call(form.querySelectorAll('input[data-interest]:checked')).map(function (c) { return c.value; });
      if (form.querySelector('input[data-interest]') && !interest.length) { showErr('Please choose at least one service you’re interested in.'); return; }
      var d = { Name: get('name'), Mobile: get('mobile'), Email: get('email'), Postcode: get('postcode'), Make: get('make'), Model: get('model'), Trim: get('trim'), Fuel: get('fuel'), Registration: get('reg') };
      d['Interested in'] = interest.join(', ') || '—';
      d['Preferred reply'] = via() === 'whatsapp' ? 'WhatsApp' : 'Email';
      var order = ['Name', 'Mobile', 'Email', 'Postcode', 'Make', 'Model', 'Trim', 'Fuel', 'Registration', 'Interested in', 'Preferred reply'];
      var lines = [];
      order.forEach(function (k) { if (d[k] && d[k] !== '—' || k === 'Interested in' || k === 'Preferred reply') lines.push(k + ': ' + d[k]); });
      var text = 'New enquiry from acrautomobile.com' + NL + NL + lines.join(NL);
      emailBackup(d);
      sheetBackup(d);
      if (via() === 'whatsapp') window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      var okMsg = ok && ok.querySelector('[data-ok-msg]');
      if (okMsg) okMsg.textContent = via() === 'whatsapp'
        ? 'We’ve opened WhatsApp with your details — just hit send. A specialist will reply within 24 hours with your recommendation, price and fitting slot.'
        : 'Thanks — your request is on its way to our team. A specialist will reply within 24 hours with your recommendation, price and fitting slot.';
      form.style.display = 'none';
      if (ok) ok.style.display = 'block';
      if (window.lucide) lucide.createIcons();
    });
  }

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () { document.querySelectorAll('.wiz-form').forEach(initWizard); });
})();
