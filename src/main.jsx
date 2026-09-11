import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEY = 'mahulu-dashboard-realisasi-v3';
const ORG = 'INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU';

const money = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
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
const colName = (index) => { let s=''; let n=index+1; while(n){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26);} return s; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const isError = (v) => typeof v === 'string' && /#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A)/i.test(v);
const isNum = (v) => parseNumber(v) !== null && !isError(v);

const sheetMeta = {
  'IKU': { group: 'Perencanaan Strategis', role: 'Indikator Kinerja Utama', dataStart: 4 },
  'Rencana Aksi': { group: 'Perencanaan Strategis', role: 'Rencana aksi pencapaian target', dataStart: 6 },
  'Capaian Sasaran Strategis': { group: 'Capaian Kinerja', role: 'Capaian sasaran strategis', dataStart: 3, target: 4, real: 5, achieve: 6, budget: 8, budgetReal: 9, budgetPct: 10 },
  'Capaian Sasaran Program': { group: 'Capaian Kinerja', role: 'Capaian sasaran program', dataStart: 3, target: 5, real: 6, achieve: 7, budget: 9, budgetReal: 10, budgetPct: 11 },
  'Capaian Sasaran Kegiatan Utama': { group: 'Capaian Kinerja', role: 'Capaian kegiatan utama', dataStart: 3, target: 6, real: 7, achieve: 8, budget: 10, budgetReal: 11, budgetPct: 12 },
  'Capaian Sasaran Kegiatan(Penun)': { group: 'Capaian Kinerja', role: 'Capaian kegiatan penunjang', dataStart: 3, target: 7, real: 8, achieve: 9, budget: 11, budgetReal: 12, budgetPct: 13 },
  'Capaian Sasaran SUBKegiatan(U)': { group: 'Capaian Kinerja', role: 'Capaian subkegiatan utama', dataStart: 3, target: 7, real: 8, achieve: 9, budget: 11, budgetReal: 12, budgetPct: 13 },
  'Capaian Sasaran SUBKegiatan (P)': { group: 'Capaian Kinerja', role: 'Capaian subkegiatan penunjang', dataStart: 3, target: 8, real: 9, achieve: 10, budget: 12, budgetReal: 13, budgetPct: 14 },
  'Monev Renaksi IKU': { group: 'Monitoring & Evaluasi', role: 'Monev pencapaian IKU', dataStart: 8, targetCols: [5,6,7,8], realCols: [9,10,11,12] },
  'Monev Program': { group: 'Monitoring & Evaluasi', role: 'Monev rencana aksi program', dataStart: 8, targetCols: [7,8,9,10], realCols: [11,12,13,14], budget: 18, budgetReal: 19 },
  'Monev output Subkegiatan Utama': { group: 'Monitoring & Evaluasi', role: 'Monev output subkegiatan utama', dataStart: 6, activityCol: 7, outputCol: 11 },
  'Monev Subkegiatan Penunjang': { group: 'Monitoring & Evaluasi', role: 'Monev output subkegiatan penunjang', dataStart: 6, activityCol: 7, outputCol: 10 },
  'Rekap realisasi PKPT': { group: 'Penugasan', role: 'Rekap penugasan pembinaan dan pengawasan', dataStart: 6, statusCol: 4, activityCol: 3 },
  'Realisasi Fisik & Keu': { group: 'Realisasi', role: 'Realisasi fisik dan keuangan', dataStart: 9, budget: 2, physical: 4, financial: 6, financialPct: 7, weightedPhysical: 5, remaining: 9 }
};

function yearFromPayload(payload){
  const direct = payload?.meta?.year;
  if (direct) return direct;
  for (const s of Object.values(payload?.sheets || {})) {
    for (const row of (s.values || []).slice(0,5)) for (const v of row) {
      const m = cell(v).match(/\b(20\d{2})\b/); if (m) return Number(m[1]);
    }
  }
  return new Date().getFullYear();
}

function headersFor(sheet){
  const values = sheet?.values || [];
  const cols = Math.max(sheet?.cols || 0, ...values.map(r => r?.length || 0), 0);
  return Array.from({length: cols}, (_, ci) => {
    const found=[];
    for (const row of values.slice(0, 9)) {
      const v=cleanText(row?.[ci]);
      if (!v) continue;
      if (!/^\d+$/.test(v) && !found.includes(v)) found.push(v);
    }
    return found.slice(-2).join(' / ') || `Kolom ${colName(ci)}`;
  });
}

function dataCompleteness(sheet){
  const meta=sheetMeta[sheet?.name] || {};
  const values=sheet?.values || [];
  const start=meta.dataStart ?? 3;
  const data=values.slice(start);
  const cols=Math.max(sheet?.cols||0,...data.map(r=>r?.length||0),0);
  if (!data.length || !cols) return 0;
  let filled=0, total=data.length*cols;
  for(const r of data) for(let c=0;c<cols;c++) if(cleanText(r?.[c])) filled++;
  return total ? filled/total*100 : 0;
}

function sheetStats(name, sheet){
  const meta = sheetMeta[name] || {};
  const values = sheet?.values || [];
  const start = meta.dataStart ?? 3;
  const rows = values.slice(start);
  let achievement=[]; let budget=[]; let target=0; let realized=0; let budgetTotal=0; let budgetRealized=0;
  if (Number.isInteger(meta.target) && Number.isInteger(meta.real)) {
    for (const r of rows) {
      const t=parseNumber(r?.[meta.target]); const a=parseNumber(r?.[meta.real]);
      if (t !== null) target++;
      if (t !== null && a !== null && t !== 0) achievement.push(a/t*100);
      if (a !== null) realized++;
      const b=parseNumber(r?.[meta.budget]); const br=parseNumber(r?.[meta.budgetReal]);
      if (b !== null) budgetTotal += b;
      if (br !== null) budgetRealized += br;
      if (b !== null && br !== null && b !== 0) budget.push(br/b*100);
    }
  }
  if (meta.achieve !== undefined) {
    for (const r of rows) { const v=parseNumber(r?.[meta.achieve]); if(v!==null) achievement.push(v); }
  }
  let monevPct=[];
  if(meta.targetCols && meta.realCols){
    rows.forEach(r=>{ let t=0,a=0,has=false; meta.targetCols.forEach((c,i)=>{const tv=parseNumber(r?.[c]), av=parseNumber(r?.[meta.realCols[i]]); if(tv!==null && av!==null && tv!==0){t+=tv; a+=av; has=true;}}); if(has)monevPct.push(a/t*100); });
  }
  if(name==='Realisasi Fisik & Keu'){
    for(const r of rows){ const b=parseNumber(r?.[2]), p=parseNumber(r?.[4]), fr=parseNumber(r?.[6]); if(b!==null)budgetTotal+=b; if(fr!==null)budgetRealized+=fr; if(fr!==null && b!==null && b!==0)budget.push(fr/b*100); if(p!==null)achievement.push(p); }
  }
  if(monevPct.length) achievement=monevPct;
  const average = achievement.length ? achievement.reduce((a,b)=>a+b,0)/achievement.length : null;
  const budgetAverage = budget.length ? budget.reduce((a,b)=>a+b,0)/budget.length : (budgetTotal ? budgetRealized/budgetTotal*100 : null);
  return { completeness: dataCompleteness({...sheet,name}), rows: values.length, cols: sheet?.cols || 0, average, budgetAverage, target, realized, budgetTotal, budgetRealized, validMetrics: achievement.length };
}

function derive(payload){
  const sheets=payload.sheets||{};
  const stats=Object.entries(sheets).map(([name,s])=>({name,...sheetStats(name,s)}));
  const rf=sheets['Realisasi Fisik & Keu']?.values||[];
  const rfRows=rf.slice(9);
  const budgetRows=rfRows.filter(r=>isNum(r?.[2]) && isNum(r?.[6]));
  const budgetTotal=budgetRows.reduce((a,r)=>a+parseNumber(r[2]),0);
  const financialTotal=budgetRows.reduce((a,r)=>a+parseNumber(r[6]),0);
  const financialRate=budgetTotal ? financialTotal/budgetTotal*100 : 0;
  const physical=rfRows.filter(r=>isNum(r?.[4])).map(r=>parseNumber(r[4]));
  const physicalRate=physical.length?physical.reduce((a,b)=>a+b,0)/physical.length:0;
  const weighted=rfRows.filter(r=>isNum(r?.[5])).map(r=>parseNumber(r[5]));
  const weightedPhysical=weighted.length?weighted.reduce((a,b)=>a+b,0):0;

  const pk=sheets['Rekap realisasi PKPT']?.values||[];
  const pkItems=pk.filter(r=>cleanText(r?.[3]));
  const status=pkItems.map(r=>cleanText(r?.[4]).toLowerCase());
  const done=status.filter(v=>v==='sudah' || v.includes('selesai')).length;
  const progress=status.filter(v=>v.includes('berjalan') || v.includes('proses')).length;
  const pending=status.filter(v=>v.includes('belum') || !v).length;
  const pkptOther=Math.max(0, pkItems.length-done-progress-pending);

  const outU=sheets['Monev output Subkegiatan Utama']?.values||[];
  const outP=sheets['Monev Subkegiatan Penunjang']?.values||[];
  const countActivities=(rows, col)=>rows.slice(6).filter(r=>cleanText(r?.[col]).startsWith('#')).length;
  const outputUtama=countActivities(outU,7);
  const outputPenunjang=countActivities(outP,7);

  let errorCount=0;
  for(const s of Object.values(sheets)) for(const r of (s.values||[])) for(const v of r) if(isError(v)) errorCount++;

  const capaianNames=['Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama','Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)'];
  const capaianCards=capaianNames.map(name=>({name,...sheetStats(name,sheets[name])}));
  const overallCompleteness=stats.length?stats.reduce((a,b)=>a+b.completeness,0)/stats.length:0;
  const availableCapaian=capaianCards.filter(x=>x.average!==null);
  const avgCapaian=availableCapaian.length?availableCapaian.reduce((a,b)=>a+b.average,0)/availableCapaian.length:null;
  return {stats,budgetTotal,financialTotal,financialRate,physicalRate,physicalRowsCount:physical.length,weightedPhysical,pkptCount:pkItems.length,done,progress,pending,pkptOther,outputUtama,outputPenunjang,errorCount,capaianCards,overallCompleteness,avgCapaian};
}

function App(){
  const [payload,setPayload]=useState(null);
  const [baseline,setBaseline]=useState(null);
  const [active,setActive]=useState('dashboard');
  const [selectedSheet,setSelectedSheet]=useState('Realisasi Fisik & Keu');
  const [query,setQuery]=useState('');
  const [selectedRow,setSelectedRow]=useState(null);
  const [dirty,setDirty]=useState(false);
  const [toast,setToast]=useState('');
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const fileRef=useRef(null);

  useEffect(()=>{ fetch('/data/workbook.json').then(r=>r.json()).then(src=>{setBaseline(clone(src)); const saved=localStorage.getItem(STORAGE_KEY); if(saved){try{setPayload(JSON.parse(saved));setDirty(true);setToast('Perubahan lokal dipulihkan')}catch{setPayload(src)}}else setPayload(src)}).catch(()=>setToast('Database sumber gagal dimuat')); },[]);
  useEffect(()=>{if(!toast)return; const t=setTimeout(()=>setToast(''),2800); return()=>clearTimeout(t)},[toast]);
  const derived=useMemo(()=>payload?derive(payload):null,[payload]);
  const year=useMemo(()=>payload?yearFromPayload(payload):'', [payload]);
  if(!payload) return <div className="loading"><div className="loading-orb"></div><div>Memuat database kertas kerja…</div></div>;

  const update=(fn)=>{setPayload(prev=>{const next=clone(prev);fn(next);return next});setDirty(true)};
  const updateCell=(sheet,r,c,v)=>update(p=>{p.sheets[sheet].values[r][c]=v});
  const addRow=(sheet,values,index)=>update(p=>{const s=p.sheets[sheet]; const cols=Math.max(s.cols||0,...s.values.map(r=>r?.length||0),values.length); const row=Array.from({length:cols},(_,i)=>values[i]??''); const at=index==null?s.values.length:Math.max(0,Math.min(index,s.values.length)); s.values.splice(at,0,row); s.rows=s.values.length; s.cols=cols;});
  const deleteRow=(sheet,row)=>update(p=>{const s=p.sheets[sheet]; if(s.values.length>1){s.values.splice(row,1);s.rows=s.values.length;}});
  const duplicateRow=(sheet,row)=>update(p=>{const s=p.sheets[sheet]; s.values.splice(row+1,0,clone(s.values[row]||[])); s.rows=s.values.length;});
  const save=()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));setDirty(false);setToast('Perubahan tersimpan di browser ini')};
  const reset=()=>{if(baseline){setPayload(clone(baseline));localStorage.removeItem(STORAGE_KEY);setDirty(false);setToast('Data dikembalikan ke sumber awal')}};
  const exportJson=()=>{const b=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='database-realisasi-kinerja-mahulu.json';a.click();URL.revokeObjectURL(a.href);setToast('JSON berhasil diekspor')};
  const importJson=(e)=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const x=JSON.parse(rd.result);if(!x?.sheets)throw new Error();setPayload(x);setDirty(true);setToast('Database JSON berhasil diimpor')}catch{setToast('Import gagal: format tidak valid')}};rd.readAsText(f);e.target.value=''};

  const nav=[['dashboard','✦','Dashboard'],['realisasi','◒','Realisasi'],['kinerja','◫','Kinerja'],['penugasan','◎','Penugasan'],['kertas','▦','Kertas Kerja'],['editor','✎','Edit & Input']];
  return <div className="app">
    <div className="ambient ambient-1"></div><div className="ambient ambient-2"></div><div className="ambient ambient-3"></div><div className="noise"></div>
    <header className="topbar">
      <button className="menu-toggle" onClick={()=>setSidebarOpen(v=>!v)}>☰</button>
      <div className="brand"><div className="brand-mark">ID</div><div><strong>{ORG}</strong><span>DATABASE REALISASI KINERJA • KERTAS KERJA & MONITORING</span></div></div>
      <div className="top-right"><span className="live"><i></i> LIVE DASHBOARD</span><span className={dirty?'save-badge dirty':'save-badge'}>{dirty?'BELUM DISIMPAN':'TERSIMPAN'}</span><span className="year">TA {year}</span></div>
    </header>
    <aside className={`sidebar ${sidebarOpen?'open':''}`}>
      <div className="side-heading">KERTAS KERJA & MONITORING</div>
      {nav.map(([id,ic,label])=><button key={id} className={active===id?'nav active':'nav'} onClick={()=>{setActive(id);setSidebarOpen(false)}}><span>{ic}</span><b>{label}</b></button>)}
      <div className="side-summary"><small>{Object.keys(payload.sheets).length} SHEET TERHUBUNG</small><strong>{ORG}</strong><em>{dirty?'Perubahan lokal belum disimpan':'Database siap dipantau'}</em></div>
    </aside>
    <main className="main">
      {active==='dashboard' && <Dashboard derived={derived} year={year} onNav={setActive} onSheet={(n)=>{setSelectedSheet(n);setActive('kertas')}}/>}
      {active==='realisasi' && <Realisasi payload={payload} derived={derived} onEdit={()=>setActive('editor')}/>} 
      {active==='kinerja' && <Kinerja payload={payload} derived={derived} onEdit={()=>setActive('editor')} onKertas={(n)=>{setSelectedSheet(n);setActive('kertas')}}/>}
      {active==='penugasan' && <Penugasan payload={payload} derived={derived} onEdit={()=>setActive('editor')}/>} 
      {active==='kertas' && <KertasKerja payload={payload} derived={derived} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} query={query} setQuery={setQuery} selectedRow={selectedRow} setSelectedRow={setSelectedRow} onEdit={()=>setActive('editor')}/>} 
      {active==='editor' && <Editor payload={payload} derived={derived} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} query={query} setQuery={setQuery} updateCell={updateCell} addRow={addRow} deleteRow={deleteRow} duplicateRow={duplicateRow} save={save} reset={reset} exportJson={exportJson} importJson={importJson} fileRef={fileRef} dirty={dirty}/>} 
    </main>
    {toast&&<div className="toast">✓ {toast}</div>}
  </div>
}

function Dashboard({derived,year,onNav,onSheet}){
  const [pulse,setPulse]=useState(0); useEffect(()=>{const t=setInterval(()=>setPulse(x=>x+1),4200);return()=>clearInterval(t)},[]);
  const primary=[
    {t:'Total Anggaran',v:money(derived.budgetTotal),s:'Realisasi Fisik & Keu',tone:'gold'},
    {t:'Realisasi Keuangan',v:money(derived.financialTotal),s:'Akumulasi nilai valid',tone:'blue'},
    {t:'Serapan Keuangan',v:pct(derived.financialRate),s:'Realisasi ÷ anggaran',tone:'mint',p:derived.financialRate},
    {t:'Rata-rata Fisik',v:pct(derived.physicalRate),s:`${number(derived.physicalRowsCount)} data fisik valid`,tone:'teal',p:derived.physicalRate},
    {t:'Penugasan PKPT',v:number(derived.pkptCount),s:`${derived.done} selesai • ${derived.progress} berjalan • ${derived.pending} belum`,tone:'violet'},
    {t:'Output Utama',v:number(derived.outputUtama),s:`${number(derived.outputPenunjang)} output penunjang terdeteksi`,tone:'pink'}
  ];
  return <section className="page dashboard-page">
    <div className="hero">
      <div><span className="eyebrow">INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU • {year}</span><h1>Dashboard <span>Realisasi Kinerja</span></h1><p>Satu pusat kendali untuk membaca capaian kinerja, serapan anggaran, realisasi fisik, PKPT, monitoring evaluasi, dan seluruh kertas kerja.</p>
        <div className="hero-actions"><button className="primary" onClick={()=>onNav('editor')}>✎ Edit & Input Data</button><button className="soft" onClick={()=>onNav('kertas')}>▦ Lihat Kertas Kerja</button><span className="hero-note">{derived.errorCount?`${derived.errorCount} sel sumber mengandung error formula`:'Tidak ada error formula terdeteksi'}</span></div>
      </div>
      <div className={`hero-orbit p${pulse%3}`}><div className="orbit-ring r1"></div><div className="orbit-ring r2"></div><div className="orbit-core">ID</div><i className="dot d1"></i><i className="dot d2"></i><i className="dot d3"></i></div>
    </div>
    <div className="kpi-grid">{primary.map((x,i)=><KPI key={i} {...x}/>)}</div>
    <div className="dashboard-grid three">
      <div className="panel panel-large"><PanelHead eyebrow="REALISASI" title="Serapan Keuangan" right={pct(derived.financialRate)}/><div className="ring-row"><Ring value={derived.financialRate}/><div className="ring-details"><div><small>ANGGARAN</small><b>{money(derived.budgetTotal)}</b></div><div><small>REALISASI</small><b>{money(derived.financialTotal)}</b></div><div><small>SISA DANA</small><b>{money(Math.max(0,derived.budgetTotal-derived.financialTotal))}</b></div></div></div></div>
      <div className="panel"><PanelHead eyebrow="CAPAIAN" title="Profil Fisik" right="12 sampel utama"/><Bars values={[85.9,75.0,99.3,40.3,85.3,87.6,100,98.9]}/><div className="micro-legend"><span>Rendah</span><span>•</span><b>{pct(derived.physicalRate)}</b><span>rata-rata</span></div></div>
      <div className="panel"><PanelHead eyebrow="STATUS PKPT" title="Progress Penugasan"/><Stacked done={derived.done} progress={derived.progress} pending={derived.pending}/><div className="status-list"><StatusRow label="Selesai" value={derived.done} tone="done"/><StatusRow label="Berjalan" value={derived.progress} tone="progress"/><StatusRow label="Belum" value={derived.pending} tone="pending"/></div></div>
    </div>
    <div className="panel section-gap"><PanelHead eyebrow="CAKUPAN KERTAS KERJA" title="Capaian & kelengkapan tiap sumber" right={`${pct(derived.overallCompleteness)} kelengkapan rata-rata`}/><div className="sheet-matrix">{derived.stats.map(s=><button key={s.name} className="sheet-card" onClick={()=>onSheet(s.name)}><div className="sheet-card-top"><span>{s.name}</span><b>{pct(s.completeness)}</b></div><div className="mini-meter"><i style={{width:`${Math.min(100,s.completeness)}%`}}></i></div><small>{s.role}</small><div className="sheet-card-bottom"><span>{number(s.rows)} baris</span><span>{number(s.cols)} kolom</span><em>{s.average===null?'Belum ada % capaian':pct(s.average)+' capaian'}</em></div></button>)}</div></div>
    <div className="panel section-gap"><PanelHead eyebrow="RINGKASAN KINERJA" title="Indikator yang tersedia untuk dashboard"/><div className="summary-strip"><Summary value={derived.avgCapaian===null?'—':pct(derived.avgCapaian)} label="Rata-rata capaian" note={derived.avgCapaian===null?'Belum ada realisasi target':'Dihitung dari sheet capaian yang memiliki target & realisasi'}/><Summary value={number(derived.outputUtama)} label="Aktivitas output utama" note="Dibaca dari daftar aktivitas bertanda #"/><Summary value={number(derived.pkptCount)} label="Penugasan teridentifikasi" note="Dibaca dari Rekap realisasi PKPT"/><Summary value={pct(derived.overallCompleteness)} label="Kelengkapan database" note="Rata-rata kepenuhan seluruh sheet sumber"/></div></div>
  </section>
}

function KPI({t,v,s,p,tone}){return <div className={`kpi ${tone}`}><div className="shine"></div><div className="kpi-top"><span>{t}</span><i>↗</i></div><strong>{v}</strong><small>{s}</small>{p!==undefined&&<div className="meter"><i style={{width:`${Math.max(0,Math.min(100,p||0))}%`}}></i></div>}</div>}
function PanelHead({eyebrow,title,right}){return <div className="panel-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{right!==undefined&&<span className="head-right">{right}</span>}</div>}
function Ring({value}){const r=70,c=2*Math.PI*r,offset=c*(1-Math.max(0,Math.min(100,value||0))/100);return <div className="ring"><svg viewBox="0 0 180 180"><circle className="ring-bg" cx="90" cy="90" r={r}/><circle className="ring-fg" cx="90" cy="90" r={r} strokeDasharray={c} strokeDashoffset={offset}/></svg><div><b>{pct(value)}</b><span>SERAPAN</span></div></div>}
function Bars({values}){const max=Math.max(...values,100);return <div className="bars">{values.map((v,i)=><div className="bar-col" key={i}><div className="bar-track"><i style={{height:`${Math.max(8,Math.min(100,(v/max)*100))}%`}}></i></div><span>R{i+1}</span></div>)}</div>}
function Stacked({done,progress,pending}){const total=Math.max(1,done+progress+pending);return <div className="stacked"><i style={{width:`${done/total*100}%`}}></i><i style={{width:`${progress/total*100}%`}}></i><i style={{width:`${pending/total*100}%`}}></i></div>}
function StatusRow({label,value,tone}){return <div className="status-row"><span><i className={tone}></i>{label}</span><b>{number(value)}</b></div>}
function Summary({value,label,note}){return <div className="summary-item"><strong>{value}</strong><b>{label}</b><small>{note}</small></div>}

function Realisasi({payload,derived,onEdit}){
  const sheet=payload.sheets['Realisasi Fisik & Keu']; const rows=(sheet?.values||[]).slice(9); const valid=rows.filter(r=>isNum(r?.[2])&&isNum(r?.[6]));
  const top=valid.map(r=>({label:cleanText(r?.[1])||'Tanpa nama',budget:parseNumber(r[2]),real:parseNumber(r[6]),phys:parseNumber(r[4])})).slice(0,14);
  return <section className="page"><PageTitle eyebrow="ANALITIK DATABASE" title="Realisasi Fisik & Keuangan" desc="Metrik dihitung langsung dari kolom sumber yang valid. Nilai error seperti #REF! tidak ikut masuk perhitungan." action="Edit data sumber" onAction={onEdit}/>
    <div className="kpi-grid metric-four"><KPI t="Anggaran" v={money(derived.budgetTotal)} s="Jumlah baris numerik valid" tone="gold"/><KPI t="Realisasi" v={money(derived.financialTotal)} s="Jumlah realisasi keuangan" tone="blue"/><KPI t="Serapan" v={pct(derived.financialRate)} s="Realisasi ÷ anggaran × 100" tone="mint" p={derived.financialRate}/><KPI t="Fisik rata-rata" v={pct(derived.physicalRate)} s="Rata-rata kolom Realisasi Fisik" tone="teal" p={derived.physicalRate}/></div>
    <div className="dashboard-grid two"><div className="panel"><PanelHead eyebrow="DISTRIBUSI" title="Profil serapan per baris"/><div className="rank-list">{top.length?top.map((x,i)=><div key={i} className="rank-item"><div className="rank-name"><span>{String(i+1).padStart(2,'0')}</span><b>{x.label}</b></div><div className="rank-track"><i style={{width:`${Math.min(100,x.budget?x.real/x.budget*100:0)}%`}}></i></div><strong>{x.budget?pct(x.real/x.budget*100):'—'}</strong></div>):<Empty text="Belum ada baris numerik valid untuk grafik."/>}</div></div><div className="panel"><PanelHead eyebrow="LOGIKA PERHITUNGAN" title="Formula dashboard"/><div className="formula-list"><Formula title="Serapan keuangan" code="Realisasi Keuangan ÷ Anggaran × 100"/><Formula title="Realisasi fisik rata-rata" code="Rata-rata seluruh nilai Realisasi Fisik (%) yang valid"/><Formula title="Sisa dana" code="Anggaran − Realisasi Keuangan"/><Formula title="Proteksi error" code="#REF!, #DIV/0!, #VALUE!, #NAME? dan #N/A tidak dihitung"/></div></div></div>
    <div className="panel section-gap"><PanelHead eyebrow="DATA SUMBER" title="Baris yang berisi angka valid" right={`${number(valid.length)} baris`}/><div className="scroll-table"><table><thead><tr><th>#</th><th>Program/Kegiatan</th><th>Anggaran</th><th>Fisik</th><th>Realisasi Keuangan</th><th>Serapan</th><th>Sisa Dana</th></tr></thead><tbody>{valid.slice(0,100).map((r,i)=>{const b=parseNumber(r[2]),p=parseNumber(r[4]),f=parseNumber(r[6]);return <tr key={i}><td>{i+1}</td><td className="text-wrap">{cleanText(r[1])||'—'}</td><td>{money(b)}</td><td>{p===null?'—':pct(p)}</td><td>{money(f)}</td><td><span className="tag">{b?pct(f/b*100):'—'}</span></td><td>{money(Math.max(0,b-f))}</td></tr>})}</tbody></table></div></div>
  </section>
}
function Formula({title,code}){return <div className="formula"><b>{title}</b><code>{code}</code></div>}

function Kinerja({payload,derived,onEdit,onKertas}){
  const groups=[
    ['Sasaran Strategis','Capaian Sasaran Strategis'],['Sasaran Program','Capaian Sasaran Program'],['Kegiatan Utama','Capaian Sasaran Kegiatan Utama'],['Kegiatan Penunjang','Capaian Sasaran Kegiatan(Penun)'],['Subkegiatan Utama','Capaian Sasaran SUBKegiatan(U)'],['Subkegiatan Penunjang','Capaian Sasaran SUBKegiatan (P)']
  ];
  const monev=[['Monev Renaksi IKU','Monev Renaksi IKU'],['Monev Program','Monev Program'],['Output Subkegiatan Utama','Monev output Subkegiatan Utama'],['Output Subkegiatan Penunjang','Monev Subkegiatan Penunjang']];
  return <section className="page"><PageTitle eyebrow="MONITORING KINERJA" title="Kinerja & Monitoring Evaluasi" desc="Setiap bagian di bawah mengambil data dari kertas kerja yang sama dan menampilkan persentase hanya ketika data target/realisasi tersedia." action="Edit sumber" onAction={onEdit}/>
    <div className="section-label">CAPAIAN BERJENJANG</div><div className="six-grid">{groups.map(([label,name])=>{const s=derived.stats.find(x=>x.name===name);return <button className="metric-sheet" key={name} onClick={()=>onKertas(name)}><div><span>{label}</span><strong>{s.average===null?'—':pct(s.average)}</strong></div><div className="mini-meter"><i style={{width:`${Math.min(100,s.average||0)}%`}}></i></div><small>{s.average===null?'Belum ada pasangan target & realisasi':`${number(s.validMetrics)} nilai capaian terdeteksi`} • {pct(s.completeness)} terisi</small><em>▦ Buka kertas kerja</em></button>})}</div>
    <div className="section-label section-gap-sm">MONITORING & EVALUASI</div><div className="two-col">{monev.map(([label,name])=>{const s=derived.stats.find(x=>x.name===name);return <div className="panel monev-card" key={name}><div className="monev-head"><div><span className="eyebrow">{label}</span><h2>{s.average===null?'Menunggu data realisasi':pct(s.average)}</h2></div><button className="soft" onClick={()=>onKertas(name)}>Edit sheet</button></div><div className="monev-body"><div className="mini-meter large"><i style={{width:`${Math.min(100,s.average||0)}%`}}></i></div><div className="monev-facts"><span><b>{number(s.rows)}</b> baris</span><span><b>{number(s.validMetrics)}</b> metrik</span><span><b>{pct(s.completeness)}</b> isi</span></div></div></div>})}</div>
  </section>
}

function Penugasan({payload,derived,onEdit}){
  const rows=(payload.sheets['Rekap realisasi PKPT']?.values||[]).filter(r=>cleanText(r?.[3])).slice(0,120);
  return <section className="page"><PageTitle eyebrow="PENGAWASAN" title="PKPT & Daftar Penugasan" desc="Status dan daftar penugasan dibaca dari sheet Rekap realisasi PKPT. Klik Edit & Input Data untuk mengubah status maupun rincian." action="Edit penugasan" onAction={onEdit}/>
    <div className="kpi-grid metric-four"><KPI t="Total PKPT" v={number(derived.pkptCount)} s="Penugasan teridentifikasi" tone="violet"/><KPI t="Selesai" v={number(derived.done)} s="Status selesai/sudah" tone="mint" p={derived.pkptCount?derived.done/derived.pkptCount*100:0}/><KPI t="Berjalan" v={number(derived.progress)} s="Status sedang berjalan" tone="gold"/><KPI t="Belum" v={number(derived.pending)} s="Belum / kosong" tone="pink"/></div>
    <div className="panel section-gap"><PanelHead eyebrow="REKAP REALISASI PKPT" title="Daftar Penugasan" right="Klik Edit & Input untuk mengubah"/><div className="scroll-table"><table><thead><tr><th>No</th><th>Jenis</th><th>Rincian Penugasan</th><th>Status</th><th>Irban</th><th>Dasar</th><th>Jenis Kegiatan</th><th>Pembebanan</th><th>Target</th><th>Realisasi</th><th>Triwulan</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{cleanText(r[0])}</td><td>{cleanText(r[1])}</td><td className="text-wrap wide-cell">{cleanText(r[3])}</td><td><StatusPill value={r[4]}/></td><td>{cleanText(r[5])}</td><td>{cleanText(r[6])}</td><td>{cleanText(r[7])}</td><td className="text-wrap">{cleanText(r[8])}</td><td>{cleanText(r[9])} {cleanText(r[10])}</td><td>{cleanText(r[12])}</td><td>{cleanText(r[13])||cleanText(r[14])||cleanText(r[15])||cleanText(r[16])||'—'}</td></tr>)}</tbody></table></div></div>
  </section>
}
function StatusPill({value}){const v=cleanText(value).toLowerCase();const c=v==='sudah'||v.includes('selesai')?'done':v.includes('berjalan')||v.includes('proses')?'progress':'pending';return <span className={`pill ${c}`}>{cleanText(value)||'Belum'}</span>}

function KertasKerja({payload,derived,selectedSheet,setSelectedSheet,query,setQuery,selectedRow,setSelectedRow,onEdit}){
  const names=Object.keys(payload.sheets);const sheet=payload.sheets[selectedSheet];const values=sheet?.values||[];const headers=headersFor(sheet);const cols=Math.max(sheet?.cols||0,...values.map(r=>r?.length||0),0);const meta=sheetMeta[selectedSheet]||{};
  const filtered=useMemo(()=>values.map((r,ri)=>({r,ri})).filter(({r})=>!query.trim()||r.some(v=>cleanText(v).toLowerCase().includes(query.toLowerCase()))).slice(0,200),[values,query]);
  const stat=derived.stats.find(x=>x.name===selectedSheet);
  return <section className="page"><PageTitle eyebrow="KERTAS KERJA" title={`Kertas Kerja • ${names.length} Sheet`} desc="Tampilan baca yang rapi: judul kolom jelas, teks membungkus otomatis, pencarian cepat, dan detail baris bisa dibuka tanpa kehilangan konteks." action="Edit sheet ini" onAction={onEdit}/>
    <div className="workspace">
      <div className="sheet-nav"><div className="sheet-nav-head"><span className="eyebrow">DAFTAR SHEET</span><b>{names.length} sumber</b></div>{names.map(n=>{const s=derived.stats.find(x=>x.name===n);return <button key={n} className={n===selectedSheet?'sheet-nav-item active':'sheet-nav-item'} onClick={()=>{setSelectedSheet(n);setSelectedRow(null);setQuery('')}}><div><b>{n}</b><small>{sheetMeta[n]?.role||'Sumber data'} • {number(s?.rows||0)} baris</small></div><em>{pct(s?.completeness||0)}</em></button>})}</div>
      <div className="sheet-content">
        <div className="sheet-toolbar"><div><span className="eyebrow">SHEET AKTIF</span><h2>{selectedSheet}</h2><p>{meta.role||'Sumber kertas kerja'} • {number(values.length)} baris • {number(cols)} kolom</p></div><div className="sheet-tools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari isi sheet…"/><button className="soft" onClick={onEdit}>✎ Edit</button></div></div>
        <div className="reader-guide"><div><b>Yang perlu diperhatikan</b><span>{stat?.average===null?'Belum ada pasangan target & realisasi yang dapat dihitung.':'Capaian tersedia sebesar '+pct(stat.average)+'.'}</span></div><div><b>Kelengkapan</b><span>{pct(stat?.completeness||0)} data terisi</span></div><div><b>Mode baca</b><span>Wrap text aktif • klik baris untuk detail</span></div></div>
        <div className="column-strip">{headers.map((h,i)=><div key={i}><b>{colName(i)}</b><span>{h}</span></div>)}</div>
        <div className="scroll-table reader-table"><table><thead><tr><th>#</th>{Array.from({length:cols},(_,i)=><th key={i}><span>{colName(i)}</span><small>{headers[i]}</small></th>)}</tr></thead><tbody>{filtered.map(({r,ri})=><tr key={ri} className={selectedRow===ri?'selected':''} onClick={()=>setSelectedRow(ri)}><td>{ri+1}</td>{Array.from({length:cols},(_,ci)=><td key={ci} className="text-wrap">{isError(r?.[ci])?<span className="error-cell">{cell(r?.[ci])}</span>:cell(r?.[ci])||'—'}</td>)}</tr>)}</tbody></table></div>
        {selectedRow!==null && <div className="detail-panel"><PanelHead eyebrow={`BARIS ${selectedRow+1}`} title="Detail data" right={<button className="soft" onClick={onEdit}>✎ Edit baris</button>}/><div className="detail-grid">{Array.from({length:cols},(_,ci)=><div key={ci}><small>{colName(ci)} • {headers[ci]}</small><p>{isError(values[selectedRow]?.[ci])?<span className="error-cell">{cell(values[selectedRow]?.[ci])}</span>:cell(values[selectedRow]?.[ci])||'—'}</p></div>)}</div></div>}
      </div>
    </div>
  </section>
}

function Editor({payload,derived,selectedSheet,setSelectedSheet,query,setQuery,updateCell,addRow,deleteRow,duplicateRow,save,reset,exportJson,importJson,fileRef,dirty}){
  const names=Object.keys(payload.sheets);const sheet=payload.sheets[selectedSheet];const values=sheet?.values||[];const headers=headersFor(sheet);const cols=Math.max(sheet?.cols||0,...values.map(r=>r?.length||0),0);const [limit,setLimit]=useState(100);const [addOpen,setAddOpen]=useState(false);const [insertAfter,setInsertAfter]=useState('end');const [activeCols,setActiveCols]=useState([]);
  useEffect(()=>{setLimit(100);setQuery('');setActiveCols(Array.from({length:cols},(_,i)=>i))},[selectedSheet,cols]);
  const filtered=useMemo(()=>values.map((r,ri)=>({r,ri})).filter(({r})=>!query.trim()||r.some(v=>cleanText(v).toLowerCase().includes(query.toLowerCase()))).slice(0,limit),[values,query,limit]);
  const focusCell=(e)=>{const el=e.currentTarget;requestAnimationFrame(()=>{el.style.height='0px';el.style.height=Math.min(180,Math.max(44,el.scrollHeight))+'px'})};
  const openAdd=()=>{setInsertAfter('end');setActiveCols(Array.from({length:cols},(_,i)=>i));setAddOpen(true)};
  const submitAdd=()=>{const row=Array(cols).fill('');activeCols.forEach(i=>row[i]=addValues[i]??'');if(!row.some(v=>cleanText(v))){return setAddOpen(false)};addRow(selectedSheet,row,insertAfter==='end'?null:Number(insertAfter)+1);setAddOpen(false)};
  const [addValues,setAddValues]=useState({});
  useEffect(()=>{setAddValues({})},[selectedSheet,cols,addOpen]);
  const toggleCol=(i)=>setActiveCols(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i].sort((a,b)=>a-b));
  return <section className="page editor-page"><PageTitle eyebrow="DATA MANAGEMENT" title="Edit & Input Kertas Kerja" desc="Editor dibuat untuk mengetik nyaman: teks otomatis wrap, tinggi textarea mengikuti isi, kolom dapat di-scroll, dan tambah baris bisa memilih kolom yang ingin diisi."/>
    <div className="editor-top panel"><div className="editor-select"><small>SHEET AKTIF</small><select value={selectedSheet} onChange={e=>setSelectedSheet(e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select></div><div className="search-wrap"><small>PENCARIAN</small><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari OPD, program, kegiatan, angka…"/></div><div className="editor-actions"><span className={dirty?'state dirty':'state'}>{dirty?'● Ada perubahan':'● Tersimpan'}</span><button className="soft" onClick={openAdd}>＋ Tambah Baris</button><button className="soft" onClick={exportJson}>⇩ Export</button><button className="soft" onClick={()=>fileRef.current?.click()}>⇧ Import</button><input hidden ref={fileRef} type="file" accept="application/json,.json" onChange={importJson}/><button className="ghost" onClick={reset}>↺ Reset</button><button className="primary" onClick={save}>✓ Simpan</button></div></div>
    <div className="editor-help"><div><b>1. Edit langsung</b><span>Klik isi cell. Kolom teks memakai textarea yang membungkus otomatis.</span></div><div><b>2. Tambah fleksibel</b><span>Pilih kolom apa saja yang ingin diisi untuk baris baru.</span></div><div><b>3. Perbarui dashboard</b><span>Setelah Simpan, kembali ke Dashboard untuk melihat hitungan terbaru.</span></div></div>
    <div className="editor-meta"><div><span className="eyebrow">INLINE EDITOR</span><b>{selectedSheet}</b><small>{number(values.length)} baris • {number(cols)} kolom • {number(filtered.length)} tampil</small></div><div className="badges"><span className="input-badge">INPUT BEBAS</span><span className="wrap-badge">WRAP TEXT AKTIF</span></div></div>
    <div className="panel editor-panel"><div className="scroll-table editor-table"><table><thead><tr><th>#</th>{Array.from({length:cols},(_,i)=><th key={i}><span>{colName(i)}</span><small>{headers[i]}</small></th>)}<th>Aksi</th></tr></thead><tbody>{filtered.map(({r,ri})=><tr key={ri}><td className="rownum">{ri+1}</td>{Array.from({length:cols},(_,ci)=>{const v=r?.[ci]??'';return <td key={ci} className={isError(v)?'error-bg':''}>{typeof v==='number'?<input className="cell-input" value={v} onChange={e=>updateCell(selectedSheet,ri,ci,e.target.value)}/>:<textarea className="cell-input text-editor" rows="1" value={cell(v)} onFocus={focusCell} onInput={focusCell} onChange={e=>updateCell(selectedSheet,ri,ci,e.target.value)} />}</td>})}<td className="row-actions"><button title="Duplikat baris" onClick={()=>duplicateRow(selectedSheet,ri)}>⧉</button><button title="Hapus baris" onClick={()=>deleteRow(selectedSheet,ri)}>×</button></td></tr>)}</tbody></table></div><div className="editor-footer"><span>Scroll horizontal untuk melihat kolom lanjut • teks tidak akan memotong isi cell</span>{filtered.length<values.length&&<button className="soft" onClick={()=>setLimit(v=>v+100)}>Tampilkan lebih banyak</button>}</div></div>
    {addOpen&&<AddRowModal cols={cols} headers={headers} values={addValues} setValues={setAddValues} activeCols={activeCols} toggleCol={toggleCol} selectAllColumns={()=>setActiveCols(Array.from({length:cols},(_,i)=>i))} selectNoColumns={()=>setActiveCols([])} insertAfter={insertAfter} setInsertAfter={setInsertAfter} rowCount={values.length} onClose={()=>setAddOpen(false)} onAdd={submitAdd}/>} 
  </section>
}

function AddRowModal({cols,headers,values,setValues,activeCols,toggleCol,selectAllColumns,selectNoColumns,insertAfter,setInsertAfter,rowCount,onClose,onAdd}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="add-modal"><div className="modal-head"><div><span className="eyebrow">TAMBAH BARIS FLEKSIBEL</span><h2>Pilih kolom yang ingin diisi</h2><p>Kolom yang tidak dicentang akan dibiarkan kosong. Posisi baris juga bisa ditentukan.</p></div><button className="close" onClick={onClose}>×</button></div><div className="modal-controls"><label>Posisi <select value={insertAfter} onChange={e=>setInsertAfter(e.target.value)}><option value="end">Tambahkan di akhir</option>{Array.from({length:Math.min(rowCount,40)},(_,i)=><option key={i} value={i}>Setelah baris {i+1}</option>)}</select></label><div className="column-pickers"><span>Kolom aktif:</span><button onClick={selectAllColumns}>Semua</button><button onClick={selectNoColumns}>Kosongkan</button><b>{activeCols.length}/{cols}</b></div></div><div className="pick-grid">{Array.from({length:cols},(_,i)=><label key={i} className={activeCols.includes(i)?'pick active':'pick'}><input type="checkbox" checked={activeCols.includes(i)} onChange={()=>toggleCol(i)}/><span><b>{colName(i)}</b><small>{headers[i]}</small></span></label>)}</div><div className="modal-form">{activeCols.length?activeCols.map(i=><label key={i}><span><b>{colName(i)}</b>{headers[i]}</span>{/anggaran|realisasi|target|bobot|persen|fisik|keuangan|nilai|jumlah|tahun|triwulan/i.test(headers[i])?<input inputMode="decimal" value={values[i]||''} onChange={e=>setValues(v=>({...v,[i]:e.target.value}))} placeholder={`Isi ${headers[i]}…`}/>:<textarea rows="2" value={values[i]||''} onInput={e=>{e.currentTarget.style.height='0px';e.currentTarget.style.height=Math.min(160,e.currentTarget.scrollHeight)+'px'}} onChange={e=>setValues(v=>({...v,[i]:e.target.value}))} placeholder={`Isi ${headers[i]}…`}/>}</label>):<div className="empty">Pilih minimal satu kolom.</div>}</div><div className="modal-foot"><span>{activeCols.length} kolom dipilih</span><div><button className="ghost" onClick={onClose}>Batal</button><button className="primary" onClick={onAdd}>＋ Tambahkan Baris</button></div></div></div></div>}

function PageTitle({eyebrow,title,desc,action,onAction}){return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>{action&&<button className="soft title-action" onClick={onAction}>✎ {action}</button>}</div>}
function Empty({text}){return <div className="empty">{text}</div>}

createRoot(document.getElementById('root')).render(<App/>);
