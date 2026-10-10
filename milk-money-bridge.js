/*!
 * Milk Money bridge — ใช้ไฟล์เดียวกันได้ทั้ง Milk Hub และ Life OS
 *
 * วิธีใช้ (ใส่ก่อน </body> ของ index.html ทั้งสองเว็บ):
 *   <script>window.MILK_MONEY = { url: 'https://script.google.com/macros/s/XXXX/exec', key: 'SYNC_KEY' };</script>
 *   <script src="milk-money-bridge.js"></script>
 *
 * Milk Hub  → ดึงรายรับรายจ่าย / ภาษี / พอร์ต / หนี้ จาก Milk Money มาแสดง และล็อกการแก้ไขส่วนนั้น (อ่านอย่างเดียว)
 * Life OS   → ส่งพอร์ต Dime, กลุ่มพอร์ต, ค่าสมาชิก, ค่าใช้จ่ายรายปี ไป Milk Money อัตโนมัติ (เฉพาะเมื่อข้อมูลเปลี่ยน)
 *             + แสดงชิป "ใช้ได้วันละ" จาก Milk Money มุมล่างซ้าย
 * Life OS อ่านรายการเงินจาก Milk Hub (same-origin) อยู่แล้ว จึงได้ข้อมูล Milk Money ต่อทอดโดยอัตโนมัติ
 */
(function () {
  'use strict';
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  // ตั้งค่าได้ 2 แบบ: window.MILK_MONEY = {url, key} ในหน้าเว็บ หรือกรอกครั้งเดียวผ่านปุ่มที่มุมล่างซ้าย (เก็บใน localStorage ของเบราว์เซอร์นี้ — Milk Hub กับ Life OS ใช้ร่วมกัน)
  function normUrl(u) { u = String(u || '').trim(); var m = u.match(/^(https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_\-]+\/exec)/); return m ? m[1] : u.split(/[?#]/)[0]; }
  function decodePair(code) {
    code = String(code || '').trim();
    if (!/^MM1\./.test(code)) return null;
    try { var b = code.slice(4).replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; var o = JSON.parse(decodeURIComponent(escape(atob(b)))); return o && o.u && o.k ? { url: normUrl(o.u), key: String(o.k).trim() } : null; } catch (e) { return null; }
  }
  function validCfg(c) { return c && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_\-]+\/exec$/.test(c.url || '') && /^[0-9a-f]{32}$/i.test(c.key || ''); }
  var CFG = window.MILK_MONEY && window.MILK_MONEY.url && !/XXXX|SYNC_KEY/.test(window.MILK_MONEY.url + window.MILK_MONEY.key) ? { url: normUrl(window.MILK_MONEY.url), key: String(window.MILK_MONEY.key).trim() } : (LS.get('mm:config', null) || {});
  if (CFG.url) CFG.url = normUrl(CFG.url);
  function setupForm(msg) {
    var old = document.getElementById('mm-setup'); if (old) old.remove();
    var w = document.createElement('div'); w.id = 'mm-setup';
    w.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(10,14,30,.5);display:flex;align-items:center;justify-content:center;font:14px "IBM Plex Sans Thai",system-ui,sans-serif';
    var inp = 'width:100%;padding:10px;border:1px solid #E3E7F2;border-radius:10px;box-sizing:border-box;font:13px ui-monospace,monospace';
    w.innerHTML = '<form style="background:#fff;color:#121A33;border-radius:18px;padding:20px;width:min(460px,92vw);display:grid;gap:10px"><b style="font-size:17px">🥛 เชื่อม Milk Money</b>' +
      (typeof msg === 'string' && msg ? '<div style="background:#FDECEC;color:#B4232A;border-radius:10px;padding:8px 10px;font-size:13px">' + msg + '</div>' : '') +
      '<span style="color:#5D6680;font-size:13px">เปิดแดชบอร์ด Milk Money → ตั้งค่า → เชื่อมต่อ → กด <b>คัดลอกรหัส</b> แล้ววางที่นี่ (ครั้งเดียว ใช้ได้ทั้ง Milk Hub และ Life OS ในเบราว์เซอร์นี้)</span>' +
      '<label>รหัสเชื่อมต่อ<textarea name="c" rows="3" placeholder="MM1.…" style="' + inp + '"></textarea></label>' +
      '<details style="font-size:12.5px;color:#5D6680"><summary style="cursor:pointer">กรอกแยกเอง (Web app URL + SYNC_KEY)</summary><label>Web app URL (ลงท้าย /exec)<input name="u" placeholder="https://script.google.com/macros/s/.../exec" style="' + inp + '"></label><label>SYNC_KEY (32 ตัวอักษร)<input name="k" style="' + inp + '"></label></details>' +
      '<div data-err style="color:#B4232A;font-size:13px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' + (CFG.url ? '<button type="button" data-clear style="margin-right:auto;padding:8px 12px;border-radius:10px;border:1px solid #E3E7F2;background:#fff;color:#B4232A">ยกเลิกการเชื่อม</button>' : '') + '<button type="button" data-x style="padding:8px 14px;border-radius:10px;border:1px solid #E3E7F2;background:#fff">ปิด</button><button style="padding:8px 14px;border-radius:10px;border:0;background:#1F3FBF;color:#fff;font-weight:600">บันทึกและเชื่อม</button></div></form>';
    document.body.appendChild(w);
    w.querySelector('[data-x]').onclick = function () { w.remove(); };
    var cl = w.querySelector('[data-clear]'); if (cl) cl.onclick = function () { try { localStorage.removeItem('mm:config'); } catch (e) { } location.reload(); };
    w.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var c = decodePair(this.c.value) || { url: normUrl(this.u.value), key: String(this.k.value || '').trim() };
      if (!validCfg(c)) { w.querySelector('[data-err]').textContent = 'รหัสไม่ถูกต้อง — ให้คัดลอกจากปุ่ม "คัดลอกรหัส" ในแดชบอร์ด (ไม่ใช่ลิงก์แดชบอร์ดจากแชท)'; return; }
      LS.set('mm:config', c); w.remove(); location.reload();
    };
  }
  window.milkMoneySetup = setupForm;
  if (!validCfg(CFG)) {
    var boot = function () { badge('mm-bridge', CFG.url ? '⚠️ ข้อมูลเชื่อม Milk Money ไม่ถูกต้อง — <u>แตะเพื่อตั้งค่าใหม่</u>' : '🥛 เชื่อม Milk Money', function () { setupForm(CFG.url ? 'ที่บันทึกไว้ไม่ใช่รหัสเชื่อมต่อ (อาจวางลิงก์แดชบอร์ดจากแชทไว้) — วางรหัสใหม่' : ''); }); };
    if (document.readyState === 'complete') setTimeout(boot, 300); else window.addEventListener('load', function () { setTimeout(boot, 300); });
  }
  var hash = function (s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return String(h); };
  var hhmm = function (d) { d = d ? new Date(d) : new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };

  function badge(id, html, onClick) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div'); el.id = id;
      el.style.cssText = 'position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9999;background:#121A33;color:#fff;font:500 12.5px/1.3 "IBM Plex Sans Thai",system-ui,sans-serif;padding:8px 12px;border-radius:12px;box-shadow:0 8px 20px -10px rgba(0,0,0,.6);display:flex;gap:8px;align-items:center;max-width:calc(100vw - 24px);cursor:pointer';
      document.body.appendChild(el);
    }
    el.innerHTML = html; el.onclick = onClick || null;
    return el;
  }

  /* ============================ Milk Hub ============================ */
  function isMilkHub() { return typeof window.loadProfileData === 'function' && typeof window.renderAll === 'function' && /Milk Hub/i.test(document.title); }
  // ก่อนเขียนทับครั้งแรก: สำรองข้อมูลเดิมในเครื่อง + ส่งรายการที่จดใน Milk Hub แต่ยังไม่มีใน Milk Money ขึ้นไปก่อน (กันข้อมูลหาย)
  function milkHubPushLocal() {
    var local = LS.get('milkhub:money:entries', []) || [];
    if (!LS.get('milkhub:mm:backupBeforeSync')) LS.set('milkhub:mm:backupBeforeSync', { at: new Date().toISOString(), money: local, tax: LS.get('milkhub:tax:data', {}), assets: LS.get('milkhub:assets:data', {}) });
    var mine = local.filter(function (e) { return e && e.id && String(e.id).indexOf('mm-') !== 0 && !e.mm; });
    if (!mine.length) return Promise.resolve({ imported: 0 });
    return fetch(CFG.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ sync_key: CFG.key, action: 'milkhub_push', data: { money: mine } }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'push failed'); if (j.imported) console.info('[Milk Money] ส่งรายการจาก Milk Hub เพิ่ม ' + j.imported + ' รายการ'); return j; });
  }
  function milkHubSync(manual) {
    badge('mm-bridge', '🥛 กำลังซิงก์กับ Milk Money…');
    return milkHubPushLocal().then(function () { return fetch(CFG.url + '?api=milkhub&key=' + encodeURIComponent(CFG.key), { redirect: 'follow' }); })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'ดึงข้อมูลไม่สำเร็จ');
        var P = 'milkhub:'; // โปรไฟล์หลัก (default) ใช้คีย์เดิมของ Milk Hub
        LS.set(P + 'money:entries', j.money || []);
        var tax = LS.get(P + 'tax:data', {}) || {};
        Object.keys(j.tax || {}).forEach(function (y) { tax[y] = Object.assign({}, tax[y] || {}, { slips: j.tax[y].slips || [], ded: Object.assign({}, (tax[y] || {}).ded || {}, j.tax[y].ded || {}) }); });
        LS.set(P + 'tax:data', tax);
        var assets = LS.get(P + 'assets:data', { fx: 34, list: [], debts: [], apiKey: '' }) || {};
        assets.list = (j.assets && j.assets.list) || assets.list; assets.debts = (j.assets && j.assets.debts) || assets.debts;
        LS.set(P + 'assets:data', assets);
        LS.set(P + 'mm:lastSync', { at: new Date().toISOString(), generated: j.generated, count: (j.money || []).length });
        var apid = 'default'; try { apid = (typeof activeProfileId !== 'undefined' && activeProfileId) || 'default'; } catch (e) { }
        return Promise.resolve(apid === 'default' ? window.loadProfileData() : null).then(function () { try { window.renderAll(); } catch (e) { } return j; });
      })
      .then(function (j) { badge('mm-bridge', '🔗 Milk Money · ' + (j.money || []).length + ' รายการ · อ่านอย่างเดียว · ' + hhmm() + ' <u>รีเฟรช</u>', function () { milkHubSync(true); }); })
      .catch(function (e) { if (/invalid key/.test(e.message)) return badge('mm-bridge', '⚠️ SYNC_KEY ไม่ถูกต้อง — <u>แตะเพื่อตั้งค่าใหม่</u>', function () { setupForm('SYNC_KEY ไม่ตรงกับ Milk Money — วางรหัสใหม่'); }); var last = LS.get('milkhub:mm:lastSync'); badge('mm-bridge', '⚠️ เชื่อม Milk Money ไม่ได้ (' + e.message + ')' + (last ? ' · ใช้ข้อมูลล่าสุด ' + hhmm(last.at) : '') + ' <u>ลองใหม่</u>', function () { milkHubSync(true); }); });
  }
  function lockMilkHub() {
    var msg = 'ส่วนนี้อ่านอย่างเดียว — จดรายการ/แก้ไขใน LINE Milk Money หรือแดชบอร์ด Milk Money';
    ['saveMoney', 'saveTax', 'saveAssets'].forEach(function (fn) {
      if (typeof window[fn] !== 'function') return;
      window[fn] = function () { try { window.toast(msg); } catch (e) { alert(msg); } return milkHubSync(true); };
    });
  }

  /* ============================ Life OS ============================ */
  function isLifeOS() { try { return typeof LS_KEY !== 'undefined' && LS_KEY === 'milkLifeOS_v1'; } catch (e) { return false; } }
  var pushTimer = null;
  function lifeOSPayload() {
    var st = LS.get('milkLifeOS_v1', {}) || {};
    return { assets: st.assets || {}, subscriptions: st.subscriptions || {}, annualExpenses: st.annualExpenses || {}, trips: st.trips || {} };
  }
  function lifeOSPush(force) {
    var data = lifeOSPayload();
    var h = hash(JSON.stringify(data));
    if (!force && h === LS.get('mm:lifeos:pushHash')) return Promise.resolve({ skipped: true });
    return fetch(CFG.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ sync_key: CFG.key, action: 'lifeos_push', data: data }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'push failed'); LS.set('mm:lifeos:pushHash', h); LS.set('mm:lifeos:lastPush', new Date().toISOString()); return j; })
      .catch(function (e) { console.warn('[Milk Money] ส่งข้อมูลไม่สำเร็จ', e); if (/invalid key/.test(e.message)) badge('mm-bridge', '⚠️ SYNC_KEY ไม่ถูกต้อง — <u>แตะเพื่อตั้งค่าใหม่</u>', function () { setupForm('SYNC_KEY ไม่ตรงกับ Milk Money — วางรหัสใหม่'); }); return { error: e.message }; });
  }
  function lifeOSSummary() {
    return fetch(CFG.url + '?api=summary&key=' + encodeURIComponent(CFG.key), { redirect: 'follow' }).then(function (r) { return r.json(); }).then(function (s) {
      if (!s.ok) { if (s.error === 'invalid key') badge('mm-bridge', '⚠️ SYNC_KEY ไม่ถูกต้อง — <u>แตะเพื่อตั้งค่าใหม่</u>', function () { setupForm('SYNC_KEY ไม่ตรงกับ Milk Money — วางรหัสใหม่'); }); return; }
      var per = Math.max(0, Math.round(s.safe_per_day)).toLocaleString('en-US');
      badge('mm-bridge', '🥛 ใช้ได้วันละ <b style="color:#F5C842">฿' + per + '</b> · สุขภาพการเงิน ' + s.health + ' · ส่งพอร์ต ' + hhmm(LS.get('mm:lifeos:lastPush')), function () { lifeOSPush(true).then(lifeOSSummary); });
    }).catch(function () { });
  }
  function hookLifeOS() {
    if (typeof window.saveState === 'function') {
      var orig = window.saveState;
      window.saveState = function () { var r = orig.apply(this, arguments); clearTimeout(pushTimer); pushTimer = setTimeout(function () { lifeOSPush(false); }, 4000); return r; };
    }
    lifeOSPush(false).then(lifeOSSummary);
  }

  function start() {
    if (!validCfg(CFG)) return;
    if (isMilkHub()) { lockMilkHub(); milkHubSync(false); setInterval(function () { if (!document.hidden) milkHubSync(false); }, 10 * 60 * 1000); }
    else if (isLifeOS()) hookLifeOS();
    else console.info('[Milk Money] ไม่รู้จักหน้านี้ — รองรับ Milk Hub และ Life OS');
  }
  if (document.readyState === 'complete') setTimeout(start, 300); else window.addEventListener('load', function () { setTimeout(start, 300); });
})();
