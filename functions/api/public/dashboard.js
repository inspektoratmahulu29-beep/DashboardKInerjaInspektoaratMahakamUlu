import { getSheetTitles, batchGetSheets, quoteSheet } from '../../lib/google.js';

const inflight = new Map();
const RANGE_END = {
  'IKU':'L','Rencana Aksi':'M','Capaian Sasaran Strategis':'K','Capaian Sasaran Program':'L',
  'Capaian Sasaran Kegiatan Utama':'M','Capaian Sasaran Kegiatan(Penun)':'N','Capaian Sasaran SUBKegiatan(U)':'N',
  'Capaian Sasaran SUBKegiatan (P)':'O','Monev Renaksi IKU':'M','Monev Program':'O',
  'Monev output Subkegiatan Utama':'L','Monev Subkegiatan Penunjang':'K','Rekap realisasi PKPT':'E','Realisasi Fisik & Keu':'K'
};

const SHEETS = [
  'IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program',
  'Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)',
  'Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)',
  'Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama',
  'Monev Subkegiatan Penunjang','Rekap realisasi PKPT','Realisasi Fisik & Keu'
];
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
const pct = v => Number.isFinite(v) ? Math.max(0, Math.min(v,100)) : 0;
const rowHasText = r => (r||[]).some(v => text(v));
const percentAverage = vals => vals.length ? pct(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;

function resolveYearTitle(year, canonical, titles) {
  const pref = `${Number(year)}__${canonical}`;
  return titles.includes(pref) ? pref : (Number(year)===2026 && titles.includes(canonical) ? canonical : null);
}

function physicalFinancial(rows) {
  /*
   * KPI REALISASI FISIK — identik dengan Web 1 V11.1.
   *
   * PENTING: Web 1 memakai kolom E (Realisasi Fisik) sebagai sumber fisik utama.
   * Jangan mengganti E dengan H atau G/C karena pada workbook aktual nilai E dapat
   * berbeda dari persentase keuangan dan memang itulah nilai fisik yang harus tampil.
   * H hanya fallback bila E kosong/tidak numerik.
   */
  const physicalRows = rows || [];
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const parse = v => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = clean(v).replace(/\s/g, '');
    if (!s || s.startsWith('=')) return null;
    if (/^-?\d+[,.]?\d*$/.test(s)) {
      if (s.includes('.') && s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
      if ((s.match(/\./g) || []).length > 1) return Number(s.replace(/\./g, ''));
      return Number(s.replace(',', '.'));
    }
    const m = s.match(/-?\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  };
  const finite = v => Number.isFinite(v);

  // Same structure discovery as Web 1.
  let officeIndex = physicalRows.findIndex(r =>
    clean(r?.[0]).toUpperCase() === 'I' &&
    clean(r?.[1]).toUpperCase().includes('INSPEKTORAT')
  );
  if (officeIndex < 0) officeIndex = Math.min(9, Math.max(0, physicalRows.length - 1));

  let totalIndex = physicalRows.findIndex(r => clean(r?.[0]).toUpperCase() === 'JUMLAH BELANJA');
  const end = totalIndex >= 0 ? totalIndex : physicalRows.length;

  const programRows = [];
  for (let i = officeIndex + 1; i < end; i++) {
    const a = clean(physicalRows[i]?.[0]);
    const b = clean(physicalRows[i]?.[1]);
    if (/^\d+$/.test(a) && b.toUpperCase().startsWith('PROGRAM ')) programRows.push(i + 1);
  }

  const top = [];
  for (let i = 0; i < programRows.length; i++) {
    const sr = programRows[i];
    const next = programRows[i + 1] || (totalIndex >= 0 ? totalIndex + 1 : physicalRows.length + 1);
    const summary = physicalRows[sr - 1] || [];
    let budget = parse(summary[2]);
    let fin = parse(summary[6]);
    if (budget === null || fin === null) {
      const detail = [];
      for (let rr = sr + 1; rr < next; rr++) {
        const r = physicalRows[rr - 1] || [];
        if (!clean(r[1])) continue;
        if (parse(r[2]) !== null || parse(r[6]) !== null) detail.push(r);
      }
      if (budget === null) budget = detail.reduce((a, r) => a + (parse(r[2]) || 0), 0);
      if (fin === null) fin = detail.reduce((a, r) => a + (parse(r[6]) || 0), 0);
    }
    top.push({ summary: sr, next, budget: budget ?? 0, fin: fin ?? 0 });
  }

  const office = physicalRows[officeIndex] || [];
  const officialTotal = parse(office[2]);
  const officialFin = parse(office[6]);
  const officialPhysical = parse(office[4]);
  const fallbackBudget = top.reduce((a, g) => a + (g.budget || 0), 0);
  const fallbackFin = top.reduce((a, g) => a + (g.fin || 0), 0);
  const budgetTotal = officialTotal !== null ? officialTotal : fallbackBudget;
  const financialTotal = officialFin !== null ? officialFin : fallbackFin;

  // WEB 1 CANONICAL KPI SYNC:
  // Web 1 persists/calculates the official Inspektorat total in E on the office row.
  // Use that value first so Web 2 cannot accidentally turn a valid KPI into 0 just
  // because one or more detail formula results are temporarily 0/blank while Google
  // Sheets is recalculating. Detail-weighted calculation remains the fallback.
  const normalizePhysical = value => {
    if (!finite(value)) return null;
    // Some Google/Excel representations can expose a percent-formatted decimal (0..1)
    // while the dashboard expects percentage points (0..100).
    if (value >= 0 && value <= 1.000001) return value * 100;
    return value;
  };
  const canonicalOfficePhysical = normalizePhysical(officialPhysical);

  // EXACT Web 1 detail logic: E is primary, H only when E is missing.
  const physicalPairs = [];
  for (const g of top) {
    for (let rr = g.summary + 1; rr < g.next; rr++) {
      const r = physicalRows[rr - 1] || [];
      if (!clean(r[1])) continue;
      const budget = parse(r[2]);
      const e = parse(r[4]);
      const h = parse(r[7]);
      const physical = e !== null ? e : h;
      if (budget !== null && budget > 0 && physical !== null && finite(physical)) {
        physicalPairs.push({ budget, physical });
      }
    }
  }

  const derivedPhysicalRaw = physicalPairs.length
    ? physicalPairs.reduce((a, x) => a + x.budget * x.physical, 0) /
      physicalPairs.reduce((a, x) => a + x.budget, 0)
    : null;
  const derivedPhysical = normalizePhysical(derivedPhysicalRaw);

  // Canonical order for public sync:
  // 1) official Web 1 office total (E row of INSPEKTORAT),
  // 2) detail weighted value,
  // 3) program weighted value,
  // 4) raw office value as final fallback.
  let physicalRate = canonicalOfficePhysical !== null && canonicalOfficePhysical > 0
    ? canonicalOfficePhysical
    : derivedPhysical;
  let physicalSource = canonicalOfficePhysical !== null && canonicalOfficePhysical > 0
    ? 'web1-office-total-E-canonical'
    : (physicalPairs.length ? 'detail-weighted-exact-web1' : 'none');
  if (!finite(physicalRate)) {
    const programPairs = [];
    for (const g of top) {
      const r = physicalRows[g.summary - 1] || [];
      const budget = parse(r[2]);
      const e = parse(r[4]);
      const h = parse(r[7]);
      const physical = e !== null ? e : h;
      if (budget !== null && budget > 0 && physical !== null && finite(physical)) {
        programPairs.push({ budget, physical });
      }
    }
    if (programPairs.length) {
      const programPhysical = normalizePhysical(
        programPairs.reduce((a, x) => a + x.budget * x.physical, 0) /
        programPairs.reduce((a, x) => a + x.budget, 0)
      );
      if (finite(programPhysical)) {
        physicalRate = programPhysical;
        physicalSource = 'program-weighted-exact-web1';
      }
    }
  }
  if (!finite(physicalRate)) {
    const rawOffice = normalizePhysical(parse(office[4]));
    if (finite(rawOffice)) {
      physicalRate = rawOffice;
      physicalSource = 'office-total-E-fallback';
    }
  }

  const financialRate = budgetTotal !== null && budgetTotal > 0 && financialTotal !== null
    ? (financialTotal / budgetTotal) * 100 : 0;

  return {
    budget: finite(budgetTotal) ? budgetTotal : 0,
    financial: finite(financialTotal) ? financialTotal : 0,
    financialRate: pct(financialRate),
    physicalRate: pct(physicalRate),
    remaining: Math.max(0, (finite(budgetTotal) ? budgetTotal : 0) - (finite(financialTotal) ? financialTotal : 0)),
    physicalSource,
    physicalRowsCount: physicalPairs.length
  };
}
function capaian(rows,targetCol,realCol){
  const ratios=[];
  for(const r of rows){const t=num(r?.[targetCol]),x=num(r?.[realCol]);if(validNum(t)&&validNum(x)&&t!==0)ratios.push(x/t*100);}
  return percentAverage(ratios);
}
function monevTW(rows,targetCols,realCols){
  const ratios=[];
  for(const r of rows) for(let j=0;j<targetCols.length;j++){const t=num(r?.[targetCols[j]]),x=num(r?.[realCols[j]]);if(validNum(t)&&t!==0&&validNum(x))ratios.push(x/t*100);}
  return percentAverage(ratios);
}
function outputCount(rows,col){return rows.reduce((s,r)=>{const n=num(r?.[col]);return s+(validNum(n)&&n>0?n:0)},0);}
function pkpt(rows){
  const c={selesai:0,berjalan:0,belum:0,total:0};
  for(const r of rows){const s=text(r?.[4]).toLowerCase();if(s.includes('sudah')||s==='selesai')c.selesai++;else if(s.includes('berjalan'))c.berjalan++;else if(s.includes('belum'))c.belum++;else continue;c.total++;}
  return c;
}
function completeness(rows){return rows.length?pct(rows.filter(rowHasText).length/rows.length*100):0;}

async function buildSnapshot(env, year) {
  const titles=await getSheetTitles(env);
  const resolved=SHEETS.map(c=>({canonical:c,title:resolveYearTitle(year,c,titles)})).filter(x=>x.title);
  if(!resolved.length) throw Object.assign(new Error('YEAR_NOT_INITIALIZED'),{code:'YEAR_NOT_INITIALIZED'});
  const ranges=resolved.map(x=>`${quoteSheet(x.title)}!A:${RANGE_END[x.canonical]||'O'}`);
  const upstream=await batchGetSheets(env,ranges);
  const byName={};
  for(let i=0;i<resolved.length;i++) byName[resolved[i].canonical]=upstream.valueRanges?.[i]?.values||[];
  const rf=physicalFinancial(byName['Realisasi Fisik & Keu']||[]);
  const kpi={totalAnggaran:rf.budget,realisasiKeuangan:rf.financial,serapan:rf.financialRate,realisasiFisik:rf.physicalRate,sisaDana:rf.remaining,physicalSource:rf.physicalSource,physicalRowsCount:rf.physicalRowsCount};
  const cs={
    strategic:capaian(byName['Capaian Sasaran Strategis']||[],4,5), program:capaian(byName['Capaian Sasaran Program']||[],5,6),
    kegiatanUtama:capaian(byName['Capaian Sasaran Kegiatan Utama']||[],6,7), kegiatanPenunjang:capaian(byName['Capaian Sasaran Kegiatan(Penun)']||[],7,8),
    subUtama:capaian(byName['Capaian Sasaran SUBKegiatan(U)']||[],7,8), subPenunjang:capaian(byName['Capaian Sasaran SUBKegiatan (P)']||[],8,9),
    renaksi:monevTW(byName['Monev Renaksi IKU']||[],[5,6,7,8],[9,10,11,12]),
    monevProgram:monevTW(byName['Monev Program']||[],[7,8,9,10],[11,12,13,14])
  };
  const pk=pkpt(byName['Rekap realisasi PKPT']||[]);
  const outputUtama=outputCount((byName['Monev output Subkegiatan Utama']||[]).slice(6),11);
  const outputPenunjang=outputCount((byName['Monev Subkegiatan Penunjang']||[]).slice(6),10);
  Object.assign(kpi,{penugasan:pk.total,selesai:pk.selesai,berjalan:pk.berjalan,belum:pk.belum,outputUtama,outputPenunjang,capaian:cs});
  const sheets=SHEETS.map(c=>{const rows=byName[c]||[];return {name:c,percent:completeness(rows),rows:rows.filter(rowHasText).length};});
  const overall=sheets.length?percentAverage(sheets.map(s=>s.percent)):0;
  return {year,updatedAt:new Date().toISOString(),source:'Google Sheets via Cloudflare Backend',kpi,sheets,overallCompleteness:overall,formulas:{
    totalAnggaran:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    realisasiKeuangan:'Total resmi pada Realisasi Fisik & Keu; fallback hanya ringkasan program tingkat atas',
    serapan:'Realisasi Keuangan ÷ Anggaran × 100', realisasiFisik:'Nilai fisik resmi/tertimbang dari sumber',
    outputUtama:'Jumlah Output pada Monev output Subkegiatan Utama', outputPenunjang:'Jumlah Output pada Monev Subkegiatan Penunjang'
  }};
}

export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  const year=Math.min(2100,Math.max(2000,Number(url.searchParams.get('year')||2026)));
  const cache=caches.default;
  const key=new Request(`${url.origin}/__cache/public-dashboard?year=${encodeURIComponent(year)}&v=11.5`);
  const cached=await cache.match(key);
  if(cached){
    const out=new Response(cached.body,cached); out.headers.set('x-dashboard-cache','HIT');
    const tag=out.headers.get('etag');
    if(tag && request.headers.get('if-none-match')===tag) return new Response(null,{status:304,headers:{etag:tag,'cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20'}});
    return out;
  }
  const staleKey=new Request(`${url.origin}/__cache/public-dashboard-stale?year=${encodeURIComponent(year)}&v=11.5`);
  let build=inflight.get(year);
  if(!build){
    build=(async()=>{
      const data=await buildSnapshot(env,year);
      const body=JSON.stringify(data);
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
      const etag=`W/"${Array.from(new Uint8Array(hash)).slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('')}"`;
      return {body,etag};
    })().finally(()=>inflight.delete(year));
    inflight.set(year,build);
  }
  try{
    const {body,etag}=await build;
    const physicalKpiSource = (() => { try { return JSON.parse(body)?.kpi?.realisasiFisik != null ? (JSON.parse(body)?.kpi?.physicalSource || 'same-snapshot') : 'missing'; } catch { return 'unknown'; } })();
    const response=new Response(body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20','cdn-cache-control':'public,s-maxage=8,stale-while-revalidate=20','etag':etag,'x-data-source':'google-sheets','x-dashboard-cache':'MISS','x-physical-kpi-source':physicalKpiSource}});
    await Promise.all([
      cache.put(key,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=8'}})),
      cache.put(staleKey,new Response(body,{headers:{...Object.fromEntries(response.headers), 'cache-control':'public,max-age=120'}}))
    ]);
    if(request.headers.get('if-none-match')===etag) return new Response(null,{status:304,headers:{etag,'cache-control':'public,max-age=2,s-maxage=8'}});
    return response;
  }catch(error){
    const stale=await cache.match(staleKey);
    if(stale){const out=new Response(stale.body,stale);out.headers.set('x-dashboard-cache','STALE');out.headers.set('x-dashboard-warning','upstream-unavailable');return out;}
    const code=error?.code==='YEAR_NOT_INITIALIZED'?'YEAR_NOT_INITIALIZED':String(error?.message||'').includes('SERVICE_DISABLED')?'GOOGLE_SHEETS_API_DISABLED':String(error?.message||'').includes('Google OAuth')?'GOOGLE_AUTH_FAILED':'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({event:'public_dashboard_error',code,message:String(error?.message||''),year,at:new Date().toISOString()}));
    return new Response(JSON.stringify({error:code==='YEAR_NOT_INITIALIZED'?'Data tahun ini belum tersedia di database pusat.':'Dashboard belum dapat mengambil data pusat.',code,year}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
}
