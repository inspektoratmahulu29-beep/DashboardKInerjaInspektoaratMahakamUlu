# Logika Formula Dashboard — Inspektorat Daerah Kabupaten Mahakam Ulu

## 1. Total Anggaran dan Realisasi Keuangan

Dashboard tidak menjumlahkan semua baris detail sekaligus dengan baris ringkasan karena itu dapat menyebabkan double counting.

Pada sheet **Realisasi Fisik & Keu**, struktur sumber diperlakukan sebagai hierarki:

- Program 1: jika baris ringkasannya kosong, total diambil dari anak-anaknya (baris 12–24).
- Program 2: jika ringkasan program terisi, angka ringkasan diperlakukan sebagai angka sumber/otoritatif (baris 26), bukan dijumlahkan ulang dengan seluruh anaknya.
- Program 3: ringkasan mengikuti satu detail sumber (baris 41 ← baris 42).

Sehingga:

`Total Anggaran = Total Program 1 + Total Program 2 + Total Program 3`

`Total Realisasi Keuangan = Realisasi Program 1 + Realisasi Program 2 + Realisasi Program 3`

Pada file yang diberikan, hasilnya selaras dengan baris **JUMLAH BELANJA**:

- Anggaran: Rp 17.588.768.787
- Realisasi keuangan: Rp 15.986.004.220
- Serapan: 90,89%

## 2. Realisasi Fisik & Keuangan per Baris

Kolom input:

- C = Anggaran
- E = Realisasi Fisik (%)
- G = Realisasi Keuangan (Rp)
- K = Permasalahan

Kolom turunan:

- D = Bobot anggaran terhadap program induk
- F = Fisik tertimbang
- H = Persentase realisasi keuangan
- I = Keuangan tertimbang
- J = Sisa dana

Rumus:

`D = C / Anggaran Program Induk × 100`

`F = D × E / 100`

`H = G / C × 100`

`I = H × D / 100`

`J = C - G`

Untuk baris dengan anggaran 0, persentase tidak dipaksa menjadi #DIV/0!; dashboard menampilkan kosong.

## 3. Total Fisik

Jika nilai realisasi fisik total pada baris kantor (misalnya E10) tersedia dari workbook, nilai tersebut dipertahankan sebagai nilai resmi sumber.

Jika kosong, dashboard menggunakan fallback tertimbang berdasarkan anggaran:

`Fisik Total = Σ(Anggaran × Fisik) / Σ(Anggaran)`

Dengan demikian data resmi dari Excel tidak ditimpa tanpa alasan.

## 4. Sheet Capaian Sasaran

Untuk enam sheet capaian, kolom `% Capaian` dan `% Realisasi Anggaran` dihitung sebagai rasio, lalu ditampilkan sebagai persentase:

`% Capaian = Realisasi Kinerja / Target Kinerja`

`% Realisasi Anggaran = Realisasi Anggaran / Pagu Anggaran`

Nilai disimpan sebagai pecahan Excel (misalnya 0,97) dan format persen membuatnya tampil sebagai 97,00%.

## 5. Kertas Kerja Lain

IKU dan Rencana Aksi diperlakukan sebagai sumber target/perencanaan, bukan kolom hasil yang dipaksakan formula.

Monev dihitung sebagai analitik dashboard: perbandingan target triwulan dan realisasi triwulan, tanpa menimpa input sumber.

Rekap PKPT dihitung dari baris penugasan: jumlah total, selesai, berjalan, belum, dan metrik penyelesaian saat target/realisasi numerik tersedia.

## 6. Import Excel

Saat Excel di-import:

1. Nilai dan formula sel dibaca.
2. Tahun dideteksi dari isi workbook.
3. Data dinormalisasi tanpa menghapus kolom kosong yang merupakan bagian dari struktur.
4. Formula turunan yang merupakan bagian dari logika dashboard dihitung ulang.
5. Nilai formula eksternal yang tidak dapat diakses tidak dibuat-buat; jika ada nilai cache, nilai cache dipertahankan.
6. Dashboard kemudian menghitung ulang KPI berdasarkan struktur sumber tersebut.

Dengan pendekatan ini, perubahan isi Excel dapat mengubah KPI tanpa harus mengubah posisi data pada dashboard secara manual.
