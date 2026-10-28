# DISPO · Real Estate OS

A single-file disposition workspace for a real-estate wholesaler: live inventory pulled
from the public listing site, the buyer list, follow-up messages, and two-way sync with
a Google Sheet.

**Live app:** https://jasonwade45.github.io/dispo-app/

## What the open page contains

The published page is open code — every line of the UI is readable — but **the buyer
list is not**. The personal data (names, phones, e-mails) ships as one blob encrypted
with AES-256-GCM; the key is derived from a passcode with PBKDF2-SHA256 (320k
iterations) inside the browser. No passcode, no data: the blob is noise, and nothing is
sent to any server to open it.

The bridge URL to the Google Sheet is deliberately **not** in this repo either — it is
pasted once per device under *Sync settings*, so the repository cannot be used to pull
the sheet.

## How data flows

| Layer | Source | Notes |
|---|---|---|
| Which homes exist, price, beds/baths/sqft, photo, Available / Pending / Sold | `elevatereg.com` | scraped by the browser itself, page by page, 350 ms apart; a baked snapshot ships as a fallback |
| Buyers, phones, e-mails, offers, last touch | `Dispo Sheet` (Google Sheet) → encrypted blob, then two-way sync | the sheet is the only source for people |
| Edits made in the app | pushed to the sheet through the Apps Script bridge | last write wins, per row |

Property status always wins over the sheet: a sheet pull can never overwrite a status
that the site reports.

## Repo layout

```
docs/index.html        built app (GitHub Pages serves this)
template.html          app source; build reads __DATA__ out of it
scripts/build_cloud.py builds docs/index.html: encrypts data.json, inlines site.json
scripts/scrape_site.py the site scraper (550 listings, ~35 s)
scripts/build_app.py   offline build: inlines data.json directly (not published)
automation/            Apps Script bridge (Google Sheet ⇄ app, JSONP)
api/                   optional Vercel functions
site.json              public snapshot of elevatereg.com listings
```

## Building the published copy

```bash
# 1 · a fresh snapshot of the listing site (optional, the app also refreshes itself)
python3 scripts/scrape_site.py

# 2 · build + encrypt, then commit
python3 scripts/build_cloud.py --pass 'YOUR-PASSCODE' --out site/index.html
cp site/index.html docs/index.html
```

`data.json` (buyers) is git-ignored on purpose — keep it in a private archive, never
here.

## Notes

* The site refuses `Origin: null`, so a copy opened straight from `file://` can only use
  the baked snapshot. Hosted (https) it scrapes live.
* Apps Script cannot scrape the site: the CDN drops datacenter IPs. Reading happens in
  the browser; the bridge only carries sheet rows.
* The app is 100 % English by design; message templates avoid prices.
