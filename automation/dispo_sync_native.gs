/**
 * DISPO · two-way sync straight into your own "Property Sheet" tab
 * ─────────────────────────────────────────────────────────────────────────────
 * This version writes into the tab you already work in — the one with the green
 * property banners and the buyer rows underneath. No second sheet to look at.
 *
 *   app  → sheet : edits, new leads and deletes are written into `Property Sheet`
 *                  (columns A…J) in place.
 *   sheet → app  : anything you type in that tab is picked up on the next pull.
 *   last write wins per row, on an ISO stamp kept in a hidden bookkeeping tab
 *   `DISPO SYNC` inside this same file.
 *
 * ONE-TIME SETUP
 *   1. Open the Google Sheet (a real Google Sheet — not an .xlsx in Office mode)
 *      → Extensions ▸ Apps Script.
 *   2. Delete the sample code, paste this whole file, press 💾 Save.
 *   3. Deploy ▸ New deployment ▸ Web app
 *        Execute as     : Me
 *        Who has access : Anyone
 *      → Deploy → authorise → copy the `…/exec` URL.
 *   4. App → Today ▸ Google Sheet sync ▸ Sync settings ▸ paste ▸ Connect.
 */

/* ───── settings ──────────────────────────────────────────────────────────── */
const TARGET_TAB = 'Property Sheet';   // the tab you work in
const BRIDGE_TAB = 'DISPO SYNC';       // hidden bookkeeping tab
const DATA_FIRST_ROW = 13;             // everything above is legend

const HEAD = ['Key', 'Property', 'Buyer Status', 'Source', 'Offer', 'Earnest',
              'Type', 'Name', 'Phone', 'Email', 'Last Touch Date',
              'Notes / Last Update', 'Contact ID', 'Deleted', 'Updated', 'Sheet Row'];

/* where each value lives in `Property Sheet` (1-based column numbers) */
const COL = { status: 1, source: 2, offer: 3, earnest: 4, type: 5, name: 6,
              phone: 7, email: 8, last: 9, notes: 10 };
const FIELDS = ['status', 'source', 'offer', 'earnest', 'type', 'name', 'phone',
                'email', 'last', 'notes'];
const ADDR_RE = /^\s*\d+.*(?:GA|Ga|Georgia)\.?\s*\d{5}/;

/* ───── helpers ───────────────────────────────────────────────────────────── */
const str_ = v => v === null || v === undefined ? '' : String(v).trim();
const norm_ = s => str_(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const iso_ = d => d instanceof Date ? d.toISOString() : str_(d);
const dateOrText_ = v => {
  const s = str_(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : s;
};
function out_(obj, callback){
  const body = callback ? callback + '(' + JSON.stringify(obj) + ');' : JSON.stringify(obj);
  return ContentService.createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

/* ───── the two tabs ──────────────────────────────────────────────────────── */
function target_(){
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TARGET_TAB);
  if(!sh) throw new Error('Tab not found: ' + TARGET_TAB);
  return sh;
}
function bridge_(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BRIDGE_TAB);
  if(!sh) sh = ss.insertSheet(BRIDGE_TAB);
  if(sh.getLastRow() === 0 || str_(sh.getRange(1, 1).getValue()) !== HEAD[0]){
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD])
      .setFontWeight('bold').setBackground('#0e1a2b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150);
    sh.setColumnWidth(2, 300);
    sh.setColumnWidth(12, 320);
  }
  sh.hideSheet();
  return sh;
}

/* ───── read the tab you work in ──────────────────────────────────────────── */
/** blocks: [{address, bannerRow, buyers:[…]}], buyers: flattened with .address */
function readVisible_(){
  const sh = target_();
  const last = sh.getLastRow();
  const blocks = [], buyers = [];
  if(last < DATA_FIRST_ROW) return {blocks, buyers, sheet: sh};
  const vals = sh.getRange(DATA_FIRST_ROW, 1, last - DATA_FIRST_ROW + 1, 10).getValues();
  let cur = null;
  vals.forEach((r, i) => {
    const row = i + DATA_FIRST_ROW;
    const colB = str_(r[1]);
    const rec = {
      row,
      status: str_(r[0]), source: colB,
      offer: str_(r[2]), earnest: str_(r[3]), type: str_(r[4]),
      name: str_(r[5]), phone: str_(r[6]), email: str_(r[7]),
      last: r[8] instanceof Date ? Utilities.formatDate(r[8], Session.getScriptTimeZone(), 'yyyy-MM-dd') : str_(r[8]),
      notes: str_(r[9]),
    };
    if(colB && ADDR_RE.test(colB)){
      cur = {address: colB, bannerRow: row, buyers: []};
      blocks.push(cur);
      return;
    }
    if(!(rec.status || rec.name || rec.phone || rec.email)) return;   // blank spacer row
    if(!cur){ cur = {address: '', bannerRow: 0, buyers: []}; blocks.push(cur); }
    rec.address = cur.address;
    cur.buyers.push(rec);
    buyers.push(rec);
  });
  return {blocks, buyers, sheet: sh};
}

/* ───── the bookkeeping tab ───────────────────────────────────────────────── */
function readBridge_(){
  const sh = bridge_();
  const last = sh.getLastRow();
  if(last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  return vals.map((r, i) => ({
    at: i + 2,
    key: str_(r[0]), property: str_(r[1]), status: str_(r[2]), source: str_(r[3]),
    offer: str_(r[4]), earnest: str_(r[5]), type: str_(r[6]), name: str_(r[7]),
    phone: str_(r[8]), email: str_(r[9]),
    last: r[10] instanceof Date ? Utilities.formatDate(r[10], Session.getScriptTimeZone(), 'yyyy-MM-dd') : str_(r[10]),
    notes: str_(r[11]),
    cid: str_(r[12]), deleted: !!r[13], updated: iso_(r[14]), sheetRow: Number(r[15]) || 0,
  })).filter(e => e.key);
}
function bridgeLine_(e){
  return [e.key || '', e.property || '', e.status || '', e.source || '',
          e.offer || '', e.earnest || '', e.type || '', e.name || '', e.phone || '',
          e.email || '', e.last || '', e.notes || '', e.cid || '',
          e.deleted ? true : '', e.updated || new Date().toISOString(),
          e.sheetRow || ''];
}
function writeBridge_(entries){
  const sh = bridge_();
  const old = Math.max(0, sh.getLastRow() - 1);
  if(!entries.length){ if(old) sh.getRange(2, 1, old, HEAD.length).clearContent(); return; }
  const data = entries.map(bridgeLine_);
  sh.getRange(2, 1, data.length, HEAD.length).setValues(data);
  if(old > data.length) sh.getRange(data.length + 2, 1, old - data.length, HEAD.length).clearContent();
}

/* ───── same lead? ────────────────────────────────────────────────────────── */
function addrMatch_(a, b){
  const x = norm_(a), y = norm_(b);
  if(!x || !y) return false;
  if(x === y) return true;
  const n = Math.min(22, x.length, y.length);
  return x.slice(0, n) === y.slice(0, n);
}
function sameLead_(a, b){
  if(!addrMatch_(a.address || a.property, b.address || b.property)) return false;
  const an = norm_(a.name), bn = norm_(b.name);
  if(an && bn && an === bn) return true;
  const ap = norm_(a.phone), bp = norm_(b.phone);
  if(ap && bp && ap === bp) return true;
  const ae = norm_(a.email), be = norm_(b.email);
  if(ae && be && ae === be) return true;
  return false;
}
const pick_ = v => { const o = {}; FIELDS.forEach(f => { o[f] = str_(v[f]); }); return o; };

/* ───── fast lookup (5,000 leads must not be compared one by one) ─────────── */
const addrKey_ = v => norm_(v && (v.address || v.property)).slice(0, 22);
function buildIndex_(list){
  const idx = {byKey: {}, byAN: {}, byAP: {}, byAE: {}, bySheetRow: {}, list};
  list.forEach(b => addToIndex_(idx, b));
  return idx;
}
const hasId_ = o => !!(norm_(o && o.name) || norm_(o && o.phone) || norm_(o && o.email));
function addToIndex_(idx, b){
  if(b.key) idx.byKey[norm_(b.key)] = b;
  const sr = Number(b.sheetRow) || 0;
  if(sr && !idx.bySheetRow[sr]) idx.bySheetRow[sr] = b;
  const a = addrKey_(b);
  if(!a) return;
  const n = norm_(b.name); if(n) idx.byAN[a + '|' + n] = idx.byAN[a + '|' + n] || b;
  const p = norm_(b.phone); if(p) idx.byAP[a + '|' + p] = idx.byAP[a + '|' + p] || b;
  const e = norm_(b.email); if(e) idx.byAE[a + '|' + e] = idx.byAE[a + '|' + e] || b;
}
function lookup_(idx, want){
  if(want.key && idx.byKey[norm_(want.key)]) return idx.byKey[norm_(want.key)];
  const a = addrKey_(want);
  if(!a) return null;
  const n = norm_(want.name); if(n && idx.byAN[a + '|' + n]) return idx.byAN[a + '|' + n];
  const p = norm_(want.phone); if(p && idx.byAP[a + '|' + p]) return idx.byAP[a + '|' + p];
  const e = norm_(want.email); if(e && idx.byAE[a + '|' + e]) return idx.byAE[a + '|' + e];
  return null;
}

/* ───── one entry per lead, newest wins (keeps the tab from growing) ──────── */
function dedupe_(bridge){
  const keep = new Map();
  bridge.forEach(e => {
    const idless = !hasId_(e);
    const k = idless
      ? 'row|' + (Number(e.sheetRow) || 0) + '|' + addrKey_(e)
      : [addrKey_(e), norm_(e.name), norm_(e.phone), norm_(e.email)].join('|');
    const prev = keep.get(k);
    if(!prev || str_(e.updated) > str_(prev.updated)) keep.set(k, e);
  });
  return Array.from(keep.values());
}

/* ───── sheet → bookkeeping (what you typed in the tab) ───────────────────── */
/** adds/updates bookkeeping rows from the tab; returns the entries that moved */
function reconcile_(vis, bridge){
  const fresh = [];
  const idx = buildIndex_(bridge);
  vis.buyers.forEach(v => {
    const want = {address: v.address, name: v.name, phone: v.phone, email: v.email};
    let hit = lookup_(idx, want);
    if(!hit && !hasId_(want)) hit = idx.bySheetRow[v.row] || null;   // status-only row
    if(!hit){
      const rec = Object.assign({
        key: 'sheet-' + Utilities.getUuid().slice(0, 8),
        property: v.address, cid: '', deleted: false,
        updated: new Date().toISOString(), sheetRow: v.row,
      }, pick_(v));
      bridge.push(rec);
      addToIndex_(idx, rec);
      fresh.push(rec);
      return;
    }
    const patch = pick_(v);
    let dirty = false;
    FIELDS.forEach(f => { if(str_(hit[f]) !== patch[f]){ hit[f] = patch[f]; dirty = true; } });
    if(hit.sheetRow !== v.row) hit.sheetRow = v.row;
    if(dirty){
      hit.deleted = false;
      hit.updated = new Date().toISOString();
      hit.property = v.address || hit.property;
      fresh.push(hit);
    }
  });
  return fresh;
}

/* ───── write one lead into the tab you work in ───────────────────────────── */
function visibleRowFor_(vis, entry){
  const want = {address: entry.property, name: entry.name, phone: entry.phone, email: entry.email};
  let hit = entry.sheetRow ? vis.buyers.find(v => v.row === entry.sheetRow && sameLead_(v, want)) : null;
  if(hit) return hit.row;
  hit = vis.buyers.find(v => sameLead_(v, want));
  return hit ? hit.row : 0;
}
function writeVisible_(sh, row, entry){
  const line = [[
    entry.status || '', entry.source || '', entry.offer || '', entry.earnest || '',
    entry.type || '', entry.name || '', entry.phone || '', entry.email || '',
    dateOrText_(entry.last), entry.notes || '',
  ]];
  sh.getRange(row, 1, 1, 10).setValues(line);
}
/** new lead: a row inside its property block, looking like the row above it */
function insertLead_(entry){
  const sh = target_();
  const vis = readVisible_();
  const block = vis.blocks.find(b => addrMatch_(b.address, entry.property));
  let at;
  if(block && block.buyers.length){
    at = block.buyers[block.buyers.length - 1].row;      // last buyer of the block
  } else if(block){
    at = block.bannerRow;
  } else {
    at = sh.getLastRow();                                 // property not found → bottom
  }
  sh.insertRowAfter(at);
  const newRow = at + 1;
  sh.getRange(at, 1, 1, 10).copyTo(sh.getRange(newRow, 1, 1, 10), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  writeVisible_(sh, newRow, entry);
  return newRow;
}

/* ───── revision stamp: one cheap question instead of a full pull ─────────── */
function bumpRev_(){
  const rev = new Date().toISOString();
  PropertiesService.getDocumentProperties().setProperty('rev', rev);
  return rev;
}
function rev_(){
  return PropertiesService.getDocumentProperties().getProperty('rev') || '';
}
/** run once from the editor so a hand edit in the sheet bumps the stamp */
function installTriggers(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(t => {
    if(t.getHandlerFunction() === 'onSheetEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  bumpRev_();
  return 'trigger installed';
}
function onSheetEdit(e){
  try{ bumpRev_(); }catch(err){}
}


/* ═══════════════════════════════════════════════════════════════════════════
   THE COMPANY SITE — elevatereg.com — is the source of truth for properties
   ---------------------------------------------------------------------------
   `action=site` walks the two public listings (available / unavailable), reads
   every card, and returns the lot. The result is cached in a hidden tab so the
   app can ask for it as often as it likes; a real fetch happens at most once
   every 6 hours (or immediately with `force=1`).
   ═════════════════════════════════════════════════════════════════════════ */
const SITE_BASE = 'https://www.elevatereg.com/property/';
const SITE_TAB = 'DISPO SITE';
const SITE_TTL_MIN = 360;
const SITE_HEAD = ['ID', 'Address', 'Price', 'Beds', 'Baths', 'Sqft', 'Terms',
                   'Badge', 'Status', 'Link', 'Image'];

function siteTab_(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SITE_TAB);
  if(!sh){
    sh = ss.insertSheet(SITE_TAB);
    sh.getRange(1, 1, 1, SITE_HEAD.length).setValues([SITE_HEAD])
      .setFontWeight('bold').setBackground('#0e1a2b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}
function readSiteTab_(){
  const sh = siteTab_();
  const last = sh.getLastRow();
  if(last < 2) return [];
  return sh.getRange(2, 1, last - 1, SITE_HEAD.length).getValues()
    .filter(r => str_(r[0]))
    .map(r => ({
      id: str_(r[0]), address: str_(r[1]), price: str_(r[2]), beds: str_(r[3]),
      baths: str_(r[4]), sqft: str_(r[5]), terms: str_(r[6]), badge: str_(r[7]),
      status: str_(r[8]), link: str_(r[9]), img: str_(r[10]),
      available: str_(r[8]) === 'Available',
    }));
}
function writeSiteTab_(rows){
  const sh = siteTab_();
  const old = Math.max(0, sh.getLastRow() - 1);
  if(!rows.length) return;
  const data = rows.map(r => [r.id, r.address, r.price, r.beds, r.baths, r.sqft,
                              r.terms, r.badge, r.status, r.link, r.img]);
  sh.getRange(2, 1, data.length, SITE_HEAD.length).setValues(data);
  if(old > data.length){
    sh.getRange(data.length + 2, 1, old - data.length, SITE_HEAD.length).clearContent();
  }
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                 '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* the site is behind a CDN that does not like bare requests, so each page is
   tried a few ways and the first one that comes back with cards is remembered */
function fetchStrategies_(){
  const keep = PropertiesService.getDocumentProperties().getProperty('siteHow');
  const all = [
    {how: 'plain',    opts: {muteHttpExceptions: true, followRedirects: true}},
    {how: 'chrome',   opts: {muteHttpExceptions: true, followRedirects: true,
                             headers: {'User-Agent': CHROME_UA}}},
    {how: 'browser',  opts: {muteHttpExceptions: true, followRedirects: true,
                             headers: {'User-Agent': CHROME_UA,
                                       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                       'Accept-Language': 'en-US,en;q=0.9'}}},
  ];
  return keep ? all.filter(a => a.how === keep).concat(all.filter(a => a.how !== keep)) : all;
}
function fetchPage_(url){
  const props = PropertiesService.getDocumentProperties();
  for(const strat of fetchStrategies_()){
    for(let i = 0; i < 2; i++){
      try{
        const res = UrlFetchApp.fetch(url, strat.opts);
        const body = res.getContentText() || '';
        if(body.indexOf('<article') > -1){
          props.setProperty('siteHow', strat.how);
          return body;
        }
      }catch(err){}
      Utilities.sleep(400);
    }
  }
  return '';
}

/* diagnostics — call the Web App with ?action=probe */
function probeSite_(){
  const url = SITE_BASE + '?status=available';
  const out = [];
  fetchStrategies_().forEach(strat => {
    try{
      const res = UrlFetchApp.fetch(url, strat.opts);
      const body = res.getContentText() || '';
      out.push({how: strat.how, code: res.getResponseCode(),
                len: body.length, articles: (body.match(/<article/g) || []).length,
                head: body.slice(0, 160).replace(/\s+/g, ' ')});
    }catch(err){
      out.push({how: strat.how, error: String((err && err.message) || err)});
    }
  });
  return {ok: true, url: url, strategies: out, serverTime: new Date().toISOString()};
}

/** one page of cards → [{id, address, price, …}] */
function parseCards_(html){
  const out = [];
  const card = /<article class="post-(\d+) property[^"]*">([\s\S]*?)<\/article>/g;
  let m;
  while((m = card.exec(html)) !== null){
    const id = m[1], body = m[2];
    const pick = re => { const x = body.match(re); return x ? String(x[1]).trim() : ''; };
    out.push({
      id: id,
      address: pick(/class="property-title[^"]*">([^<]+)</),
      link: pick(/href="(https:\/\/www\.elevatereg\.com\/property\/[^"]+)"/),
      price: pick(/<li class="lead"><b>([^<]+)<\/b>/),
      beds: pick(/<li>([\d.]+) bd<\/li>/),
      baths: pick(/<li>([\d.]+) ba<\/li>/),
      sqft: pick(/<li>([\d,]+) sqft<\/li>/).replace(/,/g, ''),
      badge: pick(/<span class="badge [^"]*"[^>]*>([^<]+)<\/span>/),
      terms: pick(/<span class="property-type-heading">([^<]+)<\/span>/),
      img: pick(/<img src="([^"]+)"/),
    });
  }
  return out;
}

/** walk both listings; returns every property exactly once */
function scrapeSite_(){
  const rows = [], seen = {};
  ['available', 'unavailable'].forEach(status => {
    let page = 1, maxPage = 1, misses = 0;
    while(page <= maxPage && page <= 40){
      const url = (page === 1 ? SITE_BASE : SITE_BASE + 'page/' + page + '/') + '?status=' + status;
      const html = fetchPage_(url);
      if(!html){
        misses++;
        if(misses >= 3) break;
        page++;
        continue;
      }
      misses = 0;
      const pages = html.match(/\/property\/page\/(\d+)\//g) || [];
      pages.forEach(x => {
        const n = Number(String(x).replace(/[^\d]/g, ''));
        if(n > maxPage) maxPage = n;
      });
      parseCards_(html).forEach(c => {
        if(!c.address || seen[c.id]) return;
        seen[c.id] = true;
        c.status = status === 'unavailable'
          ? (c.badge || 'Sold')
          : (c.badge || 'Available');
        c.available = c.status === 'Available';
        rows.push(c);
      });
      page++;
      Utilities.sleep(250);
    }
  });
  return rows;
}

function sitePayload_(force){
  const props = PropertiesService.getDocumentProperties();
  const at = props.getProperty('siteAt') || '';
  const fresh = at && (Date.now() - new Date(at).getTime()) < SITE_TTL_MIN * 60000;
  let rows = (!force && fresh) ? readSiteTab_() : [];
  let cached = !!rows.length;
  if(!rows.length){
    rows = scrapeSite_();
    if(rows.length){
      writeSiteTab_(rows);
      props.setProperty('siteAt', new Date().toISOString());
    } else {
      rows = readSiteTab_();          // the site refused us — serve the last good copy
      cached = true;
    }
  }
  const by = s => rows.filter(r => r.status === s).length;
  return {
    ok: true, cached: cached, checked: props.getProperty('siteAt') || '',
    count: rows.length, available: by('Available'), pending: by('Pending'),
    sold: by('Sold'), listings: rows, serverTime: new Date().toISOString(),
  };
}

/* ───── GET: ping / pull / push ───────────────────────────────────────────── */
function doGet(e){
  const p = (e && e.parameter) || {};
  const cb = p.callback || '';
  try{
    const action = p.action || 'ping';
    if(action === 'ping'){
      const sh = target_();
      return out_({ok: true, mode: 'native',
                   sheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
                   tab: TARGET_TAB, rows: Math.max(0, sh.getLastRow() - DATA_FIRST_ROW + 1),
                   rev: rev_(), serverTime: new Date().toISOString()}, cb);
    }
    if(action === 'rev')   return out_({ok: true, rev: rev_(), serverTime: new Date().toISOString()}, cb);
    if(action === 'site')  return out_(sitePayload_(String(p.force || '') === '1'), cb);
    if(action === 'probe') return out_(probeSite_(), cb);
    if(action === 'pull')  return out_(pull_(p.since || ''), cb);
    if(action === 'push')  return out_(push_(JSON.parse(p.payload || '[]')), cb);
    return out_({ok: false, error: 'unknown action ' + action}, cb);
  }catch(err){
    return out_({ok: false, error: String((err && err.message) || err)}, cb);
  }
}
function doPost(e){
  try{
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return ContentService.createTextOutput(JSON.stringify(push_(body.ops || body)))
      .setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ───── pull: sheet → app ─────────────────────────────────────────────────── */
function pull_(since){
  const vis = readVisible_();
  const bridge = dedupe_(readBridge_());
  const fresh = reconcile_(vis, bridge);
  if(fresh.length || !bridge.length){
    writeBridge_(bridge);
    bumpRev_();
  }
  const rows = bridge.filter(e => !e.deleted && e.updated && (!since || e.updated > since))
    .map(e => ({key: e.key, property: e.property, status: e.status, source: e.source,
                offer: e.offer, earnest: e.earnest, type: e.type, name: e.name,
                phone: e.phone, email: e.email, last: e.last, notes: e.notes,
                cid: e.cid, updated: e.updated}));
  const deleted = bridge.filter(e => e.deleted && (!since || e.updated > since)).map(e => e.key);
  return {ok: true, rows, deleted, fresh: fresh.length, total: bridge.length,
          rev: rev_(), serverTime: new Date().toISOString()};
}

/* ───── push: app → sheet ─────────────────────────────────────────────────── */
function push_(ops){
  if(!Array.isArray(ops)) return {ok: false, error: 'payload is not a list'};
  const sh = target_();
  let vis = readVisible_();
  const bridge = readBridge_();
  const bridgeIdx = buildIndex_(bridge);
  let visIdx = buildIndex_(vis.buyers.map(v => Object.assign({}, v, {property: v.address})));
  const stamp = new Date().toISOString();
  let set = 0, del = 0, made = 0, skipped = 0;

  ops.forEach(op => {
    if(!op || !op.key) { skipped++; return; }
    const src = op.row || {};
    const want = {key: op.key, property: src.property || '', address: src.property || '',
                  name: src.name || '', phone: src.phone || '', email: src.email || ''};

    if(op.op === 'del'){
      const hit = lookup_(bridgeIdx, want);
      if(!hit){ skipped++; return; }
      hit.deleted = true; hit.updated = op.updated || stamp;
      const seenDel = lookup_(visIdx, {property: hit.property, name: hit.name, phone: hit.phone, email: hit.email});
      const at = seenDel ? seenDel.row : 0;
      if(at){
        sh.getRange(at, 1, 1, 10).clearContent();
        sh.getRange(at, 11).setValue('deleted from the app');
        hit.sheetRow = at;
      }
      del++;
      return;
    }

    if(op.op !== 'set'){ skipped++; return; }
    let hit = lookup_(bridgeIdx, want);
    if(!hit){
      hit = {key: op.key, cid: src.cid || '', deleted: false, sheetRow: 0, property: want.address};
      bridge.push(hit);
      addToIndex_(bridgeIdx, hit);
    }
    Object.assign(hit, pick_(src), {
      key: op.key, property: want.address || hit.property, cid: src.cid || hit.cid || '',
      deleted: false, updated: src.updated || stamp,
    });
    const seen = lookup_(visIdx, {property: hit.property, name: hit.name, phone: hit.phone, email: hit.email});
    let at = seen ? seen.row : 0;
    if(!at){
      at = insertLead_(hit);
      if(at){
        made++;
        visIdx = buildIndex_(readVisible_().buyers.map(v => Object.assign({}, v, {property: v.address})));
      }
    } else {
      writeVisible_(sh, at, hit);
    }
    if(!at) { skipped++; return; }
    hit.sheetRow = at;
    set++;
  });

  SpreadsheetApp.flush();
  writeBridge_(bridge);
  const rev = bumpRev_();
  return {ok: true, set, del, made, skipped, rows: Math.max(0, sh.getLastRow() - DATA_FIRST_ROW + 1),
          total: bridge.length, rev, serverTime: new Date().toISOString()};
}

/* ───── run once from the editor: fill the bookkeeping tab from the sheet ─── */
function seedBridge(){
  const vis = readVisible_();
  const bridge = readBridge_();
  const n = reconcile_(vis, bridge).length;
  writeBridge_(bridge);
  return bridge.length + ' leads tracked, ' + n + ' touched';
}
function healthCheck(){
  const vis = readVisible_();
  const bridge = readBridge_();
  return {tab: TARGET_TAB, buyersInTab: vis.buyers.length, propertiesInTab: vis.blocks.length,
          tracked: bridge.length, deleted: bridge.filter(b => b.deleted).length,
          deployed: 'Deploy ▸ Manage deployments → copy the /exec URL'};
}
