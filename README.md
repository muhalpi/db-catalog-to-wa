# DB Catalog to WA

Web katalog produk digital dengan alur:

`Pilih produk -> tambah ke keranjang -> isi form checkout -> kirim detail order ke WhatsApp`

Project ini pakai Next.js (App Router), Neon Postgres untuk penyimpanan katalog admin, dan tanpa payment gateway.

## Fitur Utama

- Katalog buyer dengan filter kategori + pencarian
- Urutan produk otomatis: kategori lalu nama (A-Z)
- Quantity stepper + ringkasan keranjang
- Tombol hapus item dari keranjang
- Checkout langsung ke WhatsApp admin dengan format pesan otomatis
- Halaman detail produk (`/produk/[id]`) untuk S&K + checkout
- Dark mode + toggle switch di buyer
- Admin login (`/admin/login`) + editor katalog (`/admin`)
- Editor produk mode daftar/detail, termasuk varian, nominal, promo, jadwal promo, status aktif
- Data katalog dibaca dari database (fallback ke `src/data/catalog.ts` jika `DATABASE_URL` belum ada)

## Tech Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- PostgreSQL (Neon) via `pg`

## Prasyarat

- Node.js 20+ (disarankan LTS terbaru)
- npm 10+
- Database PostgreSQL (Neon)

## Instalasi Lokal

1. Install dependency

```bash
npm install
```

2. Buat file environment

macOS/Linux:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

3. Isi value di `.env.local`

```env
NEXT_PUBLIC_WHATSAPP_NUMBER=6281234567890
ADMIN_PASSWORD=isi_password_admin
ADMIN_SESSION_SECRET=isi_secret_panjang_acak
DATABASE_URL=postgres://username:password@host.neon.tech/dbname?sslmode=verify-full
```

4. Jalankan development server

```bash
npm run dev
```

5. Buka:

- Buyer: [http://localhost:3000](http://localhost:3000)
- Admin login: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

## Environment Variables

- `NEXT_PUBLIC_WHATSAPP_NUMBER`:
  nomor WhatsApp tujuan checkout (format internasional, tanpa `+`).
- `ADMIN_PASSWORD`:
  password login admin.
- `ADMIN_SESSION_SECRET`:
  secret untuk sign cookie sesi admin.
- `DATABASE_URL`:
  koneksi PostgreSQL/Neon untuk simpan katalog.

## Cara Kerja Data Katalog

- Endpoint publik buyer: `GET /api/catalog`
- Endpoint admin katalog:
  - `GET /api/admin/catalog`
  - `PUT /api/admin/catalog`
- Saat pertama kali jalan, tabel `catalog_configs` akan dibuat otomatis jika belum ada.
- Jika `DATABASE_URL` kosong, aplikasi fallback ke data lokal `src/data/catalog.ts`.

## Script Penting

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Deploy ke Vercel

1. Push ke GitHub.
2. Import repo ke Vercel.
3. Tambahkan semua env vars:
   - `NEXT_PUBLIC_WHATSAPP_NUMBER`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
   - `DATABASE_URL`
4. Deploy.

## Struktur Folder

```text
src/
  app/
    admin/                 # halaman admin
    api/                   # endpoint katalog + auth admin
    produk/[id]/           # halaman detail produk buyer
    page.tsx               # halaman utama buyer
  components/
    admin/                 # komponen login + editor admin
    buyer/                 # komponen buyer (detail checkout form)
  data/
    catalog.ts             # seed/default katalog + type
  lib/
    admin-session.ts       # auth cookie admin
    catalog-storage.ts     # load/save katalog ke DB
```

## Catatan

- Tidak ada payment gateway: pembayaran tetap diproses manual lewat chat WhatsApp.
- Untuk keamanan produksi:
  - gunakan password admin kuat,
  - isi `ADMIN_SESSION_SECRET` random panjang,
  - pastikan project/environment Vercel private.
