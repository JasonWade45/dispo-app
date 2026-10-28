"""Build the PUBLIC / hosted copy of the app.

The public copy contains:
  * the whole UI + JS (no personal data anywhere in the source)
  * the site snapshot from elevatereg.com (public information)
  * ONE encrypted blob: data.json (buyers, phones, emails) compressed with gzip
    and sealed with AES-256-GCM. The key is derived from a passcode with
    PBKDF2-SHA256 (320k iterations) *in the browser*.

Without the passcode the blob is noise, so publishing the file on a public
repo does not publish the buyer list.

Usage:  python3 scripts/build_cloud.py --pass 'YOUR-PASSCODE' [--out site/index.html]
"""
import argparse, json, os, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE_ENC = r"""
const fs = require('fs'), crypto = require('crypto'), zlib = require('zlib');
const [src, out, pass] = process.argv.slice(2);
const raw = fs.readFileSync(src);
const gz = zlib.gzipSync(raw, {level: 9});
const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), ITER = 320000;
const key = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), salt, ITER, 32, 'sha256');
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([c.update(gz), c.final()]);
const blob = {v: 1, it: ITER, gz: 1, salt: salt.toString('base64'),
              iv: iv.toString('base64'),
              ct: Buffer.concat([ct, c.getAuthTag()]).toString('base64')};
fs.writeFileSync(out, JSON.stringify(blob));
console.log(`payload ${raw.length} B -> gzip ${gz.length} B -> sealed ${blob.ct.length * 0.75 | 0} B`);
"""

LOCK = r"""
<style>
#lock{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(1200px 600px at 50% -10%,#1b3352 0%,#0e1a2b 60%,#0a1320 100%);padding:20px}
#lock .box{width:100%;max-width:392px;background:#fff;border-radius:18px;padding:26px 24px 22px;
  box-shadow:0 24px 60px rgba(4,10,20,.45)}
#lock .logo{display:flex;align-items:center;gap:10px;margin-bottom:14px}
#lock .logo i{width:38px;height:38px;border-radius:11px;background:#0e1a2b;color:#3ec27a;font-style:normal;
  font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center}
#lock h1{font-size:17px;margin:0;color:#101c2e;letter-spacing:-.2px}
#lock .sub{font-size:12px;color:#6b7c93;margin:2px 0 0}
#lock p.hint{font-size:12px;color:#6b7c93;margin:0 0 14px}
#lock label{display:block;font-size:11px;font-weight:800;letter-spacing:.7px;color:#6b7c93;
  text-transform:uppercase;margin-bottom:6px}
#lock input{width:100%;padding:11px 12px;border:1px solid #e3e9f0;border-radius:10px;font-size:14px;
  outline:none;transition:border-color .15s,box-shadow .15s}
#lock input:focus{border-color:#4f8ef7;box-shadow:0 0 0 3px rgba(79,142,247,.16)}
#lock button{width:100%;margin-top:12px;padding:11px 14px;border:0;border-radius:10px;background:#0f9d58;
  color:#fff;font-weight:700;font-size:14px;cursor:pointer}
#lock button:disabled{opacity:.6;cursor:default}
#lock .err{min-height:16px;font-size:12px;color:#c0392b;margin-top:9px;font-weight:600}
#lock .rem{display:flex;align-items:center;gap:7px;margin-top:12px;font-size:12px;color:#5a6a7d}
#lock .rem input{width:auto;margin:0}
#lock .foot{margin-top:14px;padding-top:12px;border-top:1px solid #eef2f7;font-size:11px;color:#8fa0b4;line-height:1.5}
body.locked #shell{display:none}
</style>
<div id="lock">
  <div class="box">
    <div class="logo"><i>D</i><div><h1>DISPO</h1><div class="sub">Real Estate OS · private</div></div></div>
    <p class="hint">This copy is published as open code. The buyer list inside it is
      encrypted — enter your passcode to open it.</p>
    <label for="lockPass">Passcode</label>
    <input id="lockPass" type="password" autocomplete="current-password" spellcheck="false" placeholder="••••••••">
    <label class="rem"><input type="checkbox" id="lockRemember" checked> Remember on this device</label>
    <button id="lockGo">Unlock</button>
    <div class="err" id="lockErr"></div>
    <div class="foot">Nothing is sent anywhere. The passcode only unlocks the file in your browser.</div>
  </div>
</div>
"""

GATE = r"""
<script>
(function(){
  var ENC = __ENC__;
  var KEY = 'dispo:pass';
  var $ = function(s){ return document.querySelector(s); };
  var err = function(m){ $('#lockErr').textContent = m || ''; };
  function b64(s){
    var bin = atob(s), out = new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function inject(){
    var src = document.getElementById('appcode').textContent;
    var el = document.createElement('script');
    el.textContent = src;
    document.body.appendChild(el);
  }
  async function open(pass){
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass),
                 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      {name:'PBKDF2', salt:b64(ENC.salt), iterations:ENC.it, hash:'SHA-256'},
      base, {name:'AES-GCM', length:256}, false, ['decrypt']);
    var buf = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64(ENC.iv)}, key, b64(ENC.ct));
    var text;
    if(ENC.gz && typeof DecompressionStream === 'function'){
      text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else {
      text = new TextDecoder().decode(buf);
    }
    return JSON.parse(text);
  }
  var busy = false;
  async function unlock(pass){
    if(busy) return; busy = true;
    var go = $('#lockGo'); go.disabled = true; var was = go.textContent; go.textContent = 'Opening…';
    err('');
    try{
      var data = await open(pass);
      window.DISPO_DATA = data;
      try{ localStorage.setItem(KEY, $('#lockRemember').checked ? pass : ''); }catch(e){}
      document.getElementById('lock').remove();
      document.body.classList.remove('locked');
      inject();
    }catch(e){
      err(/passcode|OperationError|DataError/i.test(String(e)) ? 'That passcode is not right.' : 'Could not open the file: ' + e.message);
      try{ localStorage.removeItem(KEY); }catch(_){}
      go.disabled = false; go.textContent = was;
      var i = $('#lockPass'); i.value = ''; i.focus();
    }
    busy = false;
  }
  document.body.classList.add('locked');
  window.__dispoUnlock = unlock;
  document.addEventListener('DOMContentLoaded', function(){
    $('#lockGo').addEventListener('click', function(){ unlock($('#lockPass').value); });
    $('#lockPass').addEventListener('keydown', function(e){
      if(e.key === 'Enter') unlock($('#lockPass').value);
    });
    var saved = '';
    try{ saved = localStorage.getItem(KEY) || ''; }catch(e){}
    if(saved){ unlock(saved); } else { $('#lockPass').focus(); }
  });
})();
</script>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pass', dest='password', required=True)
    ap.add_argument('--out', default=os.path.join(ROOT, 'site', 'index.html'))
    a = ap.parse_args()

    data = json.load(open(os.path.join(ROOT, 'data.json')))
    imgs_p = os.path.join(ROOT, 'images.json')
    if os.path.exists(imgs_p):
        imgs = json.load(open(imgs_p))
        for p in data['props']:
            p['img'] = imgs.get(str(p['row']), p.get('img') or '')

    tmp = tempfile.mkdtemp()
    src, enc = os.path.join(tmp, 'payload.json'), os.path.join(tmp, 'payload.enc')
    json.dump(data, open(src, 'w'), ensure_ascii=False, separators=(',', ':'))
    node_js = os.path.join(tmp, 'enc.js')
    open(node_js, 'w').write(NODE_ENC)
    r = subprocess.run(['node', node_js, src, enc, a.password], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit('encrypt failed: ' + r.stderr)
    print(r.stdout.strip())
    blob = open(enc).read()

    tpl = open(os.path.join(ROOT, 'template.html')).read()
    marker = '<script>window.DISPO_DATA = __DATA__;</script>'
    head, rest = tpl.split(marker, 1)
    app_open = '<script>\n"use strict";'
    i = rest.index(app_open)
    app_end = rest.rindex('</script>')
    app = rest[i + len('<script>'):app_end]
    # a public file must not carry a working bridge URL: anyone holding it could
    # pull the buyer rows. The owner pastes it once per device in Sync settings.
    app = app.replace(
        "const SYNC_DEFAULT_URL = 'https://script.google.com/macros/s/"
        "AKfycbxY-tvyvlwbtthfPcqhEE__Nz-3woimoJI_LIXgnEQQ0C7q5oiKhD9uHm90kCVoCInI/exec';",
        "const SYNC_DEFAULT_URL = '';  // paste your own Apps Script URL in Sync settings")
    tail = rest[app_end + len('</script>'):]

    site_p = os.path.join(ROOT, 'site.json')
    site = json.load(open(site_p)) if os.path.exists(site_p) else None
    seed = ''
    if site:
        seed = ('<script>window.__SITE_SNAPSHOT__=' +
                json.dumps(site, ensure_ascii=False, separators=(',', ':')) + ';</script>\n')

    # the shell sits behind the lock overlay
    head = head.replace('<main class="wrap" id="view">',
                        '<main class="wrap" id="view">', 1)
    html = (head + LOCK + seed +
            '<script id="appcode" type="text/x-dispo">' + app + '</script>\n' +
            GATE.replace('__ENC__', blob) + tail)

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    open(a.out, 'w').write(html)
    print(f'{a.out} · {os.path.getsize(a.out)/1048576:.2f} MB · '
          f'{len(data["props"])} properties · {len(data["followups"])} messages'
          + (f' · site {site["count"]} ({site["available"]} available)' if site else ''))


if __name__ == '__main__':
    main()
