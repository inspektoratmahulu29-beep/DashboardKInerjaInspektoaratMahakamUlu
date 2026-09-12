const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

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
  let sa;
  try { sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson; }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON invalid'); }
  if (!sa?.client_email || !sa?.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON tidak lengkap');
  const now = Math.floor(Date.now() / 1000);
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
  return (await resp.json()).access_token;
}
async function sheetsMeta(env) {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID belum diatur');
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const resp = await fetch(`${SHEETS_API}/${encodeURIComponent(env.GOOGLE_SHEETS_SPREADSHEET_ID)}?fields=spreadsheetId,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))`, {
    headers:{Authorization:`Bearer ${token}`}
  });
  if (!resp.ok) throw new Error(`Google Sheets ${resp.status}: ${await resp.text()}`);
  return resp.json();
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
  const resp = await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  if(!resp.ok) throw new Error(`Google Sheets ${resp.status}: ${await resp.text()}`);
  return resp.json();
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
