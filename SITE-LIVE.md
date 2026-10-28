# Properties now come from elevatereg.com

The company site is the source of truth for **properties**: address, price,
beds, baths, sqft, link, photo and availability (`Available` / `Pending` /
`Sold`). The CRM sheet is still the source of truth for **people**: the buyer
rows, statuses, notes and last-touch dates.

## How it works

```
elevatereg.com ──► the browser (direct fetch) ──► app      ← preferred, works when hosted
        └────────► Apps Script Web App (action=site) ──► app  ← fallback, e.g. file://
```
The site answers every origin, so a hosted copy of the app walks the listing pages
itself (one page at a time, with retries, ~40 s for all 554). A `file://` copy has
no origin the site accepts, so it uses the Apps Script bridge instead.

The build also **ships with a snapshot** (`site.json`, rebuilt by
`scripts/scrape_site.py`), so the app opens with real site data before any fetch,
and only refreshes when that snapshot is more than 6 hours old.

* `action=site` walks both public listings — `/property/?status=available`
  (25 pages) and `/property/?status=unavailable` (12 pages) — reads every card
  and returns the lot: **553 listings · 32 available · 341 pending · 180 sold**.
* The result is stored in the hidden tab `DISPO SITE` and reused for 6 hours,
  so the app can ask as often as it likes without hammering the site.
* `action=site&force=1` (the **Refresh from site** button) always refetches.

## In the app

* **Properties** is built from the site: the status, price, beds, baths and
  sqft chips come straight from the listing. A property that is on the site but
  not in the CRM is added automatically with 0 buyers, so nothing is invisible.
* **Live Inventory** lists all 553 listings with their real status.
* **Follow-ups** only build messages for properties the site still shows as
  `Available` — a pending or sold listing is flagged `gone`.
* The sidebar shows **Site synced <date>**; the button under it refetches.
* The last snapshot is kept in `localStorage["dispo:site"]`, so the app opens
  with real data even before the bridge answers.

## Why the sheet is still needed

Buyers do not exist on the website. Every person, status, phone, note and
last-touch date comes from `Dispo Sheet`, and edits still sync both ways. The
two sources are merged: site wins for the property, sheet wins for the buyer.
