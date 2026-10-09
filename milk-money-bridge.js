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
  var CFG = window.MILK_MONEY || {};
  if (!CFG.url || !CFG.key || /XXXX|SYNC_KEY/.test(CFG.url + CFG.key)) { console.warn('[Milk Money] ยังไม่ได้ตั้งค่า window.MILK_MONEY = {url, key}'); return; }
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
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
  function milkHubSync(manual) {
    badge('mm-bridge', '🥛 กำลังดึงข้อมูลจาก Milk Money…');
    return fetch(CFG.url + '?api=milkhub&key=' + encodeURIComponent(CFG.key), { redirect: 'follow' })
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
      .catch(function (e) { var last = LS.get('milkhub:mm:lastSync'); badge('mm-bridge', '⚠️ เชื่อม Milk Money ไม่ได้ (' + e.message + ')' + (last ? ' · ใช้ข้อมูลล่าสุด ' + hhmm(last.at) : '') + ' <u>ลองใหม่</u>', function () { milkHubSync(true); }); });
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
      .catch(function (e) { console.warn('[Milk Money] ส่งข้อมูลไม่สำเร็จ', e); return { error: e.message }; });
  }
  function lifeOSSummary() {
    return fetch(CFG.url + '?api=summary&key=' + encodeURIComponent(CFG.key), { redirect: 'follow' }).then(function (r) { return r.json(); }).then(function (s) {
      if (!s.ok) return;
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
    if (isMilkHub()) { lockMilkHub(); milkHubSync(false); setInterval(function () { if (!document.hidden) milkHubSync(false); }, 10 * 60 * 1000); }
    else if (isLifeOS()) hookLifeOS();
    else console.info('[Milk Money] ไม่รู้จักหน้านี้ — รองรับ Milk Hub และ Life OS');
  }
  if (document.readyState === 'complete') setTimeout(start, 300); else window.addEventListener('load', function () { setTimeout(start, 300); });
})();
