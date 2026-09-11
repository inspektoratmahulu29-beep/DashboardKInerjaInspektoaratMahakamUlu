import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const SOURCE_KEY = 'sakip-mahulu-realisasi-kinerja-v2';
const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const pct = n => `${(Number(n)||0).toLocaleString('id-ID',{maximumFractionDigits:1})}%`;
const number = n => new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n)||0);
const cell = v => v === null || v === undefined ? '' : String(v);
const isNum = v => (typeof v==='number' && Number.isFinite(v)) || (typeof v==='string' && v.trim()!=='' && Number.isFinite(Number(v.replace(/\./g,'').replace(',','.'))));
const toNumber = v => typeof v==='number' ? v : Number(String(v).replace(/\./g,'').replace(',','.'));
const colName = index => { let s=''; let n=index+1; while(n){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; };

function getYear(meta,sheets){
  const candidates=[meta?.year];
  for(const s of Object.values(sheets||{})){
    for(const row of (s.values||[]).slice(0,5)) for(const v of row) if(typeof v==='string'){ const m=v.match(/\b(20\d{2})\b/); if(m)candidates.push(+m[1]); }
  }
  return candidates.find(Boolean)||new Date().getFullYear();
}

function clonePayload(obj){ return JSON.parse(JSON.stringify(obj)); }

function derive(payload){
  const sheets=payload.sheets||{};
  const rf=sheets['Realisasi Fisik & Keu']?.values||[];
  const financialRows=rf.slice(9);
  const items=financialRows.filter(r=>isNum(r?.[2]) && isNum(r?.[6]));
  const budgetTotal=items.reduce((a,r)=>a+toNumber(r[2]),0);
  const realizationTotal=items.reduce((a,r)=>a+toNumber(r[6]),0);
  const financialRate=budgetTotal?realizationTotal/budgetTotal*100:0;
  const physicalRows=financialRows.filter(r=>isNum(r?.[4])).map(r=>toNumber(r[4]));
  const physicalRate=physicalRows.length?physicalRows.reduce((a,b)=>a+b,0)/physicalRows.length:0;
  const weightedPhysicalRows=financialRows.filter(r=>isNum(r?.[5])).map(r=>toNumber(r[5]));
  const weightedPhysical=weightedPhysicalRows.length?weightedPhysicalRows.reduce((a,b)=>a+b,0):0;

  const pkpt=sheets['Rekap realisasi PKPT']?.values||[];
  const pkptItems=pkpt.filter(r=>cell(r?.[3]).trim());
  const statusOf=r=>cell(r?.[4]).toLowerCase();
  const done=pkptItems.filter(r=>statusOf(r)==='sudah').length;
  const progress=pkptItems.filter(r=>statusOf(r).includes('berjalan')).length;
  const belum=pkptItems.filter(r=>statusOf(r).includes('belum') || (!statusOf(r) && r[3])).length;

  const utama=sheets['Monev output Subkegiatan Utama']?.values||[];
  const utamaActivities=utama.slice(6).filter(r=>cell(r?.[7]).trim().startsWith('#'));
  const penunjang=sheets['Monev Subkegiatan Penunjang']?.values||[];
  const penunjangActivities=penunjang.slice(6).filter(r=>cell(r?.[7]).trim().startsWith('#'));

  const errors=[];
  for(const [name,s] of Object.entries(sheets)) (s.values||[]).forEach((row,ri)=>row.forEach((v,ci)=>{ if(typeof v==='string' && /#(REF!|DIV\/0!|NAME\?|VALUE!|N\/A)/.test(v)) errors.push({sheet:name,row:ri+1,col:ci+1,value:v}); }));

  const programTotals=[];
  for(const r of financialRows){
    const label=cell(r?.[1]).trim();
    if(label && isNum(r?.[2]) && isNum(r?.[6])){
      const budget=toNumber(r[2]), realization=toNumber(r[6]);
      const rate=isNum(r?.[7])?toNumber(r[7]):(budget?realization/budget*100:0);
      programTotals.push({label,budget,realization,rate,physical:isNum(r?.[4])?toNumber(r[4]):null});
    }
  }
  const sheetsSummary=Object.entries(sheets).map(([name,s])=>({name,rows:s.rows,cols:s.cols}));
  return {budgetTotal,realizationTotal,financialRate,physicalRate,weightedPhysical,physicalRows,pkptCount:pkptItems.length,done,progress,belum,utamaCount:utamaActivities.length,penunjangCount:penunjangActivities.length,errors,programTotals,sheetsSummary};
}

function App(){
  const [payload,setPayload]=useState(null);
  const [baseline,setBaseline]=useState(null);
  const [active,setActive]=useState('dashboard');
  const [selectedSheet,setSelectedSheet]=useState('Realisasi Fisik & Keu');
  const [query,setQuery]=useState('');
  const [selectedRow,setSelectedRow]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [toast,setToast]=useState('');
  const fileRef=useRef(null);

  useEffect(()=>{
    fetch('/data/workbook.json').then(r=>r.json()).then(source=>{
      setBaseline(clonePayload(source));
      const saved=localStorage.getItem(SOURCE_KEY);
      if(saved){ try { setPayload(JSON.parse(saved)); setDirty(true); setToast('Perubahan lokal dipulihkan'); } catch { setPayload(source); } }
      else setPayload(source);
    }).catch(()=>setToast('Gagal memuat database sumber'));
  },[]);
  useEffect(()=>{ if(!toast)return; const t=setTimeout(()=>setToast(''),2800); return()=>clearTimeout(t); },[toast]);

  const derived=useMemo(()=>payload?derive(payload):null,[payload]);
  const year=useMemo(()=>payload?getYear(payload.meta,payload.sheets):'', [payload]);
  if(!payload) return <div className="loading-screen"><div className="pulse"></div><span>Memuat database kertas kerja…</span></div>;

  const nav=[
    ['dashboard','◈','Dashboard'],['realisasi','◒','Realisasi'],['kinerja','◫','Kinerja'],['penugasan','◌','Penugasan'],['kertas','▦','Kertas Kerja'],['editor','✎','Edit Data']
  ];

  const updatePayload = updater => { setPayload(prev=>{ const next=clonePayload(prev); updater(next); return next; }); setDirty(true); };
  const updateCell = (sheetName,rowIndex,colIndex,value) => updatePayload(p=>{ p.sheets[sheetName].values[rowIndex][colIndex]=value; });
  const addRow = sheetName => updatePayload(p=>{ const s=p.sheets[sheetName]; const cols=s.cols||Math.max(...s.values.map(r=>r.length),0); s.values.push(Array.from({length:cols},()=>'')); s.rows=s.values.length; });
  const deleteRow = (sheetName,rowIndex) => updatePayload(p=>{ const s=p.sheets[sheetName]; if(s.values.length>1){ s.values.splice(rowIndex,1); s.rows=s.values.length; } });
  const saveLocal = () => { localStorage.setItem(SOURCE_KEY,JSON.stringify(payload)); setDirty(false); setToast('Perubahan dashboard tersimpan di browser ini'); };
  const resetSource = () => { if(!baseline)return; setPayload(clonePayload(baseline)); localStorage.removeItem(SOURCE_KEY); setDirty(false); setToast('Kembali ke data sumber Excel'); };
  const exportJson = () => { const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='database-realisasi-kinerja-mahulu-updated.json'; a.click(); URL.revokeObjectURL(a.href); setToast('File JSON berhasil diekspor'); };
  const importJson = e => { const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{ try{ const imported=JSON.parse(reader.result); if(!imported?.sheets) throw new Error('Format tidak valid'); setPayload(imported); setDirty(true); setToast('Database JSON berhasil diimpor'); } catch { setToast('Import gagal: format JSON tidak valid'); } }; reader.readAsText(file); e.target.value=''; };

  return <div className="app-shell">
    <div className="ambient ambient-a"></div><div className="ambient ambient-b"></div><div className="ambient ambient-c"></div><div className="grain"></div>
    <header className="topbar">
      <button className="menu-btn" onClick={()=>setSidebarOpen(v=>!v)}>☰</button>
      <div className="brand"><div className="brand-mark">ID</div><div><strong>INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU</strong><span>DATABASE REALISASI KINERJA</span></div></div>
      <div className="top-actions"><span className="live"><i></i> LIVE DASHBOARD</span><span className={dirty?'edit-state dirty':'edit-state'}>{dirty?'BELUM DISIMPAN':'TERSIMPAN'}</span><span className="year-chip">TA {year}</span></div>
    </header>

    <aside className={`sidebar ${sidebarOpen?'open':''}`}>
      <div className="side-caption">KERTAS KERJA & MONITORING</div>
      {nav.map(([id,icon,label])=><button key={id} className={active===id?'nav-item active':'nav-item'} onClick={()=>{setActive(id);setSidebarOpen(false)}}><span>{icon}</span>{label}</button>)}
      <div className="sidebar-footer"><small>{derived.sheetsSummary.length} SHEET TERHUBUNG</small><b>Inspektorat Daerah Kabupaten Mahakam Ulu</b></div>
    </aside>

    <main className="main">
      {active==='dashboard' && <Dashboard derived={derived} year={year} onNav={setActive} dirty={dirty}/>} 
      {active==='realisasi' && <Realisasi payload={payload} derived={derived} onEdit={()=>setActive('editor')}/>}
      {active==='kinerja' && <Kinerja payload={payload} onEdit={()=>setActive('editor')}/>} 
      {active==='penugasan' && <Penugasan payload={payload} derived={derived} onEdit={()=>setActive('editor')}/>}
      {active==='kertas' && <KertasKerja payload={payload} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} query={query} setQuery={setQuery} selectedRow={selectedRow} setSelectedRow={setSelectedRow} onEdit={()=>setActive('editor')}/>} 
      {active==='editor' && <Editor payload={payload} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} query={query} setQuery={setQuery} updateCell={updateCell} addRow={addRow} deleteRow={deleteRow} saveLocal={saveLocal} resetSource={resetSource} exportJson={exportJson} importJson={importJson} fileRef={fileRef} dirty={dirty}/>} 
    </main>
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>
}

function Dashboard({derived,year,onNav,dirty}){
  const [ticker,setTicker]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTicker(v=>v+1),4200);return()=>clearInterval(t)},[]);
  const trend=derived.physicalRows.slice(0,8);
  return <section className="page">
    <div className="hero">
      <div><span className="eyebrow">INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU • {year}</span><h1>Dashboard <em>Realisasi Kinerja</em></h1><p>Pusat kendali untuk membaca serapan anggaran, capaian fisik, pelaksanaan PKPT, output, serta mengubah database kertas kerja secara langsung.</p><div className="hero-actions"><button className="primary" onClick={()=>onNav('editor')}>✎ Edit & Update Data</button><span className="hero-note">{dirty?'Ada perubahan yang belum disimpan':'Data tersimpan dari sumber dashboard'}</span></div></div>
      <div className="hero-orbit"><div className="orbit-ring ring-one"></div><div className="orbit-ring ring-two"></div><div className="orbit-dot dot-a"></div><div className="orbit-dot dot-b"></div><div className="orbit-core">{ticker%2===0?'ID':'RK'}</div></div>
    </div>
    <div className="kpi-grid">
      <Kpi title="Total Anggaran" value={money(derived.budgetTotal)} sub="Akumulasi kolom Anggaran" accent="gold"/>
      <Kpi title="Realisasi Keuangan" value={money(derived.realizationTotal)} sub="Akumulasi kolom Realisasi" accent="blue"/>
      <Kpi title="Serapan Keuangan" value={pct(derived.financialRate)} sub="Realisasi ÷ Anggaran × 100" accent="green" progress={derived.financialRate}/>
      <Kpi title="Rata-rata Fisik" value={pct(derived.physicalRate)} sub={`${derived.physicalRows.length} nilai fisik terisi`} accent="cyan" progress={derived.physicalRate}/>
      <Kpi title="Penugasan PKPT" value={number(derived.pkptCount)} sub={`${derived.done} selesai • ${derived.progress} berjalan • ${derived.belum} belum`} accent="violet"/>
      <Kpi title="Output Subkegiatan" value={number(derived.utamaCount + derived.penunjangCount)} sub={`${derived.utamaCount} utama • ${derived.penunjangCount} penunjang`} accent="pink"/>
    </div>
    <div className="dashboard-grid">
      <div className="panel large"><div className="panel-head"><div><span className="eyebrow">REALISASI</span><h2>Serapan Keuangan</h2></div><span className="score-badge">{pct(derived.financialRate)}</span></div><div className="ring-wrap"><div className="progress-ring" style={{'--p':`${Math.min(derived.financialRate,100)}%`}}><div className="ring-inner"><b>{derived.financialRate.toFixed(1)}%</b><span>serapan</span></div></div><div className="mini-stats"><div><small>ANGGARAN</small><b>{money(derived.budgetTotal)}</b></div><div><small>REALISASI</small><b>{money(derived.realizationTotal)}</b></div><div><small>SISA DANA</small><b>{money(Math.max(derived.budgetTotal-derived.realizationTotal,0))}</b></div></div></div></div>
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">FISIK</span><h2>Profil Capaian</h2></div><span className="muted">sample</span></div><Bars data={trend.length?trend:[0,0,0,0]} max={100}/><div className="bar-legend"><span>Realisasi fisik</span><strong>{pct(derived.physicalRate)}</strong></div></div>
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">STATUS PKPT</span><h2>Progress Penugasan</h2></div></div><StatusBar done={derived.done} progress={derived.progress} pending={derived.belum}/><div className="status-list"><span><i className="dot done"></i>Selesai <b>{derived.done}</b></span><span><i className="dot progress"></i>Berjalan <b>{derived.progress}</b></span><span><i className="dot pending"></i>Belum <b>{derived.belum}</b></span></div></div>
    </div>
    <div className="edit-banner"><div><span className="eyebrow">MODE DATA</span><h3>Nilai KPI bukan template</h3><p>Semua KPI dihitung ulang dari data kertas kerja yang dapat diedit. Ubah nilai anggaran, realisasi, fisik, atau status PKPT di menu Edit Data.</p></div><button className="secondary" onClick={()=>onNav('editor')}>Buka Editor →</button></div>
    {derived.errors.length>0 && <div className="alert"><span>⚠</span><div><b>Ditemukan {derived.errors.length} formula/cached error dari workbook sumber.</b><small>Editor tetap mengizinkan koreksi nilai. Setelah data diperbaiki, KPI langsung menghitung ulang di browser.</small></div></div>}
  </section>
}

function Kpi({title,value,sub,accent,progress}){return <div className={`kpi-card ${accent}`}><div className="shine"></div><div className="kpi-top"><span>{title}</span><i>↗</i></div><b>{value}</b><small>{sub}</small>{progress!==undefined&&<div className="meter"><span style={{width:`${Math.max(0,Math.min(Number(progress)||0,100))}%`}}></span></div>}</div>}
function Bars({data,max}){return <div className="bars">{data.map((v,i)=><div className="bar-col" key={i}><div className="bar-track"><div className="bar-fill" style={{height:`${Math.min(100,Math.max(0,(Number(v)||0)/max*100))}%`}}></div></div><span>T{i+1}</span></div>)}</div>}
function StatusBar({done,progress,pending}){const t=done+progress+pending||1;return <div className="status-track"><span style={{width:`${done/t*100}%`}}></span><span style={{width:`${progress/t*100}%`}}></span><span style={{width:`${pending/t*100}%`}}></span></div>}

function Realisasi({payload,derived,onEdit}){
  const data=payload.sheets['Realisasi Fisik & Keu']?.values||[]; const rows=data.slice(9).filter(r=>r.some(v=>v!==null&&v!=='')); const programs=derived.programTotals.filter(p=>p.budget||p.realization).slice(0,10);
  return <section className="page"><PageTitle eyebrow="ANALITIK DATABASE" title="Realisasi Fisik & Keuangan" desc="KPI di bawah selalu membaca ulang nilai pada sheet Realisasi Fisik & Keu." action="Edit sumber data" onAction={onEdit}/>
    <div className="metric-row"><Kpi title="Anggaran" value={money(derived.budgetTotal)} sub="kolom C" accent="gold"/><Kpi title="Realisasi" value={money(derived.realizationTotal)} sub="kolom G" accent="blue"/><Kpi title="Serapan" value={pct(derived.financialRate)} sub="G ÷ C × 100" accent="green" progress={derived.financialRate}/><Kpi title="Fisik rata-rata" value={pct(derived.physicalRate)} sub="kolom E" accent="cyan" progress={derived.physicalRate}/></div>
    <div className="two-col"><div className="panel"><div className="panel-head"><div><span className="eyebrow">PROGRAM</span><h2>Profil Serapan</h2></div></div><div className="program-bars">{programs.map((p,i)=><div className="program-row" key={i}><div className="program-label"><span>{p.label.replace(/^Program\s+/i,'').slice(0,62)}</span><b>{pct(p.rate)}</b></div><div className="thinbar"><span style={{width:`${Math.min(Math.max(p.rate,0),100)}%`}}></span></div><small>{money(p.realization)} / {money(p.budget)}</small></div>)}</div></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">FORMULA VIEW</span><h2>Logika Perhitungan</h2></div></div><div className="formula-box"><div><b>Serapan Keuangan</b><code>Realisasi Keuangan ÷ Anggaran × 100</code></div><div><b>Realisasi Fisik Rata-rata</b><code>Σ Realisasi Fisik ÷ jumlah nilai fisik terisi</code></div><div><b>Sisa Dana</b><code>Anggaran − Realisasi Keuangan</code></div></div></div></div>
    <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">DATABASE</span><h2>Baris Realisasi</h2></div><span className="muted">{rows.length} baris</span></div><DataTable rows={rows} maxRows={24}/></div>
  </section>
}

function Kinerja({payload,onEdit}){const groups=[['IKU',['IKU']],['Sasaran Strategis',['Capaian Sasaran Strategis']],['Sasaran Program',['Capaian Sasaran Program']],['Monev',['Monev Renaksi IKU','Monev Program']]];return <section className="page"><PageTitle eyebrow="MONITORING KINERJA" title="Kinerja & Monitoring Evaluasi" desc="Semua sumber tetap tersedia sebagai kertas kerja yang dapat diedit." action="Edit data kinerja" onAction={onEdit}/><div className="card-grid">{groups.map(([title,names])=><div className="panel" key={title}><div className="panel-head"><div><span className="eyebrow">SUMBER</span><h2>{title}</h2></div></div>{names.map(n=><div className="source-card" key={n}><div className="source-icon">▦</div><div><b>{n}</b><small>{payload.sheets[n]?.rows||0} baris • {payload.sheets[n]?.cols||0} kolom</small></div><span>✎</span></div>)}</div>)}</div></section>}

function Penugasan({payload,derived,onEdit}){const pkpt=payload.sheets['Rekap realisasi PKPT']?.values||[];const rows=pkpt.filter(r=>cell(r?.[3]).trim()).slice(0,100);return <section className="page"><PageTitle eyebrow="PENGAWASAN" title="PKPT & Output Penugasan" desc="Status penugasan sekarang dihitung dari kolom Pemantauan Realisasi pada sheet Rekap realisasi PKPT." action="Edit status PKPT" onAction={onEdit}/><div className="kpi-grid"><Kpi title="PKPT" value={number(derived.pkptCount)} sub="penugasan teridentifikasi" accent="violet"/><Kpi title="Selesai" value={number(derived.done)} sub="status Sudah" accent="green"/><Kpi title="Berjalan" value={number(derived.progress)} sub="status Sedang Berjalan" accent="gold"/><Kpi title="Belum" value={number(derived.belum)} sub="status Belum / kosong" accent="pink"/></div><div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">REKAP REALISASI PKPT</span><h2>Daftar Penugasan</h2></div><span className="muted">Untuk mengubah klik Edit status PKPT</span></div><PKPTTable rows={rows}/></div></section>}

function KertasKerja({payload,selectedSheet,setSelectedSheet,query,setQuery,selectedRow,setSelectedRow,onEdit}){const names=Object.keys(payload.sheets);const sheet=payload.sheets[selectedSheet];const values=sheet?.values||[];const filtered=useMemo(()=>values.filter(r=>query.trim()===''||r.some(v=>cell(v).toLowerCase().includes(query.toLowerCase()))),[values,query]);return <section className="page"><PageTitle eyebrow="SUMBER DATA" title={`Kertas Kerja • ${names.length} Sheet`} desc="Eksplorasi langsung isi workbook sebagai sumber dashboard." action="Edit sheet ini" onAction={onEdit}/><div className="workspace"><div className="sheet-list">{names.map(n=><button key={n} className={selectedSheet===n?'sheet-btn active':'sheet-btn'} onClick={()=>{setSelectedSheet(n);setSelectedRow(null)}}><span>▦</span><div><b>{n}</b><small>{payload.sheets[n].rows} × {payload.sheets[n].cols}</small></div></button>)}</div><div className="sheet-view"><div className="sheet-toolbar"><div><b>{selectedSheet}</b><small>{sheet?.range}</small></div><div className="toolbar-actions"><input placeholder="Cari isi sheet…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="secondary" onClick={onEdit}>✎ Edit</button></div></div><div className="table-wrap"><DataTable rows={filtered} header={true} maxRows={250} onRow={setSelectedRow}/></div>{selectedRow&&<div className="row-detail"><div><span className="eyebrow">DETAIL BARIS</span><h3>Baris terpilih</h3></div><pre>{JSON.stringify(selectedRow,null,2)}</pre></div>}</div></div></section>}

function Editor({payload,selectedSheet,setSelectedSheet,query,setQuery,updateCell,addRow,deleteRow,saveLocal,resetSource,exportJson,importJson,fileRef,dirty}){
  const names=Object.keys(payload.sheets); const sheet=payload.sheets[selectedSheet];
  const [limit,setLimit]=useState(80);
  const values=sheet?.values||[];
  const filtered=useMemo(()=>values.map((r,ri)=>({r,ri})).filter(({r})=>query.trim()===''||r.some(v=>cell(v).toLowerCase().includes(query.toLowerCase()))).slice(0,limit),[values,query,limit]);
  const cols=Math.max(sheet?.cols||0,...values.map(r=>r.length),0);
  return <section className="page editor-page">
    <PageTitle eyebrow="DATA MANAGEMENT" title="Edit & Update Database" desc="Ini adalah area input. Saat nilai diubah, seluruh KPI dan grafik di dashboard langsung dihitung ulang."/>
    <div className="editor-toolbar panel"><div className="editor-toolbar-left"><div className="editor-select"><small>Sheet aktif</small><select value={selectedSheet} onChange={e=>{setSelectedSheet(e.target.value);setQuery('')}}>{names.map(n=><option key={n}>{n}</option>)}</select></div><div className="search-wrap"><small>Pencarian</small><input placeholder="Cari nilai, OPD, kegiatan…" value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="editor-actions"><span className={dirty?'dirty-label':'saved-label'}>{dirty?'● Ada perubahan':'● Tersimpan'}</span><button className="secondary" onClick={()=>addRow(selectedSheet)}>＋ Tambah baris</button><button className="secondary" onClick={exportJson}>⇩ Export JSON</button><button className="secondary" onClick={()=>fileRef.current?.click()}>⇧ Import JSON</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={importJson}/><button className="ghost" onClick={resetSource}>↺ Reset sumber</button><button className="primary" onClick={saveLocal}>✓ Simpan perubahan</button></div></div>
    <div className="editor-note"><b>Bagaimana perhitungan bekerja?</b> Untuk KPI utama, kolom yang digunakan adalah <code>Realisasi Fisik & Keu → C Anggaran, E Fisik, G Realisasi Keuangan</code> dan <code>Rekap realisasi PKPT → E Status Pemantauan</code>. Edit nilai tersebut untuk melihat dampaknya seketika.</div>
    <div className="panel editor-panel"><div className="panel-head"><div><span className="eyebrow">INLINE EDITOR</span><h2>{selectedSheet}</h2></div><span className="muted">Menampilkan {filtered.length} baris • {cols} kolom</span></div><div className="editor-scroll"><table className="editor-table"><thead><tr><th className="row-num">#</th>{Array.from({length:cols},(_,ci)=><th key={ci}>{colName(ci)}</th>)}<th className="action-head">Aksi</th></tr></thead><tbody>{filtered.map(({r,ri})=><tr key={ri}><td className="row-num">{ri+1}</td>{Array.from({length:cols},(_,ci)=>{const v=r[ci]??'';const numeric=isNum(v) && !(typeof v==='string'&&/[A-Za-z#]/.test(v));return <td key={ci}><input className={numeric?'numeric':''} value={cell(v)} onChange={e=>updateCell(selectedSheet,ri,ci,numeric?e.target.value:e.target.value)} /></td>})}<td className="row-actions"><button title="Hapus baris" onClick={()=>deleteRow(selectedSheet,ri)}>×</button></td></tr>)}</tbody></table></div><div className="editor-footer"><span>Perubahan belum menjadi database publik sampai disimpan melalui backend/Google Spreadsheet. Untuk deployment statis, tombol Simpan menyimpan ke browser ini dan Export JSON dapat mengganti sumber data.</span>{filtered.length<values.length&&<button className="secondary" onClick={()=>setLimit(v=>v+100)}>Tampilkan lebih banyak</button>}</div></div>
  </section>
}

function PageTitle({eyebrow,title,desc,action,onAction}){return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>{action&&<button className="secondary title-action" onClick={onAction}>✎ {action}</button>}</div>}
function DataTable({rows,maxRows=100,onRow}){const display=rows.slice(0,maxRows);const cols=Math.max(...display.map(r=>r.length),0);if(!display.length)return <div className="empty">Tidak ada data yang cocok.</div>;return <table className="data-table"><tbody>{display.map((r,ri)=><tr key={ri} onClick={()=>onRow?.(r)} className={onRow?'clickable':''}>{Array.from({length:cols},(_,ci)=><td key={ci}>{cell(r[ci])}</td>)}</tr>)}</tbody></table>}
function PKPTTable({rows}){const headers=['No','Jenis','Rincian Penugasan','Status','Irban','Dasar','Jenis Kegiatan','Pembebanan','Target','Realisasi','Triwulan'];return <div className="table-scroll"><table className="nice-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{cell(r[0]??'')}</td><td>{cell(r[1])}</td><td className="wide">{cell(r[3])}</td><td><StatusPill value={r[4]}/></td><td>{cell(r[5])}</td><td>{cell(r[6])}</td><td>{cell(r[7])}</td><td>{cell(r[8])}</td><td>{cell(r[9])} {cell(r[10])}</td><td>{cell(r[12])}</td><td>{cell(r[13]) || cell(r[14]) || cell(r[15]) || cell(r[16])}</td></tr>)}</tbody></table></div>}
function StatusPill({value}){const v=cell(value).toLowerCase();let c=v==='sudah'?'done':v.includes('berjalan')?'progress':'pending';return <span className={`pill ${c}`}>{value||'Belum'}</span>}

createRoot(document.getElementById('root')).render(<App/>);
