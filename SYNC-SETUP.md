# DISPO ⇄ Google Sheet · two-way sync

The app and a Google Sheet stay in step, in **both** directions:

* change something in the app (edit a cell, add a lead, delete a row) → press **Sheet sync ▸ Push**, it lands in the sheet;
* change something in the sheet → press **Pull**, the app picks it up (the automatic switch also does this on every change (pull every 20 s));
* a row changed on both sides keeps the **newer** one (ISO `Updated` column, last write wins).

Your original **Dispo Sheet is never touched.** The script owns a separate bridge tab.

---

## 1 · Put the script in the sheet (one time, ~2 minutes)

1. Open the bridge sheet: **DISPO SYNC (bridge sheet)** — it already holds all 4,977 buyer rows.
   *(You can also use your own sheet; the script creates the `DISPO SYNC` tab by itself.)*
2. Menu **Extensions ▸ Apps Script**.
3. Delete the sample code, paste the whole of **`automation/dispo_sync.gs`**, press 💾 **Save**.
4. **Deploy ▸ New deployment ▸ ⚙ Web app**
   * Description: `DISPO sync`
   * Execute as: **Me**
   * Who has access: **Anyone**
   * **Deploy** → authorise (Google asks once) → copy the URL that ends in **`/exec`**.

> “Anyone” only means “anyone who has the link can call the script”. It does not publish the sheet,
> and the script only ever writes to the bridge tab.

## 2 · Connect the app

1. Buyer List ▸ **Sheet sync** (in the edit bar, with the cloud icon).
2. Paste the `/exec` URL → **Connect**. You should see `Connected to <sheet> · N rows`.
3. Turn on **Automatic — push on every change, pull every 20 s** if you want it hands-free.

## 3 · Everyday use

| Button | What it does |
|---|---|
| **↑ Push my changes** | sends every local change not yet in the sheet (in chunks of 40 rows) |
| **↓ Pull from sheet** | brings back only the rows changed since the last pull |
| **Sync both ways now** | push, then pull — the safe “make everything match” button |
| Automatic switch | pushes 1.5 s after any change, pulls every 20 s, and never needs a button |

The button in the edit bar tells you where you stand: grey `Sheet sync` = not connected,
amber `Sync pending` = local changes waiting to go up, green `Sheet synced` = both sides agree.

## How the bridge tab is laid out

`Key · Property · Buyer Status · Source · Offer · Earnest · Type · Name · Phone · Email · Last Touch Date · Notes / Last Update · Contact ID · Deleted · Updated`

* **Key** is the identity of the row — never edit or duplicate it.
* **Deleted** = `TRUE` marks a row the app deleted (it stays visible for the audit trail).
* **Updated** is the ISO timestamp used by last-write-wins.
* Edit any other cell directly in the sheet; the app picks it up on the next pull.

## If you want the sheet to start from your *original* tab

In the Apps Script editor set `SOURCE_TAB = 'Dispo Sheet'` (or whatever the tab is called) and run
`seedFromCurrentTab()` once. It reads the banner/buyer layout and fills the bridge tab. The original
tab is only read, never written.

## Limits worth knowing

* Apps Script Web Apps answer slowly on a cold start (2–5 s). The app waits 30 s for a pull and 45 s for a push chunk.
* A push is chunked to keep every request URL small; 4,977 rows of edits would take a few minutes the first time,
  but in daily use a push is a handful of rows.
* Pull returns only what changed, so it is fast after the first sync.
* Everything is still stored in the browser as well — an `Export edits` file (JSON) remains your offline backup.
