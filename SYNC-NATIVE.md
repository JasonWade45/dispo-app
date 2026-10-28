# Sync straight into your own `Property Sheet`

This is the version to use when the changes must land in the sheet you already
work in — the one with the green property banners and the buyer rows under them.

## Why a Google-Sheet copy is needed
`Dispo Sheet` in Drive is an **.xlsx** file. Google opens those in *Office
editing mode*, where the `Extensions ▸ Apps Script` menu does not exist, so no
script can be attached to it. Converting it to a real Google Sheet (File ▸ Save
as Google Sheets) keeps every tab, the banner colours and the layout, and makes
the script possible. `Dispo Sheet` (Google Sheet) **is** that copy — it keeps the original's name and
every tab. The old `.xlsx` is kept in Drive as
`Dispo Sheet (OLD Excel copy — archive)` and is never written to.

## Setup (2 minutes, once)
1. Open **Dispo Sheet — SYNC**
   https://docs.google.com/spreadsheets/d/113r2V62hivFhAWjfGRBOqZXfyS7g1Sp1Ceq_pFPsT-M/edit
2. **Extensions ▸ Apps Script** → delete the sample code → paste all of
   `automation/dispo_sync_native.gs` → 💾 **Save**.
3. **Deploy ▸ New deployment ▸ Web app** — *Execute as* **Me**, *Who has access*
   **Anyone** → **Deploy** → authorise → copy the `…/exec` URL.
4. In the app: **Today ▸ Google Sheet sync ▸ Sync settings** → paste the URL →
   **Connect**.

## What the script does
| Direction | Effect |
|---|---|
| app → sheet | edits and new leads are written into `Property Sheet`, columns **A…J**, of the matching buyer row |
| app → sheet (new lead) | a row is inserted **inside that property's block**, formatted like the row above it |
| app → sheet (delete) | the buyer's cells are cleared and `NOTES` (column K) is set to `deleted from the app` |
| sheet → app | anything you type in the tab is picked up on the next pull |
| both | last write wins, compared on an ISO stamp |

A hidden tab `DISPO SYNC` is created inside the same file. It stores the
bookkeeping only: key, timestamp, deleted flag and the row number in
`Property Sheet`. Nothing in it is meant to be edited by hand.

## Good to know
* Columns **A…J** are the only ones the script writes. The banner rows, the
  legend at the top, the colours and every other tab are left alone.
* The property banner row of a block is never touched — only its buyer rows.
* Rows you add by hand in the middle of a block are noticed and adopted.
* `Property Sheet` must keep its name; change `TARGET_TAB` at the top of the
  script if you rename it.
* Run `healthCheck()` from the editor any time to see counts.

## Your deployment

* Web app URL: `https://script.google.com/macros/s/AKfycbySd6whuDhtDrX6tkPMcZJ0R-0eO8UBbGWgz0s9I5xlAVoThqkw-hwQQoqNBudgV3v3/exec`
* Verified: ping ok · full pull of 5,141 sheet rows in ~25 s · app edit written into
  `Property Sheet` · new lead inserted inside its property block · deleted lead cleared.
* To ship a new version of the script: **Deploy ▸ Manage deployments ▸ ✏ ▸ Version:
  New version ▸ Deploy** — the URL stays the same.

## In the app

Today ▸ **Google Sheet sync** ▸ **Sync settings** → paste the URL → **Connect**.
After that it is automatic: a change is pushed ~1.5 s after you make it, and the
sheet is checked every 20 s. Buyer List ▸ **Sheet sync** shows the same state, and
searches now auto-open the property that contains the hit.

## Verified end state (live deployment)

| Check | Result |
|---|---|
| ping | `ok:true` · `Dispo Sheet — SYNC` · `Property Sheet` · 6,856 rows |
| first pull | 5,265 rows in ~15 s |
| app edit → sheet | row updated in the tab, confirmed by a follow-up pull |
| new lead → sheet | inserted inside its property block, row count +1 |
| delete → sheet | buyer cells cleared, `NOTES` says `deleted from the app` |
| sheet → app | arrived in 55 s (20 s tick + cold start + pull) |
| repeated pulls | total count stable — the dedupe pass holds |

`installTriggers()` installs an `onEdit` trigger that bumps the revision stamp,
so a hand edit in `Property Sheet` is noticed on the next 20 s tick.
