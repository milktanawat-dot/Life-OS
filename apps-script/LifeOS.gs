/**
 * LifeOS.gs — สะพานข้อมูลจาก "สุขภาพครอบครัว" ไป Milk Life OS + ดึงข้อมูลนาฬิกา Garmin (Personal API)
 * อัปเดต 25 พ.ย. 2569
 *
 * ติดตั้ง:
 *   1) วางไฟล์นี้เป็นไฟล์ใหม่ชื่อ LifeOS.gs ในโปรเจ็ค Apps Script ของบอท
 *   2) ใน Code.gs บรรทัดแรกในฟังก์ชัน doGet(e) ใส่:
 *        var lifeOs = lifeOsJson_(e); if (lifeOs) return lifeOs;
 *   3) Project Settings → Script Properties → เพิ่ม
 *        GARMIN_KEY_แม่มิลค์   = คีย์ API ส่วนบุคคลจาก Garmin Connect (บัญชีของแม่)
 *      (คนอื่นก็เพิ่มได้: GARMIN_KEY_<ชื่อเดียวกับในบอท>)
 *   4) Deploy → Manage deployments → ✎ → Version: New version → Deploy  (ลิงก์เดิมใช้ต่อได้)
 *   5) รัน garminTest() ครั้งแรกเพื่อให้อนุญาตสิทธิ์ UrlFetch และดูผลใน Execution log
 *
 * ความปลอดภัย: คีย์ Garmin อยู่ใน Script Properties เท่านั้น ไม่ถูกส่งออกไปที่เว็บ
 * ข้อมูล Garmin จะส่งให้เฉพาะ token ที่มีสิทธิ์เห็นคนนั้นอยู่แล้ว (ตามสิทธิ์ในบอท)
 */

var GARMIN_BASE_ = 'https://personal.connectapi.garmin.com';
var GARMIN_DAYS_ = 28;          // ดึงย้อนหลังกี่วัน
var GARMIN_CACHE_SEC_ = 3 * 3600; // เก็บผลไว้ 3 ชม. (กด Sync ใน Life OS = ดึงใหม่)
var LIFEOS_TZ_ = 'Asia/Bangkok';

/** เรียกจาก doGet(e) — คืน JSON ถ้า ?format=json ไม่งั้นคืน null ให้ doGet ทำงานตามเดิม */
function lifeOsJson_(e) {
  if (!e || !e.parameter || e.parameter.format !== 'json') return null;
  var token = e.parameter.token;
  var out;
  try {
    var d = getDataForToken(token);
    var data = (typeof d === 'string') ? JSON.parse(d) : d;
    var m = '[]';
    try { m = getMedicationsForToken(token); } catch (x) {}
    out = { data: data, meds: m, garmin: {} };
    if (data && !data.error) {
      var force = e.parameter.refresh === '1';
      garminNames_().forEach(function (name) {
        if (lifeOsCanSee_(data, name)) out.garmin[name] = garminGet_(name, force);
      });
    }
  } catch (err) {
    out = { error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function lifeOsCanSee_(data, name) {
  if (data.viewer && data.viewer.name === name) return true;
  return (data.users || []).indexOf(name) >= 0;
}

/** ชื่อทุกคนที่มีคีย์ Garmin ใน Script Properties */
function garminNames_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).filter(function (k) { return k.indexOf('GARMIN_KEY_') === 0 && props[k]; })
    .map(function (k) { return k.substring('GARMIN_KEY_'.length); });
}

function garminDate_(offsetDays) {
  var d = new Date(Date.now() + (offsetDays || 0) * 86400000);
  return Utilities.formatDate(d, LIFEOS_TZ_, 'yyyy-MM-dd');
}

function garminCacheKey_(prefix, name) {
  var h = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, name, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  return prefix + h;
}

/** แลกคีย์เป็น access token (อายุ ≤ 24 ชม.) แล้วเก็บไว้ใน cache */
function garminToken_(name, force) {
  var cache = CacheService.getScriptCache();
  var ck = garminCacheKey_('gtok_', name);
  if (!force) { var c = cache.get(ck); if (c) return c; }
  var key = PropertiesService.getScriptProperties().getProperty('GARMIN_KEY_' + name);
  if (!key) throw new Error('ยังไม่ได้ใส่ GARMIN_KEY_' + name);
  var res = UrlFetchApp.fetch(GARMIN_BASE_ + '/personalapitoken-service/personal-api/personal-api-key/token', {
    method: 'post', headers: { Authorization: 'ApiKey ' + key.trim(), Accept: '*/*' }, muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 401 || code === 403) throw new Error('คีย์ Garmin ไม่ถูกต้องหรือหมดอายุ (HTTP ' + code + ') — สร้างคีย์ใหม่ใน Garmin Connect แล้วใส่แทน');
  if (code !== 200) throw new Error('ขอ token ไม่สำเร็จ HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
  var tok = res.getContentText().trim();
  if (tok.charAt(0) === '{') { try { var j = JSON.parse(tok); tok = j.accessToken || j.access_token || tok; } catch (x) {} }
  cache.put(ck, tok, 20 * 3600);
  return tok;
}

function garminGetJson_(tok, path, params) {
  var q = params ? '?' + Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '';
  var res = UrlFetchApp.fetch(GARMIN_BASE_ + path + q, {
    headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' }, muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 204) return null;
  if (code !== 200) throw new Error(path + ' HTTP ' + code + ': ' + res.getContentText().slice(0, 160));
  var txt = res.getContentText();
  return txt ? JSON.parse(txt) : null;
}

function garminList_(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.data)) return x.data;
  if (Array.isArray(x.hrvSummaries)) return x.hrvSummaries;
  return [];
}
/** เวลา local ของ Garmin (epoch ms ที่เป็นเวลาท้องถิ่น หรือสตริง ISO) → 'HH:mm' */
function garminClock_(v) {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) return Utilities.formatDate(new Date(Number(v)), 'UTC', 'HH:mm');
  var m = String(v).match(/T?(\d{2}):(\d{2})/); return m ? m[1] + ':' + m[2] : undefined;
}
function num_(v) { return (v === null || v === undefined || v === '' || isNaN(Number(v))) ? undefined : Number(v); }
function pick_(o, path) { var p = path.split('.'); for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; }
function first_(o, paths) { for (var i = 0; i < paths.length; i++) { var v = num_(pick_(o, paths[i])); if (v !== undefined) return v; } return undefined; }

/** ดึงข้อมูล Garmin ของคนชื่อ name → {configured, fetchedAt, days:{yyyy-mm-dd:{…}}, errors[]} */
function garminGet_(name, force) {
  var cache = CacheService.getScriptCache();
  var ck = garminCacheKey_('gdat_', name);
  if (!force) { var c = cache.get(ck); if (c) return JSON.parse(c); }
  var out = { configured: true, fetchedAt: new Date().toISOString(), days: {}, errors: [] };
  var tok;
  try { tok = garminToken_(name, false); }
  catch (e1) { out.errors.push(String(e1.message || e1)); return out; }
  var end = garminDate_(0);
  var day = function (date) { return out.days[date] || (out.days[date] = {}); };
  var set = function (o, k, v) { if (v !== undefined) o[k] = v; };
  var call = function (label, fn) {
    try { fn(); }
    catch (e) {
      // token อาจหมดอายุก่อนเวลา — ลองขอใหม่ครั้งเดียว
      if (/HTTP 401/.test(String(e.message)) && !call.retried) { call.retried = true; tok = garminToken_(name, true); try { fn(); return; } catch (e2) { e = e2; } }
      out.errors.push(label + ': ' + String(e.message || e));
    }
  };
  // ช่วงละ 14 วัน (กันชนเพดานช่วงวันที่ของ API)
  var chunks = [];
  for (var s = GARMIN_DAYS_ - 1; s >= 0; s -= 14) chunks.push([garminDate_(-s), garminDate_(-Math.max(0, s - 13))]);

  chunks.forEach(function (ch) {
    call('dailysummaries', function () {
      garminList_(garminGetJson_(tok, '/usersummary-service/v2/dailysummaries', { startDate: ch[0], endDate: ch[1] })).forEach(function (x) {
        if (!x || !x.calendarDate) return; var o = day(x.calendarDate);
        set(o, 'steps', first_(x, ['movement.steps.value', 'totalSteps']));
        set(o, 'stepGoal', first_(x, ['movement.steps.goal', 'dailyStepGoal']));
        set(o, 'restingHR', first_(x, ['heartRate.restingValue', 'restingHeartRate']));
        set(o, 'minHR', first_(x, ['heartRate.minValue', 'minHeartRate']));
        set(o, 'maxHR', first_(x, ['heartRate.maxValue', 'maxHeartRate']));
        set(o, 'hrAlerts', first_(x, ['heartRate.alertCount', 'abnormalHeartRateAlertsCount']));
        set(o, 'stress', first_(x, ['stress.avgLevel', 'averageStressLevel']));
        set(o, 'stressMax', first_(x, ['stress.maxLevel', 'maxStressLevel']));
        set(o, 'bbMax', first_(x, ['bodyBattery.maxValue', 'bodyBatteryHighestValue']));
        set(o, 'bbMin', first_(x, ['bodyBattery.minValue', 'bodyBatteryLowestValue']));
        set(o, 'bbLatest', first_(x, ['bodyBattery.latestValue', 'bodyBatteryMostRecentValue']));
        set(o, 'bbCharged', first_(x, ['bodyBattery.chargedValue', 'bodyBatteryChargedValue']));
        set(o, 'spO2', first_(x, ['pulseOx.avgValue', 'averageSpo2']));
        set(o, 'spO2Min', first_(x, ['pulseOx.minValue', 'lowestSpo2']));
        set(o, 'respiration', first_(x, ['respiration.avgValue', 'avgWakingRespirationValue']));
        var mod = first_(x, ['intensityMinutes.moderate', 'moderateIntensityMinutes']);
        var vig = first_(x, ['intensityMinutes.vigorous', 'vigorousIntensityMinutes']);
        if (mod !== undefined || vig !== undefined) o.intensityMin = (mod || 0) + 2 * (vig || 0);
      });
    });
    call('sleep', function () {
      garminList_(garminGetJson_(tok, '/sleep-service/sleep/dailySleepSummariesByDate', { startDate: ch[0], endDate: ch[1] })).forEach(function (x) {
        var dto = x && x.dailySleepDTO ? x.dailySleepDTO : x;
        if (!dto || !dto.calendarDate) return; var o = day(dto.calendarDate);
        set(o, 'sleepSecs', num_(dto.sleepTimeSeconds));
        set(o, 'deepSecs', num_(dto.deepSleepSeconds));
        set(o, 'lightSecs', num_(dto.lightSleepSeconds));
        set(o, 'remSecs', num_(dto.remSleepSeconds));
        set(o, 'awakeSecs', num_(dto.awakeSleepSeconds));
        set(o, 'awakeCount', num_(dto.awakeCount));
        set(o, 'sleepScore', first_(dto, ['sleepScores.overall.value']));
        set(o, 'avgSleepingHR', num_(dto.avgHeartRate));
        set(o, 'sleepSpO2', num_(dto.averageSpO2Value));
        set(o, 'sleepStress', num_(dto.avgSleepStress));
        set(o, 'sleepStart', garminClock_(dto.sleepStartTimestampLocal));
        set(o, 'sleepEnd', garminClock_(dto.sleepEndTimestampLocal));
      });
    });
    call('hrv', function () {
      garminList_(garminGetJson_(tok, '/hrv-service/hrv/daily/' + ch[0] + '/' + ch[1])).forEach(function (x) {
        if (!x || !x.calendarDate) return; var o = day(x.calendarDate);
        set(o, 'hrv', num_(x.lastNightAvg));
        set(o, 'hrvWeekly', num_(x.weeklyAvg));
        if (x.status) o.hrvStatus = x.status;
      });
    });
  });
  // ลบวันที่ไม่มีค่าเลย
  Object.keys(out.days).forEach(function (d) { if (!Object.keys(out.days[d]).length) delete out.days[d]; });
  if (Object.keys(out.days).length || !out.errors.length) {
    try { cache.put(ck, JSON.stringify(out), GARMIN_CACHE_SEC_); } catch (x) {}
  }
  return out;
}

/** รันจาก editor เพื่อทดสอบ — ดูผลใน Execution log */
function garminTest() {
  var names = garminNames_();
  if (!names.length) { Logger.log('ยังไม่มี Script Property ชื่อ GARMIN_KEY_<ชื่อ>'); return; }
  names.forEach(function (name) {
    var r = garminGet_(name, true);
    var ds = Object.keys(r.days).sort();
    Logger.log('== ' + name + ' : ' + ds.length + ' วัน · errors: ' + JSON.stringify(r.errors));
    ds.slice(-3).forEach(function (d) { Logger.log(d + ' ' + JSON.stringify(r.days[d])); });
  });
}

/** ใช้ดูหน้าตาข้อมูลดิบ ถ้าบางค่าไม่ขึ้น */
function garminTestRaw() {
  var name = garminNames_()[0]; if (!name) return;
  var tok = garminToken_(name, true), d = garminDate_(-1);
  [['/usersummary-service/v2/dailysummaries', { startDate: d, endDate: d }],
   ['/sleep-service/sleep/dailySleepSummariesByDate', { startDate: d, endDate: d }],
   ['/hrv-service/hrv/daily/' + d + '/' + d, null]].forEach(function (p) {
    try { Logger.log(p[0] + '\n' + JSON.stringify(garminGetJson_(tok, p[0], p[1])).slice(0, 3000)); }
    catch (e) { Logger.log(p[0] + ' ERROR ' + e.message); }
  });
}
