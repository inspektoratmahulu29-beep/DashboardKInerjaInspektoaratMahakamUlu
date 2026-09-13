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
  // Prefer the official total row / office row. Do not add detail rows when a total exists.
  let totalRow = -1;
  for (let i=0;i<rows.length;i++) {
    const joined=(rows[i]||[]).map(text).join(' ').toUpperCase();
    if (joined.includes('JUMLAH BELANJA') || joined.includes('TOTAL BELANJA')) { totalRow=i; break; }
  }
  if (totalRow<0 && rows[9]) totalRow=9;
  let budget = totalRow>=0 ? num(rows[totalRow]?.[2]) : null;
  let financial = totalRow>=0 ? num(rows[totalRow]?.[6]) : null;
  let physical = totalRow>=0 ? num(rows[totalRow]?.[4]) : null;

  if (!validNum(budget) || !validNum(financial) || !validNum(physical)) {
    // Fallback only to likely top-level program summary rows; never sum every detail row.
    const candidates=[10,25,40].filter(i=>rows[i]);
    if (!validNum(budget)) budget=candidates.reduce((s,i)=>s+(num(rows[i]?.[2])||0),0) || null;
    if (!validNum(financial)) financial=candidates.reduce((s,i)=>s+(num(rows[i]?.[6])||0),0) || null;
    if (!validNum(physical)) {
      const ps=candidates.map(i=>[num(rows[i]?.[2]),num(rows[i]?.[4])]).filter(([a,p])=>validNum(a)&&validNum(p)&&a>0);
      physical=ps.length?ps.reduce((s,[a,p])=>s+a*p,0)/ps.reduce((s,[a])=>s+a,0):null;
    }
  }
  const rate=validNum(budget)&&budget>0&&validNum(financial)?financial/budget*100:null;
  return {budget:budget||0,financial:financial||0,financialRate:pct(rate),physicalRate:pct(physical),remaining:Math.max(0,(budget||0)-(financial||0))};
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
  const key=new Request(`${url.origin}/__cache/public-dashboard?year=${encodeURIComponent(year)}&v=11`);
  const cached=await cache.match(key);
  if(cached){
    const out=new Response(cached.body,cached); out.headers.set('x-dashboard-cache','HIT');
    const tag=out.headers.get('etag');
    if(tag && request.headers.get('if-none-match')===tag) return new Response(null,{status:304,headers:{etag:tag,'cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20'}});
    return out;
  }
  const staleKey=new Request(`${url.origin}/__cache/public-dashboard-stale?year=${encodeURIComponent(year)}&v=11`);
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
    const response=new Response(body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public,max-age=2,s-maxage=8,stale-while-revalidate=20','cdn-cache-control':'public,s-maxage=8,stale-while-revalidate=20','etag':etag,'x-data-source':'google-sheets','x-dashboard-cache':'MISS'}});
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
