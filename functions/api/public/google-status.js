import { batchGetSheets, quoteSheet } from '../../lib/google.js';

export async function onRequestGet({ env }) {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'GOOGLE_CONFIG_MISSING'
    }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  try {
    const result = await batchGetSheets(env, [`${quoteSheet('IKU')}!A1:A1`]);
    return new Response(JSON.stringify({
      ok: true,
      code: 'GOOGLE_SHEETS_OK',
      ranges: (result.valueRanges || []).map(v => v.range).filter(Boolean)
    }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch (error) {
    const message = String(error?.message || '');
    const code = message.includes('403') || message.includes('SERVICE_DISABLED')
      ? 'GOOGLE_SHEETS_API_DISABLED'
      : message.includes('Google OAuth')
      ? 'GOOGLE_AUTH_FAILED'
      : 'GOOGLE_SHEETS_UNAVAILABLE';
    console.error(JSON.stringify({ event: 'google_status_error', code, message, at: new Date().toISOString() }));
    return new Response(JSON.stringify({
      ok: false,
      code,
      message: code === 'GOOGLE_SHEETS_API_DISABLED'
        ? 'Aktifkan Google Sheets API pada project Service Account.'
        : 'Koneksi Google Sheets belum berhasil.'
    }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}
