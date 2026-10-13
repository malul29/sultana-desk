# PRD — Sultana Desk

Platform internal PT. Balla Sultana Samata (Sultana Living) untuk membuat dokumen penjualan siap cetak, mengelola stok unit, dan melihat laporan penjualan.

| | |
|---|---|
| Status | Dipakai di tahap uji; fitur inti selesai, laporan lanjutan direncanakan |
| Pemilik produk | Tim Sultana Living |
| Basis | Kode di repo `malul29/sultana-desk` (`main`) |
| Catatan | Bagian "Fakta yang perlu dikonfirmasi" di akhir belum final |

---

## 1. Latar belakang

Dokumen penjualan (surat konfirmasi, surat pemesanan, kwitansi, tanda terima) sebelumnya diisi manual di Word dari template. Akibatnya:

- nomor surat dikelola manual dan rawan ganda atau terlewat;
- isian yang sama diketik berulang, dan salah ketik tidak terdeteksi;
- status unit (tersedia, dipesan, terjual) dicatat terpisah dari dokumen sehingga sering tidak sinkron;
- tidak ada satu tempat untuk melihat siapa membuat dokumen apa, dan berapa nilai penjualan.

## 2. Tujuan

1. Mengubah isian form menjadi dokumen PDF dan Word yang sama dengan template perusahaan.
2. Menjamin nomor dokumen unik dan berurutan tanpa celah.
3. Menyimpan setiap dokumen yang dicetak beserta isiannya, sehingga bisa dicari, dicetak ulang, dan dikoreksi.
4. Menjaga status stok unit tetap sinkron dengan dokumen yang terbit.
5. Memberi manajemen (admin) laporan penjualan yang bisa dipercaya.

### Bukan tujuan (saat ini)

- Bukan sistem akuntansi atau pembukuan. Uang masuk dijumlahkan dari kwitansi, belum dicocokkan dengan jadwal pembayaran.
- Tidak mengirim dokumen otomatis (email atau WhatsApp).
- Tidak ada portal untuk pembeli.
- Tidak mengelola komisi sales.
- Tidak tersedia sebagai aplikasi seluler. Web responsif saja.

## 3. Pengguna dan peran

| Peran | Siapa | Boleh |
|---|---|---|
| **Admin** | Manajemen, admin kantor | Semua fitur: membuat dokumen, mengoreksi dokumen yang sudah dicetak, mengelola stok unit, melihat Laporan Penjualan, mengelola pengguna, melihat log aktivitas |
| **Staf** | Sales, petugas administrasi | Membuat dokumen, melihat Riwayat Dokumen dan Stok Unit. Tidak bisa mengubah dokumen tercetak, mengubah stok, melihat laporan, atau mengelola pengguna |

Akses dibatasi di server, bukan hanya disembunyikan di tampilan.

## 4. Lingkup fungsional

### 4.1 Dokumen

| Dokumen | Isi dan fungsi | Efek ke stok |
|---|---|---|
| **Surat Konfirmasi Unit (SKU)** | Konfirmasi pemesanan awal. Boleh memuat uang reservasi. Per dokumen dicetak 3 rangkap | Unit menjadi *dipesan* |
| **Surat Pemesanan Unit (SPU)** | Pemesanan resmi, tanpa baris reservasi. Per dokumen dicetak 3 rangkap | Unit menjadi *dipesan* |
| **Kwitansi** | Bukti pembayaran booking fee atau uang muka. Rekening tujuan selalu PT. Balla Sultana Samata | Unit menjadi *terjual* |
| **Tanda Terima** | Bukti penyerahan atau penerimaan dokumen | Tidak ada |
| **S&K Surat Pesanan** | Syarat dan ketentuan baku, tidak bernomor dan tidak tersimpan | Tidak ada |
| **Kwitansi kosong** | Kwitansi tanpa isi untuk ditulis tangan, tidak bernomor dan tidak tersimpan | Tidak ada |

Setiap SKU dan SPU berisi 9 halaman: 3 rangkap, masing-masing terdiri dari surat, syarat dan ketentuan, dan denah lokasi unit (dengan unit yang dipesan ditandai merah di masterplan).

### 4.2 Isian dan validasi

- Semua isian yang berlaku **wajib diisi** sebelum dokumen bisa dicetak. Tombol Cetak terkunci sampai lengkap, isian yang kurang ditandai, dan tiap isian wajib diberi tanda `*`.
- Server memeriksa ulang aturan yang sama dan menolak dokumen tidak lengkap dengan daftar isian yang kurang (422). Dokumen yang gagal tidak memakai nomor.
- **Berkas unggahan tidak wajib.** KTP, NPWP dan, untuk SPU dengan KPR, KK, rekening koran, dan surat nikah. PDF, JPG, PNG, atau WEBP, maksimal 8 MB. Jenis berkas dicek dari isinya, bukan ekstensinya.
- Berkas yang diunggah bisa dilihat dan diunduh dari form dan dari Riwayat Dokumen.

### 4.3 Cara pembayaran dan jadwal

Dokumen hanya menampilkan cara pembayaran yang dipilih, dalam satu tabel jadwal.

| Cara | Baris jadwal |
|---|---|
| **Tunai keras** | Reservasi (hanya SKU), Booking Fee, Pelunasan (otomatis 1 bulan setelah Booking Fee) |
| **Tunai bertahap** | Reservasi (hanya SKU), Booking Fee, angsuran maksimal 10 kali dengan tanggal bulanan otomatis |
| **KPR** | Reservasi (hanya SKU), Booking Fee, uang muka maksimal 12 kali dengan tanggal bulanan otomatis, Pelunasan KPR |

Aturan jadwal dipakai bersama oleh browser dan server, jadi tampilan dan hasil cetak selalu sama.

### 4.4 Penomoran

- Format `NNN/SL-BSS/<bulan romawi>/<tahun>`, contoh `007/SL-BSS/X/2026`.
- **Urutan kembali ke 001 setiap bulan**, mengikuti bulan pada tanggal dokumen. Satu urutan dipakai bersama oleh keempat jenis dokumen.
- Nomor diambil secara atomik dalam transaksi yang sama dengan penyimpanan dokumen: dua pengguna tidak mungkin mendapat nomor yang sama, dan dokumen yang gagal tidak menghabiskan nomor.
- Nomor tidak berubah setelah dokumen dikoreksi.

### 4.5 Stok unit

- 36 unit awal (7 Deluxe, 23 Executive, 6 Premiere), terisi otomatis pada instalasi baru dan berstatus *tersedia*.
- Status: **tersedia**, **dipesan**, **terjual**. SKU atau SPU mengubah menjadi *dipesan*, Kwitansi mengubah menjadi *terjual*. Hanya unit *terjual* yang tidak bisa dipesan lagi. Kwitansi tidak pernah menurunkan status unit yang sudah terjual.
- Kartu unit menampilkan nomor, status, type, luas tanah dan bangunan, nama pemesan atau pembeli terakhir, nomor dokumen, dan nilai (Harga Pengikatan).
- Admin menambah, mengubah (semua status), dan menghapus unit. Tampilan dibagi per halaman, tiga kartu per baris.
- Masterplan interaktif di samping daftar unit, dengan warna per type dan status.

### 4.6 Riwayat dokumen

Tabel semua dokumen dengan pencarian (nomor, nama, unit), filter jenis, pagination (10, 25, 50, 100 per halaman), tautan **Cetak PDF**, **Word**, dan berkas unggahan. Admin dapat **mengoreksi** dokumen tercetak: nomor tetap, PDF dibuat ulang, stok disesuaikan, dan perubahan dicatat (siapa, kapan, apa yang berubah).

### 4.7 Laporan penjualan (admin)

Ringkasan penjualan dan stok: total penjualan, terjual dan dipesan, uang masuk (jumlah kwitansi), rata-rata harga, grafik per bulan, status stok, per cara bayar, per type, per sales, ranking unit termahal, daftar penjualan, dan unduhan CSV. Nilai penjualan adalah Harga Pengikatan pada SKU atau SPU terbaru dari unit yang masih dipesan atau terjual.

### 4.8 Pengguna dan keamanan

- Login dengan username dan password (scrypt). Sesi disimpan di cookie httpOnly, hanya hash token yang disimpan.
- Percobaan gagal dibatasi: 5 kali per 15 menit per kombinasi alamat dan username. Akun nonaktif mendapat pesan yang jelas setelah password benar.
- Perlindungan CSRF, header keamanan, dan semua endpoint data wajib login.
- Admin menambah pengguna, mengganti peran, mengaktifkan atau menonaktifkan akun, dan mereset password. Reset password mengakhiri sesi pengguna itu.
- Log aktivitas (login, dokumen, stok, pengguna). Tampilan menampilkan maksimal 100 entri terakhir, seluruhnya tersimpan di database.

## 5. Kebutuhan non-fungsional

| Area | Kebutuhan |
|---|---|
| **Data** | PostgreSQL. Isian dokumen disimpan utuh (JSON), PDF dan berkas unggahan disimpan di database. Migrasi otomatis dan terkunci saat aplikasi menyala |
| **Dokumen** | Word dibuat dengan `docx`, PDF dikonversi dengan LibreOffice. Hasil mengikuti template: font, kertas, dan tata letak |
| **Kinerja** | Konversi PDF dibatasi (bawaan 1 pekerja pada server 2 GB). Pembuatan satu dokumen sekitar 1–2 detik |
| **Penyebaran** | Docker (aplikasi, database, Caddy untuk HTTPS otomatis) atau Coolify. Bisa diakses langsung lewat IP untuk uji. Panduan di `DEPLOY.md` |
| **Cadangan** | Skrip backup dan restore tersedia. Wajib dijadwalkan karena database memuat KTP dan NPWP pemesan |
| **Kualitas** | 42 tes otomatis (server, aturan jadwal, penomoran, stok awal). Tampilan belum punya tes otomatis |
| **Peramban** | Chrome, Edge, Safari, dan Firefox versi terbaru |

## 6. Aturan bisnis penting

1. Satu unit hanya bisa punya satu pemilik aktif. Unit *terjual* tidak bisa dipesan lagi.
2. Kwitansi untuk unit yang sudah terjual tetap boleh dibuat (pembayaran lanjutan) tanpa mengubah pemilik.
3. Dokumen yang sudah dicetak hanya bisa diubah oleh admin dan selalu terlacak.
4. Rekening tujuan: SKU memakai rekening atas nama Megawati dan Rosdiana (Mandiri), SPU dan kwitansi memakai rekening PT. Balla Sultana Samata (BTN).
5. Isi syarat dan ketentuan SKU dan SPU sama dengan template Surat Pesanan, dengan nama dokumen disesuaikan.

## 7. Fakta yang perlu dikonfirmasi

Bagian ini diambil dari berkas template dan belum dikonfirmasi pemilik.

- Nomor rekening BTN `01057-01-30-000035-8` dan nomor telepon footer `0877-8575-8656` masih berlaku.
- Rekening SPU memang rekening BTN PT, bukan rekening lain.
- Pasal uang reservasi SKU (dikembalikan 100% dalam 7 hari kerja) tidak ikut lagi setelah S&K diganti template. Apakah SKU masih membutuhkannya?
- Nomor kembali ke 001 mengikuti bulan pada tanggal dokumen. Apakah seharusnya mengikuti bulan saat dokumen dicetak?
- Apakah staf boleh melihat nilai dan nama pembeli di Stok Unit dan kolom Jumlah di Riwayat Dokumen?

## 8. Rencana pengembangan

**Tingkat 1: laporan dari data yang sudah ada** (kira-kira 2–3 hari)
Filter per periode, type, sales, dan cara bayar. Perbandingan dengan periode sebelumnya. Laporan per sumber informasi dan kinerja sales. Ekspor Excel dan PDF. Lama unit belum terjual.

**Tingkat 2: pelacakan pembayaran** (kira-kira 1–2 minggu, perubahan terbesar)
Mencatat pembayaran per baris jadwal dan menautkan kwitansi ke baris itu. Hasilnya: piutang dan keterlambatan, sisa pembayaran per unit, proyeksi arus kas, dan pembatalan pesanan beserta alasannya. Butuh tabel baru dan perubahan form kwitansi.

**Tingkat 3: pelaporan lanjutan** (kira-kira 2–4 minggu)
Komisi sales, laporan terjadwal lewat email atau WhatsApp, dasbor per peran, penyusun laporan sendiri, dan hak akses per laporan.

**Lainnya**
Tes tampilan otomatis, memecah `public/index.html` (sekitar 3.000 baris), pembatasan beban pembuatan PDF, kirim PDF lewat WhatsApp, tombol batalkan pesanan.

## 9. Ukuran keberhasilan

| Ukuran | Target |
|---|---|
| Dokumen dengan nomor ganda atau terlewat | 0 |
| Dokumen yang dibuat lewat sistem dibanding manual | semua dokumen penjualan baru |
| Selisih status unit dengan dokumen terbit | 0 |
| Waktu membuat satu SKU atau SPU | kurang dari 5 menit |
| Laporan penjualan bulanan tanpa rekap manual | ya |

## 10. Risiko

| Risiko | Penanganan |
|---|---|
| Kehilangan data KTP dan NPWP bila server atau database rusak | Backup terjadwal dan uji pemulihan |
| Kebocoran data pribadi | Akses berperan, login wajib, HTTPS lewat domain, jangan membuka port 3000 ke internet |
| Hasil cetak berbeda dari template di Word | Tata letak dibuat dan diuji lewat konversi PDF. Perbedaan font di Word masih mungkin |
| Server 2 GB bersama Coolify kehabisan memori saat membuat PDF | Swap 2 GB dan satu pekerja PDF |
| Pembayaran tidak tercatat per jadwal, sehingga laporan piutang belum bisa | Tingkat 2 pada rencana pengembangan |
