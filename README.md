# Dashboard Kertas Kerja — Database Realisasi Kinerja Mahakam Ulu

Dashboard web untuk **Database Realisasi Kinerja Inspektorat Kabupaten Mahakam Ulu**, dibangun dari workbook:

`2026_Dashboard KERTAS KERJA_Database Realisasi Kinerja.xlsx`

## Fitur

- KPI otomatis dari nilai numerik yang tersedia pada sheet **Realisasi Fisik & Keu**.
- Serapan keuangan = Realisasi Keuangan / Anggaran × 100.
- Rata-rata realisasi fisik dari baris fisik yang terisi.
- Status PKPT: selesai, berjalan, dan belum.
- Monitoring sumber IKU, sasaran, dan Monev.
- Explorer **14 sheet kertas kerja** dengan pencarian.
- UI glassmorphism + gradient ambient + animasi.
- Menampilkan peringatan data source bila workbook mengandung cached formula error seperti `#REF!`, `#NAME?`, dll.
- Static-first, aman untuk deploy ke Cloudflare Pages.

## Menjalankan lokal

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output siap deploy ada di folder `dist/`.

## Deploy GitHub → Cloudflare Pages

1. Upload folder proyek ini ke repository GitHub.
2. Di Cloudflare Pages, pilih **Create a project → Connect to Git**.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Framework preset: **Vite**
6. Deploy.

## Sumber data

Snapshot workbook sudah diekstrak ke:

`public/data/workbook.json`

Untuk sinkronisasi live dari Google Sheets/API, ganti loader di `src/main.jsx` agar mengambil endpoint data Anda. Struktur UI sudah dipisahkan antara data source dan visualisasi sehingga adapter dapat diganti tanpa mengubah tampilan dashboard.

## Catatan data

Workbook sumber saat ini memiliki beberapa nilai error tersimpan, khususnya pada sheet **Realisasi Fisik & Keu** (`#REF!` dan `#NAME?`). Dashboard tidak menjumlahkan error tersebut; hanya nilai numerik yang valid yang dipakai dalam KPI.

## V6 fixes
- KPI uang di Dashboard menggunakan layout Rp + nominal terpisah agar tidak terpotong.
- KPI utama dan panel ringkasan dapat diklik dan membuka detail animated modal.
- Panel Serapan, Profil Fisik, dan Progress PKPT juga interaktif.
- Mempertahankan editor kertas kerja V5 dan manajemen tahun.
