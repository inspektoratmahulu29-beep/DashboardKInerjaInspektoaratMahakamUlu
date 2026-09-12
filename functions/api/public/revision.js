export async function onRequestGet() {
  // Web 1 is read-only. Until Web 2 exposes a persisted revision endpoint,
  // return a lightweight polling marker so the client can refresh cheaply.
  const bucket = Math.floor(Date.now() / 3000);
  return new Response(JSON.stringify({
    revision: bucket,
    intervalMs: 3000
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
