# Sultana Desk — Deploy ke VPS

Sistem terdiri dari 3 container: **PostgreSQL** (data), **app** (Node/Express + LibreOffice untuk membuat PDF), dan **Caddy** (HTTPS otomatis).

Setiap dokumen dicetak sebagai **PDF** (dibuat dari tata letak Word oleh LibreOffice di dalam container) dan salinan PDF-nya diarsipkan di database.

## Kebutuhan
- VPS Linux (Ubuntu 22.04/24.04), minimal 1 vCPU / **2 GB RAM** (LibreOffice butuh memori saat membuat PDF)
- Sebuah domain/subdomain yang **A record**-nya mengarah ke IP VPS (mis. `dokumen.sultanaliving.co.id`)
- Port 80 dan 443 terbuka

## 1. Siapkan server (sekali saja)
```bash
# Docker
curl -fsSL https://get.docker.com | sh
# Firewall: hanya SSH + web
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
```

## 2. Pasang aplikasi
Salin folder `app` ke server (mis. ke `/opt/sultana`), lalu:
```bash
cd /opt/sultana
cp .env.example .env
nano .env        # isi DOMAIN, DB_PASSWORD (openssl rand -hex 24), ADMIN_USERNAME/ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f app     # tunggu "Sultana Desk → http://localhost:3000"
```
Buka `https://<domain-anda>` dan login dengan akun admin dari `.env`. Sertifikat HTTPS diurus Caddy otomatis (butuh DNS sudah benar).

**Langkah pertama setelah login:** menu *Pengguna & Aktivitas* → tambah akun staf/sales, lalu klik *Ubah password* untuk akun admin.

## 3. Peran
| | Admin | Staf |
|---|---|---|
| Membuat dokumen (SKU, Pemesanan, Kwitansi, Tanda Terima) | ✔ | ✔ |
| Melihat riwayat dokumen & stok unit | ✔ | ✔ |
| Tambah/ubah/hapus unit, ubah status stok | ✔ | ✘ |
| Kelola pengguna, lihat log aktivitas | ✔ | ✘ |

Setiap dokumen mencatat siapa pembuatnya. Akun yang dinonaktifkan atau di-reset passwordnya langsung keluar dari semua sesi.

## 3b. Berkas unggahan (KTP, NPWP, KK, rekening koran, surat nikah)
Berkas yang diunggah staf pada SKU/SPU disimpan **di dalam database** (bukan di folder terpisah), jadi ikut tercadangkan oleh `backup.sh`/cron di bawah dan ikut terpulihkan saat restore. Perkiraan ruang: scan 1–3 MB per berkas, 2–5 berkas per dokumen. Berkas yang diunggah tetapi dokumennya tidak jadi dicetak dihapus otomatis setelah 24 jam.

## 4. Cadangan (WAJIB)
```bash
./deploy/backup.sh                 # coba sekali
crontab -e                         # lalu tambahkan:
0 2 * * * cd /opt/sultana && ./deploy/backup.sh >> backups/backup.log 2>&1
```
Backup harian disimpan di `backups/` (30 hari terakhir). **Salin folder itu ke tempat lain** (komputer kantor / cloud storage) secara berkala — backup di server yang sama tidak melindungi bila server hilang.

Pulihkan: `./deploy/restore.sh backups/sultana-YYYY-MM-DD-HHMM.sql.gz`

## 5. Update aplikasi
```bash
cd /opt/sultana
# salin kode terbaru, lalu:
docker compose up -d --build
```
Skema database diperbarui otomatis saat aplikasi start (folder `src/migrations`). Lakukan backup dulu sebelum update.

## 6. Memindahkan data dari versi lama (SQLite)
Jika sebelumnya sudah memakai versi SQLite dan ada data yang harus dipertahankan: salin `data/sultana.db` dan `data/counter.json` ke folder `data/` di server, lalu
```bash
docker compose exec app node scripts/migrate-sqlite.js
```
Aman dijalankan ulang (data yang sudah ada dilewati). Nomor surat berlanjut dari nomor terakhir.

## Perintah berguna
```bash
docker compose ps                          # status
docker compose logs --tail=100 app         # log aplikasi
docker compose exec app node scripts/create-user.js budi "Budi Santoso" staff   # tambah user lewat terminal
docker compose restart app
```

## Catatan keamanan
- Database tidak dibuka ke internet (tanpa `ports`); hanya container app yang dapat mengaksesnya.
- Password disimpan ter-hash (scrypt); sesi memakai cookie `HttpOnly`, `Secure`, `SameSite=Lax`; login dikunci 15 menit setelah 5 kali gagal.
- Jangan menaruh file `.env` di tempat yang dapat diakses orang lain.

## Menjalankan di komputer sendiri (pengembangan)
```bash
# sekali saja, untuk membuat PDF di komputer sendiri:
brew install --cask libreoffice

npm install
npm run dev        # PostgreSQL bawaan + aplikasi di http://localhost:3000  (login: admin / admin12345)
npm test           # tes otomatis terhadap PostgreSQL asli (tes PDF dilewati bila LibreOffice tidak ada)
```

---

# Deploy dengan Coolify

Coolify sudah mengurus domain + HTTPS (Traefik), jadi pakai **`docker-compose.coolify.yml`** (tanpa Caddy).

1. **Simpan kode di Git** (repo privat GitHub/GitLab). Folder `app` adalah root repo; `.gitignore` sudah mengecualikan `node_modules`, `data/pg-dev`, `.env`.
2. Di Coolify: **Projects → + New → Resource → Private Repository** (GitHub App atau Deploy Key) → pilih repo & branch.
3. **Build Pack: Docker Compose**, *Docker Compose Location*: `/docker-compose.coolify.yml`.
4. **Environment Variables**: isi `ADMIN_USERNAME`, `ADMIN_PASSWORD` (min. 8 karakter), opsional `ADMIN_NAME`. Password database dibuat otomatis oleh Coolify (`SERVICE_PASSWORD_POSTGRES`).
5. **Domain**: pada service **app** isi `https://desk.domain-anda.co.id:3000` (DNS A record harus sudah ke IP server). Service **db** tidak diberi domain.
6. **Deploy**. Build pertama ±5–10 menit (memasang LibreOffice).
7. Isi stok unit sekali: buka service **app → Terminal**, jalankan `node scripts/seed-units.js`.
8. **Backup harian ke backup storage** (di server, lewat SSH; ganti `/mnt/backup` dengan lokasi backup storage Anda, cek dengan `df -h`). Nama container database di Coolify berawalan `db-`:
   ```
   mkdir -p /mnt/backup/sultana
   crontab -e
   ```
   tambahkan baris:
   ```
   0 2 * * * docker exec $(docker ps -qf name=^db- | head -1) pg_dump -U sultana --no-owner sultana | gzip > /mnt/backup/sultana/sultana-$(date +\%F).sql.gz && find /mnt/backup/sultana -name '*.sql.gz' -mtime +30 -delete
   ```
   Jika ada lebih dari satu container berawalan `db-`, ganti `$(docker ps …)` dengan nama container yang tampil di Coolify.

Catatan memori: Coolify sendiri memakai ±0,7–1 GB RAM. Di VPS 2 GB, **aktifkan swap 2 GB** dan biarkan `PDF_WORKERS=1`.
