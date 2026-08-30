# -*- coding: utf-8 -*-
"""Inject the per-marque copy from make-copy.py into the <make>-tracker-installation pages.

Idempotent - the injected section is marked, so re-running replaces rather than
duplicates. Run from the repo root:  python3 tools/build-make-pages.py
"""
import json, os, re, sys
from importlib.machinery import SourceFileLoader

HERE = os.path.dirname(os.path.abspath(__file__))
MAKES = SourceFileLoader('make_copy', os.path.join(HERE, 'make-copy.py')).load_module().MAKES

MARK = '<!-- make-detail -->'


def esc(t):
    return re.sub(r'&(?!(?:[a-zA-Z]+|#\d+);)', '&amp;', t)


def plain(t):
    t = re.sub(r'<[^>]+>', '', t)
    for a, b in [('&amp;', '&'), ('&pound;', '£'), ('&nbsp;', ' ')]:
        t = t.replace(a, b)
    return t


def build(slug, m):
    path = '%s-tracker-installation.html' % slug
    s = open(path, encoding='utf-8').read()
    orig, name = s, m['name']

    # ---- 1. prose block
    recs = ''.join('<li><strong>%s</strong> — %s</li>' % (t, esc(d)) for t, d in m['rec'])
    prose = ('<h2>Vehicle security for the %s</h2>'
             '<p>%s</p>'
             '<h3>What we recommend for a %s, and why</h3><ul>%s</ul>'
             '<p>We fit across London, Surrey and the Home Counties — %s — and hand over insurance '
             'certification on the day. We are a mobile service: we come to you, and there is no '
             'workshop to visit.</p>') % (name, esc(m['intro']), name, recs, esc(m['models']))
    a = s.index('<div class="prose">') + len('<div class="prose">')
    b = s.index('</div><div class="aside-cta">', a)
    s = s[:a] + prose + s[b:]

    # ---- 2. marque-specific threat + installation section
    sec = (MARK + '<section class="sec alt"><div class="wrap"><div class="prose">'
           '<h2>How a %s actually gets stolen</h2><p>%s</p>'
           '<h2>What fitting a %s involves</h2><p>%s</p>'
           '</div></div></section>' + MARK) % (name, esc(m['threat']), name, esc(m['fitting']))
    if MARK in s:
        i = s.index(MARK); j = s.index(MARK, i + len(MARK)) + len(MARK)
        s = s[:i] + sec + s[j:]
    else:
        s = s[:s.index('<section class="sec alt tight">')] + sec + s[s.index('<section class="sec alt tight">'):]

    # ---- 3. FAQs (marque-specific + one honest mobile-only answer)
    faqs = list(m['faqs']) + [
        ('Do you come to me, or do I bring the car to you?',
         'We come to you. ACR Automobile is a fully mobile service — we fit at your home, office or '
         'storage across London, Surrey and the Home Counties, and there is no workshop to visit.'),
        ('Will it affect my %s warranty?' % name,
         'No. We install to manufacturer standard, taking factory feeds using manufacturer connector '
         'standards, and nothing is cut or spliced. Your warranty is unaffected and the installation is reversible.'),
    ]
    faq_html = '<div class="faq">' + ''.join(
        '<details><summary>%s<span class="pl"></span></summary><div class="ans">%s</div></details>'
        % (esc(q), esc(ans)) for q, ans in faqs) + '</div>'
    i = s.index('<div class="faq">')
    j = s.index('</div></section>', i)
    s = s[:i] + faq_html + s[j + len('</div>'):]

    # ---- 4. FAQPage schema mirrors the visible FAQs exactly
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": plain(q),
         "acceptedAnswer": {"@type": "Answer", "text": plain(ans)}} for q, ans in faqs]}
    s = re.sub(r'<script type="application/ld\+json">\s*\{[^<]*?"@type"\s*:\s*"FAQPage".*?</script>',
               '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False, separators=(',', ':')) + '</script>',
               s, count=1, flags=re.S)

    # ---- 5. marque-specific description from this page's own opening line
    first = plain(esc(m['intro'])).split('. ')[0].strip()
    tail = '. Insurance-approved trackers & immobilisers, fitted at your address.'
    if len(first) + len(tail) > 172:
        first = first[:172 - len(tail)].rsplit(' ', 1)[0] + '\u2026'
    desc = (first + tail).replace('&', '&amp;')
    s = re.sub(r'(<meta name="description" content=")[^"]*(">)', lambda x: x.group(1) + desc + x.group(2), s, count=1)

    if s != orig:
        open(path, 'w', encoding='utf-8').write(s)
    return len(plain(prose + sec + faq_html).split())


def main():
    total = 0
    for slug, m in sorted(MAKES.items()):
        path = '%s-tracker-installation.html' % slug
        if not os.path.exists(path):
            print('  MISSING %s' % path); continue
        n = build(slug, m); total += n
        print('  %-16s %-22s %4d unique words injected' % (slug, m['name'], n))
    print('%d make pages rebuilt, %d words of unique copy' % (len(MAKES), total))


if __name__ == '__main__':
    main()
