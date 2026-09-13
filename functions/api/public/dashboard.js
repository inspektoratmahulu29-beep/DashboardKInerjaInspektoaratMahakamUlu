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
   * KPI REALISASI FISIK — HARUS SAMA DENGAN LOGIKA WEB 1.
   *
   * Struktur sheet "Realisasi Fisik & Keu":
   * C = Anggaran
   * D = Bobot
   * E = Realisasi Fisik (%)
   * F = Fisik Tertimbang (%)
   * G = Realisasi Keuangan (Rp)
   * H = Realisasi Keuangan (%)
   * I = Keuangan Tertimbang (%)
   *
   * Nilai KPI fisik resmi Web 1 dihitung dari DETAIL, berbobot menurut
   * anggaran: SUM(C*E) / SUM(C). Baris kantor/total hanya dipakai sebagai
   * fallback apabila detail belum tersedia.
   *
   * Ini penting karena E dapat sementara blank/error saat Google Sheets
   * belum selesai menghitung formula. Pada kondisi itu H menjadi fallback
   * per baris (secara aljabar E = H pada template ini), sama seperti Web 1.
   */
  const physicalRows = rows || [];
  const text = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const parse = v => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v ?? '').trim().replace(/\s/g, '');
    if (!s || s.startsWith('=')) return null;
    try {
      let n;
      if (s.includes('.') && s.includes(',')) n = Number(s.replace(/\./g, '').replace(',', '.'));
      else if ((s.match(/\./g) || []).length > 1) n = Number(s.replace(/\./g, ''));
      else n = Number(s.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  };
  const finite = v => Number.isFinite(v);

  // 1) Temukan baris kantor utama "I / INSPEKTORAT".
  let officeIndex = physicalRows.findIndex(r =>
    text(r?.[0]).toUpperCase() === 'I' &&
    text(r?.[1]).toUpperCase().includes('INSPEKTORAT')
  );
  if (officeIndex < 0) officeIndex = Math.min(9, Math.max(0, physicalRows.length - 1));

  // 2) Temukan header program yang membatasi kelompok detail.
  const programRows = [];
  for (let i = officeIndex + 1; i < physicalRows.length; i++) {
    const no = text(physicalRows[i]?.[0]);
    const label = text(physicalRows[i]?.[1]).toUpperCase();
    if (/^\d+$/.test(no) && label.startsWith('PROGRAM ')) programRows.push(i + 1); // 1-based
  }

  // 3) Hitung fisik detail berbobot anggaran — sumber utama.
  const detailPairs = [];
  const top = [];
  for (let i = 0; i < programRows.length; i++) {
    const summaryRow = programRows[i];
    const nextRow = programRows[i + 1] || (physicalRows.length + 1);
    const summary = physicalRows[summaryRow - 1] || [];

    let groupBudget = parse(summary[2]);
    let groupFinancial = parse(summary[6]);
    let groupPhysical = parse(summary[4]);
    if (!finite(groupBudget) || groupBudget < 0) groupBudget = 0;

    // Detail dimulai setelah baris program.
    for (let rr = summaryRow + 1; rr < nextRow; rr++) {
      const r = physicalRows[rr - 1] || [];
      if (!text(r[1])) continue;

      const budget = parse(r[2]);
      // Web 1 V11.1 menetapkan E (Realisasi Fisik) secara aljabar sama dengan H
      // pada template ini: E = I/D*100 dan I = H*D/100, sehingga E = H.
      // Google Sheets kadang mengembalikan hasil formula E sebagai 0/stale
      // walaupun H sudah memiliki nilai valid. Karena itu Web 2 harus memprioritaskan
      // H sebagai sumber stabil untuk KPI fisik, lalu E hanya sebagai fallback.
      const physicalFromH = parse(r[7]);
      const physicalFromE = parse(r[4]);
      const physical = finite(physicalFromH) ? physicalFromH : physicalFromE;
      if (finite(budget) && budget > 0 && finite(physical)) {
        detailPairs.push({ budget, physical });
      }
    }

    // Bila nilai ringkasan program tersedia, simpan sebagai fallback.
    // Sama seperti detail: H adalah representasi stabil dari E pada template ini.
    const summaryPhysical = (() => {
      const h = parse(summary[7]);
      const e = parse(summary[4]);
      return finite(h) ? h : e;
    })();
    if (finite(groupBudget) && groupBudget > 0 && finite(summaryPhysical)) {
      groupPhysical = summaryPhysical;
      top.push({ budget: groupBudget, physical: summaryPhysical, financial: groupFinancial });
    } else if (finite(groupBudget) && groupBudget > 0) {
      top.push({ budget: groupBudget, physical: null, financial: groupFinancial });
    }
  }

  let physicalRate = null;
  let physicalSource = 'none';

  // Persis prinsip Web 1: detail fisik yang valid menjadi sumber utama.
  if (detailPairs.length) {
    const budgetSum = detailPairs.reduce((s, x) => s + x.budget, 0);
    const weightedSum = detailPairs.reduce((s, x) => s + x.budget * x.physical, 0);
    if (budgetSum > 0) {
      physicalRate = weightedSum / budgetSum;
      physicalSource = 'detail-weighted';
    }
  }

  // Fallback 1: weighted program summaries.
  if (!finite(physicalRate) && top.length) {
    const pairs = top.filter(x => finite(x.budget) && x.budget > 0 && finite(x.physical));
    const budgetSum = pairs.reduce((s, x) => s + x.budget, 0);
    if (budgetSum > 0) {
      physicalRate = pairs.reduce((s, x) => s + x.budget * x.physical, 0) / budgetSum;
      physicalSource = 'program-weighted';
    }
  }

  // 4) Nilai anggaran/keuangan tetap mengikuti baris kantor utama,
  // sama seperti Web 1.
  const office = physicalRows[officeIndex] || [];
  let budget = parse(office[2]);
  let financial = parse(office[6]);

  if (!finite(budget)) {
    const sumTop = top.reduce((s, x) => s + (finite(x.budget) ? x.budget : 0), 0);
    budget = sumTop || 0;
  }
  if (!finite(financial)) {
    const sumTop = top.reduce((s, x) => s + (finite(x.financial) ? x.financial : 0), 0);
    financial = sumTop || 0;
  }

  // Fallback terakhir hanya bila benar-benar tidak ada detail/program yang valid.
  if (!finite(physicalRate)) {
    const officeH = parse(office[7]);
    const officeE = parse(office[4]);
    const officePhysical = finite(officeH) ? officeH : officeE;
    if (finite(officePhysical)) {
      physicalRate = officePhysical;
      physicalSource = 'office-total';
    }
  }

  const financialRate = finite(budget) && budget > 0 && finite(financial)
    ? (financial / budget) * 100
    : null;

  return {
    budget: finite(budget) ? budget : 0,
    financial: finite(financial) ? financial : 0,
    financialRate: pct(financialRate),
    physicalRate: pct(physicalRate),
    remaining: Math.max(0, (finite(budget) ? budget : 0) - (finite(financial) ? financial : 0)),
    physicalSource,
    physicalRowsCount: detailPairs.length
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
  const kpi={totalAnggaran:rf.budget,realisasiKeuangan:rf.financial,serapan:rf.financialRate,realisasiFisik:rf.physicalRate,sisaDana:rf.remaining};
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
  const key=new Request(`${url.origin}/__cache/public-dashboard?year=${encodeURIComponent(year)}&v=11.3`);
  const cached=await cache.match(key);
  if(cached){
    const out=new Response(cached.body,cached); out.headers.set('x-dashboard-cache','HIT');
    const tag=out.headers.get('etag');
    if(tag && request.headers.get('if-none-match')===tag) return new Response(null,{status:304,headers:{etag:tag,'cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20'}});
    return out;
  }
  const staleKey=new Request(`${url.origin}/__cache/public-dashboard-stale?year=${encodeURIComponent(year)}&v=11.3`);
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
    const physicalKpiSource = (() => { try { return JSON.parse(body)?.kpi?.realisasiFisik != null ? 'same-snapshot' : 'missing'; } catch { return 'unknown'; } })();
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
