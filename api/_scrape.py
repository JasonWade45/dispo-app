"""Scrape elevatereg.com — stdlib only (runs inside a Vercel Function and in GitHub Actions).

The site lists each property as <article class="post-ID property …">. A card carries a
badge only when it is NOT available: `Pending` or `Sold`. No badge  →  truly available.
"""
import html
import json
import re
import time
import urllib.error
import urllib.request
from datetime import date

BASE = 'https://www.elevatereg.com'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en-US,en;q=0.9'}
CARD = re.compile(r'<article class="post-(\d+) property[^"]*">(.*?)</article>', re.S)


def _get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode('utf-8', 'ignore')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ''
        except Exception:
            pass
        time.sleep(1.0 + i)
    return ''


def parse_page(page_html):
    out = []
    for pid, body in CARD.findall(page_html):
        def one(pat, group=1):
            m = re.search(pat, body, re.S)
            return html.unescape(m.group(group)).strip() if m else ''
        beds = baths = sqft = ''
        for d in re.findall(r'<li>([^<]*)</li>', body):
            d = html.unescape(d).strip()
            if 'bd' in d and not beds:
                beds = d.replace('bd', '').strip()
            elif 'ba' in d and not baths:
                baths = d.replace('ba', '').strip()
            elif 'sqft' in d:
                sqft = d.replace('sqft', '').strip()
        out.append(dict(
            id=pid,
            address=one(r'class="property-title[^"]*">([^<]*)</p>'),
            price=one(r'<li class="lead"><b>([^<]*)</b>'),
            beds=beds, baths=baths, sqft=sqft,
            terms=one(r'class="property-type-heading">([^<]*)<'),
            image=one(r'<img src="([^"]+)"'),
            link=one(r'href="(https://www\.elevatereg\.com/property/[^"]+)"'),
            badge=one(r'<span class="badge ([^"]*)"[^>]*>([^<]*)</span>', 2),
        ))
    return out


def scrape(max_pages=60, sleeper=time.sleep, deadline=None):
    rows, seen = [], set()
    for status in ('available', 'unavailable'):
        page = 1
        while page <= max_pages:
            if deadline and time.time() > deadline:
                break
            url = (f'{BASE}/property/page/{page}/?status={status}' if page > 1
                   else f'{BASE}/property/?status={status}')
            cards = parse_page(_get(url))
            new = 0
            for c in cards:
                if c['id'] in seen:
                    continue
                seen.add(c['id'])
                c['page_status'] = status
                rows.append(c)
                new += 1
            if not cards or new == 0:
                break
            page += 1
            sleeper(0.4)
    for c in rows:
        c['status'] = c['badge'] or ('Available' if c['page_status'] == 'available' else 'Sold')
        c['available'] = not bool(c['badge'])
    return rows


def snapshot(budget=None):
    deadline = time.time() + budget if budget else None
    rows = scrape(deadline=deadline)
    return dict(
        checked=str(date.today()),
        partial=bool(deadline and time.time() > deadline),
        count=len(rows),
        available=sum(1 for c in rows if c['available']),
        pending=sum(1 for c in rows if c['status'] == 'Pending'),
        sold=sum(1 for c in rows if c['status'] == 'Sold'),
        listings=[dict(id=c['id'], address=c['address'], price=c['price'], beds=c['beds'],
                       baths=c['baths'], sqft=c['sqft'], terms=c['terms'], img=c['image'],
                       link=c['link'], status=c['status'], available=c['available'])
                  for c in rows],
    )


if __name__ == '__main__':          # python3 api/_scrape.py  → writes site_snapshot.json
    _d = snapshot()
    with open('site_snapshot.json', 'w') as _f:
        json.dump(_d, _f, indent=1)
    print(f"checked {_d['checked']}: {_d['count']} listings · {_d['available']} available · "
          f"{_d['pending']} pending · {_d['sold']} sold")
