"""Scrape elevatereg.com into site.json — every listing, with its real status.

    python3 scripts/scrape_site.py

Walks /property/?status=available (25 pages) and /property/?status=unavailable
(12 pages), reads every card and writes a snapshot the app can ship with.
"""
import json, os, re, time, urllib.request

BASE = 'https://www.elevatereg.com/property/'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CARD = re.compile(r'<article class="post-(\d+) property[^"]*">(.*?)</article>', re.S)


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode('utf-8', 'ignore')
            if '<article' in body:
                return body
        except Exception:
            pass
        time.sleep(1.2 * (i + 1))
    return ''


def parse(html):
    out = []
    for pid, body in CARD.findall(html):
        pick = lambda rx: (re.search(rx, body).group(1).strip() if re.search(rx, body) else '')
        out.append(dict(
            id=pid,
            address=pick(r'class="property-title[^"]*">([^<]+)<'),
            link=pick(r'href="(https://www\.elevatereg\.com/property/[^"]+)"'),
            price=pick(r'<li class="lead"><b>([^<]+)</b>'),
            beds=pick(r'<li>([\d.]+) bd</li>'),
            baths=pick(r'<li>([\d.]+) ba</li>'),
            sqft=pick(r'<li>([\d,]+) sqft</li>').replace(',', ''),
            badge=pick(r'<span class="badge [^"]*"[^>]*>([^<]+)</span>'),
            terms=pick(r'<span class="property-type-heading">([^<]+)</span>'),
            img=pick(r'<img src="([^"]+)"'),
        ))
    return out


def scrape():
    rows, seen = [], set()
    for status in ('available', 'unavailable'):
        page, max_page, misses = 1, 1, 0
        while page <= max_page and page <= 60:
            url = (BASE if page == 1 else f'{BASE}page/{page}/') + f'?status={status}'
            html = get(url)
            if not html:
                misses += 1
                if misses >= 3:
                    break
                page += 1
                continue
            misses = 0
            for n in re.findall(r'/property/page/(\d+)/', html):
                max_page = max(max_page, int(n))
            for c in parse(html):
                if not c['address'] or c['id'] in seen:
                    continue
                seen.add(c['id'])
                c['status'] = (c['badge'] or 'Sold') if status == 'unavailable' \
                    else (c['badge'] or 'Available')
                c['available'] = c['status'] == 'Available'
                rows.append(c)
            print(f'  {status} page {page}/{max_page}', flush=True)
            page += 1
            time.sleep(0.3)
    return rows


def main():
    rows = scrape()
    snap = {
        'listings': rows,
        'count': len(rows),
        'available': sum(1 for r in rows if r['status'] == 'Available'),
        'pending': sum(1 for r in rows if r['status'] == 'Pending'),
        'sold': sum(1 for r in rows if r['status'] == 'Sold'),
        'checked': time.strftime('%Y-%m-%d'),
    }
    out = os.path.join(ROOT, 'site.json')
    json.dump(snap, open(out, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(f'site.json · {snap["count"]} listings · {snap["available"]} available · '
          f'{snap["pending"]} pending · {snap["sold"]} sold')


if __name__ == '__main__':
    main()
