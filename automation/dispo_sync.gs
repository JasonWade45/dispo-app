/**
 * DISPO · Google Sheet ⇄ DISPO app · two-way sync
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES
 *   Keeps a dedicated tab (default: `DISPO SYNC`) as the bridge between your
 *   Google Sheet and the DISPO web app. The app pushes every change it makes
 *   (new lead, edited cell, deleted row) and pulls every change made in the
 *   sheet. Last write wins, compared on the ISO `Updated` column.
 *   ⚠ Your original sheet / tab is never touched — this only writes to the
 *   bridge tab, which the script creates by itself.
 *
 * ONE-TIME SETUP (2 minutes)
 *   1. Open the Google Sheet you want to sync → Extensions ▸ Apps Script.
 *   2. Delete the sample code, paste this whole file, press 💾 Save.
 *   3. Deploy ▸ New deployment ▸ type "Web app"
 *        Description : DISPO sync
 *        Execute as  : Me
 *        Who has access : Anyone
 *      → Deploy, authorise, then copy the `.../exec` URL.
 *   4. In the app: Buyer List ▸ Sheet sync → paste the URL → Connect.
 *
 * OPTIONAL
 *   • To start from what is already in your sheet, run `seedFromCurrentTab()`
 *     once from the Apps Script editor (reads `SOURCE_TAB` and fills the bridge
 *     tab). Leave SOURCE_TAB empty to skip that.
 *   • `installAutoPush()` makes the sheet push its changes to the app on every
 *     edit … not needed: the app pulls by itself.
 */

/* ───── settings ──────────────────────────────────────────────────────────── */
const BRIDGE_TAB = 'DISPO SYNC';   // the tab this script owns
const SOURCE_TAB = '';             // optional: a tab to seed from, '' = off
const HEAD = ['Key', 'Property', 'Buyer Status', 'Source', 'Offer', 'Earnest',
              'Type', 'Name', 'Phone', 'Email', 'Last Touch Date',
              'Notes / Last Update', 'Contact ID', 'Deleted', 'Updated'];

/* column order of the bridge tab, mirrored in the app */
const F = ['status','source','offer','earnest','type','name','phone','email','last','notes'];

/* ───── tab helpers ───────────────────────────────────────────────────────── */
function bridge_(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BRIDGE_TAB);
  if(!sh){
    // a sheet imported from the CSV already carries our header — reuse it
    sh = ss.getSheets().find(x => String(x.getRange(1, 1).getValue()).trim() === HEAD[0]) || null;
  }
  if(!sh){
    sh = ss.insertSheet(BRIDGE_TAB);
  }
  if(sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== HEAD[0]){
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD])
      .setFontWeight('bold').setBackground('#0e1a2b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150);
    sh.setColumnWidth(2, 300);
    sh.setColumnWidth(12, 320);
  }
  return sh;
}

function rowsToObjects_(sh){
  const last = sh.getLastRow();
  if(last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  return values.filter(r => r[0] !== '' && !r[13]).map(r => ({
    key: String(r[0]),
    property: String(r[1] || ''),
    status: String(r[2] || ''),
    source: String(r[3] || ''),
    offer: r[4] === '' ? '' : String(r[4]),
    earnest: r[5] === '' ? '' : String(r[5]),
    type: String(r[6] || ''),
    name: String(r[7] || ''),
    phone: String(r[8] || ''),
    email: String(r[9] || ''),
    last: r[10] instanceof Date ? Utilities.formatDate(r[10], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[10] || ''),
    notes: String(r[11] || ''),
    cid: String(r[12] || ''),
    updated: r[14] instanceof Date ? r[14].toISOString() : String(r[14] || ''),
  }));
}

function indexOfKey_(sh){
  const last = sh.getLastRow();
  const map = {};
  if(last < 2) return map;
  const keys = sh.getRange(2, 1, last - 1, 1).getValues();
  keys.forEach((r, i) => { const k = String(r[0]); if(k) map[k] = i + 2; });
  return map;
}

/* ───── write one row ─────────────────────────────────────────────────────── */
function writeRow_(sh, idx, row){
  const line = [
    row.key || '', row.property || '', row.status || '', row.source || '',
    row.offer === '' || row.offer == null ? '' : row.offer,
    row.earnest === '' || row.earnest == null ? '' : row.earnest,
    row.type || '', row.name || '', row.phone || '', row.email || '',
    row.last || '', row.notes || '', row.cid || '', '',
    row.updated || new Date().toISOString(),
  ];
  if(idx){ sh.getRange(idx, 1, 1, HEAD.length).setValues([line]); return idx; }
  sh.appendRow(line);
  return sh.getLastRow();
}

/* ───── JSONP out (works from file:// and any static host) ────────────────── */
function out_(obj, callback){
  const body = callback ? callback + '(' + JSON.stringify(obj) + ');' : JSON.stringify(obj);
  return ContentService.createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

/* ───── GET: ping / pull ──────────────────────────────────────────────────── */
function doGet(e){
  const p = (e && e.parameter) || {};
  const cb = p.callback || '';
  try{
    const sh = bridge_();
    const action = p.action || 'ping';

    if(action === 'ping'){
      return out_({ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
                   tab: BRIDGE_TAB, rows: Math.max(0, sh.getLastRow() - 1),
                   serverTime: new Date().toISOString()}, cb);
    }

    if(action === 'pull'){
      const since = p.since || '';
      const all = rowsToObjects_(sh);
      const rows = since ? all.filter(r => r.updated && r.updated > since) : all;
      // deleted rows are flagged, not removed, so the app can see them
      const last = sh.getLastRow();
      const deleted = [];
      if(last >= 2){
        const vals = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
        vals.forEach(r => {
          if(!r[0] || !r[13]) return;
          const updated = r[14] instanceof Date ? r[14].toISOString() : String(r[14] || '');
          if(!since || updated > since) deleted.push(String(r[0]));
        });
      }
      return out_({ok: true, rows: rows, deleted: deleted,
                   serverTime: new Date().toISOString()}, cb);
    }

    if(action === 'push'){
      return out_(push_(p.payload), cb);
    }

    return out_({ok: false, error: 'unknown action ' + action}, cb);
  }catch(err){
    return out_({ok: false, error: String(err && err.message || err)}, cb);
  }
}

/* ───── POST: same as GET push (kept for curl / scripts) ──────────────────── */
function doPost(e){
  try{
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    return ContentService.createTextOutput(JSON.stringify(push_(JSON.stringify(body.ops || body))))
      .setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ───── the actual write ──────────────────────────────────────────────────── */
function push_(payload){
  const ops = typeof payload === 'string' ? JSON.parse(payload || '[]') : (payload || []);
  if(!Array.isArray(ops)) return {ok:false, error:'payload is not a list'};
  const sh = bridge_();
  const idx = indexOfKey_(sh);
  let set = 0, del = 0, skipped = 0;
  const stamp = new Date().toISOString();
  ops.forEach(op => {
    if(!op || !op.key) return;
    if(op.op === 'del'){
      const at = idx[op.key];
      if(at){
        sh.getRange(at, 14).setValue(true);
        sh.getRange(at, 15).setValue(op.updated || stamp);
        idx[op.key] = at; del++;
      } else skipped++;
      return;
    }
    if(op.op === 'set' && op.row){
      const row = Object.assign({}, op.row, {key: op.key, updated: op.row.updated || stamp});
      const at = idx[op.key];
      const where = writeRow_(sh, at || 0, row);
      idx[op.key] = where; set++;
    }
  });
  SpreadsheetApp.flush();
  return {ok:true, set: set, del: del, skipped: skipped, rows: Math.max(0, sh.getLastRow() - 1),
          serverTime: new Date().toISOString()};
}

/* ───── optional: seed the bridge tab from an existing tab ────────────────── */
/**
 * Run once from the editor if you want the sheet's existing rows to appear in
 * the app. It reads SOURCE_TAB looking for a property address column and a
 * name column — adjust the two numbers below to your sheet.
 */
function seedFromCurrentTab(){
  if(!SOURCE_TAB) throw new Error('Set SOURCE_TAB first');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(SOURCE_TAB);
  if(!src) throw new Error('Tab not found: ' + SOURCE_TAB);
  const sh = bridge_();
  const idx = indexOfKey_(sh);
  const values = src.getDataRange().getValues();
  let current = '', n = 0;
  values.forEach((r, i) => {
    if(i === 0) return;
    const line = r.map(c => String(c == null ? '' : c).trim());
    const nonEmpty = line.filter(Boolean).length;
    if(nonEmpty === 0) return;
    // a banner row: almost everything empty except one long address-looking cell
    const looksAddress = /\d/.test(line[1] || '') && /[a-z]/i.test(line[1] || '') && !line[6];
    if(looksAddress && nonEmpty <= 4){ current = line[1]; return; }
    const name = line[6], phone = line[7], email = line[8];
    if(!name && !phone && !email) return;
    const key = 'seed-' + (i + 1);
    const row = {
      key: key, property: current, status: line[1], source: line[2], offer: line[3],
      earnest: line[4], type: line[5], name: name, phone: phone, email: email,
      last: line[9], notes: line[10], cid: line[11], updated: new Date().toISOString(),
    };
    writeRow_(sh, idx[key] || 0, row);
    idx[key] = sh.getLastRow();
    n++;
  });
  SpreadsheetApp.flush();
  return n + ' rows written to ' + BRIDGE_TAB;
}

/* ───── small check from the editor ───────────────────────────────────────── */
function healthCheck(){
  const sh = bridge_();
  return {tab: BRIDGE_TAB, rows: Math.max(0, sh.getLastRow() - 1),
          deployed: 'Deploy ▸ Manage deployments to copy the /exec URL'};
}
