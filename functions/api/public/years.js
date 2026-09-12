import { getSheetTitles } from '../../lib/google.js';
const CANONICAL = [
  'IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama',
  'Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)',
  'Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang',
  'Rekap realisasi PKPT','Realisasi Fisik & Keu'
];
export async function onRequestGet({env}){
  try{
    const titles=await getSheetTitles(env);
    const years=new Set();
    for(const t of titles){
      const m=String(t).match(/^(20\d{2})__/);
      if(m) years.add(Number(m[1]));
      else if(CANONICAL.includes(t)) years.add(2026);
    }
    return Response.json({ok:true,years:[...years].sort((a,b)=>b-a)});
  }catch(e){ return Response.json({ok:false,code:'GOOGLE_SHEETS_UNAVAILABLE'}, {status:503});}
}
