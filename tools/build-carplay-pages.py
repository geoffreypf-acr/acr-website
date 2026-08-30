# -*- coding: utf-8 -*-
"""Inject carplay-copy.py into the 10 <make>-apple-carplay-london pages and the
four BMW/MINI software pages.

Idempotent - the injected section is marked. Run from the repo root.
"""
import json, os, re
from importlib.machinery import SourceFileLoader

HERE = os.path.dirname(os.path.abspath(__file__))
_m = SourceFileLoader('carplay_copy', os.path.join(HERE, 'carplay-copy.py')).load_module()
CARPLAY, SOFTWARE = _m.CARPLAY, _m.SOFTWARE

MARK = '<!-- detail -->'


def esc(t):
    return re.sub(r'&(?!(?:[a-zA-Z]+|#\d+);)', '&amp;', t)


def plain(t):
    t = re.sub(r'<[^>]+>', '', t)
    for a, b in [('&amp;', '&'), ('&pound;', '£'), ('&nbsp;', ' ')]:
        t = t.replace(a, b)
    return t


def apply(path, intro_html, section_html, faqs, desc_seed):
    s = open(path, encoding='utf-8').read()
    orig = s

    # intro paragraph of the .prose block, keeping the existing h2 and bullet list
    a = s.index('<div class="prose">') + len('<div class="prose">')
    h2end = s.index('</h2>', a) + len('</h2>')
    pstart = s.index('<p>', h2end)
    pend = s.index('</p>', pstart) + len('</p>')
    s = s[:pstart] + intro_html + s[pend:]

    # marked detail section, before the first following section
    sec = MARK + section_html + MARK
    if MARK in s:
        i = s.index(MARK); j = s.index(MARK, i + len(MARK)) + len(MARK)
        s = s[:i] + sec + s[j:]
    else:
        anchor = None
        for cand in ['<section class="sec alt tight">', '<section class="cta-band">']:
            if cand in s:
                anchor = s.index(cand); break
        s = s[:anchor] + sec + s[anchor:]

    # FAQs + matching schema
    faq_html = '<div class="faq">' + ''.join(
        '<details><summary>%s<span class="pl"></span></summary><div class="ans">%s</div></details>'
        % (esc(q), esc(ans)) for q, ans in faqs) + '</div>'
    i = s.index('<div class="faq">')
    j = s.index('</div></section>', i)
    s = s[:i] + faq_html + s[j + len('</div>'):]

    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": plain(q),
         "acceptedAnswer": {"@type": "Answer", "text": plain(ans)}} for q, ans in faqs]}
    s = re.sub(r'<script type="application/ld\+json">\s*\{[^<]*?"@type"\s*:\s*"FAQPage".*?</script>',
               '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False, separators=(',', ':')) + '</script>',
               s, count=1, flags=re.S)

    first = plain(esc(desc_seed)).split('. ')[0].strip()
    tail = '. Mobile fitting across London & Surrey — we come to you.'
    if len(first) + len(tail) > 172:
        first = first[:172 - len(tail)].rsplit(' ', 1)[0] + '…'
    desc = (first + tail).replace('&', '&amp;')
    s = re.sub(r'(<meta name="description" content=")[^"]*(">)', lambda x: x.group(1) + desc + x.group(2), s, count=1)

    # ACR is mobile-only: no "bring it to our base" anywhere
    s = re.sub(r'We fit at our West London \(W11\) base or mobile across London and Surrey\.',
               'We fit at your address across London and Surrey — we are a fully mobile service and there is no workshop to visit.', s)

    if s != orig:
        open(path, 'w', encoding='utf-8').write(s)
    return len(plain(intro_html + section_html + faq_html).split())


def main():
    total = 0
    for slug, c in sorted(CARPLAY.items()):
        path = c['file'] + '.html'
        if not os.path.exists(path):
            print('  MISSING %s' % path); continue
        n = apply(path,
                  '<p>%s</p>' % esc(c['intro']),
                  ('<section class="sec alt"><div class="wrap"><div class="prose">'
                   '<h2>Which system is in your %s</h2>'
                   '<p>Your car will have one of %s, and that decides whether the work is an '
                   'activation or a retrofit. We confirm it from your registration and VIN before '
                   'quoting.</p>'
                   '<h2>How we do it on a %s</h2><p>%s</p>'
                   '<h3>What stays exactly as it was</h3><p>%s</p>'
                   '</div></div></section>') % (c['name'], esc(c['sysline']), c['name'],
                                                esc(c['how']), esc(c['keeps'])),
                  c['faqs'], c['intro'])
        total += n
        print('  %-32s %4d words' % (c['file'], n))

    for slug, sw in sorted(SOFTWARE.items()):
        path = slug + '.html'
        if not os.path.exists(path):
            print('  MISSING %s' % path); continue
        n = apply(path,
                  '<p>%s</p>' % esc(sw['intro']),
                  ('<section class="sec alt"><div class="wrap"><div class="prose">'
                   '<h2>How we approach %s work</h2><p>%s</p>'
                   '<h2>The thing most owners are not told</h2><p>%s</p>'
                   '</div></div></section>') % (sw['name'], esc(sw['body']), esc(sw['note'])),
                  sw['faqs'], sw['intro'])
        total += n
        print('  %-32s %4d words' % (slug, n))

    print('%d pages rebuilt, %d words of unique copy' % (len(CARPLAY) + len(SOFTWARE), total))


if __name__ == '__main__':
    main()
