const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const REQUEST_TIMEOUT_MS = 12000;
let tokenCache = null;

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function textBase64url(text) { return base64url(new TextEncoder().encode(text)); }
function pemToArrayBuffer(pem) {
  const body = String(pem || '').replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export async function getGoogleAccessToken(serviceAccountJson) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt - now > 120) return tokenCache.accessToken;
  let sa;
  try { sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson; }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON invalid'); }
  if (!sa?.client_email || !sa?.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON tidak lengkap');
  const unsigned = `${textBase64url(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${textBase64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(sa.private_key), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const resp = await fetch(TOKEN_URL, {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${base64url(new Uint8Array(signature))}`})});
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  tokenCache = { accessToken: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return data.access_token;
}
async function fetchJson(url, options = {}) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      const text = await resp.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      if (resp.ok) return data;
      last = new Error(data?.error?.message || `Google Sheets ${resp.status}`);
      last.status = resp.status;
      if (![429,500,502,503,504].includes(resp.status) || attempt === 2) break;
      const retryAfter = Number(resp.headers.get('retry-after') || 0);
      await new Promise(r => setTimeout(r, retryAfter ? Math.min(5000, retryAfter*1000) : 300*(2**attempt)));
    } catch (e) {
      last = e?.name === 'AbortError' ? new Error('Google Sheets request timeout') : e;
      last.status = 504;
      if (attempt === 2) break;
      await new Promise(r => setTimeout(r, 350*(2**attempt)));
    } finally { clearTimeout(timer); }
  }
  throw last || new Error('Google Sheets unavailable');
}

async function sheetsMeta(env) {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID belum diatur');
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return fetchJson(`${SHEETS_API}/${encodeURIComponent(env.GOOGLE_SHEETS_SPREADSHEET_ID)}?fields=spreadsheetId,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))`, {
    headers:{Authorization:`Bearer ${token}`}
  });
}
export async function getSheetTitles(env) {
  const meta = await sheetsMeta(env);
  return (meta.sheets || []).map(s=>s.properties.title);
}
export async function batchGetSheets(env, ranges) {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID belum diatur');
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const url = new URL(`${SHEETS_API}/${encodeURIComponent(env.GOOGLE_SHEETS_SPREADSHEET_ID)}/values:batchGet`);
  for (const range of ranges) url.searchParams.append('ranges', range);
  url.searchParams.set('majorDimension','ROWS');
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  return fetchJson(url, {headers:{Authorization:`Bearer ${token}`}});
}
export function quoteSheet(name) { return `'${String(name).replace(/'/g,"''")}'`; }
export async function batchGetExisting(env, rangesByName) {
  const titles = await getSheetTitles(env);
  const available = new Set(titles);
  const resolved = rangesByName.filter(x => available.has(x.title));
  if (!resolved.length) return {titles, valueRanges:[]};
  const data = await batchGetSheets(env, resolved.map(x=>`${quoteSheet(x.title)}!A:${x.endCol||'Z'}`));
  return {titles, valueRanges:data.valueRanges||[]};
}
