
import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);
const pct = n => `${(n||0).toLocaleString('id-ID',{maximumFractionDigits:1})}%`;
const number = n => new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(n||0);
const cell = v => v === null || v === undefined ? '' : String(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function getYear(meta,sheets){
  const candidates=[meta?.year];
  for(const s of Object.values(sheets||{})){
    for(const row of (s.values||[]).slice(0,5)){
      for(const v of row){
        if(typeof v==='string'){
          const m=v.match(/\b(20\d{2})\b/); if(m)candidates.push(+m[1]);
        }
      }
    }
  }
  return candidates.find(Boolean)||new Date().getFullYear();
}

function derive(payload){
  const sheets=payload.sheets||{};
  const rf=sheets['Realisasi Fisik & Keu']?.values||[];
  const financialRows=rf.slice(9);
  const items=financialRows.filter(r=>isNum(r?.[2]) && isNum(r?.[6]));
  const budgetTotal=items.reduce((a,r)=>a+r[2],0);
  const realizationTotal=items.reduce((a,r)=>a+r[6],0);
  const financialRate=budgetTotal?realizationTotal/budgetTotal*100:0;
  const physicalRows=financialRows.filter(r=>isNum(r?.[4])).map(r=>r[4]);
  const physicalRate=physicalRows.length?physicalRows.reduce((a,b)=>a+b,0)/physicalRows.length:0;

  const pkpt=sheets['Rekap realisasi PKPT']?.values||[];
  const pkptItems=pkpt.filter(r=>cell(r?.[3]).trim());
  const done=pkptItems.filter(r=>cell(r?.[4]).toLowerCase()==='sudah').length;
  const progress=pkptItems.filter(r=>cell(r?.[4]).toLowerCase().includes('berjalan')).length;
  const belum=pkptItems.filter(r=>cell(r?.[4]).toLowerCase().includes('belum')).length;

  const utama=sheets['Monev output Subkegiatan Utama']?.values||[];
  const utamaActivities=utama.slice(6).filter(r=>cell(r?.[7]).trim().startsWith('#'));
  const penunjang=sheets['Monev Subkegiatan Penunjang']?.values||[];
  const penunjangActivities=penunjang.slice(6).filter(r=>cell(r?.[7]).trim().startsWith('#'));

  const errors=[];
  for(const [name,s] of Object.entries(sheets)){
    (s.values||[]).forEach((row,ri)=>row.forEach((v,ci)=>{
      if(typeof v==='string' && /#(REF!|DIV\/0!|NAME\?|VALUE!|N\/A)/.test(v)) errors.push({sheet:name,row:ri+1,col:ci+1,value:v});
    }));
  }

  // Derived program summary from rows that are clearly program totals in the physical/financial sheet.
  const programTotals=[];
  for(const r of financialRows){
    const label=cell(r?.[1]).trim();
    if(label && isNum(r?.[2]) && isNum(r?.[6])){
      programTotals.push({label,budget:r[2],realization:r[6],rate:isNum(r?.[7])?r[7]:(r[2]?r[6]/r[2]*100:0),physical:isNum(r?.[4])?r[4]:null});
    }
  }

  const sheetsSummary=Object.entries(sheets).map(([name,s])=>({name,rows:s.rows,cols:s.cols}));

  return {budgetTotal,realizationTotal,financialRate,physicalRate,physicalRows,pkptCount:pkptItems.length,done,progress,belum,
    utamaCount:utamaActivities.length,penunjangCount:penunjangActivities.length,errors,programTotals,sheetsSummary};
}

function App(){
  const [payload,setPayload]=useState(null);
  const [active,setActive]=useState('dashboard');
  const [selectedSheet,setSelectedSheet]=useState('Realisasi Fisik & Keu');
  const [query,setQuery]=useState('');
  const [selectedRow,setSelectedRow]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);

  useEffect(()=>{fetch('/data/workbook.json').then(r=>r.json()).then(setPayload)},[]);
  const derived=useMemo(()=>payload?derive(payload):null,[payload]);
  const year=useMemo(()=>payload?getYear(payload.meta,payload.sheets):'',[payload]);
  if(!payload) return <div className="loading-screen"><div className="pulse"></div><span>Memuat database kertas kerja…</span></div>;

  const nav=[
    ['dashboard','◈','Dashboard'],
    ['realisasi','◒','Realisasi'],
    ['kinerja','◫','Kinerja'],
    ['penugasan','◌','Penugasan'],
    ['kertas','▦','Kertas Kerja']
  ];

  return <div className="app-shell">
    <div className="ambient ambient-a"></div><div className="ambient ambient-b"></div><div className="ambient ambient-c"></div>
    <header className="topbar">
      <button className="menu-btn" onClick={()=>setSidebarOpen(v=>!v)}>☰</button>
      <div className="brand"><div className="brand-mark">MU</div><div><strong>MAHAKAM ULU</strong><span>DATABASE REALISASI KINERJA</span></div></div>
      <div className="top-actions"><span className="live"><i></i> LIVE DATA</span><span className="year-chip">TA {year}</span></div>
    </header>

    <aside className={`sidebar ${sidebarOpen?'open':''}`}>
      <div className="side-caption">KERTAS KERJA</div>
      {nav.map(([id,icon,label])=><button key={id} className={active===id?'nav-item active':'nav-item'} onClick={()=>{setActive(id);setSidebarOpen(false)}}><span>{icon}</span>{label}</button>)}
      <div className="sidebar-footer"><small>14 SHEET TERHUBUNG</small><b>Inspektorat Kabupaten Mahakam Ulu</b></div>
    </aside>

    <main className="main">
      {active==='dashboard' && <Dashboard derived={derived} year={year} onNav={setActive}/>}
      {active==='realisasi' && <Realisasi payload={payload} derived={derived}/>}
      {active==='kinerja' && <Kinerja payload={payload}/>}
      {active==='penugasan' && <Penugasan payload={payload} derived={derived}/>}
      {active==='kertas' && <KertasKerja payload={payload} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} query={query} setQuery={setQuery} selectedRow={selectedRow} setSelectedRow={setSelectedRow}/>}
    </main>
  </div>
}

function Dashboard({derived,year,onNav}){
  const [ticker,setTicker]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTicker(v=>v+1),5000);return()=>clearInterval(t)},[]);
  const trend=derived.physicalRows.slice(0,8);
  return <section className="page">
    <div className="hero">
      <div><span className="eyebrow">INSPEKTORAT KABUPATEN MAHAKAM ULU • {year}</span>
      <h1>Dashboard <em>Realisasi Kinerja</em></h1>
      <p>Satu layar untuk membaca serapan anggaran, capaian fisik, pelaksanaan PKPT, output penugasan, serta kertas kerja sumber.</p></div>
      <div className="hero-orbit"><div className="orbit-ring"></div><div className="orbit-core">{ticker%2===0?'RK':'MU'}</div></div>
    </div>

    <div className="kpi-grid">
      <Kpi title="Total Anggaran" value={money(derived.budgetTotal)} sub="Dari baris database bernilai numerik" accent="gold"/>
      <Kpi title="Realisasi Keuangan" value={money(derived.realizationTotal)} sub="Akumulasi realisasi terisi" accent="blue"/>
      <Kpi title="Serapan Keuangan" value={pct(derived.financialRate)} sub="Realisasi ÷ Anggaran × 100" accent="green" progress={derived.financialRate}/>
      <Kpi title="Rata-rata Realisasi Fisik" value={pct(derived.physicalRate)} sub={`${derived.physicalRows.length} sampel fisik yang terisi`} accent="cyan" progress={derived.physicalRate}/>
      <Kpi title="Penugasan PKPT" value={number(derived.pkptCount)} sub={`${derived.done} selesai • ${derived.progress} berjalan`} accent="violet"/>
      <Kpi title="Output Subkegiatan Utama" value={number(derived.utamaCount)} sub="Aktivitas bertanda # pada database" accent="pink"/>
    </div>

    <div className="dashboard-grid">
      <div className="panel large">
        <div className="panel-head"><div><span className="eyebrow">REALISASI</span><h2>Serapan Keuangan</h2></div><span className="score-badge">{pct(derived.financialRate)}</span></div>
        <div className="ring-wrap"><div className="progress-ring" style={{'--p':`${Math.min(derived.financialRate,100)}%`}}><div className="ring-inner"><b>{derived.financialRate.toFixed(1)}%</b><span>serapan</span></div></div>
        <div className="mini-stats"><div><small>ANGGARAN</small><b>{money(derived.budgetTotal)}</b></div><div><small>REALISASI</small><b>{money(derived.realizationTotal)}</b></div><div><small>SISA</small><b>{money(Math.max(derived.budgetTotal-derived.realizationTotal,0))}</b></div></div></div>
      </div>
      <div className="panel">
        <div className="panel-head"><div><span className="eyebrow">FISIK</span><h2>Profil Capaian</h2></div><span className="muted">rata-rata</span></div>
        <Bars data={trend.length?trend:[0,0,0,0]} max={100}/>
        <div className="bar-legend"><span>Fisik (%)</span><strong>{pct(derived.physicalRate)}</strong></div>
      </div>
      <div className="panel">
        <div className="panel-head"><div><span className="eyebrow">STATUS PKPT</span><h2>Progress Penugasan</h2></div></div>
        <StatusBar done={derived.done} progress={derived.progress} pending={derived.belum}/>
        <div className="status-list"><span><i className="dot done"></i>Selesai <b>{derived.done}</b></span><span><i className="dot progress"></i>Berjalan <b>{derived.progress}</b></span><span><i className="dot pending"></i>Belum <b>{derived.belum}</b></span></div>
      </div>
    </div>

    <div className="quick-nav">
      <button onClick={()=>onNav('realisasi')}><span>↗</span><div><b>Analitik Realisasi</b><small>Anggaran, fisik, dan keuangan</small></div></button>
      <button onClick={()=>onNav('kinerja')}><span>◎</span><div><b>Monitoring Kinerja</b><small>IKU, sasaran, dan monev</small></div></button>
      <button onClick={()=>onNav('penugasan')}><span>⌁</span><div><b>PKPT & Output</b><small>Status penugasan pengawasan</small></div></button>
      <button onClick={()=>onNav('kertas')}><span>▦</span><div><b>Buka Kertas Kerja</b><small>14 sheet sebagai sumber</small></div></button>
    </div>

    {derived.errors.length>0 && <div className="alert"><span>⚠</span><div><b>Data source memuat {derived.errors.length} formula error/cached error.</b><small>Dashboard tetap menghitung dari nilai numerik yang valid. Perbaiki referensi #REF! / #NAME? pada workbook bila ingin semua rumus aktif.</small></div></div>}
  </section>
}

function Kpi({title,value,sub,accent,progress}){
 return <div className={`kpi-card ${accent}`}><div className="shine"></div><div className="kpi-top"><span>{title}</span><i>•</i></div><b>{value}</b><small>{sub}</small>{progress!==undefined && <div className="meter"><span style={{width:`${Math.max(0,Math.min(progress,100))}%`}}></span></div>}</div>
}

function Bars({data,max}){
 return <div className="bars">{data.map((v,i)=><div className="bar-col" key={i}><div className="bar-track"><div className="bar-fill" style={{height:`${Math.min(100,(v/max)*100)}%`}}></div></div><span>T{i+1}</span></div>)}</div>
}
function StatusBar({done,progress,pending}){
 const t=done+progress+pending||1;
 return <div className="status-track"><span style={{width:`${done/t*100}%`}}></span><span style={{width:`${progress/t*100}%`}}></span><span style={{width:`${pending/t*100}%`}}></span></div>
}

function Realisasi({payload,derived}){
 const data=payload.sheets['Realisasi Fisik & Keu']?.values||[];
 const rows=data.slice(9).filter(r=>r.some(v=>v!==null&&v!==''));
 const programs=derived.programTotals.slice(0,8);
 return <section className="page"><PageTitle eyebrow="ANALITIK DATABASE" title="Realisasi Fisik & Keuangan" desc="Angka diturunkan dari sheet “Realisasi Fisik & Keu” dengan hanya memasukkan baris numerik yang valid."/>
 <div className="metric-row"><Kpi title="Anggaran" value={money(derived.budgetTotal)} sub="baris numerik valid" accent="gold"/><Kpi title="Realisasi" value={money(derived.realizationTotal)} sub="baris numerik valid" accent="blue"/><Kpi title="Serapan" value={pct(derived.financialRate)} sub="keuangan ÷ anggaran" accent="green" progress={derived.financialRate}/><Kpi title="Fisik rata-rata" value={pct(derived.physicalRate)} sub="sampel terisi" accent="cyan" progress={derived.physicalRate}/></div>
 <div className="two-col"><div className="panel"><div className="panel-head"><div><span className="eyebrow">PROGRAM</span><h2>Profil Serapan</h2></div></div><div className="program-bars">{programs.map((p,i)=><div className="program-row" key={i}><div className="program-label"><span>{p.label.replace(/^Program\s+/i,'').slice(0,56)}</span><b>{pct(p.rate)}</b></div><div className="thinbar"><span style={{width:`${Math.min(p.rate,100)}%`}}></span></div><small>{money(p.realization)} / {money(p.budget)}</small></div>)}</div></div>
 <div className="panel"><div className="panel-head"><div><span className="eyebrow">FORMULA VIEW</span><h2>Logika Perhitungan</h2></div></div><div className="formula-box"><div><b>Serapan Keuangan</b><code>Realisasi Keuangan ÷ Anggaran × 100</code></div><div><b>Realisasi Fisik Tertimbang</b><code>Bobot × Realisasi Fisik ÷ 100</code></div><div><b>Sisa Dana</b><code>Anggaran − Realisasi Keuangan</code></div></div></div></div>
 <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">DATABASE</span><h2>Baris Realisasi</h2></div><span className="muted">{rows.length} baris terisi</span></div><DataTable rows={rows} maxRows={24}/></div>
 </section>
}

function Kinerja({payload}){
 const groups=[['IKU',['IKU']],['Sasaran Strategis',['Capaian Sasaran Strategis']],['Sasaran Program',['Capaian Sasaran Program']],['Monev',['Monev Renaksi IKU','Monev Program']]];
 return <section className="page"><PageTitle eyebrow="MONITORING KINERJA" title="Kinerja & Monitoring Evaluasi" desc="Kumpulan sumber kinerja utama dan monev yang sudah tersimpan pada workbook."/>
 <div className="card-grid">{groups.map(([title,names])=><div className="panel" key={title}><div className="panel-head"><div><span className="eyebrow">SUMBER</span><h2>{title}</h2></div></div>{names.map(n=><div className="source-card" key={n}><div className="source-icon">▦</div><div><b>{n}</b><small>{payload.sheets[n]?.rows||0} baris • {payload.sheets[n]?.cols||0} kolom</small></div><span>↗</span></div>)}</div>)}</div>
 </section>
}

function Penugasan({payload,derived}){
 const pkpt=payload.sheets['Rekap realisasi PKPT']?.values||[];
 const rows=pkpt.filter(r=>cell(r?.[3]).trim()).slice(0,80);
 return <section className="page"><PageTitle eyebrow="PENGAWASAN" title="PKPT & Output Penugasan" desc="Ringkasan status penugasan dan output yang tercatat pada database."/>
 <div className="kpi-grid"><Kpi title="PKPT" value={number(derived.pkptCount)} sub="penugasan teridentifikasi" accent="violet"/><Kpi title="Selesai" value={number(derived.done)} sub="status Sudah" accent="green"/><Kpi title="Berjalan" value={number(derived.progress)} sub="status Sedang Berjalan" accent="gold"/><Kpi title="Belum" value={number(derived.belum)} sub="status Belum" accent="pink"/></div>
 <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">REKAP REALISASI PKPT</span><h2>Daftar Penugasan</h2></div><span className="muted">klik baris untuk detail</span></div><PKPTTable rows={rows}/></div></section>
}

function KertasKerja({payload,selectedSheet,setSelectedSheet,query,setQuery,selectedRow,setSelectedRow}){
 const names=Object.keys(payload.sheets);
 const sheet=payload.sheets[selectedSheet];
 const values=sheet?.values||[];
 const filtered=useMemo(()=>values.filter(r=>query.trim()===''||r.some(v=>cell(v).toLowerCase().includes(query.toLowerCase()))),[values,query]);
 return <section className="page"><PageTitle eyebrow="SUMBER DATA" title="Kertas Kerja • 14 Sheet" desc="Eksplorasi langsung isi workbook yang menjadi sumber dashboard. Gunakan pencarian untuk menemukan indikator, program, kegiatan, atau penugasan."/>
 <div className="workspace"><div className="sheet-list">{names.map(n=><button key={n} className={selectedSheet===n?'sheet-btn active':'sheet-btn'} onClick={()=>{setSelectedSheet(n);setSelectedRow(null)}}><span>▦</span><div><b>{n}</b><small>{payload.sheets[n].rows} × {payload.sheets[n].cols}</small></div></button>)}</div>
 <div className="sheet-view"><div className="sheet-toolbar"><div><b>{selectedSheet}</b><small>{sheet?.range}</small></div><input placeholder="Cari isi sheet…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="table-wrap"><DataTable rows={filtered} header={true} maxRows={250} onRow={setSelectedRow}/></div>{selectedRow && <div className="row-detail"><div><span className="eyebrow">DETAIL BARIS</span><h3>Baris terpilih</h3></div><pre>{JSON.stringify(selectedRow,null,2)}</pre></div>}</div></div>
 </section>
}

function PageTitle({eyebrow,title,desc}){return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>}

function DataTable({rows,maxRows=100,header=false,onRow}){
 const display=rows.slice(0,maxRows);
 const cols=Math.max(...display.map(r=>r.length),0);
 if(!display.length) return <div className="empty">Tidak ada data yang cocok.</div>;
 return <table><tbody>{display.map((r,ri)=><tr key={ri} onClick={()=>onRow?.(r)} className={onRow?'clickable':''}>{Array.from({length:cols},(_,ci)=><td key={ci}>{cell(r[ci])}</td>)}</tr>)}</tbody></table>
}
function PKPTTable({rows}){
 const headers=['No','Jenis','Rincian Penugasan','Status','Irban','Dasar','Jenis Kegiatan','Pembebanan','Target','Realisasi','Triwulan'];
 return <div className="table-scroll"><table className="nice-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{cell(r[0]??'')}</td><td>{cell(r[1])}</td><td className="wide">{cell(r[3])}</td><td><StatusPill value={r[4]}/></td><td>{cell(r[5])}</td><td>{cell(r[6])}</td><td>{cell(r[7])}</td><td>{cell(r[8])}</td><td>{cell(r[9])}</td><td>{cell(r[12])}</td><td>{cell(r[13]) || cell(r[14]) || cell(r[15]) || cell(r[16])}</td></tr>)}</tbody></table></div>
}
function StatusPill({value}){const v=cell(value).toLowerCase();let c=v==='sudah'?'done':v.includes('berjalan')?'progress':'pending';return <span className={`pill ${c}`}>{value||'—'}</span>}

createRoot(document.getElementById('root')).render(<App/>)
