"""Apply a site snapshot (site_snapshot.json) to data.json — statuses, prices, inventory, KPIs.

Run after scripts/scrape_cli.py, before scripts/build_app.py. Needs no spreadsheet access,
so the scheduled GitHub Action can keep the deployed site fresh on its own.
"""
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data.json')
SNAP = os.path.join(ROOT, 'site_snapshot.json')


def addr_key(a):
    m = re.match(r'^(\d+)[^a-z0-9]+([a-z]+)',
                 re.sub(r'\b(apt|unit|ste|#)\s*\S+', ' ', str(a or '').lower()))
    return f'{m.group(1)}|{m.group(2)}' if m else re.sub(r'[^a-z0-9]', '', str(a or '').lower())


def price_num(p):
    d = re.sub(r'[^\d]', '', str(p or ''))
    return int(d) if d else None


def main():
    if not os.path.exists(SNAP):
        sys.exit('site_snapshot.json not found — run scripts/scrape_cli.py first')
    snap = json.load(open(SNAP))
    data = json.load(open(DATA))
    live = {addr_key(l['address']): l for l in snap['listings']}

    changed = 0
    for p in data['props']:
        l = live.get(addr_key(p['address']))
        if not l:
            continue
        new_price = price_num(l.get('price'))
        if p.get('status') != l['status'] or (new_price and new_price != p.get('price')):
            changed += 1
        p['status'] = l['status']
        if new_price:
            p['price'] = new_price
        p['liveChecked'] = True

    sheet_keys = {addr_key(p['address']) for p in data['props']}
    data['inventory'] = [dict(
        id=l.get('id'), address=l['address'], price=price_num(l.get('price')),
        priceTxt=l.get('price'), beds=l.get('beds'), baths=l.get('baths'), sqft=l.get('sqft'),
        terms=l.get('terms'), status=l['status'], link=l.get('link'), img=l.get('img') or '',
        inSheet=addr_key(l['address']) in sheet_keys) for l in snap['listings']]

    k = data['kpi']
    statuses = [p['status'] for p in data['props']]
    k.update(available=statuses.count('Available'), pending=statuses.count('Pending'),
             sold=statuses.count('Sold'), offmarket=statuses.count('Off-market'),
             siteTotal=snap['count'], siteAvailable=snap['available'],
             sitePending=snap['pending'], siteSold=snap['sold'],
             checked=snap['checked'], missing=len([l for l in data['inventory']
                                                   if not l['inSheet']]))

    # flag follow-ups that reference a property which just left the market
    gone = 0
    for f in data['followups']:
        f['gone'] = [a for a in f['props']
                     if (live.get(addr_key(a)) or {}).get('available') is False]
        gone += 1 if f['gone'] else 0

    data['changes'] = [dict(address=l['address'], kind='Not in the sheet', detail=l['status'],
                            price=l.get('price'), link=l.get('link'))
                       for l in data['inventory'] if not l['inSheet']]

    json.dump(data, open(DATA, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f"applied snapshot {snap['checked']}: {changed} property rows updated · "
          f"{snap['available']} available · {gone} follow-ups now reference an unavailable listing")


if __name__ == '__main__':
    main()
