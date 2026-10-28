"""Inline data.json + images.json into index.html (single self-contained file)."""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    tpl = open(os.path.join(ROOT, 'template.html')).read()
    data = json.load(open(os.path.join(ROOT, 'data.json')))
    imgs_path = os.path.join(ROOT, 'images.json')
    imgs = json.load(open(imgs_path)) if os.path.exists(imgs_path) else {}
    for p in data['props']:
        p['img'] = imgs.get(str(p['row']), p.get('img') or '')
    site_path = os.path.join(ROOT, 'site.json')
    site = json.load(open(site_path)) if os.path.exists(site_path) else None
    html = tpl.replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    seed = ('<script>window.__SITE_SNAPSHOT__=' +
            json.dumps(site, ensure_ascii=False, separators=(',', ':')) + ';</script>\n')
    html = html.replace('<script>window.DISPO_DATA =', seed + '<script>window.DISPO_DATA =', 1)
    out = os.path.join(ROOT, 'index.html')
    open(out, 'w').write(html)
    print(f'index.html rebuilt · {os.path.getsize(out)/1048576:.2f} MB · '
          f'{len(data["props"])} properties · {len(data["followups"])} messages'
          + (f' · site {site["count"]} listings ({site["available"]} available)' if site else ''))


if __name__ == '__main__':
    main()
