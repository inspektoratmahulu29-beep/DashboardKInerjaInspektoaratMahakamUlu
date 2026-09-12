export async function onRequestGet({env}) {
  return new Response(JSON.stringify({
    ok:true,
    service:'Dashboard Realisasi Kinerja Mahakam Ulu public backend',
    googleSheetsConfigured:Boolean(env.GOOGLE_SHEETS_SPREADSHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_JSON)
  }), {headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
