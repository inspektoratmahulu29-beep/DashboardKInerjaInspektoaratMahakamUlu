import { batchGetSheets, quoteSheet } from '../../lib/google.js';

const SHEETS = [
  'IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program',
  'Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)',
  'Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)',
  'Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama',
  'Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'
];
const RANGES = SHEETS.map(s => `${quoteSheet(s)}!A:Z`);
const num = v => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim().replace(/\s/g,'');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) return Number(s.replace(/\./g,'').replace(',','.'));
  if ((s.match(/\./g)||[]).length > 1) return Number(s.replace(/\./g,''));
  return Number(s.replace(',','.'));
};
const text = v => String(v ?? '').replace(/\s+/g,' ').trim();
const validNum = v => Number.isFinite(v);
const pct = v => Number.isFinite(v) ? Math.max(0, Math.min(v, 100)) : 0;
const rowHasText = r => (r||[]).some(v => text(v));
const meaningfulCells = rows => (rows||[]).reduce((n,r)=>n+(r||[]).filter(v=>text(v)).length,0);

function findLabelRow(rows, labels) {
  for (let i=0;i<rows.length;i++) {
    const joined = (rows[i]||[]).map(text).join(' ').toUpperCase();
    if (labels.some(x=>joined.includes(x))) return i;
  }
  return -1;
}
function findFirstNumeric(rows, colIndex, start=0) {
  for (let i=start;i<rows.length;i++) {
    const n=num(rows[i]?.[colIndex]);
    if (validNum(n)) return {row:i,value:n};
  }
  return null;
}
function percentFrom(ratio) { return Number.isFinite(ratio) ? pct(ratio*100) : null; }

function physicalFinancial(sheet) {
  const rows = sheet;
  let totalRow = findLabelRow(rows, ['JUMLAH BELANJA','TOTAL BELANJA','TOTAL']);
  if (totalRow < 0 && rows[9]) totalRow = 9;
  let budget = totalRow >= 0 ? num(rows[totalRow]?.[2]) : null;
  let financial = totalRow >= 0 ? num(rows[totalRow]?.[6]) : null;
  let physical = totalRow >= 0 ? num(rows[totalRow]?.[4]) : null;
  if (!validNum(budget)) {
    const candidates = [10,25,40].filter(i=>rows[i]);
    budget = candidates.reduce((s,i)=>s+(num(rows[i]?.[2])||0),0) || null;
  }
  if (!validNum(financial)) {
    const candidates = [10,25,40].filter(i=>rows[i]);
    financial = candidates.reduce((s,i)=>s+(num(rows[i]?.[6])||0),0) || null;
  }
  if (!validNum(physical)) {
    const ps=[];
    for (const i of [10,25,40]) {
      const a=num(rows[i]?.[2]), p=num(rows[i]?.[4]);
      if(validNum(a)&&validNum(p)&&a>0) ps.push([a,p]);
    }
    if(ps.length) physical = ps.reduce((sa,[a,p])=>sa+a*p,0)/ps.reduce((sa,[a])=>sa+a,0);
  }
  const rate = validNum(budget)&&budget>0&&validNum(financial) ? (financial/budget)*100 : null;
  return { budget: budget||0, financial: financial||0, financialRate: pct(rate), physicalRate: pct(physical), remaining: Math.max(0,(budget||0)-(financial||0)) };
}
function capaian(sheet, targetCol, realCol) {
  const ratios=[];
  for(let i=0;i<sheet.length;i++){
    const t=num(sheet[i]?.[targetCol]), r=num(sheet[i]?.[realCol]);
    if(validNum(t)&&validNum(r)&&t!==0) ratios.push((r/t)*100);
  }
  return ratios.length ? pct(ratios.reduce((a,b)=>a+b,0)/ratios.length) : 0;
}
function budgetPct(sheet, budgetCol, realCol) {
  const ratios=[];
  for(let i=0;i<sheet.length;i++){
    const b=num(sheet[i]?.[budgetCol]), r=num(sheet[i]?.[realCol]);
    if(validNum(b)&&validNum(r)&&b!==0) ratios.push((r/b)*100);
  }
  return ratios.length ? pct(ratios.reduce((a,b)=>a+b,0)/ratios.length) : 0;
}
function monevTW(sheet, targetCols, realCols) {
  const ratios=[];
  for(let i=0;i<sheet.length;i++) for(let j=0;j<targetCols.length;j++) {
    const t=num(sheet[i]?.[targetCols[j]]), r=num(sheet[i]?.[realCols[j]]);
    if(validNum(t)&&t!==0&&validNum(r)) ratios.push((r/t)*100);
  }
  return ratios.length ? pct(ratios.reduce((a,b)=>a+b,0)/ratios.length) : 0;
}
function outputCount(sheet, col) {
  let total=0;
  for(let i=0;i<sheet.length;i++) { const n=num(sheet[i]?.[col]); if(validNum(n) && n>0) total+=n; }
  return total;
}
function pkpt(sheet) {
  const counts={selesai:0, berjalan:0, belum:0, total:0};
  for(let i=0;i<sheet.length;i++){
    const s=text(sheet[i]?.[4]).toLowerCase();
    if(!s) continue;
    if(s==='sudah'||s==='selesai'||s.includes('sudah')) counts.selesai++;
    else if(s.includes('berjalan')) counts.berjalan++;
    else if(s.includes('belum')) counts.belum++;
    else continue;
    counts.total++;
  }
  return counts;
}
function completeness(rows) {
  if(!rows.length) return 0;
  const nonemptyRows=rows.filter(rowHasText).length;
  return pct((nonemptyRows/rows.length)*100);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());
  try {
    const upstream = await batchGetSheets(env, RANGES);
    const byName = {};
    for (const v of (upstream.valueRanges||[])) {
      const raw = v.range || '';
      const name = SHEETS.find(s => raw.includes(s.replace(/'/g,"''"))) || SHEETS.find(s=>raw.toLowerCase().includes(s.toLowerCase()));
      if(name) byName[name] = v.values || [];
    }
    const rf = physicalFinancial(byName['Realisasi Fisik & Keu'] || []);
    const cs = {
      strategic: capaian(byName['Capaian Sasaran Strategis']||[],4,5),
      program: capaian(byName['Capaian Sasaran Program']||[],5,6),
      kegiatanUtama: capaian(byName['Capaian Sasaran Kegiatan Utama']||[],6,7),
      kegiatanPenunjang: capaian(byName['Capaian Sasaran Kegiatan(Penun)']||[],7,8),
      subUtama: capaian(byName['Capaian Sasaran SUBKegiatan(U)']||[],7,8),
      subPenunjang: capaian(byName['Capaian Sasaran SUBKegiatan (P)']||[],8,9)
    };
    const monev = {
      renaksi: monevTW(byName['Monev Renaksi IKU']||[],[5,6,7,8],[9,10,11,12]),
      program: monevTW(byName['Monev Program']||[],[7,8,9,10],[11,12,13,14])
    };
    const pk = pkpt(byName['Rekap realisasi PKPT']||[]);
    const outputs = {
      utama: outputCount(byName['Monev output Subkegiatan Utama']||[],11),
      penunjang: outputCount(byName['Monev Subkegiatan Penunjang']||[],10)
    };
    const completenessMap = SHEETS.map(name=>({name, percent:completeness(byName[name]||[]), rows:(byName[name]||[]).filter(rowHasText).length}));
    const overall = completenessMap.length ? completenessMap.reduce((s,x)=>s+x.percent,0)/completenessMap.length : 0;
    const payload = {
      year, updatedAt:new Date().toISOString(),
      source:'Google Sheets via Cloudflare Function',
      kpi:{
        totalAnggaran:rf.budget, realisasiKeuangan:rf.financial, serapan:rf.financialRate,
        realisasiFisik:rf.physicalRate, sisaDana:rf.remaining,
        penugasan:pk.total, selesai:pk.selesai, berjalan:pk.berjalan, belum:pk.belum,
        outputUtama:outputs.utama, outputPenunjang:outputs.penunjang,
        capaian:{...cs, renaksi:monev.renaksi, monevProgram:monev.program}
      },
      sheets:completenessMap,
      overallCompleteness:overall,
      formulas:{
        totalAnggaran:'Baris total resmi / fallback hanya ringkasan program tingkat atas',
        realisasiKeuangan:'Baris total resmi / fallback hanya ringkasan program tingkat atas',
        serapan:'Realisasi Keuangan ÷ Anggaran × 100',
        fisik:'Realisasi Fisik pada baris total resmi; fallback rata-rata tertimbang program',
        outputUtama:'SUM Jumlah Output pada Monev output Subkegiatan Utama',
        outputPenunjang:'SUM Jumlah Output pada Monev Subkegiatan Penunjang'
      }
    };
    const headers = {'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=2, stale-while-revalidate=4','x-data-source':'google-sheets'};
    return new Response(JSON.stringify(payload), {headers});
  } catch (error) {
    return new Response(JSON.stringify({error:'Backend Google Sheets belum siap', detail:error.message}), {
      status:503, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
    });
  }
}
