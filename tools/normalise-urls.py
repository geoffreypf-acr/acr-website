#!/usr/bin/env python3
"""
Normalise canonical URLs across the site.

The ACR SEO dashboard writes new pages with `https://www.acrautomobile.com/...`
canonical, og:url, sitemap and llms.txt entries. That host 301-redirects to the
apex domain, so every such URL points at a redirect, and the sitemap ends up
listing the same page twice. This script puts everything back to the URL that
actually serves a 200: https://acrautomobile.com/<slug>

It is idempotent — running it on a clean tree changes nothing and exits 0.

Usage:
    python3 tools/normalise-urls.py           # fix in place
    python3 tools/normalise-urls.py --check   # report only, exit 1 if fixes needed
"""
import glob
import os
import re
import sys

WWW = "https://www.acrautomobile.com"
APEX = "https://acrautomobile.com"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

check_only = "--check" in sys.argv
changes = []


def fix_text_files():
    """www -> apex across every HTML / TXT / XML file."""
    for path in sorted(glob.glob("*.html") + glob.glob("*.txt") + glob.glob("*.xml")):
        with open(path, encoding="utf-8") as fh:
            original = fh.read()
        n = original.count(WWW)
        if not n:
            continue
        updated = original.replace(WWW, APEX)
        changes.append(f"{path}: {n} www -> apex")
        if not check_only:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(updated)


def fix_canonicals():
    """canonical and og:url should be extensionless, matching what the server serves."""
    for path in sorted(glob.glob("*.html")):
        with open(path, encoding="utf-8") as fh:
            original = fh.read()
        updated = re.sub(
            r'(<link rel="canonical" href="' + re.escape(APEX) + r'/[a-z0-9-]+)\.html(">)',
            r"\1\2",
            original,
        )
        updated = re.sub(
            r'(<meta property="og:url" content="' + re.escape(APEX) + r'/[a-z0-9-]+)\.html(">)',
            r"\1\2",
            updated,
        )
        if updated != original:
            changes.append(f"{path}: stripped .html from canonical/og:url")
            if not check_only:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(updated)


def fix_sitemap():
    """Drop duplicate <url> blocks, keeping the first occurrence of each <loc>."""
    path = "sitemap.xml"
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        original = fh.read()

    blocks = re.findall(r"  <url>\n.*?  </url>\n", original, re.S)
    seen, kept, dropped = set(), [], []
    for block in blocks:
        loc = re.search(r"<loc>([^<]*)</loc>", block)
        key = loc.group(1).rstrip("/") if loc else block
        if key in seen:
            dropped.append(key)
            continue
        seen.add(key)
        kept.append(block)

    if not dropped:
        return
    head = original[: original.find("  <url>")]
    updated = head + "".join(kept) + "</urlset>\n"
    changes.append(f"sitemap.xml: removed {len(dropped)} duplicate URL(s) -> {len(kept)} unique")
    if not check_only:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(updated)


fix_text_files()
fix_canonicals()
fix_sitemap()

if not changes:
    print("URLs already normalised - nothing to do.")
    sys.exit(0)

print(("Would fix:" if check_only else "Fixed:"))
for line in changes:
    print("  " + line)
sys.exit(1 if check_only else 0)
