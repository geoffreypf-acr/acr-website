# -*- coding: utf-8 -*-
"""Inject the per-area copy from area-copy.py into the tracker-installation-* pages.

Idempotent: the injected section is marked, so re-running replaces rather than
duplicates. Run from the repo root:  python3 tools/build-area-pages.py
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib.machinery import SourceFileLoader
AREAS = SourceFileLoader('area_copy', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'area-copy.py')).load_module().AREAS

MARK = '<!-- area-local -->'


def esc(t):
    """& -> &amp; for the bare ampersands the old pages left in prose and FAQ text."""
    return re.sub(r'&(?!(?:[a-zA-Z]+|#\d+);)', '&amp;', t)


def plain(t):
    """HTML -> text, for JSON-LD."""
    t = re.sub(r'<[^>]+>', '', t)
    for a, b in [('&amp;', '&'), ('&pound;', '£'), ('&nbsp;', ' ')]:
        t = t.replace(a, b)
    return t


def build(slug, area, name):
    path = 'tracker-installation-%s.html' % slug
    s = open(path, encoding='utf-8').read()
    orig = s

    # ---- 1. the .prose block: area-specific intro, recommendations, outro
    recs = ''.join('<li><strong>%s</strong> — %s</li>' % (t, esc(d)) for t, d in area['recs'])
    prose = ('<h2>Insurance-approved vehicle security in %s</h2>'
             '<p>%s</p>'
             '<h3>What we recommend in %s, and why</h3><ul>%s</ul>'
             '<p>%s</p>') % (name, esc(area['intro']), name, recs, esc(area['outro']))
    a = s.index('<div class="prose">') + len('<div class="prose">')
    b = s.index('</div><div class="aside-cta">', a)
    s = s[:a] + prose + s[b:]

    # ---- 2. the local section (replace on re-run, else insert after the prose section)
    where = ''.join('<li>%s</li>' % esc(w) for w in area['where'])
    sec = (MARK + '<section class="sec alt"><div class="wrap"><div class="prose">'
           '<h2>%s</h2><p>%s</p><p>%s</p>'
           '<h3>Where we typically fit in %s</h3><ul>%s</ul><p>%s</p>'
           '</div></div></section>' + MARK) % (
        esc(area['h2']), esc(area['p1']), esc(area['p2']), name, where, esc(area['p3']))
    if MARK in s:
        i = s.index(MARK); j = s.index(MARK, i + len(MARK)) + len(MARK)
        s = s[:i] + sec + s[j:]
    else:
        anchor = s.index('<section class="sec alt tight">')
        s = s[:anchor] + sec + s[anchor:]

    # ---- 3. FAQs: two tailored generics + three area-specific
    faqs = [
        ('Do you fit trackers in %s?' % name,
         'Yes — %s is part of our regular route and we fit insurance-approved Meta Trak trackers, '
         'immobilisers and packages throughout %s at your home, office or storage. We are a mobile '
         'service, so we come to you.' % (name, area['pc'])),
        ('Which system will you recommend for my car?',
         'It depends on the vehicle, its value and what your insurer specifies — usually a Meta Trak S7 '
         'or S5, and in %s most often as a tracker-and-immobiliser package. We confirm it at the free '
         'assessment before anything is booked, and certification is issued on the day of fitting.' % name),
    ] + list(area['faqs'])

    faq_html = '<div class="faq">' + ''.join(
        '<details><summary>%s<span class="pl"></span></summary><div class="ans">%s</div></details>'
        % (esc(q), esc(ans)) for q, ans in faqs) + '</div>'
    i = s.index('<div class="faq">')
    j = s.index('</div></section>', i)
    s = s[:i] + faq_html + s[j + len('</div>'):]

    # ---- 4. FAQPage schema must match the visible FAQs
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": plain(q),
         "acceptedAnswer": {"@type": "Answer", "text": plain(ans)}} for q, ans in faqs]}
    s = re.sub(r'<script type="application/ld\+json">\{"@context":"https://schema\.org","@type":"FAQPage".*?</script>',
               '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False, separators=(',', ':')) + '</script>',
               s, count=1, flags=re.S)

    # ---- 5. a description built from this area's own opening line
    first = plain(esc(area['intro'])).split('. ')[0].strip()
    if len(first) > 118:
        first = first[:115].rsplit(' ', 1)[0] + '…'
    desc = '%s. Insurance-approved trackers &amp; immobilisers fitted at your address in %s.' % (first, area['pc'])
    if len(plain(desc)) > 175:
        desc = '%s. Approved trackers fitted at your address in %s.' % (first, area['pc'])
    s = re.sub(r'(<meta name="description" content=")[^"]*(">)', lambda m: m.group(1) + desc + m.group(2), s, count=1)

    # ---- 6. bare ampersands left in the AutoRepair schema description
    s = re.sub(r'("description":"[^"]*?) & ', r'\1 and ', s)

    if s != orig:
        open(path, 'w', encoding='utf-8').write(s)
    return len(plain(prose + sec + faq_html).split())


def main():
    total = 0
    for slug, area in sorted(AREAS.items()):
        path = 'tracker-installation-%s.html' % slug
        if not os.path.exists(path):
            print('  MISSING %s' % path); continue
        h1 = re.search(r'<h1>Vehicle Tracker Installation in ([^<]+)</h1>', open(path, encoding='utf-8').read())
        name = h1.group(1) if h1 else slug.replace('-', ' ').title()
        n = build(slug, area, name)
        total += n
        print('  %-24s %s  %4d unique words injected' % (slug, area['pc'].ljust(10), n))
    print('%d area pages rebuilt, %d words of unique copy' % (len(AREAS), total))


if __name__ == '__main__':
    main()
