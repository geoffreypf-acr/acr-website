#!/bin/bash
# Submit changed URLs to IndexNow (Bing, Yandex, Seznam - Google does not participate).
# Usage: tools/indexnow.sh              -> submits every URL in sitemap.xml
#        tools/indexnow.sh path1 path2  -> submits just those paths
set -euo pipefail
KEY="c58baf8a434d509c14b076a8fe393402"
HOST="acrautomobile.com"
if [ $# -gt 0 ]; then
  URLS=$(for p in "$@"; do echo "https://$HOST/${p#/}"; done)
else
  URLS=$(grep -o '<loc>[^<]*' sitemap.xml | sed 's|<loc>||')
fi
COUNT=$(echo "$URLS" | grep -c .)
BODY=$(python3 -c "
import json,sys
urls=[l.strip() for l in sys.stdin if l.strip()]
print(json.dumps({'host':'$HOST','key':'$KEY','keyLocation':'https://$HOST/$KEY.txt','urlList':urls}))
" <<< "$URLS")
echo "submitting $COUNT urls to IndexNow..."
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -X POST 'https://api.indexnow.org/indexnow'   -H 'Content-Type: application/json; charset=utf-8' --data "$BODY"
