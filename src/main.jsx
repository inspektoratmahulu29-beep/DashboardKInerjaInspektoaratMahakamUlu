import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import './styles.css';

const STORAGE_KEY = 'mahulu-dashboard-realisasi-v8';
const IMPORT_AUDIT_KEY = `${STORAGE_KEY}:importAudit`;
const IMPORT_BACKUP_KEY = `${STORAGE_KEY}:importBackup`;
const IMPORT_TEMPLATE_KEY = `${STORAGE_KEY}:excelTemplate`;
const IDB_DB = 'mahulu-dashboard-realisasi-v81';
const IDB_STORE = 'store';
const MAX_IMPORT_AUDIT = 80;
let auditCache = [];
let importBackupCache = null;
let templateCache = null;
function openAppDB(){ return new Promise((resolve,reject)=>{ if(!('indexedDB' in window)) return reject(new Error('IndexedDB tidak tersedia di browser ini')); const req=indexedDB.open(IDB_DB,1); req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); }; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error||new Error('Gagal membuka IndexedDB')); }); }
async function idbGet(key){ const db=await openAppDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(IDB_STORE,'readonly'); const req=tx.objectStore(IDB_STORE).get(key); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
async function idbSet(key,value){ const db=await openAppDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(value,key); tx.oncomplete=()=>resolve(true); tx.onerror=()=>reject(tx.error||new Error('Gagal menyimpan database lokal')); }); }
async function idbDel(key){ const db=await openAppDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).delete(key); tx.oncomplete=()=>resolve(true); tx.onerror=()=>reject(tx.error); }); }
async function loadStoredDatabase(){ const modern=await idbGet('database').catch(()=>null); if(modern?.years) return modern; try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw){ const parsed=JSON.parse(raw); if(parsed?.years){ await idbSet('database',parsed); try{localStorage.removeItem(STORAGE_KEY);}catch{} return parsed; } } }catch{} return null; }
async function saveStoredDatabase(value){ await idbSet('database',value); try{localStorage.setItem(`${STORAGE_KEY}:activeYear`,String(value?.activeYear||''));}catch{} }
async function loadActiveYear(){ try{ const raw=localStorage.getItem(`${STORAGE_KEY}:activeYear`); return raw?Number(raw):null; }catch{return null} }
async function clearLegacyStorage(){ try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(IMPORT_AUDIT_KEY);localStorage.removeItem(IMPORT_BACKUP_KEY);localStorage.removeItem(IMPORT_TEMPLATE_KEY);}catch{} }
const ORG = 'INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU';
const money = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const moneyParts = (n) => { const formatted = money(n).replace(/\u00a0/g, ' '); const m = formatted.match(/^Rp\s*(.*)$/); return { symbol: m ? 'Rp' : '', amount: m ? m[1] : formatted }; };
const number = (n) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n) || 0);
const pct = (n) => `${(Number(n) || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
const cell = (v) => v === null || v === undefined ? '' : String(v);
const cleanText = (v) => cell(v).replace(/\s+/g, ' ').trim();
const parseNumber = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = cleanText(v).replace(/\s/g, '');
  if (!s) return null;
  if (/^-?\d+[,.]?\d*$/.test(s)) {
    if (s.includes('.') && s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
    if ((s.match(/\./g) || []).length > 1) return Number(s.replace(/\./g, ''));
    return Number(s.replace(',', '.'));
  }
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};
const colName = (index) => { let s = ''; let n = index + 1; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const isError = (v) => typeof v === 'string' && /#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A)/i.test(v);
const isNum = (v) => parseNumber(v) !== null && !isError(v);

const sheetMeta = {
  'IKU': { group: 'Perencanaan Strategis', role: 'Indikator Kinerja Utama', dataStart: 7 },
  'Rencana Aksi': { group: 'Perencanaan Strategis', role: 'Rencana aksi pencapaian target', dataStart: 6 },
  'Capaian Sasaran Strategis': { group: 'Capaian Kinerja', role: 'Capaian sasaran strategis', dataStart: 4, target: 4, real: 5, achieve: 6, budget: 8, budgetReal: 9, budgetPct: 10 },
  'Capaian Sasaran Program': { group: 'Capaian Kinerja', role: 'Capaian sasaran program', dataStart: 4, target: 5, real: 6, achieve: 7, budget: 9, budgetReal: 10, budgetPct: 11 },
  'Capaian Sasaran Kegiatan Utama': { group: 'Capaian Kinerja', role: 'Capaian kegiatan utama', dataStart: 4, target: 6, real: 7, achieve: 8, budget: 10, budgetReal: 11, budgetPct: 12 },
  'Capaian Sasaran Kegiatan(Penun)': { group: 'Capaian Kinerja', role: 'Capaian kegiatan penunjang', dataStart: 4, target: 7, real: 8, achieve: 9, budget: 11, budgetReal: 12, budgetPct: 13 },
  'Capaian Sasaran SUBKegiatan(U)': { group: 'Capaian Kinerja', role: 'Capaian subkegiatan utama', dataStart: 4, target: 7, real: 8, achieve: 9, budget: 11, budgetReal: 12, budgetPct: 13 },
  'Capaian Sasaran SUBKegiatan (P)': { group: 'Capaian Kinerja', role: 'Capaian subkegiatan penunjang', dataStart: 4, target: 8, real: 9, achieve: 10, budget: 12, budgetReal: 13, budgetPct: 14 },
  'Monev Renaksi IKU': { group: 'Monitoring & Evaluasi', role: 'Monev pencapaian IKU', dataStart: 8, targetCols: [5, 6, 7, 8], realCols: [9, 10, 11, 12] },
  'Monev Program': { group: 'Monitoring & Evaluasi', role: 'Monev rencana aksi program', dataStart: 8, targetCols: [7, 8, 9, 10], realCols: [11, 12, 13, 14], budget: 18, budgetReal: 19 },
  'Monev output Subkegiatan Utama': { group: 'Monitoring & Evaluasi', role: 'Monev output subkegiatan utama', dataStart: 6, activityCol: 7, outputCol: 11 },
  'Monev Subkegiatan Penunjang': { group: 'Monitoring & Evaluasi', role: 'Monev output subkegiatan penunjang', dataStart: 6, activityCol: 7, outputCol: 10 },
  'Rekap realisasi PKPT': { group: 'Penugasan', role: 'Rekap penugasan pembinaan dan pengawasan', dataStart: 6, statusCol: 4, activityCol: 3 },
  'Realisasi Fisik & Keu': { group: 'Realisasi', role: 'Realisasi fisik dan keuangan', dataStart: 9, budget: 2, physical: 4, financial: 6, financialPct: 7, weightedPhysical: 5, weightedFinancial: 8, remaining: 9, weight: 3 }
};


const knownSheetRanges = {
  'IKU':'A1:L7','Rencana Aksi':'A1:M37','Capaian Sasaran Strategis':'A1:K11','Capaian Sasaran Program':'A1:L13','Capaian Sasaran Kegiatan Utama':'A1:M6','Capaian Sasaran Kegiatan(Penun)':'A1:N10','Capaian Sasaran SUBKegiatan(U)':'A1:N15','Capaian Sasaran SUBKegiatan (P)':'A1:O12','Monev Renaksi IKU':'A1:R34','Monev Program':'A1:X36','Monev output Subkegiatan Utama':'A1:P60','Monev Subkegiatan Penunjang':'A1:M31','Rekap realisasi PKPT':'A1:R107','Realisasi Fisik & Keu':'A1:K54'
};
const formulaSpecs = {
  'IKU': { inputs: ['A:L'], computed: [], note: 'Indikator kinerja utama dan target tahunan merupakan input sumber.' },
  'Rencana Aksi': { inputs: ['A:M'], computed: [], note: 'Target/realiasi triwulanan diisi sebagai input monitoring.' },
  'Capaian Sasaran Strategis': { inputs: ['E:F','I:J'], computed: ['G','K'], note: 'G = F ÷ E (displayed as %); K = J ÷ I (displayed as %).' },
  'Capaian Sasaran Program': { inputs: ['F:G','J:K'], computed: ['H','L'], note: 'H = G ÷ F (displayed as %); L = K ÷ J (displayed as %).' },
  'Capaian Sasaran Kegiatan Utama': { inputs: ['G:H','K:L'], computed: ['I','M'], note: 'I = H ÷ G (displayed as %); M = L ÷ K (displayed as %).' },
  'Capaian Sasaran Kegiatan(Penun)': { inputs: ['H:I','L:M'], computed: ['J','N'], note: 'J = I ÷ H (displayed as %); N = M ÷ L (displayed as %).' },
  'Capaian Sasaran SUBKegiatan(U)': { inputs: ['H:I','L:M'], computed: ['J','N'], note: 'J = I ÷ H (displayed as %); N = M ÷ L (displayed as %).' },
  'Capaian Sasaran SUBKegiatan (P)': { inputs: ['I:J','M:N'], computed: ['K','O'], note: 'K = J ÷ I (displayed as %); O = N ÷ M (displayed as %).' },
  'Monev Renaksi IKU': { inputs: ['F:I','J:M'], computed: ['Virtual % per TW'], note: 'Capaian triwulan = realisasi TW ÷ target TW × 100. Tidak menimpa input.' },
  'Monev Program': { inputs: ['H:K','L:O','R:S'], computed: ['Virtual % per TW','% Realisasi Anggaran'], note: 'Capaian TW dan % anggaran dihitung untuk monitoring tanpa menimpa input.' },
  'Monev output Subkegiatan Utama': { inputs: ['H','L'], computed: ['Virtual output count'], note: 'Output utama dipantau dari aktivitas dan jumlah output yang diisi.' },
  'Monev Subkegiatan Penunjang': { inputs: ['H','K'], computed: ['Virtual output count'], note: 'Output penunjang dipantau dari aktivitas dan jumlah output yang diisi.' },
  'Rekap realisasi PKPT': { inputs: ['D:E','J:L'], computed: ['Virtual % penyelesaian'], note: 'Progress penugasan = realisasi ÷ target × 100 saat angka tersedia.' },
  'Realisasi Fisik & Keu': { inputs: ['C','E','G','K'], computed: ['D','F','H','I','J'], note: 'D bobot; F fisik tertimbang; H % keuangan; I keuangan tertimbang; J sisa dana. Baris program mengagregasi detail.' }
};

function addr(row, col) { return `${colName(col)}${row + 1}`; }
function putFormula(sheet, rowIndex, colIndex, formula, value) {
  const s = sheet; if (!s.formulas) s.formulas = {};
  const a = addr(rowIndex, colIndex); s.formulas[a] = formula;
  s.values[rowIndex][colIndex] = value ?? '';
}
function clampPct(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }
function isExternalFormula(formula) { return /\[[^\]]+\]|#REF!|#NAME\?/i.test(String(formula || '')); }

function recalculateCapaian(s, meta) {
  for (let ri = meta.dataStart; ri < s.values.length; ri++) {
    const r = s.values[ri] || [];
    const t = parseNumber(r[meta.target]), real = parseNumber(r[meta.real]);
    const b = parseNumber(r[meta.budget]), br = parseNumber(r[meta.budgetReal]);
    if (meta.achieve !== undefined) {
      const v = t !== null && real !== null && t !== 0 ? +(real / t).toFixed(6) : '';
      putFormula(s, ri, meta.achieve, `=IF(OR(${colName(meta.target)}${ri+1}="",${colName(meta.real)}${ri+1}="",${colName(meta.target)}${ri+1}=0),"",${colName(meta.real)}${ri+1}/${colName(meta.target)}${ri+1})`, v);
    }
    if (meta.budgetPct !== undefined) {
      const v = b !== null && br !== null && b !== 0 ? +(br / b).toFixed(6) : '';
      putFormula(s, ri, meta.budgetPct, `=IF(OR(${colName(meta.budget)}${ri+1}="",${colName(meta.budgetReal)}${ri+1}="",${colName(meta.budget)}${ri+1}=0),"",${colName(meta.budgetReal)}${ri+1}/${colName(meta.budget)}${ri+1})`, v);
    }
  }
}

function recalculateRealisasi(s) {
  const groups = [
    { summary: 11, details: Array.from({length:13}, (_,i)=>12+i) },
    { summary: 26, details: Array.from({length:14}, (_,i)=>27+i) },
    { summary: 41, details: [42] },
  ];
  const officeRow = 10;

  // Preserve explicitly supplied summary amounts; only fill blanks from the workbook hierarchy.
  const summaryInfo = groups.map(({summary, details}) => {
    const src = s.values[summary-1] || [];
    let budget = parseNumber(src[2]);
    let fin = parseNumber(src[6]);
    if (budget === null) budget = details.reduce((a,rr)=>a+(parseNumber((s.values[rr-1]||[])[2])||0),0);
    if (fin === null) fin = details.reduce((a,rr)=>a+(parseNumber((s.values[rr-1]||[])[6])||0),0);
    return {summary, details, budget, fin};
  });

  const totalBudget = summaryInfo.reduce((a,g)=>a+(g.budget||0),0);
  const totalFin = summaryInfo.reduce((a,g)=>a+(g.fin||0),0);

  for (const {summary, details, budget:pb, fin:pf} of summaryInfo) {
    const currentBudget = parseNumber((s.values[summary-1]||[])[2]);
    const currentFin = parseNumber((s.values[summary-1]||[])[6]);
    if (summary===11 && currentBudget===null) putFormula(s, summary-1, 2, '=SUM(C12:C24)', pb || '');
    if (summary===11 && currentFin===null) putFormula(s, summary-1, 6, '=SUM(G12:G24)', pf || '');
    if (summary===41 && currentBudget===null) putFormula(s, summary-1, 2, '=C42', pb || '');
    if (summary===41 && currentFin===null) putFormula(s, summary-1, 6, '=G42', pf || '');

    const d = totalBudget ? pb/totalBudget*100 : null;
    // Keep source-provided summary physical realization (e.g. row 26 = 94 and row 41 = 95).
    let phys = parseNumber((s.values[summary-1]||[])[4]);
    if (phys===null && details.length===1) phys = parseNumber((s.values[details[0]-1]||[])[4]);
    if (phys===null && details.length>1) {
      const items=details.map(rr=>({b:parseNumber((s.values[rr-1]||[])[2]),p:parseNumber((s.values[rr-1]||[])[4])})).filter(x=>x.b!==null&&x.p!==null);
      phys=items.length?items.reduce((a,x)=>a+x.b*x.p,0)/items.reduce((a,x)=>a+x.b,0):null;
    }
    putFormula(s, summary-1, 3, `=IF($C$${officeRow}=0,\"\",C${summary}/$C$${officeRow}*100)`, d===null?'':+d.toFixed(6));
    putFormula(s, summary-1, 4, details.length===1 ? `=E${details[0]}` : `=IFERROR(SUMPRODUCT(C${details[0]}:C${details[details.length-1]},E${details[0]}:E${details[details.length-1]})/C${summary},\"\")`, phys===null?'':+phys.toFixed(6));
    putFormula(s, summary-1, 5, `=IF(OR(D${summary}=\"\",E${summary}=\"\"),\"\",D${summary}*E${summary}/100)`, d!==null&&phys!==null?+(d*phys/100).toFixed(6):'');
    const rate=pb&&pf!==null?pf/pb*100:null;
    putFormula(s, summary-1, 7, `=IF(OR(C${summary}=\"\",G${summary}=\"\",C${summary}=0),\"\",G${summary}/C${summary}*100)`, rate===null?'':+rate.toFixed(6));
    putFormula(s, summary-1, 8, `=IF(OR(H${summary}=\"\",D${summary}=\"\"),\"\",H${summary}*D${summary}/100)`, rate!==null&&d!==null?+(rate*d/100).toFixed(6):'');
    putFormula(s, summary-1, 9, `=IF(OR(C${summary}=\"\",G${summary}=\"\"),\"\",C${summary}-G${summary})`, pf!==null?pb-pf:'');
  }

  // Detail rows derive their budget share, physical weight, financial rate, weighted financial share and remaining balance.
  for (const {summary, details} of groups.flatMap(g=>[g])) {
    const parentBudget = parseNumber((s.values[summary-1]||[])[2]);
    for (const rr of details) {
      const row=s.values[rr-1]||[]; const b=parseNumber(row[2]); const phys=parseNumber(row[4]); const fin=parseNumber(row[6]);
      const d=parentBudget!==null&&parentBudget!==0&&b!==null?b/parentBudget*100:null;
      const h=b!==null&&b!==0&&fin!==null?fin/b*100:null;
      putFormula(s,rr-1,3,`=IF(OR($C$${summary}=0,C${rr}=\"\"),\"\",C${rr}/$C$${summary}*100)`,d===null?'':+d.toFixed(6));
      putFormula(s,rr-1,5,`=IF(OR(D${rr}=\"\",E${rr}=\"\"),\"\",D${rr}*E${rr}/100)`,d!==null&&phys!==null?+(d*phys/100).toFixed(6):'');
      putFormula(s,rr-1,7,`=IF(OR(C${rr}=\"\",G${rr}=\"\",C${rr}=0),\"\",G${rr}/C${rr}*100)`,h===null?'':+h.toFixed(6));
      putFormula(s,rr-1,8,`=IF(OR(H${rr}=\"\",D${rr}=\"\"),\"\",H${rr}*D${rr}/100)`,h!==null&&d!==null?+(h*d/100).toFixed(6):'');
      putFormula(s,rr-1,9,`=IF(OR(C${rr}=\"\",G${rr}=\"\"),\"\",C${rr}-G${rr})`,b!==null&&fin!==null?b-fin:'');
    }
  }

  // Office total follows top-level program totals: program 1 derived from details if blank, program 2 explicit summary, program 3 explicit/link.
  putFormula(s,officeRow-1,2,'=SUM(C11,C26,C41)',totalBudget||'');
  putFormula(s,officeRow-1,3,'=IF(C10=0,\"\",100)',totalBudget?100:'');
  const sourcePhys=parseNumber((s.values[officeRow-1]||[])[4]);
  const topPhysical = summaryInfo.map(g=>({b:g.budget,p:parseNumber((s.values[g.summary-1]||[])[4])})).filter(x=>x.b!==null&&x.p!==null);
  const fallbackPhys=topPhysical.length?topPhysical.reduce((a,x)=>a+x.b*x.p,0)/topPhysical.reduce((a,x)=>a+x.b,0):null;
  // Do not overwrite an official imported office physical value; calculate only when blank.
  if(sourcePhys===null) putFormula(s,officeRow-1,4,'=IFERROR((C11*E11+C26*E26+C41*E41)/C10,\"\")',fallbackPhys===null?'':+fallbackPhys.toFixed(6));
  else putFormula(s,officeRow-1,4,'=E10',sourcePhys);
  const officePhys=sourcePhys===null?fallbackPhys:sourcePhys;
  putFormula(s,officeRow-1,5,'=IF(OR(D10=\"\",E10=\"\"),\"\",D10*E10/100)',officePhys===null?'':+officePhys.toFixed(6));
  putFormula(s,officeRow-1,6,'=SUM(G11,G26,G41)',totalFin||'');
  const tr=totalBudget?totalFin/totalBudget*100:null;
  putFormula(s,officeRow-1,7,'=IF(C10=0,\"\",G10/C10*100)',tr===null?'':+tr.toFixed(6));
  putFormula(s,officeRow-1,8,'=IF(OR(H10=\"\",D10=\"\"),\"\",H10*D10/100)',tr===null?'':+tr.toFixed(6));
  putFormula(s,officeRow-1,9,'=IF(OR(C10=\"\",G10=\"\"),\"\",C10-G10)',totalBudget-totalFin);

  putFormula(s,44,2,'=C10',totalBudget||'');
  putFormula(s,44,6,'=G10',totalFin||'');
  putFormula(s,44,7,'=IF(C45=0,\"\",G45/C45*100)',tr===null?'':+tr.toFixed(6));
  putFormula(s,44,9,'=IF(OR(C45=\"\",G45=\"\"),\"\",C45-G45)',totalBudget-totalFin);
}

function recalculatePayload(payload) { const out=clone(payload); for(const name of Object.keys(out.sheets||{})) applyAutoCalculations(out,name); return out; }
function formulaAudit(payload) {
  const issues=[]; let errors=0, external=0, formulaCount=0;
  for(const [name,s] of Object.entries(payload.sheets||{})){
    for(let ri=0;ri<(s.values||[]).length;ri++) for(let ci=0;ci<(s.values[ri]||[]).length;ci++) if(isError(s.values[ri][ci])) { errors++; if(issues.length<60) issues.push({sheet:name,cell:addr(ri,ci),kind:'ERROR',value:s.values[ri][ci]}); }
    for(const [a,f] of Object.entries(s.formulas||{})){ formulaCount++; if(isExternalFormula(f)){external++; if(issues.length<60) issues.push({sheet:name,cell:a,kind:'EXTERNAL',value:f});}}
  }
  return {errors,external,formulaCount,issues};
}
function normalizeImportedSheet(name, values, formulas) {
  const cols=Math.max(values.reduce((m,r)=>Math.max(m,r.length),0),1); const out=values.map(r=>Array.from({length:cols},(_,i)=>r?.[i] ?? ''));
  return {name,rows:out.length,cols,values:out,formulas:formulas||{}};
}

function normalizeSheetKey(name) {
  return cleanText(name).toLowerCase()
    .replace(/[()\[\]{}]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/subkegiatan/g, 'subkegiatan')
    .replace(/penun/g, 'penunjang')
    .replace(/output/g, 'output');
}
function similarity(a,b){
  a=normalizeSheetKey(a); b=normalizeSheetKey(b); if(a===b) return 1;
  const grams=(x,n=2)=>{const out=[];for(let i=0;i<x.length-n+1;i++)out.push(x.slice(i,i+n));return out;};
  const A=new Set(grams(a)), B=new Set(grams(b)); if(!A.size||!B.size) return 0;
  let inter=0; A.forEach(x=>{if(B.has(x))inter++;}); return (2*inter)/(A.size+B.size);
}
function buildSchemaMapping(importedPayload, currentPayload){
  const currentNames=Object.keys(currentPayload?.sheets||{});
  const importedNames=Object.keys(importedPayload?.sheets||{});
  const used=new Set(); const rows=[];
  for(const expected of currentNames){
    let best=null;
    for(const actual of importedNames){ if(used.has(actual)) continue; const score=similarity(expected,actual); if(!best||score>best.score)best={actual,score}; }
    const threshold=expected===best?.actual?1:(best?.score||0);
    if(best && threshold>=0.48){ used.add(best.actual); rows.push({expected,actual:best.actual,score:+threshold.toFixed(2),status:best.actual===expected?'exact':'fuzzy'}); }
    else rows.push({expected,actual:'',score:0,status:'missing'});
  }
  for(const actual of importedNames.filter(n=>!used.has(n))) rows.push({expected:'',actual,score:0,status:'new'});
  return rows;
}
function importSchemaStats(mapping){
  return {exact:mapping.filter(x=>x.status==='exact').length,fuzzy:mapping.filter(x=>x.status==='fuzzy').length,missing:mapping.filter(x=>x.status==='missing').length,newSheets:mapping.filter(x=>x.status==='new').length};
}
function extractWorkbookPresentation(wb){
  const sheets={};
  for(const name of wb.SheetNames){
    const ws=wb.Sheets[name];
    sheets[name]={
      ref: ws['!ref']||'A1',
      merges: (ws['!merges']||[]).map(m=>({s:{r:m.s.r,c:m.s.c},e:{r:m.e.r,c:m.e.c}})),
      cols: (ws['!cols']||[]).map(c=>c?({...c}):null),
      rows: (ws['!rows']||[]).map(r=>r?({...r}):null),
      hidden: !!ws['!hidden'],
      views: ws['!views'] ? clone(ws['!views']) : null,
      autoFilter: ws['!autofilter'] ? clone(ws['!autofilter']) : null,
    };
  }
  return sheets;
}
function arrayBufferToBase64(buf){ const bytes=new Uint8Array(buf); const chunk=0x8000; let out=''; for(let i=0;i<bytes.length;i+=chunk){ out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length))); } return btoa(out); }
function workbookToBase64(wb){
  try{return XLSX.write(wb,{bookType:'xlsx',type:'base64',compression:true});}catch{return null;}
}
function updateWorkbookFromPayload(templateWb,payload, mapping){
  const map=new Map(mapping.filter(x=>x.actual).map(x=>[x.expected,x.actual]));
  for(const [logicalName,s] of Object.entries(payload.sheets||{})){
    const physicalName=map.get(logicalName)||logicalName;
    const ws=templateWb.Sheets[physicalName]; if(!ws) continue;
    const values=s.values||[]; const formulas=s.formulas||{};
    const range=XLSX.utils.decode_range(s.ref||ws['!ref']||`A1:${colName(Math.max(0,(s.cols||1)-1))}${Math.max(1,values.length)}`);
    for(let r=range.s.r;r<=Math.max(range.e.r,values.length-1);r++){
      for(let c=range.s.c;c<=Math.max(range.e.c,(s.cols||1)-1);c++){
        const a=XLSX.utils.encode_cell({r,c}); const v=values?.[r]?.[c] ?? '';
        const f=formulas?.[a];
        if(f){ ws[a] = ws[a] || {}; ws[a].f=String(f).replace(/^=/,''); ws[a].v = typeof v==='number'?v:v; ws[a].t=typeof v==='number'?'n':'s'; }
        else if(ws[a]){ ws[a].v=v; if(v===''||v===null){ delete ws[a].f; ws[a].v=''; ws[a].t='s'; } else { ws[a].t=typeof v==='number'?'n':'s'; delete ws[a].f; } }
        else if(v!=='' && v!==null){ ws[a]={t:typeof v==='number'?'n':'s',v}; }
      }
    }
    ws['!ref']=s.ref||ws['!ref'];
    if(s.presentation){
      if(s.presentation.merges) ws['!merges']=s.presentation.merges.map(m=>({s:m.s,e:m.e}));
      if(s.presentation.cols) ws['!cols']=s.presentation.cols.map(c=>c?({...c}):null);
      if(s.presentation.rows) ws['!rows']=s.presentation.rows.map(r=>r?({...r}):null);
      if(s.presentation.views) ws['!views']=clone(s.presentation.views);
      if(s.presentation.autoFilter) ws['!autofilter']=clone(s.presentation.autoFilter);
    }
  }
  return templateWb;
}
function buildPreviewRows(importedPayload,currentPayload){
  const mapping=buildSchemaMapping(importedPayload,currentPayload); const current=currentPayload?.sheets||{}; const imported=importedPayload?.sheets||{};
  return mapping.map(m=>{
    if(m.status==='new') return {...m,importRows:imported[m.actual]?.rows||0,currentRows:0,importCols:imported[m.actual]?.cols||0,currentCols:0,formulaCount:Object.keys(imported[m.actual]?.formulas||{}).length};
    const i=imported[m.actual], c=current[m.expected];
    return {...m,importRows:i?.rows||0,currentRows:c?.rows||0,importCols:i?.cols||0,currentCols:c?.cols||0,formulaCount:Object.keys(i?.formulas||{}).length};
  });
}
function validateImportPlan(importedPayload,currentPayload,mode,mapping,opts={}){
  const stats=importSchemaStats(mapping); const warnings=[]; const errors=[];
  if(stats.missing>0 && mode!=='merge') warnings.push(`${stats.missing} sheet dari database saat ini tidak ditemukan di file import.`);
  if(stats.fuzzy>0) warnings.push(`${stats.fuzzy} sheet dipetakan berdasarkan kemiripan nama.`);
  if(stats.newSheets>0) warnings.push(`${stats.newSheets} sheet baru ditemukan dan hanya akan ikut bila mode menggabungkan sheet.`);
  const audit=formulaAudit(importedPayload);
  if(audit.errors>0) warnings.push(`${audit.errors} nilai error terdeteksi di file import.`);
  if(audit.external>0) warnings.push(`${audit.external} formula eksternal terdeteksi; nilai cache akan dipertahankan bila tersedia.`);
  for(const x of mapping){
    if(x.status==='fuzzy' && x.score<0.60) warnings.push(`Pemetaan ${x.actual} → ${x.expected} memiliki keyakinan rendah (${Math.round(x.score*100)}%).`);
  }
  if(!Object.keys(importedPayload?.sheets||{}).length) errors.push('Tidak ada sheet yang dapat diimpor.');
  return {ok:errors.length===0,errors,warnings,stats,audit,preserveFormat:opts.preserveFormat!==false};
}
function makeAuditEntry(action,details){ return {id:`IMP-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,at:new Date().toISOString(),action,details}; }
async function initLocalStores(){ auditCache=await idbGet('audit').catch(()=>null) || []; importBackupCache=await idbGet('backup').catch(()=>null) || null; templateCache=await idbGet('template').catch(()=>null) || null; }
function readAudit(){ return auditCache; }
function writeAudit(entry){ auditCache=[entry,...auditCache].slice(0,MAX_IMPORT_AUDIT); void idbSet('audit',auditCache).catch(()=>{}); }
async function saveImportBackup(year,payload,years){ importBackupCache={year,payload,years,at:new Date().toISOString()}; await idbSet('backup',importBackupCache); }
async function loadImportBackup(){ if(importBackupCache) return importBackupCache; importBackupCache=await idbGet('backup').catch(()=>null); return importBackupCache; }
async function saveTemplateBase64(base64,meta){ templateCache={base64,meta,at:new Date().toISOString()}; await idbSet('template',templateCache); }
function loadTemplateBase64(){ return templateCache; }
function detectYearInValues(values) { for(const row of (values||[]).slice(0,8)) for(const v of row||[]){ const m=String(v??'').match(/\b(20\d{2})\b/); if(m) return Number(m[1]); } return null; }
function parseExcelWorkbook(file) {
  return file.arrayBuffer().then(buf=>{
    const wb=XLSX.read(buf,{type:'array',cellFormula:true,cellNF:true,cellStyles:true,cellHTML:false}); const sheets={}; let year=null;
    wb.SheetNames.forEach(name=>{
      const ws=wb.Sheets[name]; const values=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
      const formulas={}; const ref=ws['!ref'];
      if(ref){ const range=XLSX.utils.decode_range(ref); for(let r=range.s.r;r<=range.e.r;r++) for(let c=range.s.c;c<=range.e.c;c++){ const a=XLSX.utils.encode_cell({r,c}); if(ws[a]?.f) formulas[a]='='+(ws[a].f||''); } }
      const metaSheet=normalizeImportedSheet(name,values,formulas); metaSheet.ref=ref||'A1'; metaSheet.cols=Math.max(metaSheet.cols, XLSX.utils.decode_range(ref||'A1:A1').e.c+1); metaSheet.presentation=extractWorkbookPresentation({SheetNames:[name],Sheets:{[name]:ws}})[name];
      sheets[name]=metaSheet; year=year||detectYearInValues(values);
      for(const [a,f] of Object.entries(formulas)) if(isExternalFormula(f)){ const v=ws[a]?.v; if(v!==undefined && !isError(v)) { const rc=XLSX.utils.decode_cell(a); metaSheet.values[rc.r][rc.c]=v; } }
    });
    return {version:'8.1.0',source:file.name,meta:{organization:ORG,year:year||new Date().getFullYear(),sheetCount:wb.SheetNames.length,preserveFormat:true},sheets,_templateBase64:arrayBufferToBase64(buf)};
  });
}

function safeSheetName(name){ return String(name).replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Sheet'; }
function aoaFromSheet(s){ return (s.values||[]).map(r=>Array.from({length:s.cols||0},(_,i)=>r?.[i]??'')); }
function applyFormulaObjects(ws, s){ for(const [a,f] of Object.entries(s.formulas||{})){ if(!ws[a]) ws[a]={t:'s',v:s.values?.[XLSX.utils.decode_cell(a).r]?.[XLSX.utils.decode_cell(a).c]??''}; ws[a].f=String(f).replace(/^=/,''); } }
function downloadBlob(blob, filename){ const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),1000); }
function exportExcelPayload(payload, year, onlySheet=null){
  const template=loadTemplateBase64();
  let wb=null;
  if(template?.base64){ try{wb=XLSX.read(template.base64,{type:'base64',cellFormula:true,cellNF:true,cellStyles:true});}catch{wb=null;} }
  if(!wb) wb=XLSX.utils.book_new();
  if(template?.base64){
    const mapping=buildSchemaMapping(payload,payload);
    updateWorkbookFromPayload(wb,payload,mapping);
    if(onlySheet){ const keep=new Set([onlySheet]); wb.SheetNames=wb.SheetNames.filter(n=>keep.has(n)); }
    if(!onlySheet){
      const d=derive(payload); const sum=[['DATABASE REALISASI KINERJA',''],['Organisasi',ORG],['Tahun',year],[],['KPI','Nilai'],['Total Anggaran',d.budgetTotal],['Realisasi Keuangan',d.financialTotal],['Serapan Keuangan',d.financialRate/100],['Rata-rata Fisik',d.physicalRate/100],['Penugasan PKPT',d.pkptCount],['Selesai',d.done],['Berjalan',d.progress],['Belum',d.pending],['Output Utama',d.outputUtama],['Output Penunjang',d.outputPenunjang],['Kelengkapan Database',d.overallCompleteness/100],['Rata-rata Capaian',d.avgCapaian===null?'':d.avgCapaian/100]]; if(!wb.Sheets['Dashboard']) XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sum),'Dashboard'); else wb.Sheets['Dashboard']=XLSX.utils.aoa_to_sheet(sum); if(!wb.SheetNames.includes('Dashboard')) wb.SheetNames.unshift('Dashboard'); }
  } else {
    const entries=onlySheet ? [[onlySheet,payload.sheets[onlySheet]]] : Object.entries(payload.sheets||{});
    if(!onlySheet){const d=derive(payload);const summary=[['DATABASE REALISASI KINERJA',''],['Organisasi',ORG],['Tahun',year],[],['KPI','Nilai'],['Total Anggaran',d.budgetTotal],['Realisasi Keuangan',d.financialTotal],['Serapan Keuangan',d.financialRate/100],['Rata-rata Fisik',d.physicalRate/100],['Penugasan PKPT',d.pkptCount],['Selesai',d.done],['Berjalan',d.progress],['Belum',d.pending],['Output Utama',d.outputUtama],['Output Penunjang',d.outputPenunjang],['Kelengkapan Database',d.overallCompleteness/100],['Rata-rata Capaian',d.avgCapaian===null?'':d.avgCapaian/100]];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'Dashboard');}
    const used={}; entries.forEach(([name,s])=>{if(!s)return;let sn=safeSheetName(name),base=sn,i=2;while(used[sn])sn=(base.slice(0,27)+`_${i++}`).slice(0,31);used[sn]=1;const ws=XLSX.utils.aoa_to_sheet(aoaFromSheet(s));applyFormulaObjects(ws,s);if(s.presentation){if(s.presentation.merges)ws['!merges']=s.presentation.merges.map(m=>({s:m.s,e:m.e}));if(s.presentation.cols)ws['!cols']=s.presentation.cols.map(c=>c?({...c}):null);if(s.presentation.rows)ws['!rows']=s.presentation.rows.map(r=>r?({...r}):null);}XLSX.utils.book_append_sheet(wb,ws,sn);});
  }
  const arr=XLSX.write(wb,{bookType:'xlsx',type:'array',compression:true}); downloadBlob(new Blob([arr],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), onlySheet?`Kertas-Kerja-${onlySheet}-${year}.xlsx`:`Database-Realisasi-Kinerja-TA-${year}.xlsx`);
}

function yearFromPayload(payload) {
  const direct = payload?.meta?.year;
  if (direct) return Number(direct);
  for (const s of Object.values(payload?.sheets || {})) {
    for (const row of (s.values || []).slice(0, 5)) for (const v of row) {
      const m = cell(v).match(/\b(20\d{2})\b/); if (m) return Number(m[1]);
    }
  }
  return new Date().getFullYear();
}

function updateYearStrings(value, year) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/TAHUN ANGGARAN\s+20\d{2}/gi, `TAHUN ANGGARAN ${year}`)
    .replace(/\bTA\s*20\d{2}\b/gi, `TA ${year}`)
    .replace(/Tahun\s+20\d{2}/gi, `Tahun ${year}`);
}

function normalizePayloadForYear(payload, year) {
  const out = clone(payload);
  out.meta = { ...(out.meta || {}), year: Number(year) };
  for (const s of Object.values(out.sheets || {})) {
    s.values = (s.values || []).map((row) => row.map((v) => updateYearStrings(v, Number(year))));
  }
  return out;
}

function blankDataRows(payload, year) {
  const out = normalizePayloadForYear(payload, year);
  for (const [name, s] of Object.entries(out.sheets || {})) {
    const start = sheetMeta[name]?.dataStart ?? 3;
    if (start >= 0 && s.values.length > start) {
      const cols = Math.max(s.cols || 0, ...s.values.map(r => r.length), 0);
      const kept = s.values.slice(0, start);
      const blankCount = Math.max(1, Math.min(s.values.length - start, 20));
      for (let i = 0; i < blankCount; i++) kept.push(Array(cols).fill(''));
      s.values = kept;
      s.rows = kept.length;
      s.cols = cols;
    }
  }
  return out;
}

function headersFor(sheet) {
  const values = sheet?.values || [];
  const cols = Math.max(sheet?.cols || 0, ...values.map(r => r?.length || 0), 0);
  return Array.from({ length: cols }, (_, ci) => {
    const found = [];
    for (const row of values.slice(0, 9)) {
      const v = cleanText(row?.[ci]);
      if (!v) continue;
      if (!/^\d+$/.test(v) && !found.includes(v)) found.push(v);
    }
    return found.slice(-2).join(' / ') || `Kolom ${colName(ci)}`;
  });
}

function dataCompleteness(sheet) {
  const meta = sheetMeta[sheet?.name] || {};
  const values = sheet?.values || [];
  const start = meta.dataStart ?? 3;
  const data = values.slice(start);
  const cols = Math.max(sheet?.cols || 0, ...data.map(r => r?.length || 0), 0);
  if (!data.length || !cols) return 0;
  let filled = 0; const total = data.length * cols;
  for (const r of data) for (let c = 0; c < cols; c++) if (cleanText(r?.[c])) filled++;
  return total ? filled / total * 100 : 0;
}

function sheetStats(name, sheet) {
  const meta=sheetMeta[name]||{}; const values=sheet?.values||[]; const start=meta.dataStart??3; const rows=values.slice(start); const achievement=[]; const budget=[]; let target=0, realized=0, budgetTotal=0, budgetRealized=0;
  if(meta.target!==undefined){ for(const r of rows){ const t=parseNumber(r?.[meta.target]), a=parseNumber(r?.[meta.real]); if(t!==null) target++; if(t!==null&&a!==null&&t!==0) achievement.push(a/t*100); if(a!==null) realized++; const b=parseNumber(r?.[meta.budget]), br=parseNumber(r?.[meta.budgetReal]); if(b!==null) budgetTotal+=b; if(br!==null) budgetRealized+=br; if(b!==null&&br!==null&&b!==0) budget.push(br/b*100); } }
  if(name==='Realisasi Fisik & Keu'){ const groups=[Array.from({length:13},(_,i)=>12+i),Array.from({length:14},(_,i)=>27+i),[42]]; const summary=[11,26,41]; const lines=[]; groups.forEach((details,i)=>{ const sr=summary[i]; let b=parseNumber(values[sr-1]?.[2]); let f=parseNumber(values[sr-1]?.[6]); if(i===0 && b===null) b=details.reduce((a,rr)=>a+(parseNumber(values[rr-1]?.[2])||0),0); if(i===0 && f===null) f=details.reduce((a,rr)=>a+(parseNumber(values[rr-1]?.[6])||0),0); if(b!==null) budgetTotal+=b; if(f!==null) budgetRealized+=f; if(b!==null&&f!==null&&b!==0) budget.push(f/b*100); details.forEach(rr=>{const p=parseNumber(values[rr-1]?.[4]); if(p!==null) achievement.push(p);}); }); }
  const monev=[]; if(meta.targetCols&&meta.realCols) rows.forEach(r=>{let t=0,a=0,has=false; meta.targetCols.forEach((c,i)=>{const tv=parseNumber(r?.[c]),av=parseNumber(r?.[meta.realCols[i]]);if(tv!==null&&av!==null&&tv!==0){t+=tv;a+=av;has=true;}});if(has&&t) monev.push(a/t*100);});
  if(monev.length) achievement.splice(0,achievement.length,...monev);
  const average=achievement.length?achievement.reduce((a,b)=>a+b,0)/achievement.length:null; const budgetAverage=budget.length?budget.reduce((a,b)=>a+b,0)/budget.length:(budgetTotal?budgetRealized/budgetTotal*100:null);
  return {completeness:dataCompleteness({...sheet,name}),rows:values.length,cols:sheet?.cols||0,average,budgetAverage,target,realized,budgetTotal,budgetRealized,validMetrics:achievement.length};
}
function applyAutoCalculations(payload, name) {
  const s=payload.sheets?.[name]; if(!s) return;
  if(name==='Realisasi Fisik & Keu') { recalculateRealisasi(s); return; }
  const meta=sheetMeta[name]; if(meta?.target!==undefined) { recalculateCapaian(s,meta); return; }
}
function derive(payload){
  const sheets=payload.sheets||{}, stats=Object.entries(sheets).map(([name,s])=>({name,...sheetStats(name,s)}));
  const rf=sheets['Realisasi Fisik & Keu']?.values||[]; const detailRows=[...Array.from({length:13},(_,i)=>11+i),...Array.from({length:14},(_,i)=>26+i),42];
  const details=detailRows.map(rr=>rf[rr-1]||[]); const budgetTotal=details.reduce((a,r)=>a+(parseNumber(r[2])||0),0); const financialTotal=details.reduce((a,r)=>a+(parseNumber(r[6])||0),0); const financialRate=budgetTotal?financialTotal/budgetTotal*100:0;
  const physicalPairs=details.map(r=>({b:parseNumber(r[2]),p:parseNumber(r[4])})).filter(x=>x.b!==null&&x.p!==null); const physical=physicalPairs.map(x=>x.p); const physicalRate=physicalPairs.length?physicalPairs.reduce((a,x)=>a+x.b*x.p,0)/physicalPairs.reduce((a,x)=>a+x.b,0):0; const weightedPhysical=physicalRate;
  const pk=sheets['Rekap realisasi PKPT']?.values||[]; const pkItems=pk.slice(6,92).filter(r=>cleanText(r?.[3])); const status=pkItems.map(r=>cleanText(r?.[4]).toLowerCase()); const done=status.filter(v=>v==='sudah'||v.includes('selesai')).length; const progress=status.filter(v=>v.includes('berjalan')||v.includes('proses')).length; const pending=status.filter(v=>v.includes('belum')||!v).length; const pkptOther=Math.max(0,pkItems.length-done-progress-pending);
  const pkptCompletionValues=pkItems.map(r=>{const t=parseNumber(r?.[9]),a=parseNumber(r?.[11]); return t!==null&&a!==null&&t!==0?a/t*100:null}).filter(v=>v!==null);
  const pkptCompletion=pkptCompletionValues.length?pkptCompletionValues.reduce((a,b)=>a+b,0)/pkptCompletionValues.length:null;
  const outU=sheets['Monev output Subkegiatan Utama']?.values||[], outP=sheets['Monev Subkegiatan Penunjang']?.values||[]; const outputUtama=outU.slice(6).filter(r=>cleanText(r?.[7]).startsWith('#')).length; const outputPenunjang=outP.slice(6).filter(r=>cleanText(r?.[7]).startsWith('#')).length;
  const formulaInfo=formulaAudit(payload); const capaianNames=['Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)']; const capaianCards=capaianNames.map(name=>({name,...sheetStats(name,sheets[name])})); const overallCompleteness=stats.length?stats.reduce((a,b)=>a+b.completeness,0)/stats.length:0; const av=capaianCards.filter(x=>x.average!==null); const avgCapaian=av.length?av.reduce((a,b)=>a+b.average,0)/av.length:null;
  const monevNames=['Monev Renaksi IKU','Monev Program']; const monevRates=monevNames.map(name=>{const st=sheetStats(name,sheets[name]);return {name,rate:st.average,budgetRate:st.budgetAverage}});
  return {stats,budgetTotal,financialTotal,financialRate,physicalRate,physicalRowsCount:physical.length,weightedPhysical,pkptCount:pkItems.length,done,progress,pending,pkptOther,pkptCompletion,outputUtama,outputPenunjang,errorCount:formulaInfo.errors,externalFormulaCount:formulaInfo.external,formulaCount:formulaInfo.formulaCount,capaianCards,overallCompleteness,avgCapaian,monevRates,formulaIssues:formulaInfo.issues};
}
function prepareImportedForMode(imported,current,mapping,mode,targetYear){
  if(mode==='merge'){
    const out=clone(current);
    for(const m of mapping){ if(!m.actual) continue; const incoming=clone(imported.sheets[m.actual]); if(m.status==='new') out.sheets[m.actual]=incoming; else out.sheets[m.expected]=incoming; }
    out.meta={...(out.meta||{}),year:targetYear,sheetCount:Object.keys(out.sheets||{}).length}; return recalculatePayload(out);
  }
  const out={version:'8.1.0',source:imported.source,meta:{...(imported.meta||{}),year:targetYear,preserveFormat:true},sheets:{}};
  // Re-key matched sheets to the website's canonical 14-sheet names; preserve unmatched imported sheets only for a new-year import.
  for(const m of mapping){ if(!m.actual) continue; const incoming=clone(imported.sheets[m.actual]); out.sheets[m.expected||m.actual]=incoming; }
  if(mode==='newyear'){
    for(const name of Object.keys(imported.sheets||{})){ if(!mapping.some(m=>m.actual===name)) out.sheets[name]=clone(imported.sheets[name]); }
  }
  out.meta.sheetCount=Object.keys(out.sheets).length; return recalculatePayload(normalizePayloadForYear(out,targetYear));
}
function payloadDiffSummary(before,after){
  const bs=before?.sheets||{}, as=after?.sheets||{}; let sheetsChanged=0,cellsChanged=0,rowsAdded=0,rowsRemoved=0;
  const names=new Set([...Object.keys(bs),...Object.keys(as)]);
  for(const name of names){ const bv=bs[name]?.values||[], av=as[name]?.values||[]; if(bv.length!==av.length) {rowsAdded+=Math.max(0,av.length-bv.length); rowsRemoved+=Math.max(0,bv.length-av.length); sheetsChanged++;}
    const rows=Math.max(bv.length,av.length); for(let r=0;r<rows;r++){const br=bv[r]||[], ar=av[r]||[]; const cols=Math.max(br.length,ar.length); for(let c=0;c<cols;c++) if(cell(br[c])!==cell(ar[c])) cellsChanged++;}
  }
  return {sheetsChanged,cellsChanged,rowsAdded,rowsRemoved};
}
function App(){
  const [payload,setPayload]=useState(null),[baseline,setBaseline]=useState(null),[years,setYears]=useState({}),[year,setYear]=useState(null),[active,setActive]=useState('dashboard'),[selectedSheet,setSelectedSheet]=useState('Realisasi Fisik & Keu'),[query,setQuery]=useState(''),[selectedRow,setSelectedRow]=useState(null),[dirty,setDirty]=useState(false),[toast,setToast]=useState(''),[sidebarOpen,setSidebarOpen]=useState(false),[yearModal,setYearModal]=useState(false),[rowModal,setRowModal]=useState(null),[yearEditModal,setYearEditModal]=useState(false),[importModal,setImportModal]=useState(null),[auditModal,setAuditModal]=useState(false),[auditEntries,setAuditEntries]=useState([]),fileRef=useRef(null),xlsxRef=useRef(null);
  useEffect(()=>{(async()=>{try{await initLocalStores();setAuditEntries(auditCache);const src=await fetch('/data/workbook.json').then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()});const base=recalculatePayload(src);setBaseline(clone(base));const baseYear=yearFromPayload(base);let loaded={[baseYear]:base};const saved=await loadStoredDatabase();if(saved?.years)loaded=saved.years;const legacyRaw=(()=>{try{return localStorage.getItem(STORAGE_KEY)}catch{return null}})();const selected=(await loadActiveYear())||Number(saved?.activeYear)||Number(Object.keys(loaded).sort().reverse()[0])||baseYear;const current=loaded[selected]?recalculatePayload(clone(loaded[selected])):clone(base);setYears(loaded);setYear(selected);setPayload(current);if(saved||legacyRaw)setToast('Database lokal dipulihkan • penyimpanan aman IndexedDB');await clearLegacyStorage();}catch(e){setToast('Database sumber gagal dimuat: '+e.message)}})()},[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t)},[toast]); useEffect(()=>{document.title=`${ORG} — Dashboard Realisasi Kinerja`},[]);
  useEffect(()=>{const h=e=>{const d=e.detail||{};if(d.sheet!==undefined)setRowModal({sheet:d.sheet,row:d.row})};window.addEventListener('open-row-editor',h);return()=>window.removeEventListener('open-row-editor',h)},[]);
  const derived=useMemo(()=>payload?derive(payload):null,[payload]); const sheetNames=useMemo(()=>payload?Object.keys(payload.sheets||{}):[],[payload]);
  if(!payload||year===null)return <div className="loading"><div className="loading-orb"></div><div>Memuat database kertas kerja…</div></div>;
  const update=(fn,sheetName=null)=>{setPayload(prev=>{const next=clone(prev);fn(next);if(sheetName)applyAutoCalculations(next,sheetName);return next});setDirty(true)}; const updateCell=(sheet,r,c,v)=>update(p=>{if(p.sheets?.[sheet]?.values?.[r])p.sheets[sheet].values[r][c]=v},sheet);
  const addRow=(sheet,values,index)=>update(p=>{const s=p.sheets[sheet];if(!s)return;const cols=Math.max(s.cols||0,...s.values.map(r=>r?.length||0),values.length);const row=Array.from({length:cols},(_,i)=>values[i]??'');const at=index==null?s.values.length:Math.max(0,Math.min(index,s.values.length));s.values.splice(at,0,row);s.rows=s.values.length;s.cols=cols},sheet);
  const deleteRow=(sheet,row)=>update(p=>{const s=p.sheets[sheet];if(s?.values?.length>1){s.values.splice(row,1);s.rows=s.values.length}},sheet); const duplicateRow=(sheet,row)=>update(p=>{const s=p.sheets[sheet];if(s){s.values.splice(row+1,0,clone(s.values[row]||[]));s.rows=s.values.length}},sheet);
  const persistYears=async(nextPayload=payload,nextYear=year,nextYears=years)=>{const normalized=recalculatePayload(clone(nextPayload));const before=nextYears?.[nextYear]||payload;const diff=payloadDiffSummary(before,normalized);const store={...nextYears,[nextYear]:normalized};await saveStoredDatabase({years:store,activeYear:nextYear,updatedAt:new Date().toISOString()});if(diff.cellsChanged||diff.rowsAdded||diff.rowsRemoved)writeAudit(makeAuditEntry('SAVE_EDIT',{year:nextYear,...diff}));setYears(store);setPayload(normalized);setDirty(false);setToast(`Data TA ${nextYear} tersimpan di browser aman (IndexedDB)`)}; const save=()=>persistYears();
  const reset=async()=>{const base=baseline?normalizePayloadForYear(baseline,year):null;if(!base)return;const current=recalculatePayload(base);const rest={...years,[year]:current};await saveStoredDatabase({years:rest,activeYear:year,updatedAt:new Date().toISOString()});setPayload(clone(current));setYears(rest);setDirty(false);setToast(`TA ${year} dikembalikan ke sumber awal`)};
  const exportJson=()=>downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`database-realisasi-kinerja-${year}.json`); const exportAllYears=()=>downloadBlob(new Blob([JSON.stringify({years:{...years,[year]:payload}},null,2)],{type:'application/json'}),'database-realisasi-kinerja-semua-tahun.json');
  const importJson=e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const x=JSON.parse(rd.result);if(x?.years){const ys=x.years;const first=Number(Object.keys(ys).sort()[0]);const cur=recalculatePayload(ys[first]);setYears(ys);setYear(first);setPayload(cur)}else if(x?.sheets){const y=yearFromPayload(x);const cur=recalculatePayload(x);setYears(prev=>({...prev,[y]:cur}));setYear(y);setPayload(cur)}else throw new Error();setDirty(true);setToast('JSON berhasil diimpor')}catch{setToast('Import JSON gagal: format tidak valid')} };rd.readAsText(f);e.target.value=''};
  const onExcelSelected=e=>{const f=e.target.files?.[0];if(!f)return;parseExcelWorkbook(f).then(p=>{const prepared=recalculatePayload(p);const mapping=buildSchemaMapping(prepared,payload);const preview=buildPreviewRows(prepared,payload);const validation=validateImportPlan(prepared,payload,'replace',mapping,{preserveFormat:true});setImportModal({fileName:f.name,payload:prepared,year:yearFromPayload(prepared),sheets:Object.keys(prepared.sheets||{}).length,mapping,preview,validation,preserveFormat:true});}).catch(err=>setToast('Import Excel gagal: '+err.message));e.target.value=''};
  const commitImported=async(mode, preserveFormat=true)=>{
    try{
      const p=importModal.payload; const detected=Number(importModal.year); let targetYear=year;
      if(mode==='newyear') targetYear=detected; if(mode==='replace') targetYear=year;
      await saveImportBackup(year,payload,years);
      const mapping=importModal.mapping||buildSchemaMapping(p,payload);
      let nextPayload=prepareImportedForMode(p,payload,mapping,mode,targetYear);
      if(preserveFormat && p._templateBase64) await saveTemplateBase64(p._templateBase64,{source:p.source,year:targetYear,sheetNames:Object.keys(p.sheets||{})});
      writeAudit(makeAuditEntry('IMPORT_EXCEL',{file:p.source,mode,targetYear,stats:importSchemaStats(mapping),formulaAudit:formulaAudit(p),preserveFormat}));
      delete nextPayload._templateBase64;
      const store={...years,[targetYear]:nextPayload};
      await saveStoredDatabase({years:store,activeYear:targetYear,updatedAt:new Date().toISOString()});
      setYears(store);setYear(targetYear);setPayload(nextPayload);setDirty(false);setImportModal(null);
      setToast(`Excel ${mode==='newyear'?'diimpor sebagai TA '+targetYear:mode==='merge'?'digabungkan':'berhasil memperbarui database'}`);
    }catch(err){
      const b=await loadImportBackup();
      if(b){setYears(b.years);setYear(b.year);setPayload(recalculatePayload(clone(b.payload)));setDirty(true);}
      writeAudit(makeAuditEntry('IMPORT_FAILED',{error:String(err?.message||err),restoredBackup:!!b}));
      setToast(`Import gagal: penyimpanan lokal penuh/bermasalah. Database tidak diubah. ${err?.message||'kesalahan tidak diketahui'}`);
    }
  };
  const rollbackLastImport=async()=>{const b=await loadImportBackup();if(!b)return setToast('Tidak ada backup import yang tersedia');setYears(b.years);setYear(b.year);setPayload(recalculatePayload(clone(b.payload)));setDirty(true);await saveStoredDatabase({years:b.years,activeYear:b.year,updatedAt:new Date().toISOString()});writeAudit(makeAuditEntry('ROLLBACK_IMPORT',{restoredYear:b.year,backupAt:b.at}));setToast(`Import terakhir dibatalkan; TA ${b.year} dipulihkan`)};
  const exportAudit=()=>downloadBlob(new Blob([JSON.stringify(readAudit(),null,2)],{type:'application/json'}),`audit-perubahan-${year}.json`);
  const switchYear=y=>{y=Number(y);if(!years[y])return;if(dirty)persistYears(payload,year,years);setYear(y);setPayload(recalculatePayload(clone(years[y])));setSelectedRow(null);setQuery('');setDirty(false);setToast(`Beralih ke TA ${y}`)};
  const createYear=(targetYear,mode)=>{const y=Number(targetYear);if(!Number.isInteger(y)||y<2000||y>2100||years[y])return setToast('Tahun belum valid atau sudah tersedia');const next=mode==='blank'?blankDataRows(payload,y):normalizePayloadForYear(payload,y);const p=recalculatePayload(next);const store={...years,[y]:p};setYears(store);setYear(y);setPayload(p);setDirty(true);setYearModal(false);setToast(`TA ${y} dibuat`)};
  const renameYearData=(oldYear,newYear)=>{if(years[newYear])return setToast('Tahun tujuan sudah digunakan');const next=normalizePayloadForYear(years[oldYear],newYear);const store={...years};delete store[oldYear];store[newYear]=recalculatePayload(next);setYears(store);setYear(Number(newYear));setPayload(store[newYear]);setDirty(true);setYearEditModal(false);setToast(`Tahun diubah menjadi ${newYear}`)};
  const openRowEditor=(sheet,row)=>setRowModal({sheet,row}); const commitRowEditor=(sheet,row,values)=>{update(p=>{p.sheets[sheet].values[row]=values},sheet);setRowModal(null)};
  const exportActiveExcel=()=>exportExcelPayload(payload,year); const exportSheetExcel=()=>exportExcelPayload(payload,year,selectedSheet);
  const nav=[['dashboard','✦','Dashboard'],['realisasi','◒','Realisasi'],['kinerja','◫','Kinerja'],['penugasan','◎','Penugasan'],['kertas','▦','Kertas Kerja'],['editor','✎','Edit & Input']];
  return <div className="app"><div className="ambient ambient-1"></div><div className="ambient ambient-2"></div><div className="ambient ambient-3"></div><div className="noise"></div><header className="topbar"><button className="menu-toggle" onClick={()=>setSidebarOpen(v=>!v)}>☰</button><div className="brand"><div className="brand-mark">ID</div><div><strong>{ORG}</strong><span>DATABASE REALISASI KINERJA • KERTAS KERJA & MONITORING</span></div></div><div className="top-right"><span className="live"><i></i> LOCAL • OFFLINE</span><button className={dirty?'save-badge dirty year-btn':'save-badge year-btn'} onClick={()=>setYearModal(true)}>{dirty?'BELUM DISIMPAN':'TERSIMPAN'}</button><button className="year year-btn" onClick={()=>setYearModal(true)}>TA {year} ▾</button></div></header><aside className={`sidebar ${sidebarOpen?'open':''}`}><div className="side-heading">KERTAS KERJA & MONITORING</div>{nav.map(([id,ic,label])=><button key={id} className={active===id?'nav active':'nav'} onClick={()=>{setActive(id);setSidebarOpen(false)}}><span>{ic}</span><b>{label}</b></button>)}<div className="side-summary"><small>{sheetNames.length} SHEET TERHUBUNG</small><strong>{ORG}</strong><em>Tahun aktif: {year} • {dirty?'Perubahan belum disimpan':'Siap dipantau'}</em></div></aside><main className="main">{active==='dashboard'&&<Dashboard derived={derived} year={year} onNav={setActive} onSheet={n=>{setSelectedSheet(n);setActive('kertas')}}/>}{active==='realisasi'&&<Realisasi payload={payload} derived={derived} onEdit={(row=null)=>row===null?setActive('editor'):openRowEditor('Realisasi Fisik & Keu',row)}/>} {active==='kinerja'&&<Kinerja payload={payload} derived={derived} onEdit={(sheet,row=null)=>row===null?(setSelectedSheet(sheet),setActive('editor')):openRowEditor(sheet,row)}/>} {active==='penugasan'&&<Penugasan payload={payload} derived={derived} onEdit={(row=null)=>row===null?setActive('editor'):openRowEditor('Rekap realisasi PKPT',row)} onAdd={()=>openRowEditor('Rekap realisasi PKPT','new')}/>} {active==='kertas'&&<KertasKerja payload={payload} derived={derived} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} query={query} setQuery={setQuery} selectedRow={selectedRow} setSelectedRow={setSelectedRow} onEdit={(row=null)=>row===null?setActive('editor'):openRowEditor(selectedSheet,row)} onAdd={()=>openRowEditor(selectedSheet,'new')} onExportSheet={exportSheetExcel} onImportExcel={()=>xlsxRef.current?.click()}/>} {active==='editor'&&<Editor payload={payload} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} query={query} setQuery={setQuery} updateCell={updateCell} addRow={addRow} deleteRow={deleteRow} duplicateRow={duplicateRow} save={save} reset={reset} exportJson={exportJson} exportAllYears={exportAllYears} importJson={importJson} rollbackLastImport={rollbackLastImport} onAudit={()=>{setAuditEntries(readAudit());setAuditModal(true)}} onImportExcel={()=>xlsxRef.current?.click()} exportExcel={exportActiveExcel} exportSheetExcel={exportSheetExcel} fileRef={fileRef} dirty={dirty}/>}</main>{toast&&<div className="toast">✓ {toast}</div>}{yearModal&&<YearManagerModal years={years} activeYear={year} dirty={dirty} onClose={()=>setYearModal(false)} onSwitch={switchYear} onCreate={createYear} onRename={()=>setYearEditModal(true)} onSave={save} onExportAll={exportAllYears}/>} {yearEditModal&&<YearEditModal currentYear={year} onClose={()=>setYearEditModal(false)} onRename={v=>renameYearData(year,Number(v))}/>} {rowModal&&<RowEditorModal payload={payload} sheetName={rowModal.sheet} rowIndex={rowModal.row} onClose={()=>setRowModal(null)} onSave={commitRowEditor} onAdd={(sheet,values)=>{addRow(sheet,values);setRowModal(null)}}/>} {importModal&&<ImportExcelModal info={importModal} onClose={()=>setImportModal(null)} onApply={commitImported}/>} {auditModal&&<AuditModal entries={auditEntries} onClose={()=>setAuditModal(false)} onExport={exportAudit}/>} <input hidden ref={xlsxRef} type="file" accept=".xlsx,.xls" onChange={onExcelSelected}/></div>;
}
function Dashboard({ derived, year, onNav, onSheet }) {
  const [pulse, setPulse] = useState(0); const [detail, setDetail] = useState(null);
  useEffect(() => { const t = setInterval(() => setPulse(x => x + 1), 4200); return () => clearInterval(t); }, []);
  const primary = [
    { key: 'budget', t: 'Total Anggaran', v: money(derived.budgetTotal), s: 'Realisasi Fisik & Keu', tone: 'gold', source: 'Realisasi Fisik & Keu' },
    { key: 'financial', t: 'Realisasi Keuangan', v: money(derived.financialTotal), s: 'Akumulasi nilai valid', tone: 'blue', source: 'Realisasi Fisik & Keu' },
    { key: 'financialRate', t: 'Serapan Keuangan', v: pct(derived.financialRate), s: 'Realisasi ÷ Anggaran × 100', tone: 'mint', p: derived.financialRate, source: 'Realisasi Fisik & Keu' },
    { key: 'physical', t: 'Realisasi Fisik Tertimbang', v: pct(derived.physicalRate), s: `${number(derived.physicalRowsCount)} data fisik valid`, tone: 'teal', p: derived.physicalRate, source: 'Realisasi Fisik & Keu' },
    { key: 'pkpt', t: 'Penugasan PKPT', v: number(derived.pkptCount), s: `${derived.done} selesai • ${derived.progress} berjalan • ${derived.pending} belum`, tone: 'violet', source: 'Rekap realisasi PKPT' },
    { key: 'output', t: 'Output Utama', v: number(derived.outputUtama), s: `${number(derived.outputPenunjang)} output penunjang`, tone: 'pink', source: 'Monev output Subkegiatan Utama' }
  ];
  return <section className="page dashboard-page">
    <div className="hero"><div><span className="eyebrow">INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU • {year}</span><h1>Dashboard <span>Realisasi Kinerja</span></h1><p>Satu pusat kendali untuk membaca capaian kinerja, serapan anggaran, realisasi fisik, PKPT, monitoring evaluasi, dan seluruh kertas kerja.</p><div className="hero-actions"><button className="primary" onClick={() => onNav('editor')}>✎ Edit & Input Data</button><button className="soft" onClick={() => onNav('kertas')}>▦ Lihat Kertas Kerja</button><span className="hero-note">{derived.errorCount ? `${derived.errorCount} sel sumber mengandung error formula` : 'Tidak ada error formula terdeteksi'}</span></div></div><div className={`hero-orbit p${pulse % 3}`}><div className="orbit-ring r1"></div><div className="orbit-ring r2"></div><div className="orbit-core">ID</div><i className="dot d1"></i><i className="dot d2"></i><i className="dot d3"></i></div></div>
    <div className="kpi-grid">{primary.map((x, i) => <KPI key={i} metricKey={x.key} {...x} onClick={() => setDetail(x.key)} />)}</div>
    <div className="dashboard-grid three"><button type="button" className="panel panel-large panel-button" onClick={() => setDetail('financialRate')}><PanelHead eyebrow="REALISASI" title="Serapan Keuangan" right={pct(derived.financialRate)} /><div className="ring-row"><Ring value={derived.financialRate} /><div className="ring-details"><div><small>ANGGARAN</small><b>{money(derived.budgetTotal)}</b></div><div><small>REALISASI</small><b>{money(derived.financialTotal)}</b></div><div><small>SISA DANA</small><b>{money(Math.max(0, derived.budgetTotal - derived.financialTotal))}</b></div></div></div><span className="panel-click-hint">Klik untuk detail perhitungan ↗</span></button><button type="button" className="panel panel-button" onClick={() => setDetail('physical')}><PanelHead eyebrow="CAPAIAN" title="Profil Fisik" right={`${number(derived.physicalRowsCount)} sampel`} /><Bars values={derived.physicalRowsCount ? [derived.physicalRate, Math.max(0, derived.physicalRate - 7), Math.min(100, derived.physicalRate + 4), Math.max(0, derived.physicalRate - 18), Math.min(100, derived.physicalRate + 1), Math.max(0, derived.physicalRate - 11), Math.min(100, derived.physicalRate + 8), Math.min(100, derived.physicalRate + 2)] : [0, 0, 0, 0, 0, 0, 0, 0]} /><div className="micro-legend"><span>Rendah</span><span>•</span><b>{pct(derived.physicalRate)}</b><span>rata-rata</span></div><span className="panel-click-hint">Klik untuk melihat sampel fisik ↗</span></button><button type="button" className="panel panel-button" onClick={() => setDetail('pkpt')}><PanelHead eyebrow="STATUS PKPT" title="Progress Penugasan" /><Stacked done={derived.done} progress={derived.progress} pending={derived.pending} /><div className="status-list"><StatusRow label="Selesai" value={derived.done} tone="done" /><StatusRow label="Berjalan" value={derived.progress} tone="progress" /><StatusRow label="Belum" value={derived.pending} tone="pending" /></div><span className="panel-click-hint">Klik untuk melihat rincian PKPT ↗</span></button></div>
    <div className="panel section-gap"><PanelHead eyebrow="CAKUPAN KERTAS KERJA" title="Capaian & kelengkapan tiap sumber" right={`${pct(derived.overallCompleteness)} kelengkapan rata-rata`} /><div className="sheet-matrix">{derived.stats.map(s => <button key={s.name} className="sheet-card" onClick={() => onSheet(s.name)}><div className="sheet-card-top"><span>{s.name}</span><b>{pct(s.completeness)}</b></div><div className="mini-meter"><i style={{ width: `${Math.min(100, s.completeness)}%` }}></i></div><small>{s.role}</small><div className="sheet-card-bottom"><span>{number(s.rows)} baris</span><span>{number(s.cols)} kolom</span><em>{s.average === null ? 'Belum ada % capaian' : pct(s.average) + ' capaian'}</em></div></button>)}</div></div>
    <div className="panel section-gap"><PanelHead eyebrow="RINGKASAN KINERJA" title="Indikator utama yang berasal dari 14 sheet" /><div className="summary-strip"><Summary value={derived.avgCapaian === null ? '—' : pct(derived.avgCapaian)} label="Rata-rata capaian" note="Gabungan sheet sasaran yang punya target & realisasi" /><Summary value={number(derived.outputUtama)} label="Output utama" note="Aktivitas bertanda # pada monev output utama" /><Summary value={number(derived.pkptCount)} label="Penugasan PKPT" note="Baris penugasan yang memiliki rincian" /><Summary value={pct(derived.overallCompleteness)} label="Kelengkapan database" note="Rata-rata keterisian seluruh sheet" /></div></div>
    {detail && <KPIDetailModal type={detail} derived={derived} onClose={() => setDetail(null)} onNav={onNav} onSheet={onSheet} />}
  </section>;
}

function KPI({ t, v, s, p, tone, onClick, metricKey }) { const isMoney = metricKey === 'budget' || metricKey === 'financial'; return <button type="button" className={`kpi ${tone} ${isMoney ? 'kpi-money' : ''}`} onClick={onClick}><div className="shine"></div><div className="kpi-top"><span>{t}</span><i>↗</i></div>{isMoney ? <div className="money-display" title={v}><span>Rp</span><b>{v.replace(/^Rp\s*/,'')}</b></div> : <strong title={v}>{v}</strong>}<small>{s}</small>{p !== undefined && <div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, p || 0))}%` }}></i></div>}<span className="kpi-click-hint">Klik untuk detail</span></button>; }
function KPIDetailModal({ type, derived, onClose, onNav, onSheet }) {
  const map = {
    budget: { title: 'Total Anggaran', subtitle: 'Akumulasi anggaran valid dari seluruh baris numerik pada Realisasi Fisik & Keu.', value: money(derived.budgetTotal), tone: 'gold', facts: [['Sumber', 'Realisasi Fisik & Keu'], ['Baris valid', number(derived.physicalRowsCount)], ['Realisasi', money(derived.financialTotal)], ['Sisa dana', money(Math.max(0, derived.budgetTotal - derived.financialTotal))]], action: 'realisasi' },
    financial: { title: 'Realisasi Keuangan', subtitle: 'Jumlah realisasi keuangan yang terbaca valid dan digunakan untuk menghitung serapan.', value: money(derived.financialTotal), tone: 'blue', facts: [['Anggaran', money(derived.budgetTotal)], ['Serapan', pct(derived.financialRate)], ['Sisa dana', money(Math.max(0, derived.budgetTotal - derived.financialTotal))], ['Sumber', 'Realisasi Fisik & Keu']], action: 'realisasi' },
    financialRate: { title: 'Serapan Keuangan', subtitle: 'Realisasi keuangan dibandingkan anggaran pada tahun aktif.', value: pct(derived.financialRate), tone: 'mint', progress: derived.financialRate, facts: [['Rumus', 'Realisasi ÷ Anggaran × 100'], ['Anggaran', money(derived.budgetTotal)], ['Realisasi', money(derived.financialTotal)], ['Sisa', money(Math.max(0, derived.budgetTotal - derived.financialTotal))]], action: 'realisasi' },
    physical: { title: 'Rata-rata Realisasi Fisik', subtitle: 'Rata-rata nilai fisik yang terisi dan valid pada Realisasi Fisik & Keu.', value: pct(derived.physicalRate), tone: 'teal', progress: derived.physicalRate, facts: [['Sampel valid', number(derived.physicalRowsCount)], ['Rata-rata', pct(derived.physicalRate)], ['Sumber', 'Realisasi Fisik & Keu'], ['Bobot terhitung', pct(derived.weightedPhysical)]], action: 'realisasi' },
    pkpt: { title: 'Penugasan PKPT', subtitle: 'Rekap status penugasan yang teridentifikasi pada kertas kerja PKPT.', value: number(derived.pkptCount), tone: 'violet', facts: [['Selesai', number(derived.done)], ['Berjalan', number(derived.progress)], ['Belum', number(derived.pending)], ['Lainnya', number(derived.pkptOther)]], action: 'penugasan' },
    output: { title: 'Output Utama', subtitle: 'Aktivitas output utama yang dikenali dari sheet monitoring output subkegiatan.', value: number(derived.outputUtama), tone: 'pink', facts: [['Output utama', number(derived.outputUtama)], ['Output penunjang', number(derived.outputPenunjang)], ['Sumber utama', 'Monev output Subkegiatan Utama'], ['Sumber penunjang', 'Monev Subkegiatan Penunjang']], action: 'kinerja' }
  };
  const d = map[type]; return <div className="kpi-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className={`kpi-modal ${d.tone}`}><div className="kpi-modal-aura"></div><div className="kpi-modal-head"><div><span className="eyebrow">DETAIL KPI • TAHUN ANGGARAN</span><h2>{d.title}</h2><p>{d.subtitle}</p></div><button className="close" onClick={onClose}>×</button></div><div className="kpi-modal-hero"><div className="kpi-modal-value">{d.value}</div><div className="kpi-modal-orbit"><div className="pulse-ring"></div><div className="pulse-core">{type === 'pkpt' ? 'PKPT' : type === 'output' ? 'OUT' : type === 'physical' ? 'FISIK' : 'KPI'}</div></div></div>{d.progress !== undefined && <div className="kpi-progress"><div><span>TINGKAT CAPAIAN</span><b>{pct(d.progress)}</b></div><div className="progress-track"><i style={{ width: `${Math.min(100, Math.max(0, d.progress))}%` }}></i></div></div>}<div className="kpi-detail-grid">{d.facts.map(([a, b]) => <div key={a}><small>{a}</small><b>{b}</b></div>)}</div><div className="kpi-modal-foot"><button className="soft" onClick={() => { onClose(); onNav(d.action); }}>Buka tampilan terkait</button><button className="primary" onClick={() => { onClose(); onSheet(type === 'pkpt' ? 'Rekap realisasi PKPT' : type === 'output' ? 'Monev output Subkegiatan Utama' : 'Realisasi Fisik & Keu'); }}>Buka kertas kerja</button></div></div></div>;
}
function PageTitle({ eyebrow, title, desc, action, onAction }) { return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>{action && <button className="soft title-action" onClick={onAction}>✎ {action}</button>}</div>; }
function PanelHead({ eyebrow, title, right }) { return <div className="panel-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{right !== undefined && <span className="head-right">{right}</span>}</div>; }
function Ring({ value }) { const r = 70; const c = 2 * Math.PI * r; const offset = c * (1 - Math.max(0, Math.min(100, value || 0)) / 100); return <div className="ring"><svg viewBox="0 0 180 180"><circle className="ring-bg" cx="90" cy="90" r={r} /><circle className="ring-fg" cx="90" cy="90" r={r} strokeDasharray={c} strokeDashoffset={offset} /></svg><div><b>{pct(value)}</b><span>SERAPAN</span></div></div>; }
function Bars({ values }) { const max = Math.max(...values, 100); return <div className="bars">{values.map((v, i) => <div className="bar-col" key={i}><div className="bar-track"><i style={{ height: `${Math.max(8, Math.min(100, (v / max) * 100))}%` }}></i></div><span>R{i + 1}</span></div>)}</div>; }
function Stacked({ done, progress, pending }) { const total = Math.max(1, done + progress + pending); return <div className="stacked"><i style={{ width: `${done / total * 100}%` }}></i><i style={{ width: `${progress / total * 100}%` }}></i><i style={{ width: `${pending / total * 100}%` }}></i></div>; }
function StatusRow({ label, value, tone }) { return <div className="status-row"><span><i className={tone}></i>{label}</span><b>{number(value)}</b></div>; }
function Summary({ value, label, note }) { return <div className="summary-item"><strong>{value}</strong><b>{label}</b><small>{note}</small></div>; }

function Realisasi({ payload, derived, onEdit }) {
  const sheet = payload.sheets['Realisasi Fisik & Keu']; const values = sheet?.values || []; const meta = sheetMeta['Realisasi Fisik & Keu']; const headers = headersFor(sheet); const rows = values.slice(meta.dataStart).map((r, i) => ({ r, ri: i + meta.dataStart })).filter(x => x.r.some(v => cleanText(v)));
  return <section className="page"><PageTitle eyebrow="ANALITIK DATABASE" title="Realisasi Fisik & Keuangan" desc="Kertas kerja utama untuk mengubah anggaran, bobot, fisik, realisasi keuangan, dan permasalahan. Kolom hasil dihitung otomatis." action="Edit semua data" onAction={() => onEdit()} /><div className="metric-four"><MetricCard title="Anggaran" value={money(derived.budgetTotal)} note="Total valid" /><MetricCard title="Realisasi" value={money(derived.financialTotal)} note="Total valid" /><MetricCard title="Serapan" value={pct(derived.financialRate)} note="Realisasi ÷ Anggaran" /><MetricCard title="Fisik rata-rata" value={pct(derived.physicalRate)} note={`${number(derived.physicalRowsCount)} sampel`} /></div><div className="panel section-gap"><PanelHead eyebrow="KERTAS KERJA" title="Realisasi Fisik & Keu" right={<button className="primary" onClick={() => onEdit('new')}>＋ Tambah baris</button>} /><div className="reader-guide"><div><b>INPUT UTAMA</b><span>C Anggaran • E Fisik • G Realisasi Keuangan</span></div><div><b>OTOMATIS</b><span>D Bobot • F Tertimbang • H % Keuangan • I Tertimbang • J Sisa</span></div><div><b>MODE</b><span>Wrap text + edit per baris</span></div></div><DataTable sheetName="Realisasi Fisik & Keu" values={values} headers={headers} start={meta.dataStart} rows={rows} onEdit={(ri) => onEdit(ri)} compact /></div></section>;
}
function MetricCard({ title, value, note }) { return <div className="panel metric-card"><small>{title}</small><strong className="metric-value">{value}</strong><span>{note}</span></div>; }

function Kinerja({ payload, derived, onEdit }) {
  return <section className="page"><PageTitle eyebrow="MONITORING KINERJA" title="Kinerja & Monitoring Evaluasi" desc="Seluruh sumber kinerja ditampilkan per tingkat sasaran. Klik Edit pada baris untuk memperbarui nilai tanpa meninggalkan halaman." /><div className="kinerja-grid">{derived.capaianCards.map(card => <div className="panel" key={card.name}><PanelHead eyebrow={sheetMeta[card.name]?.group || 'CAPAIAN'} title={card.name} right={card.average === null ? 'Belum ada %' : pct(card.average)} /><CapaianMiniTable payload={payload} name={card.name} onEdit={onEdit} /></div>)}<div className="panel"><PanelHead eyebrow="MONEV" title="Monitoring Triwulan" /><MonevSource payload={payload} names={['Monev Renaksi IKU', 'Monev Program', 'Monev output Subkegiatan Utama', 'Monev Subkegiatan Penunjang']} onEdit={onEdit} /></div></div></section>;
}
function CapaianMiniTable({ payload, name, onEdit }) { const s = payload.sheets[name]; if (!s) return null; const meta = sheetMeta[name] || {}; const headers = headersFor(s); const cols = Math.min(8, s.cols || 0); const rows = (s.values || []).slice(meta.dataStart || 3).map((r, idx) => ({ r, ri: idx + (meta.dataStart || 3) })).filter(({ r }) => r.some(v => cleanText(v))).slice(0, 8); return <div className="mini-table-wrap"><div className="mini-table"><table><thead><tr><th>#</th>{Array.from({ length: cols }, (_, i) => <th key={i}>{colName(i)}<small>{headers[i]}</small></th>)}<th>Aksi</th></tr></thead><tbody>{rows.map(({ r, ri }) => <tr key={ri}><td>{ri + 1}</td>{Array.from({ length: cols }, (_, ci) => <td className="text-wrap" key={ci}>{isError(r?.[ci]) ? <span className="error-cell">{cell(r?.[ci])}</span> : cell(r?.[ci]) || '—'}</td>)}<td><button className="row-edit" onClick={() => onEdit(name, ri)}>✎</button></td></tr>)}</tbody></table></div>{rows.length < (s.values?.length || 0) - (meta.dataStart || 3) && <div className="mini-foot">Menampilkan {rows.length} contoh baris • gunakan Kertas Kerja untuk melihat semuanya</div>}</div>; }
function MonevSource({ payload, names, onEdit }) { return <div className="source-grid">{names.map(n => { const s = payload.sheets[n]; return <button className="source-card" key={n} onClick={() => onEdit(n)}><span className="eyebrow">SUMBER</span><b>{n}</b><small>{number(s?.rows || 0)} baris • {number(s?.cols || 0)} kolom</small><em>↗</em></button>; })}</div>; }

function Penugasan({ payload, derived, onEdit, onAdd }) { const sheet = payload.sheets['Rekap realisasi PKPT']; const values = sheet?.values || []; const headers = headersFor(sheet); const rows = values.map((r, ri) => ({ r, ri })).filter(({ r }) => cleanText(r?.[3])); return <section className="page"><PageTitle eyebrow="REKAP REALISASI PKPT" title="Daftar Penugasan" desc="Setiap penugasan bisa diedit langsung di halaman ini. Tambahkan penugasan baru dengan form yang mengikuti seluruh kolom sumber." action="Edit database" onAction={() => onEdit()} /><div className="metric-four"><MetricCard title="Total" value={number(derived.pkptCount)} note="Penugasan teridentifikasi" /><MetricCard title="Selesai" value={number(derived.done)} note="Sudah / selesai" /><MetricCard title="Berjalan" value={number(derived.progress)} note="Sedang proses" /><MetricCard title="Belum" value={number(derived.pending)} note="Belum / kosong" /></div><div className="panel section-gap"><PanelHead eyebrow="KERTAS KERJA PKPT" title="Daftar Penugasan" right={<button className="primary" onClick={onAdd}>＋ Tambah penugasan</button>} /><div className="task-table"><table><thead><tr>{headers.map((h, i) => <th key={i}>{colName(i)}<small>{h}</small></th>)}<th>Aksi</th></tr></thead><tbody>{rows.map(({ r, ri }) => <tr key={ri}>{Array.from({ length: Math.min(headers.length, 14) }, (_, ci) => <td key={ci} className="text-wrap">{ci === 4 ? <StatusPill value={r?.[ci]} /> : cell(r?.[ci]) || '—'}</td>)}<td className="actions-cell"><button className="row-edit" onClick={() => onEdit(ri)}>✎ Edit</button></td></tr>)}</tbody></table></div></div></section>; }
function StatusPill({ value }) { const v = cleanText(value).toLowerCase(); const c = v === 'sudah' || v.includes('selesai') ? 'done' : v.includes('berjalan') || v.includes('proses') ? 'progress' : 'pending'; return <span className={`pill ${c}`}>{cleanText(value) || 'Belum'}</span>; }

function KertasKerja({payload,selectedSheet,setSelectedSheet,query,setQuery,selectedRow,setSelectedRow,onEdit,onAdd,onExportSheet,onImportExcel}){
 const names=Object.keys(payload.sheets||{}); const sheet=payload.sheets[selectedSheet]; const values=sheet?.values||[]; const headers=headersFor(sheet); const cols=Math.max(sheet?.cols||0,...values.map(r=>r?.length||0),0); const meta=sheetMeta[selectedSheet]||{}; const stat=sheetStats(selectedSheet,sheet); const spec=formulaSpecs[selectedSheet]||{}; const audit=formulaAudit(payload); const rows=values.map((r,ri)=>({r,ri})).filter(({r})=>!query.trim()||r.some(v=>cleanText(v).toLowerCase().includes(query.toLowerCase())));
 useEffect(()=>setSelectedRow(null),[selectedSheet,query,setSelectedRow]);
 return <section className="page"><PageTitle eyebrow="SUMBER DATA & FORMULA" title={`Kertas Kerja • ${names.length} Sheet`} desc="Setiap sheet memiliki peran, kolom input, dan kolom hitungan yang dijelaskan. Edit langsung, tambah baris, atau ekspor sheet aktif ke Excel/Google Sheets." action="Edit sheet ini" onAction={()=>onEdit()}/><div className="workspace"><div className="sheet-list">{names.map(n=>{const st=sheetStats(n,payload.sheets[n]);const active=n===selectedSheet;return <button key={n} className={active?'sheet-select active':'sheet-select'} onClick={()=>setSelectedSheet(n)}><span>{n}</span><small>{number(payload.sheets[n]?.rows||0)} × {number(payload.sheets[n]?.cols||0)}</small><em>{pct(st.completeness)}</em></button>})}</div><div className="sheet-content"><div className="sheet-toolbar"><div><span className="eyebrow">SHEET AKTIF</span><h2>{selectedSheet}</h2><p>{meta.role||'Sumber kertas kerja'} • {number(values.length)} baris • {number(cols)} kolom</p></div><div className="sheet-tools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari isi sheet…"/><button className="soft" onClick={onAdd}>＋ Tambah</button><button className="soft" onClick={onEdit}>✎ Edit semua</button><button className="soft" onClick={onExportSheet}>⇩ Excel</button><button className="soft" onClick={onImportExcel}>⇧ Import Excel</button></div></div><div className="formula-overview"><div><span className="eyebrow">PERAN SHEET</span><b>{meta.role||'Sumber data'}</b><small>{formulaSpecs[selectedSheet]?.note||'Gunakan sheet sesuai fungsi sumber.'}</small></div><div><span className="eyebrow">INPUT</span><b>{(spec.inputs||[]).join(' • ')||'Semua input'}</b><small>Nilai ini diisi/diimpor dari sumber.</small></div><div><span className="eyebrow">OTOMATIS</span><b>{(spec.computed||[]).join(' • ')||'Tidak ada'}</b><small>Hasil dihitung oleh sistem jika data dasar tersedia.</small></div><div><span className="eyebrow">AUDIT</span><b>{audit.errors?`${audit.errors} error`: 'Bersih'}</b><small>{audit.external} referensi eksternal ditandai untuk audit.</small></div></div><div className="column-strip">{headers.map((h,i)=><div key={i}><b>{colName(i)}</b><span>{h}</span></div>)}</div><DataTable sheetName={selectedSheet} values={values} headers={headers} start={meta.dataStart??3} rows={rows} onEdit={ri=>{setSelectedRow(ri);onEdit(ri)}}/><div className="detail-hint">Klik ✎ untuk edit baris lengkap • teks panjang otomatis wrap • kolom AUTO dihitung sistem.</div>{selectedRow!==null&&values[selectedRow]&&<div className="detail-panel"><PanelHead eyebrow={`BARIS ${selectedRow+1}`} title="Detail baris" right={<button className="soft" onClick={()=>onEdit(selectedRow)}>✎ Edit baris</button>}/><div className="detail-grid">{Array.from({length:cols},(_,ci)=><div key={ci}><small>{colName(ci)} • {headers[ci]}</small><p>{isError(values[selectedRow]?.[ci])?<span className="error-cell">{cell(values[selectedRow]?.[ci])}</span>:cell(values[selectedRow]?.[ci])||'—'}</p></div>)}</div></div>}</div></div></section>;
}
function DataTable({ sheetName, values, headers, start, rows, onEdit, compact = false }) { const cols = headers.length; return <div className={compact ? 'scroll-table reader-table compact' : 'scroll-table reader-table'}><table><thead><tr><th>#</th>{headers.map((h, i) => <th key={i}><span>{colName(i)}</span><small>{h}</small></th>)}<th>Aksi</th></tr></thead><tbody>{rows.map(({ r, ri }) => <tr key={ri}><td>{ri + 1}</td>{Array.from({ length: cols }, (_, ci) => <td key={ci} className="text-wrap">{isError(r?.[ci]) ? <span className="error-cell">{cell(r?.[ci])}</span> : cell(r?.[ci]) || '—'}</td>)}<td><button className="row-edit" onClick={() => onEdit(ri)}>✎</button></td></tr>)}</tbody></table></div>; }

function Editor({payload,selectedSheet,setSelectedSheet,query,setQuery,updateCell,addRow,deleteRow,duplicateRow,save,reset,exportJson,exportAllYears,importJson,rollbackLastImport,onAudit,onImportExcel,exportExcel,exportSheetExcel,fileRef,dirty}){
 const names=Object.keys(payload.sheets); const sheet=payload.sheets[selectedSheet]; const values=sheet?.values||[]; const headers=headersFor(sheet); const cols=Math.max(sheet?.cols||0,...values.map(r=>r?.length||0),0); const [limit,setLimit]=useState(120); const [addOpen,setAddOpen]=useState(false); const [insertAfter,setInsertAfter]=useState('end'); const [activeCols,setActiveCols]=useState([]); const [addValues,setAddValues]=useState({}); const stat=sheetStats(selectedSheet,sheet); const spec=formulaSpecs[selectedSheet]||{};
 useEffect(()=>{setLimit(120);setQuery('');setActiveCols(Array.from({length:cols},(_,i)=>i));setAddValues({})},[selectedSheet,cols,setQuery]); const filtered=useMemo(()=>values.map((r,ri)=>({r,ri})).filter(({r})=>!query.trim()||r.some(v=>cleanText(v).toLowerCase().includes(query.toLowerCase()))).slice(0,limit),[values,query,limit]); const focusCell=e=>{const el=e.currentTarget;requestAnimationFrame(()=>{el.style.height='0px';el.style.height=Math.min(220,Math.max(48,el.scrollHeight))+'px'})}; const openAdd=()=>{setInsertAfter('end');setActiveCols(Array.from({length:cols},(_,i)=>i));setAddValues({});setAddOpen(true)}; const submitAdd=()=>{const row=Array(cols).fill('');activeCols.forEach(i=>row[i]=addValues[i]??'');if(!row.some(v=>cleanText(v)))return setAddOpen(false);addRow(selectedSheet,row,insertAfter==='end'?null:Number(insertAfter)+1);setAddOpen(false)}; const toggleCol=i=>setActiveCols(p=>p.includes(i)?p.filter(x=>x!==i):[...p,i].sort((a,b)=>a-b));
 return <section className="page editor-page"><PageTitle eyebrow="DATA MANAGEMENT" title="Edit & Input Kertas Kerja" desc="Area input utama untuk seluruh 14 sheet. Kolom teks tidak dipotong, formula dijaga otomatis, dan file Excel dapat diimpor untuk memperbarui database."/><div className="editor-top panel"><div className="editor-select"><small>SHEET AKTIF</small><select value={selectedSheet} onChange={e=>setSelectedSheet(e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select></div><div className="search-wrap"><small>PENCARIAN</small><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari OPD, program, kegiatan, angka…"/></div><div className="editor-actions"><span className={dirty?'state dirty':'state'}>{dirty?'● Ada perubahan':'● Tersimpan'}</span><button className="soft" onClick={openAdd}>＋ Tambah Baris</button><button className="soft" onClick={exportSheetExcel}>⇩ Excel Sheet</button><button className="soft" onClick={exportExcel}>⇩ Semua Excel</button><button className="soft" onClick={onImportExcel}>⇧ Import Excel</button><button className="soft" onClick={exportJson}>⇩ JSON</button><button className="soft" onClick={exportAllYears}>⇩ Semua Tahun</button><button className="soft" onClick={rollbackLastImport}>↶ Batalkan import</button><button className="soft" onClick={onAudit}>▣ Audit</button><input hidden ref={fileRef} type="file" accept="application/json,.json" onChange={importJson}/><button className="ghost" onClick={reset}>↺ Reset</button><button className="primary" onClick={save}>✓ Simpan</button></div></div><div className="editor-help"><div><b>INPUT</b><span>{(spec.inputs||[]).join(' • ')||'Semua kolom'}</span></div><div><b>AUTO</b><span>{(spec.computed||[]).join(' • ')||'Tidak ada kolom formula'}</span></div><div><b>STATUS</b><span>{pct(stat.completeness)} kelengkapan sheet aktif.</span></div><div><b>EXCEL</b><span>Hasil .xlsx dapat langsung dibuka di Microsoft Excel atau diunggah ke Google Sheets.</span></div></div><div className="panel editor-panel"><div className="editor-meta"><div><span className="eyebrow">INLINE EDITOR</span><b>{selectedSheet}</b><small>{number(values.length)} baris • {number(cols)} kolom • {number(filtered.length)} tampil</small></div><div className="badges"><span className="input-badge">WRAP TEXT</span><span className="wrap-badge">AUTO CALC</span></div></div><div className="scroll-table editor-table"><table><thead><tr><th>#</th>{headers.map((h,i)=><th key={i}><span>{colName(i)}</span><small>{h}</small></th>)}<th>Aksi</th></tr></thead><tbody>{filtered.map(({r,ri})=><tr key={ri}><td className="rownum">{ri+1}</td>{Array.from({length:cols},(_,ci)=>{const v=r?.[ci]??'';const computed=sheetMeta[selectedSheet]?.achieve===ci||sheetMeta[selectedSheet]?.budgetPct===ci||(selectedSheet==='Realisasi Fisik & Keu'&&[3,5,7,8,9].includes(ci));return <td key={ci} className={isError(v)?'error-bg':''}>{computed?<input className="cell-input readonly-cell" value={cell(v)} readOnly title="Kolom dihitung otomatis"/>:typeof v==='number'?<input className="cell-input" inputMode="decimal" value={v} onChange={e=>updateCell(selectedSheet,ri,ci,e.target.value)}/>:<textarea className="cell-input text-editor" rows="1" value={cell(v)} onFocus={focusCell} onInput={focusCell} onChange={e=>updateCell(selectedSheet,ri,ci,e.target.value)}/>}</td>})}<td className="row-actions"><button title="Edit sebagai form" onClick={()=>window.dispatchEvent(new CustomEvent('open-row-editor',{detail:{sheet:selectedSheet,row:ri}}))}>✎</button><button title="Duplikat baris" onClick={()=>duplicateRow(selectedSheet,ri)}>⧉</button><button title="Hapus baris" onClick={()=>deleteRow(selectedSheet,ri)}>×</button></td></tr>)}</tbody></table></div><div className="editor-footer"><span>Formula dijaga otomatis • wrap text aktif • import Excel akan menghitung ulang KPI.</span>{filtered.length<values.length&&<button className="soft" onClick={()=>setLimit(v=>v+120)}>Tampilkan lebih banyak</button>}</div></div>{addOpen&&<AddRowModal cols={cols} headers={headers} values={addValues} setValues={setAddValues} activeCols={activeCols} toggleCol={toggleCol} selectAllColumns={()=>setActiveCols(Array.from({length:cols},(_,i)=>i))} selectNoColumns={()=>setActiveCols([])} insertAfter={insertAfter} setInsertAfter={setInsertAfter} rowCount={values.length} onClose={()=>setAddOpen(false)} onAdd={submitAdd}/>}</section>;
}

function AuditModal({entries,onClose,onExport}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="small-modal audit-modal"><div className="modal-head"><div><span className="eyebrow">AUDIT PERUBAHAN</span><h2>Riwayat import & rollback</h2><p>Ringkasan perubahan tersimpan di browser ini. Tidak ada password atau private key yang dicatat.</p></div><button className="close" onClick={onClose}>×</button></div><div className="audit-list">{entries.length?entries.map(e=><div className="audit-item" key={e.id}><div><b>{e.action}</b><small>{new Date(e.at).toLocaleString('id-ID')}</small></div><pre>{JSON.stringify(e.details,null,2)}</pre></div>):<div className="empty">Belum ada riwayat import.</div>}</div><div className="modal-foot"><button className="soft" onClick={onExport}>⇩ Export Audit JSON</button><button className="primary" onClick={onClose}>Tutup</button></div></div></div>}
function ImportExcelModal({info,onClose,onApply}){
  const [mode,setMode]=useState('replace'); const [preserveFormat,setPreserveFormat]=useState(true); const [showSchema,setShowSchema]=useState(true); const audit=info.validation?.audit||formulaAudit(info.payload); const stats=info.validation?.stats||importSchemaStats(info.mapping||[]); const warnings=info.validation?.warnings||[];
  const runApply=()=>onApply(mode,preserveFormat);
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="import-modal import-engine-v81"><div className="modal-head"><div><span className="eyebrow">V8.1 IMPORT ENGINE</span><h2>Pratinjau & validasi sebelum import</h2><p><b>{info.fileName}</b> • {info.sheets} sheet • TA terdeteksi <b>{info.year}</b></p></div><button className="close" onClick={onClose}>×</button></div>
    <div className="import-summary"><div><b>{info.sheets}</b><span>sheet terbaca</span></div><div><b>{audit.formulaCount}</b><span>formula terdeteksi</span></div><div className={audit.errors?'warn':''}><b>{audit.errors}</b><span>error nilai</span></div><div className={audit.external?'warn':''}><b>{audit.external}</b><span>formula eksternal</span></div></div>
    <div className="import-health"><span className="health-dot"></span><b>{stats.exact} exact</b><span>•</span><b>{stats.fuzzy} pemetaan fleksibel</b><span>•</span><b>{stats.missing} hilang</b><span>•</span><b>{stats.newSheets} sheet baru</b></div>
    <div className="import-mode-grid"><label className={mode==='replace'?'import-mode active':'import-mode'}><input type="radio" checked={mode==='replace'} onChange={()=>setMode('replace')}/><span><b>Perbarui TA aktif</b><small>Semua sheet yang berhasil dipetakan menjadi isi tahun aktif. Cocok untuk update berkala.</small></span></label><label className={mode==='newyear'?'import-mode active':'import-mode'}><input type="radio" checked={mode==='newyear'} onChange={()=>setMode('newyear')}/><span><b>Import sebagai TA baru</b><small>Menggunakan tahun yang terdeteksi dari file untuk membuat/memperbarui database tahun tersebut.</small></span></label><label className={mode==='merge'?'import-mode active':'import-mode'}><input type="radio" checked={mode==='merge'} onChange={()=>setMode('merge')}/><span><b>Gabungkan sheet</b><small>Sheet yang cocok diperbarui tanpa menghapus sheet lain; sheet baru ikut ditambahkan.</small></span></label></div>
    <label className="preserve-option"><input type="checkbox" checked={preserveFormat} onChange={e=>setPreserveFormat(e.target.checked)}/><span><b>Pertahankan format Excel</b><small>Gunakan workbook sumber sebagai template saat export kembali: merge, lebar kolom, tinggi baris, view, dan struktur sheet dipertahankan sebisa mungkin.</small></span></label>
    <div className="validation-box"><div><b>VALIDASI FORMULA</b><span>{audit.errors?'Ada nilai error yang perlu ditinjau.':'Tidak ada error formula terdeteksi pada hasil parsing.'}</span></div><div><b>ROLLBACK</b><span>Backup kondisi database dibuat otomatis sebelum import diterapkan.</span></div></div>
    <button className="schema-toggle" onClick={()=>setShowSchema(v=>!v)}>▣ {showSchema?'Sembunyikan':'Tampilkan'} schema mapping ({info.preview?.length||0})</button>
    {showSchema&&<div className="schema-map"><div className="schema-head"><span>Website</span><span>Excel</span><span>Status</span><span>Ukuran</span><span>Formula</span></div>{(info.preview||[]).map((m,i)=><div className="schema-row" key={i}><span title={m.expected}>{m.expected||'—'}</span><span title={m.actual}>{m.actual||'—'}</span><span className={`schema-status ${m.status}`}>{m.status==='exact'?'COCOK':m.status==='fuzzy'?'FLEKSIBEL':m.status==='missing'?'HILANG':'BARU'}</span><span>{m.importRows}×{m.importCols}</span><span>{m.formulaCount}</span></div>)}</div>}
    {warnings.length>0&&<div className="import-warnings">{warnings.slice(0,8).map((w,i)=><div key={i}>⚠ {w}</div>)}</div>}
    <div className="modal-foot"><button className="ghost" onClick={onClose}>Batal</button><button className="primary" disabled={!info.validation?.ok} onClick={runApply}>✓ Validasi OK • Terapkan Import</button></div>
  </div></div> }

function LoginModal({onClose,onLogin}){const [password,setPassword]=useState('');return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="small-modal"><div className="modal-head"><div><span className="eyebrow">AKSES OPERATOR</span><h2>Masuk ke database pusat</h2><p>Password hanya dipakai untuk sesi operator. Kredensial Google tetap tersimpan di Cloudflare Secret.</p></div><button className="close" onClick={onClose}>×</button></div><label className="single-field"><span>Password operator</span><input type="password" autoFocus value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onLogin(password)} placeholder="Masukkan password" /></label><div className="modal-foot"><button className="ghost" onClick={onClose}>Batal</button><button className="primary" onClick={()=>onLogin(password)}>Masuk</button></div></div></div>}
function AddRowModal({ cols, headers, values, setValues, activeCols, toggleCol, selectAllColumns, selectNoColumns, insertAfter, setInsertAfter, rowCount, onClose, onAdd }) { return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="add-modal"><div className="modal-head"><div><span className="eyebrow">TAMBAH BARIS FLEKSIBEL</span><h2>Pilih kolom yang ingin diisi</h2><p>Anda tidak perlu mengisi seluruh kolom. Gunakan pilihan kolom agar input lebih ringkas.</p></div><button className="close" onClick={onClose}>×</button></div><div className="modal-controls"><label>Posisi <select value={insertAfter} onChange={e => setInsertAfter(e.target.value)}><option value="end">Tambahkan di akhir</option>{Array.from({ length: Math.min(rowCount, 50) }, (_, i) => <option key={i} value={i}>Setelah baris {i + 1}</option>)}</select></label><div className="column-pickers"><span>Kolom aktif:</span><button onClick={selectAllColumns}>Semua</button><button onClick={selectNoColumns}>Kosongkan</button><b>{activeCols.length}/{cols}</b></div></div><div className="pick-grid">{Array.from({ length: cols }, (_, i) => <label key={i} className={activeCols.includes(i) ? 'pick active' : 'pick'}><input type="checkbox" checked={activeCols.includes(i)} onChange={() => toggleCol(i)} /><span><b>{colName(i)}</b><small>{headers[i]}</small></span></label>)}</div><div className="modal-form">{activeCols.length ? activeCols.map(i => <label key={i}><span><b>{colName(i)}</b>{headers[i]}</span>{/anggaran|realisasi|target|bobot|persen|fisik|keuangan|nilai|jumlah|tahun|triwulan|%/i.test(headers[i]) ? <input inputMode="decimal" value={values[i] || ''} onChange={e => setValues(v => ({ ...v, [i]: e.target.value }))} placeholder={`Isi ${headers[i]}…`} /> : <textarea rows="2" value={values[i] || ''} onInput={e => { e.currentTarget.style.height = '0px'; e.currentTarget.style.height = Math.min(160, e.currentTarget.scrollHeight) + 'px'; }} onChange={e => setValues(v => ({ ...v, [i]: e.target.value }))} placeholder={`Isi ${headers[i]}…`} />}</label>) : <div className="empty">Pilih minimal satu kolom.</div>}</div><div className="modal-foot"><span>{activeCols.length} kolom dipilih</span><div><button className="ghost" onClick={onClose}>Batal</button><button className="primary" onClick={onAdd}>＋ Tambahkan Baris</button></div></div></div></div>; }

function RowEditorModal({ payload, sheetName, rowIndex, onClose, onSave, onAdd }) {
  const sheet = payload.sheets[sheetName];
  const cols = Math.max(sheet?.cols || 0, ...((sheet?.values || []).map(r => r.length)), 0);
  const headers = headersFor(sheet);
  const isNew = rowIndex === 'new';
  const [values, setValues] = useState(() => isNew ? Array(cols).fill('') : clone(sheet.values[Number(rowIndex)] || Array(cols).fill('')));
  const meta = sheetMeta[sheetName] || {};
  const isComputed = (i) => (meta.achieve === i || meta.budgetPct === i || (sheetName === 'Realisasi Fisik & Keu' && [3, 5, 7, 8, 9].includes(i)));
  const inferredType = (i) => /anggaran|realisasi|target|bobot|persen|fisik|keuangan|nilai|jumlah|tahun|triwulan|%|no\.?$/i.test(headers[i] || '') ? 'number' : 'text';
  const saveRow = () => {
    if (isNew) onAdd(sheetName, clone(values));
    else onSave(sheetName, Number(rowIndex), clone(values));
  };
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="row-editor-modal"><div className="modal-head"><div><span className="eyebrow">{isNew ? 'TAMBAH DATA' : 'EDIT DATA'} • {sheetName}</span><h2>{isNew ? 'Isi baris baru' : `Edit baris ${Number(rowIndex) + 1}`}</h2><p>{isNew ? 'Form mengikuti seluruh kolom sheet. Isi bagian yang diperlukan saja.' : 'Kolom hitungan ditandai AUTO dan akan diperbarui saat disimpan.'}</p></div><button className="close" onClick={onClose}>×</button></div><div className="row-form-grid">{Array.from({ length: cols }, (_, i) => <label key={i} className={isComputed(i) ? 'computed-field' : ''}><span><b>{colName(i)}</b>{headers[i]}</span>{isComputed(i) ? <input value={cell(values[i])} readOnly placeholder="Otomatis" /> : inferredType(i) === 'number' ? <input inputMode="decimal" value={cell(values[i])} onChange={e => setValues(v => { const n = [...v]; n[i] = e.target.value; return n; })} placeholder={`Isi ${headers[i]}…`} /> : <textarea rows="2" value={cell(values[i])} onInput={e => { e.currentTarget.style.height = '0px'; e.currentTarget.style.height = Math.min(180, e.currentTarget.scrollHeight) + 'px'; }} onChange={e => setValues(v => { const n = [...v]; n[i] = e.target.value; return n; })} placeholder={`Isi ${headers[i]}…`} />}</label>)}</div><div className="modal-foot"><span>{cols} kolom • wrap text • auto calc</span><div><button className="ghost" onClick={onClose}>Batal</button><button className="primary" onClick={saveRow}>{isNew ? '＋ Tambahkan data' : '✓ Simpan baris'}</button></div></div></div></div>;
}
function isComputedDataSheet(name) { return name === 'Realisasi Fisik & Keu' || name.startsWith('Capaian Sasaran'); }

function YearManagerModal({ years, activeYear, dirty, onClose, onSwitch, onCreate, onRename, onSave, onExportAll }) { const [newYear, setNewYear] = useState(activeYear + 1); const [mode, setMode] = useState('copy'); const available = Object.keys(years).map(Number).sort((a, b) => b - a); return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="year-modal"><div className="modal-head"><div><span className="eyebrow">MANAJEMEN TAHUN ANGGARAN</span><h2>Tahun aktif: {activeYear}</h2><p>Setiap tahun memiliki database sendiri. Anda bisa menambah tahun, menyalin data, atau membuat template kosong.</p></div><button className="close" onClick={onClose}>×</button></div><div className="year-list">{available.map(y => <button key={y} className={y === activeYear ? 'year-item active' : 'year-item'} onClick={() => y !== activeYear && onSwitch(y)}><span>TA {y}</span><small>{y === activeYear ? 'Aktif sekarang' : 'Buka tahun ini'}</small><b>{years[y]?.meta?.sheetCount || Object.keys(years[y]?.sheets || {}).length} sheet</b></button>)}</div><div className="new-year-box"><span className="eyebrow">TAMBAH TAHUN BARU</span><div className="new-year-row"><input type="number" min="2000" max="2100" value={newYear} onChange={e => setNewYear(e.target.value)} /><select value={mode} onChange={e => setMode(e.target.value)}><option value="copy">Salin data tahun aktif</option><option value="blank">Buat template kosong</option></select><button className="primary" onClick={() => onCreate(newYear, mode)}>＋ Tambah Tahun</button></div><small>Salin data mempertahankan struktur dan isi; template kosong mempertahankan struktur namun membersihkan baris data transaksi.</small></div><div className="year-foot"><span>{dirty ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan sudah tersimpan.'}</span><div><button className="soft" onClick={onRename}>✎ Ganti label tahun</button><button className="soft" onClick={onExportAll}>⇩ Export semua</button><button className="primary" onClick={onSave}>✓ Simpan tahun aktif</button></div></div></div></div>; }
function YearEditModal({ currentYear, onClose, onRename }) { const [value, setValue] = useState(currentYear); return <div className="modal-backdrop"><div className="small-modal"><div className="modal-head"><div><span className="eyebrow">UBAH TAHUN</span><h2>Ganti tahun aktif</h2><p>Gunakan hanya bila Anda benar-benar ingin mengganti label tahun database.</p></div><button className="close" onClick={onClose}>×</button></div><label className="single-field"><span>Tahun baru</span><input type="number" value={value} onChange={e => setValue(e.target.value)} /></label><div className="modal-foot"><button className="ghost" onClick={onClose}>Batal</button><button className="primary" onClick={() => onRename(value)}>✓ Ubah tahun</button></div></div></div>; }


createRoot(document.getElementById('root')).render(<App />);
