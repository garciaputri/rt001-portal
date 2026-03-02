/**
 * ═══════════════════════════════════════════════════════════════
 * RT.001 RAWABUNTU — Google Apps Script Backend v4 (JSONP)
 * ═══════════════════════════════════════════════════════════════
 * Menggunakan JSONP untuk bypass CORS sepenuhnya.
 * Browser inject <script> tag → GAS return callback(json)
 * Tidak ada preflight, tidak ada CORS error, 100% kompatibel.
 * ═══════════════════════════════════════════════════════════════
 */

const SPREADSHEET_ID  = '151mqBeoHMRrUhtQa_GPAmkPlXY9MGmW1ycRffimMn2g';
const DRIVE_FOLDER_ID = '1m-rRxKy1W-gxLc1jqlXW_RtTv9qkNGcC';

const SH_KAS    = 'Laporan Kas';
const SH_WARGA  = 'Data Warga';
const SH_ANN    = 'Pengumuman';
const SH_AGENDA = 'Agenda';
const SH_ADUAN  = 'Aduan';
const SH_LOG    = 'Log Aktivitas';

/* ── JSONP RESPONSE ──
   Jika ada parameter callback, wrap JSON dalam callback().
   Jika tidak ada, return JSON biasa.
   Content-Type: text/javascript agar browser eksekusi sebagai script. */
function jsonpOut(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ══════════════════════════════════════════════════════════════
   doGet — semua request masuk sini
   Params: action, data (JSON encoded), ts, callback (JSONP)
   ══════════════════════════════════════════════════════════════ */
function doGet(e) {
  var callback = null;
  try {
    callback = (e && e.parameter && e.parameter.callback) || null;
    var action   = (e && e.parameter && e.parameter.action) || 'ping';
    var ts       = (e && e.parameter && e.parameter.ts)     || new Date().toISOString();

    var data = {};
    if (e && e.parameter && e.parameter.data) {
      try { data = JSON.parse(decodeURIComponent(e.parameter.data)); }
      catch(pe) { data = {}; }
    }

    var result;
    switch (action) {
      case 'ping':     result = { status:'ok', msg:'RT.001 Backend aktif ✅', ts: new Date().toISOString() }; break;
      case 'getData':  result = getAllData();        break;
      case 'fullSync': result = fullSync(data, ts); break;
      case 'resetAll': result = resetAll();          break;
      default:         result = { status:'error', msg:'Aksi tidak dikenal: ' + action };
    }

    logActivity(action, ts, result.status || 'ok');
    return jsonpOut(result, callback);

  } catch (err) {
    console.error('doGet error:', err);
    return jsonpOut({ status:'error', msg: err.message }, callback);
  }
}

/* doPost tetap ada untuk kompatibilitas */
function doPost(e) {
  var callback = null;
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var data   = body.data   || {};
    var ts     = body.ts     || new Date().toISOString();
    callback   = body.callback || null;
    var result;
    switch (action) {
      case 'fullSync': result = fullSync(data, ts); break;
      case 'getData':  result = getAllData();        break;
      case 'resetAll': result = resetAll();          break;
      default:         result = { status:'error', msg:'Aksi tidak dikenal: ' + action };
    }
    logActivity(action, ts, result.status || 'ok');
    return jsonpOut(result, callback);
  } catch (err) {
    return jsonpOut({ status:'error', msg: err.message }, callback);
  }
}

/* ── FULL SYNC ── */
function fullSync(data, ts) {
  try {
    var results = [];
    if (Array.isArray(data.kas))    { writeKas(data.kas, ts);       results.push('kas OK');    }
    if (Array.isArray(data.warga))  { writeWarga(data.warga, ts);   results.push('warga OK');  }
    if (Array.isArray(data.ann))    { writeAnn(data.ann, ts);       results.push('ann OK');    }
    if (Array.isArray(data.agenda)) { writeAgenda(data.agenda, ts); results.push('agenda OK'); }
    if (Array.isArray(data.aduan))  { writeAduan(data.aduan, ts);   results.push('aduan OK');  }
    return { status:'ok', msg:'fullSync selesai', results: results };
  } catch (err) {
    return { status:'error', msg: err.message };
  }
}

/* ── GET ALL DATA ── */
function getAllData() {
  try {
    return {
      status: 'ok',
      kas:    readSheet(SH_KAS,    ['id','tgl','ket','kat','jns','nom','saldo','oleh']),
      warga:  readSheet(SH_WARGA,  ['id','nama','nik','blok','jiwa','hp','status','kat']),
      ann:    readSheet(SH_ANN,    ['id','judul','jenis','tgl','isi','pembuat']),
      agenda: readSheet(SH_AGENDA, ['id','nama','tgl','waktu','lokasi','ket']),
      aduan:  readSheet(SH_ADUAN,  ['id','nama','jenis','lokasi','deskripsi','status','tgl']),
    };
  } catch (err) {
    return { status:'error', msg: err.message };
  }
}

/* ── READ SHEET → JSON ── */
function readSheet(sheetName, fields) {
  var sheet = getOrCreateSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, fields.length).getValues();
  return data
    .filter(function(row) { return row[0] !== '' && row[0] !== null; })
    .map(function(row) {
      var obj = {};
      fields.forEach(function(f, i) {
        obj[f] = (row[i] !== undefined && row[i] !== null) ? String(row[i]) : '';
      });
      return obj;
    });
}

/* ── WRITE KAS ── */
function writeKas(rows, ts) {
  var sheet = getOrCreateSheet(SH_KAS);
  clearAndWriteHeaders(sheet, ['ID','Tanggal','Keterangan','Kategori','Jenis','Nominal','Saldo','Dicatat Oleh','Update']);
  if (!rows.length) return;
  var data = rows.map(function(k) {
    return [k.id||'',k.tgl||'',k.ket||'',k.kat||'',k.jns||'',Number(k.nom)||0,Number(k.saldo)||0,k.oleh||'',ts];
  });
  sheet.getRange(2, 1, data.length, 9).setValues(data);
}

/* ── WRITE WARGA ── */
function writeWarga(rows, ts) {
  var sheet = getOrCreateSheet(SH_WARGA);
  clearAndWriteHeaders(sheet, ['ID','Nama KK','NIK','Blok','Jiwa','No. HP','Status','Kategori','Update']);
  if (!rows.length) return;
  var data = rows.map(function(w) {
    return [w.id||'',w.nama||'',w.nik||'',w.blok||'',Number(w.jiwa)||0,w.hp||'',w.status||'Tetap',w.kat||'Pribumi',ts];
  });
  sheet.getRange(2, 1, data.length, 9).setValues(data);
}

/* ── WRITE PENGUMUMAN ── */
function writeAnn(rows, ts) {
  var sheet = getOrCreateSheet(SH_ANN);
  clearAndWriteHeaders(sheet, ['ID','Judul','Jenis','Tanggal','Isi','Pembuat','Update']);
  if (!rows.length) return;
  var data = rows.map(function(a) {
    return [a.id||'',a.judul||'',a.jenis||'',a.tgl||'',a.isi||'',a.pembuat||'',ts];
  });
  sheet.getRange(2, 1, data.length, 7).setValues(data);
}

/* ── WRITE AGENDA ── */
function writeAgenda(rows, ts) {
  var sheet = getOrCreateSheet(SH_AGENDA);
  clearAndWriteHeaders(sheet, ['ID','Nama Kegiatan','Tanggal','Waktu','Lokasi','Keterangan','Update']);
  if (!rows.length) return;
  var data = rows.map(function(a) {
    return [a.id||'',a.nama||'',a.tgl||'',a.waktu||'',a.lokasi||'',a.ket||'',ts];
  });
  sheet.getRange(2, 1, data.length, 7).setValues(data);
}

/* ── WRITE ADUAN ── */
function writeAduan(rows, ts) {
  var sheet = getOrCreateSheet(SH_ADUAN);
  clearAndWriteHeaders(sheet, ['ID','Nama Pelapor','Jenis','Lokasi','Deskripsi','Status','Tanggal','Update']);
  if (!rows.length) return;
  var data = rows.map(function(a) {
    return [a.id||'',a.nama||'',a.jenis||'',a.lokasi||'',a.deskripsi||'',a.status||'Baru',a.tgl||'',ts];
  });
  sheet.getRange(2, 1, data.length, 8).setValues(data);
}

/* ── HEADER HELPER ── */
function clearAndWriteHeaders(sheet, headers) {
  sheet.clearContents();
  var hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setBackground('#1B4F8A').setFontColor('#FFFFFF')
        .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  try { sheet.autoResizeColumns(1, headers.length); } catch(e) {}
}

/* ── GET OR CREATE SHEET ── */
function getOrCreateSheet(name) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

/* ── RESET ALL ── */
function resetAll() {
  try {
    var ts = new Date().toISOString();
    writeKas([],ts); writeWarga([],ts); writeAnn([],ts);
    writeAgenda([],ts); writeAduan([],ts);
    return { status:'ok', msg:'Semua sheet berhasil direset' };
  } catch (err) {
    return { status:'error', msg: err.message };
  }
}

/* ── LOG AKTIVITAS ── */
function logActivity(action, ts, statusStr) {
  try {
    var sheet = getOrCreateSheet(SH_LOG);
    if (sheet.getLastRow() === 0) {
      var h = sheet.getRange(1,1,1,4);
      h.setValues([['Timestamp','Action','Status','Keterangan']]);
      h.setBackground('#374151').setFontColor('#FFFFFF').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([ts, action, statusStr, 'Portal RT.001']);
    var last = sheet.getLastRow();
    if (last > 501) sheet.deleteRows(2, last - 501);
  } catch(e) { /* tidak kritikal */ }
}
