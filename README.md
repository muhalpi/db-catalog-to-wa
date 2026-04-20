# Katalog WA Store

Starter web katalog untuk jualan item digital (premium, pulsa, token listrik) dengan alur:

`Pilih produk -> Isi checkout -> Kirim ke WhatsApp admin`

Tidak memakai payment gateway. Checkout akan membuka WhatsApp dengan detail order otomatis.

## Fitur

- Katalog produk dengan tombol tambah/kurang quantity
- Keranjang dan total belanja
- Keranjang tersimpan di `localStorage`
- Form checkout dinamis sesuai jenis produk dalam cart
- Generate pesan checkout ke `wa.me`

## Setup Lokal

1. Install dependency

```bash
npm install
```

2. Copy file env

```bash
cp .env.example .env.local
```

3. Isi nomor WhatsApp admin di `.env.local`

```env
NEXT_PUBLIC_WHATSAPP_NUMBER=6281234567890
```

4. Jalankan project

```bash
npm run dev
```

5. Buka [http://localhost:3000](http://localhost:3000)

## Deploy ke Vercel

1. Push repo ke GitHub
2. Import project ke Vercel
3. Tambahkan Environment Variable:
- `NEXT_PUBLIC_WHATSAPP_NUMBER`
4. Deploy

## Catatan Pengembangan

- Semua data produk sekarang terpusat di `src/data/catalog.ts`
- Edit `src/data/catalog.ts` untuk tambah/hapus item
- Edit `src/data/catalog.ts` untuk ubah harga
- Edit `src/data/catalog.ts` untuk ubah varian/nominal/provider
- Edit `src/data/catalog.ts` untuk ubah status tersedia (`isAvailable`)
- Edit `src/data/catalog.ts` untuk atur promo:
- `promoPrice` untuk harga promo
- `promoLabel` untuk label promo (opsional)
- `promoStart` untuk tanggal mulai promo (opsional)
- `promoEnd` untuk tanggal akhir promo (opsional)
- Contoh format tanggal: `2026-05-01T00:00:00+07:00`
- Kalau ingin rekap order, bisa tambah endpoint `/api/order` untuk simpan ke Google Sheets
