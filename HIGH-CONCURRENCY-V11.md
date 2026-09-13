# V11 — Public dashboard high concurrency

## Perubahan
- `A:ZZ` diganti dengan rentang kolom minimum yang benar-benar dipakai KPI. Ini mengurangi payload dari sheet besar secara signifikan.
- Token Google disimpan di cache isolate sehingga cache miss tidak selalu melakukan OAuth exchange.
- Google requests memiliki timeout dan retry backoff.
- Cache API dipakai untuk snapshot publik dengan ETag/304.
- Single-flight per tahun mencegah beberapa viewer yang datang bersamaan di isolate yang sama melakukan fetch Google bersamaan.
- Snapshot stale tetap dapat ditampilkan saat Google/Internet sedang gagal.
- Endpoint daftar tahun juga di-cache.
- Frontend tetap mempertahankan snapshot terakhir saat backend sedang gangguan dan tidak membuat polling bertumpuk.

## Model trafik
Viewer -> Cloudflare -> cached snapshot -> jika expired -> satu fetch Google -> snapshot baru.

Cache Cloudflare bersifat per data center, sehingga tidak dapat dijanjikan invalidation global satu milidetik. Target desain adalah beberapa detik dan ketahanan saat banyak viewer bersamaan.
