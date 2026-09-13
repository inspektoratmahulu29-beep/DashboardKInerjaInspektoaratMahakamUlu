import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0).replace(/\u00a0/g,' ');
const num=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n)||0);
const pct=n=>`${(Number(n)||0).toLocaleString('id-ID',{maximumFractionDigits:1})}%`;
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));

function App(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[year,setYear]=useState(2026),[years,setYears]=useState([2026]),[tab,setTab]=useState('dashboard'),[activeKpi,setActiveKpi]=useState(null),[pulse,setPulse]=useState(0),[lastSync,setLastSync]=useState(null);

  const load=async()=>{
    try{
      setLoading(true);
      const r=await fetch(`/api/public/dashboard?year=${year}`,{cache:'no-store'});
      const j=await r.json();
      if(!r.ok) throw new Error(j.message||j.error||`HTTP ${r.status}`);
      setData(j);setError('');setLastSync(new Date());
    }catch(e){setError(e.message)}finally{setLoading(false)}
  };

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const r=await fetch('/api/public/years',{cache:'no-store'});const j=await r.json();
        if(!cancelled&&j.ok&&j.years?.length){setYears(j.years);if(!j.years.includes(year))setYear(j.years[0]);}
      }catch{}
    })();
    load();
    const t=setInterval(()=>load(),3000);
    const p=setInterval(()=>setPulse(v=>v+1),1800);
    return()=>{cancelled=true;clearInterval(t);clearInterval(p)};
  },[year]);

  const k=data?.kpi||{};
  const cards=useMemo(()=>[
    {id:'budget',label:'Total Anggaran',value:money(k.totalAnggaran),note:'Pagu anggaran pada sumber realisasi fisik & keuangan',icon:'Rp',tone:'gold'},
    {id:'financial',label:'Realisasi Keuangan',value:money(k.realisasiKeuangan),note:'Akumulasi realisasi keuangan terhimpun',icon:'↗',tone:'teal'},
    {id:'serapan',label:'Serapan Keuangan',value:pct(k.serapan),note:'Realisasi dibandingkan total anggaran',icon:'%',tone:'mint',progress:clamp(k.serapan)},
    {id:'physical',label:'Realisasi Fisik',value:pct(k.realisasiFisik),note:'Capaian fisik resmi/tertimbang dari sumber',icon:'◌',tone:'blue',progress:clamp(k.realisasiFisik)},
    {id:'pkpt',label:'Penugasan PKPT',value:num(k.penugasan),note:`${num(k.selesai)} selesai • ${num(k.berjalan)} berjalan • ${num(k.belum)} belum`,icon:'◎',tone:'violet'},
    {id:'output',label:'Total Output',value:num((k.outputUtama||0)+(k.outputPenunjang||0)),note:`Utama ${num(k.outputUtama)} • Penunjang ${num(k.outputPenunjang)}`,icon:'▦',tone:'rose'}
  ],[k]);

  const sourceTitle=tab==='dashboard'?'Pusat Kendali Realisasi Kinerja':tab==='realisasi'?'Realisasi Fisik & Keuangan':tab==='kinerja'?'Kinerja & Monitoring':'Penugasan & Output';

  return <div className="app">
    <header className="topbar">
      <div className="brand-wrap">
        <div className="logo-pair">
          <div className="logo-frame"><img src="/assets/logo-mahakam-ulu.png" alt="Lambang Kabupaten Mahakam Ulu" /></div>
          <div className="logo-frame logo-ins"><img src="/assets/logo-inspektorat.png" alt="Logo Inspektorat Kabupaten Mahakam Ulu" /></div>
        </div>
        <div className="brand-copy">
          <div className="brand-kicker">PEMERINTAH KABUPATEN MAHAKAM ULU</div>
          <b>INSPEKTORAT DAERAH</b>
          <span>Dashboard Realisasi Kinerja & Pengawasan</span>
        </div>
      </div>
      <div className="top-actions">
        <div className="realtime"><span className="live-dot"/> REALTIME <small>{lastSync?`• ${lastSync.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:''}</small></div>
        <label className="year-select"><span>TA</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      </div>
    </header>

    <div className="shell">
      <aside className="side">
        <div className="side-heading"><span>MONITORING</span><b>Realisasi Kinerja</b></div>
        {[
          ['dashboard','⌂','Dashboard'],['realisasi','◒','Realisasi'],['kinerja','◫','Kinerja'],['penugasan','◎','Penugasan']
        ].map(([id,ic,t])=><button key={id} className={tab===id?'nav active':'nav'} onClick={()=>setTab(id)}><span>{ic}</span>{t}<i>›</i></button>)}
        <div className="side-card">
          <div className="orbit-mini"><span className="orbit-dot"/></div>
          <small>DATA INSPEKTORAT</small>
          <b>Kabupaten Mahakam Ulu</b>
          <span>TA {year}</span>
        </div>
        <div className="side-foot">Pemantauan kinerja terintegrasi dalam satu tampilan publik.</div>
      </aside>

      <main className="main">
        <div className="ambient a1"/><div className="ambient a2"/><div className="grid-glow"/>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">INSPEKTORAT DAERAH • TA {year}</span>
            <h1>{sourceTitle.split(' ')[0]} <em>{sourceTitle.split(' ').slice(1).join(' ')}</em></h1>
            <p>Pusat visualisasi capaian anggaran, realisasi fisik, penugasan PKPT, output, dan kelengkapan kertas kerja Inspektorat Kabupaten Mahakam Ulu.</p>
            <div className="hero-line"><span/><span/><span/><span/><span/></div>
          </div>
          <div className={`hero-orb p${pulse%4}`} aria-hidden="true">
            <div className="orb-ring r1"/><div className="orb-ring r2"/><div className="orb-ring r3"/>
            <div className="orb-core"><img src="/assets/logo-mahakam-ulu.png" alt=""/></div>
            <i className="orbit-point d1"/><i className="orbit-point d2"/><i className="orbit-point d3"/>
          </div>
        </section>

        {loading&&!data?<div className="loading panel"><div className="loader"/><span>Mengambil data realisasi kinerja…</span></div>:error&&!data?<div className="error panel"><b>Data belum dapat ditampilkan</b><span>{error}</span><button onClick={load}>Muat kembali</button></div>:<>
          {tab==='dashboard'&&<Dashboard cards={cards} k={k} data={data} onKpi={setActiveKpi}/>} 
          {tab==='realisasi'&&<Realisasi k={k} onKpi={setActiveKpi}/>} 
          {tab==='kinerja'&&<Kinerja k={k}/>} 
          {tab==='penugasan'&&<Penugasan k={k}/>} 
        </>}
        <footer>© {year} Inspektorat Daerah Kabupaten Mahakam Ulu • Dashboard Realisasi Kinerja</footer>
      </main>
    </div>
    {activeKpi&&<KpiModal kpi={activeKpi} k={k} onClose={()=>setActiveKpi(null)}/>} 
  </div>
}

function Dashboard({cards,k,data,onKpi}){return <>
  <div className="kpis">{cards.map(c=><button className={`kpi tone-${c.tone}`} key={c.id} onClick={()=>onKpi(c)}>
    <div className="kpi-head"><span className="kpi-icon">{c.icon}</span><span className="kpi-link">DETAIL <b>↗</b></span></div>
    <label>{c.label}</label><strong>{c.value}</strong><p>{c.note}</p>
    {typeof c.progress==='number'&&<div className="mini-progress"><i style={{width:`${c.progress}%`}}/></div>}
  </button>)}</div>

  <div className="dashboard-grid">
    <section className="panel panel-large gauge-panel">
      <div className="panel-title"><span>REALISASI KEUANGAN</span><b>Serapan Anggaran</b><small>{pct(k.serapan)}</small></div>
      <div className="gauge-wrap"><div className="gauge" style={{'--p':`${clamp(k.serapan)}%`}}><div><strong>{pct(k.serapan)}</strong><small>SERAPAN</small></div></div><div className="gauge-caption">Realisasi dibanding total anggaran</div></div>
      <div className="stats stats-grid">
        <div><small>ANGGARAN</small><b>{money(k.totalAnggaran)}</b></div>
        <div><small>REALISASI</small><b>{money(k.realisasiKeuangan)}</b></div>
        <div><small>SISA DANA</small><b>{money(k.sisaDana)}</b></div>
        <div><small>REALISASI FISIK</small><b>{pct(k.realisasiFisik)}</b></div>
      </div>
    </section>

    <section className="panel performance-panel">
      <div className="panel-title"><span>CAPAIAN KINERJA</span><b>Profil Realisasi</b><small>8 indikator</small></div>
      <div className="profile-bars">{[
        ['Strategis',k.capaian?.strategic],['Program',k.capaian?.program],['Kegiatan',k.capaian?.kegiatanUtama],['Penunjang',k.capaian?.kegiatanPenunjang],['Sub-U',k.capaian?.subUtama],['Sub-P',k.capaian?.subPenunjang],['Renaksi',k.capaian?.renaksi],['Monev',k.capaian?.monevProgram]
      ].map(([n,v])=><div className="profile-bar" key={n}><span style={{height:`${Math.max(7,clamp(v))}%`}}/><b>{n}</b><small>{pct(v)}</small></div>)}</div>
    </section>

    <section className="panel pkpt-panel">
      <div className="panel-title"><span>STATUS PKPT</span><b>Progress Penugasan</b><small>{num(k.penugasan)} total</small></div>
      <div className="stack"><i style={{width:`${ratio(k.selesai,k.penugasan)}%`}}/><i style={{width:`${ratio(k.berjalan,k.penugasan)}%`}}/><i style={{width:`${ratio(k.belum,k.penugasan)}%`}}/></div>
      <div className="legend"><span><i className="done"/>Selesai <b>{num(k.selesai)}</b></span><span><i className="running"/>Berjalan <b>{num(k.berjalan)}</b></span><span><i className="pending"/>Belum <b>{num(k.belum)}</b></span></div>
      <div className="output"><div><small>OUTPUT UTAMA</small><b>{num(k.outputUtama)}</b></div><div><small>OUTPUT PENUNJANG</small><b>{num(k.outputPenunjang)}</b></div></div>
    </section>
  </div>

  <section className="panel coverage">
    <div className="panel-title"><span>CAKUPAN KERTAS KERJA</span><b>Capaian & kelengkapan tiap sumber</b><small>{pct(data?.overallCompleteness)} rata-rata</small></div>
    <div className="coverage-grid">{(data?.sheets||[]).map(s=><div className="coverage-item" key={s.name}><div><b>{s.name}</b><span>{pct(s.percent)}</span></div><div className="track"><i style={{width:`${clamp(s.percent)}%`}}/></div></div>)}</div>
  </section>

  <section className="summary-strip">
    <div className="summary-label"><span>RINGKASAN KINERJA</span><b>Indikator utama dashboard</b></div>
    <div className="summary-item"><strong>{pct((k.capaian?.strategic||0))}</strong><span>Capaian strategis</span></div>
    <div className="summary-item"><strong>{num(k.outputUtama)}</strong><span>Output utama</span></div>
    <div className="summary-item"><strong>{num(k.penugasan)}</strong><span>Penugasan PKPT</span></div>
    <div className="summary-item"><strong>{pct(data?.overallCompleteness)}</strong><span>Kelengkapan sumber</span></div>
  </section>
</>}

function ratio(a,b){return b?Math.max(0,Math.min(100,(Number(a||0)/Number(b||0))*100)):0}
function Realisasi({k,onKpi}){const rows=[['Total Anggaran',money(k.totalAnggaran)],['Realisasi Keuangan',money(k.realisasiKeuangan)],['Sisa Dana',money(k.sisaDana)],['Serapan Keuangan',pct(k.serapan)],['Realisasi Fisik',pct(k.realisasiFisik)]];return <section><div className="section-title"><span>ANALITIK REALISASI</span><h2>Fisik & Keuangan</h2><p>Ringkasan indikator realisasi yang dibaca langsung dari sumber kinerja.</p></div><div className="metric-list">{rows.map(([a,b])=><button key={a} onClick={()=>onKpi({label:a,value:b,note:'Nilai dihitung dan dibaca dari sumber data pusat.'})}><span>{a}</span><strong>{b}</strong><em>↗</em></button>)}</div><div className="panel formula"><span>LOGIKA PERHITUNGAN</span><b>Serapan Keuangan = Realisasi Keuangan ÷ Anggaran × 100</b><b>Realisasi Fisik = nilai fisik resmi/tertimbang dari sumber</b><b>Sisa Dana = Anggaran − Realisasi Keuangan</b></div></section>}
function Kinerja({k}){const items=[['Sasaran Strategis',k.capaian?.strategic],['Sasaran Program',k.capaian?.program],['Kegiatan Utama',k.capaian?.kegiatanUtama],['Kegiatan Penunjang',k.capaian?.kegiatanPenunjang],['Subkegiatan Utama',k.capaian?.subUtama],['Subkegiatan Penunjang',k.capaian?.subPenunjang],['Monev Renaksi IKU',k.capaian?.renaksi],['Monev Program',k.capaian?.monevProgram]];return <section><div className="section-title"><span>MONITORING</span><h2>Kinerja & Evaluasi</h2><p>Perbandingan capaian antar kelompok sumber dalam tampilan visual yang ringkas.</p></div><div className="performance-grid">{items.map(([n,v])=><div className="perf panel" key={n}><div><b>{n}</b><strong>{pct(v)}</strong></div><div className="track"><i style={{width:`${clamp(v)}%`}}/></div></div>)}</div></section>}
function Penugasan({k}){return <section><div className="section-title"><span>PKPT</span><h2>Progress Penugasan</h2><p>Ringkasan status penugasan dan jumlah output pada tahun anggaran terpilih.</p></div><div className="pen-grid"><div className="big-num panel"><strong>{num(k.penugasan)}</strong><span>Total penugasan</span></div>{[['Selesai',k.selesai],['Berjalan',k.berjalan],['Belum',k.belum]].map(([n,v])=><div className="status panel" key={n}><small>{n}</small><strong>{num(v)}</strong><span>{pct(ratio(v,k.penugasan))} dari total</span></div>)}</div><div className="panel output-grid"><div><small>OUTPUT UTAMA</small><strong>{num(k.outputUtama)}</strong></div><div><small>OUTPUT PENUNJANG</small><strong>{num(k.outputPenunjang)}</strong></div><div><small>TOTAL OUTPUT</small><strong>{num((k.outputUtama||0)+(k.outputPenunjang||0))}</strong></div></div></section>}
function KpiModal({kpi,k,onClose}){return <div className="modal-back" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={onClose}>×</button><span className="eyebrow">DETAIL KPI • INSPEKTORAT MAHAKAM ULU</span><h2>{kpi.label}</h2><div className="modal-number">{kpi.value}</div><p>{kpi.note}</p><div className="modal-grid"><div><small>ANGGARAN</small><b>{money(k.totalAnggaran)}</b></div><div><small>REALISASI</small><b>{money(k.realisasiKeuangan)}</b></div><div><small>FISIK</small><b>{pct(k.realisasiFisik)}</b></div><div><small>PKPT</small><b>{num(k.penugasan)}</b></div></div><div className="formula-box"><small>DATA</small><b>Inspektorat Kabupaten Mahakam Ulu • TA berjalan</b><span>Pembaruan data berlangsung otomatis.</span></div></div></div>}

createRoot(document.getElementById('root')).render(<App/>);
