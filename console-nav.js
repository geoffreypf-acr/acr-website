/* Shared console switcher for the private back-end pages.
 *
 * One dropdown, four destinations, dropped into every console so you never have
 * to go back to a bookmark to change screens:
 *
 *   Pipeline    crm-a7c93f.html              (board view)
 *   Dashboard   crm-a7c93f.html              (same file, dashboard view)
 *   Marketing   marketing-console-a7c93f.html
 *   Booking     booking-console-a7c93f.html
 *   ACR SEO     external (Vercel) - the URL is stored locally, see below
 *
 * Pipeline and Dashboard are two views of ONE file, toggled by the
 * acr_crm_dash localStorage key. This script writes that key from the URL hash
 * BEFORE the CRM boots, so #dashboard and #pipeline are honest deep links
 * rather than "open the CRM and then click a button".
 *
 * The SEO dashboard lives on Vercel and its URL is not in this repo, so the
 * first time it is picked the user is asked once and it is remembered. That
 * avoids hard-coding a guess, and avoids blocking the whole switcher on it.
 *
 * Mount by putting <span data-console-nav></span> in the header and loading
 * this file. Styling is inline on purpose: three consoles, three stylesheets,
 * and a switcher that looks different on each would be worse than none.
 */
(function () {
  var SEO_KEY  = 'acr_seo_url';
  var DASH_KEY = 'acr_crm_dash';

  var LINKS = [
    { k: 'pipeline',  label: 'Pipeline',   file: 'crm-a7c93f.html',               hash: 'pipeline'  },
    { k: 'dashboard', label: 'Dashboard',  file: 'crm-a7c93f.html',               hash: 'dashboard' },
    { k: 'marketing', label: 'Marketing',  file: 'marketing-console-a7c93f.html'  },
    { k: 'booking',   label: 'Booking',    file: 'booking-console-a7c93f.html'    },
    { k: 'seo',       label: 'ACR SEO',    external: true                          }
  ];

  function here() {
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  /* Run this at parse time, not on DOMContentLoaded: the CRM reads
     acr_crm_dash while it boots, so a hash arriving later would be ignored and
     the link would silently land on the wrong view. */
  (function applyHash() {
    if (here().indexOf('crm-') !== 0) return;
    var h = (location.hash || '').replace(/^#/, '').toLowerCase();
    if (h !== 'dashboard' && h !== 'pipeline') return;
    try { localStorage.setItem(DASH_KEY, h === 'dashboard' ? '1' : '0'); } catch (e) {}
  })();

  function current() {
    var f = here();
    if (f.indexOf('marketing-console') === 0) return 'marketing';
    if (f.indexOf('booking-console') === 0)   return 'booking';
    if (f.indexOf('crm-') === 0) {
      var h = (location.hash || '').replace(/^#/, '').toLowerCase();
      if (h === 'dashboard') return 'dashboard';
      if (h === 'pipeline')  return 'pipeline';
      var on = false;
      try { on = localStorage.getItem(DASH_KEY) === '1'; } catch (e) {}
      return on ? 'dashboard' : 'pipeline';
    }
    return '';
  }

  function seoUrl() {
    try { return (localStorage.getItem(SEO_KEY) || '').trim(); } catch (e) { return ''; }
  }

  function askSeoUrl() {
    var v = window.prompt(
      'Paste the ACR SEO dashboard URL.\n\nIt is stored in this browser only, so you '
      + 'only have to do this once per device.', seoUrl() || 'https://');
    if (v == null) return '';
    v = String(v).trim();
    if (!/^https?:\/\/.+\..+/.test(v)) { if (v) window.alert('That does not look like a URL.'); return ''; }
    try { localStorage.setItem(SEO_KEY, v); } catch (e) {}
    return v;
  }

  function go(key) {
    var l = LINKS.filter(function (x) { return x.k === key; })[0];
    if (!l) return;
    if (l.external) {
      var u = seoUrl() || askSeoUrl();
      if (u) window.open(u, '_blank', 'noopener');
      return;                                     // stay put - it opened in a new tab
    }
    var target = l.file + (l.hash ? '#' + l.hash : '');
    if (l.file.toLowerCase() === here() && l.hash) {
      /* already on this file - just switch the view without a round trip */
      try { localStorage.setItem(DASH_KEY, l.hash === 'dashboard' ? '1' : '0'); } catch (e) {}
      location.hash = l.hash;
      location.reload();
      return;
    }
    location.href = target;
  }

  function render() {
    var mounts = document.querySelectorAll('[data-console-nav]');
    if (!mounts.length) return;
    var cur = current();
    Array.prototype.forEach.call(mounts, function (mount) {
      if (mount.getAttribute('data-mounted') === '1') return;
      mount.setAttribute('data-mounted', '1');

      var wrap = document.createElement('span');
      wrap.style.cssText = 'display:inline-flex;align-items:center;gap:7px;vertical-align:middle';

      var lab = document.createElement('span');
      lab.textContent = 'Console';
      lab.style.cssText = 'font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;'
                        + 'color:var(--text-muted,#8b93a1);white-space:nowrap';

      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Switch console');
      sel.style.cssText = 'height:38px;padding:0 30px 0 11px;border-radius:var(--radius-md,8px);'
        + 'border:1px solid var(--border-default,#33405a);background:var(--surface-inset,#141c2b);'
        + 'color:var(--text-primary,#e8ecf3);font-family:var(--font-body,inherit);font-size:13.5px;'
        + 'font-weight:600;cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;'
        + 'background-image:url("data:image/svg+xml;utf8,'
        + "<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' "
        + "stroke='%238b93a1' stroke-width='3'><path d='M6 9l6 6 6-6'/></svg>" + '");'
        + 'background-repeat:no-repeat;background-position:right 10px center';

      LINKS.forEach(function (l) {
        var o = document.createElement('option');
        o.value = l.k;
        o.textContent = l.label + (l.external ? ' ↗' : '');
        if (l.k === cur) o.selected = true;
        sel.appendChild(o);
      });

      sel.addEventListener('change', function () {
        var v = sel.value;
        if (v === cur) return;
        /* put the dropdown back if the destination opens in a new tab, or the
           user cancels the URL prompt - otherwise it lies about where you are */
        var isExternal = LINKS.filter(function (x) { return x.k === v; })[0].external;
        go(v);
        if (isExternal) sel.value = cur;
      });

      wrap.appendChild(lab);
      wrap.appendChild(sel);
      mount.appendChild(wrap);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
  /* The consoles sit behind a passcode gate and some build their header after
     unlocking, so expose this for a re-mount. Guarded by data-mounted. */
  window.__consoleNav = render;
})();
