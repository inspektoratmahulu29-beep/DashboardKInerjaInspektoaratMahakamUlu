export async function onRequestGet() {
  return new Response(JSON.stringify({revision: Math.floor(Date.now()/3000)*3000}), {
    headers:{'content-type':'application/json','cache-control':'no-store'}
  });
}
