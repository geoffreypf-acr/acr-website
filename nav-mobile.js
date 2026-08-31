/* Mobile navigation, built from the desktop nav that is already on the page.
 *
 * THE BUG THIS FIXES
 * site.css hides nav.main below 980px on every page. The burger and the
 * off-canvas menu existed only in index.html, and their CSS only in home.css,
 * which only index.html loads. So on 88 of 89 pages there was no navigation at
 * all on a phone - the menu was hidden and nothing replaced it.
 *
 * WHY IT GENERATES RATHER THAN DUPLICATES
 * index.html had a hand-written mobile menu, and it had already drifted: the
 * whole Trade section, the services index and the BMW/MINI overview were in the
 * desktop nav and missing from it. Copying that markup to 88 more pages would
 * have guaranteed the same drift 88 times over. Reading the real nav means the
 * two cannot disagree - add a link to the header and it appears on mobile.
 */
(function () {
  function build() {
    var nav = document.querySelector('nav.main');
    if (!nav) return;                       // console pages, or a page with no nav
    if (document.getElementById('mnav')) return;   // already built

    var header = nav.closest('header') || nav.parentNode;

    /* ---- the burger, next to the existing header actions ---- */
    var burger = document.querySelector('.nav-burger');
    if (!burger) {
      burger = document.createElement('button');
      burger.className = 'nav-burger';
      burger.id = 'navBurger';
      burger.type = 'button';
      burger.setAttribute('aria-label', 'Open menu');
      burger.setAttribute('aria-expanded', 'false');
      burger.innerHTML = '<i data-lucide="menu"></i>';
      var cta = header.querySelector('.nav-cta') || nav.parentNode;
      cta.appendChild(burger);
    }

    /* ---- the panel ---- */
    var logo = header.querySelector('img.logo');
    var panel = document.createElement('div');
    panel.className = 'mnav';
    panel.id = 'mnav';
    panel.setAttribute('aria-hidden', 'true');

    var top = document.createElement('div');
    top.className = 'mnav-top';
    top.innerHTML =
      (logo ? '<img class="logo" src="' + logo.getAttribute('src') + '" alt="ACR Automobile" style="height:26px">' : '<span></span>') +
      '<button class="mnav-close" id="mnavClose" type="button" aria-label="Close menu"><i data-lucide="x"></i></button>';
    panel.appendChild(top);

    /* Walk the real nav in document order. A .nav-item with a dropdown becomes
       a collapsible group; anything else becomes a plain link. Nested
       subdropdowns are flattened into their parent group - a menu three levels
       deep on a phone is worse than a slightly longer list. */
    function labelOf(a) {
      var t = '';
      a.childNodes.forEach ? null : null;
      Array.prototype.forEach.call(a.childNodes, function (n) {
        if (n.nodeType === 3) t += n.nodeValue;
      });
      return t.replace(/\s+/g, ' ').trim() || (a.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function addLink(parent, href, text, cls) {
      if (!href || !text) return;
      var a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = text;
      if (cls) a.className = cls;
      parent.appendChild(a);
    }

    Array.prototype.forEach.call(nav.children, function (child) {
      if (child.tagName === 'A') {
        addLink(panel, child.getAttribute('href'), labelOf(child));
        return;
      }
      if (!child.classList || !child.classList.contains('nav-item')) return;

      var head = child.querySelector(':scope > a');
      var drop = child.querySelector(':scope > .dropdown');
      if (!head) return;

      if (!drop) { addLink(panel, head.getAttribute('href'), labelOf(head)); return; }

      var det = document.createElement('details');
      var sum = document.createElement('summary');
      sum.innerHTML = '<span></span><i data-lucide="chevron-down" class="chev"></i>';
      sum.querySelector('span').textContent = labelOf(head);
      det.appendChild(sum);

      var sub = document.createElement('div');
      sub.className = 'sub';

      /* the group heading is itself a page - keep it reachable */
      var ownHref = head.getAttribute('href');
      if (ownHref && !/^#/.test(ownHref)) {
        addLink(sub, ownHref, labelOf(head) + ' overview');
      }

      Array.prototype.forEach.call(drop.children, function (item) {
        if (item.tagName === 'A') {
          addLink(sub, item.getAttribute('href'), labelOf(item));
          return;
        }
        if (item.classList && item.classList.contains('nav-sub')) {
          var subHead = item.querySelector(':scope > a');
          if (subHead) addLink(sub, subHead.getAttribute('href'), labelOf(subHead));
          var deeper = item.querySelector(':scope > .subdropdown');
          if (deeper) {
            Array.prototype.forEach.call(deeper.querySelectorAll('a[href]'), function (a) {
              addLink(sub, a.getAttribute('href'), labelOf(a), 'deep');
            });
          }
        }
      });

      det.appendChild(sub);
      panel.appendChild(det);
    });

    /* the phone number and quote button, which live outside nav.main */
    var tel = header.querySelector('a[href^="tel:"]');
    if (tel) addLink(panel, tel.getAttribute('href'), 'Call ' + (tel.textContent || '').replace(/\s+/g, ' ').trim());
    var quote = header.querySelector('.nav-cta a.btn, .nav-cta a[href*="assessment"]');
    if (quote) addLink(panel, quote.getAttribute('href'), labelOf(quote) || 'Request a quote', 'mnav-cta');

    document.body.appendChild(panel);

    /* ---- open / close ---- */
    function open() {
      document.body.classList.add('menu-open');
      burger.setAttribute('aria-expanded', 'true');
      panel.setAttribute('aria-hidden', 'false');
    }
    function close() {
      document.body.classList.remove('menu-open');
      burger.setAttribute('aria-expanded', 'false');
      panel.setAttribute('aria-hidden', 'true');
    }
    burger.addEventListener('click', open);
    panel.querySelector('#mnavClose').addEventListener('click', close);
    /* a link that only changes the hash does not reload, so the panel would
       stay open over the content it just scrolled to */
    panel.querySelectorAll('a[href]').forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    if (window.lucide) lucide.createIcons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
