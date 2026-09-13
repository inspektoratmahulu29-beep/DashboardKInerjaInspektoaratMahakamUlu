import { getSheetTitles } from '../../lib/google.js';
const CANONICAL = [
  'IKU','Rencana Aksi','Capaian Sasaran Strategis','Capaian Sasaran Program','Capaian Sasaran Kegiatan Utama',
  'Capaian Sasaran Kegiatan(Penun)','Capaian Sasaran SUBKegiatan(U)','Capaian Sasaran SUBKegiatan (P)',
  'Monev Renaksi IKU','Monev Program','Monev output Subkegiatan Utama','Monev Subkegiatan Penunjang',
  'Rekap realisasi PKPT','Realisasi Fisik & Keu'
];
export async function onRequestGet({request,env}){
  const cache=caches.default; const key=new Request(`${new URL(request.url).origin}/__cache/public-years?v=11`);
  const cached=await cache.match(key); if(cached) return new Response(cached.body,cached);
  try{
    const titles=await getSheetTitles(env);
    const years=new Set();
    for(const t of titles){
      const m=String(t).match(/^(20\d{2})__/);
      if(m) years.add(Number(m[1]));
      else if(CANONICAL.includes(t)) years.add(2026);
    }
    const response=Response.json({ok:true,years:[...years].sort((a,b)=>b-a)},{headers:{'cache-control':'public,max-age=60,s-maxage=300','x-years-cache':'MISS'}}); await cache.put(key,response.clone()); return response;
  }catch(e){ return Response.json({ok:false,code:'GOOGLE_SHEETS_UNAVAILABLE'}, {status:503});}
}
