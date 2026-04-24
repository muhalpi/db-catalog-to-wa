export type FieldType = "tel" | "email" | "text";

export type Requirement = {
  key: string;
  label: string;
  placeholder: string;
  type: FieldType;
};

export type VariantOption = {
  id: string;
  label: string;
  price: number;
  promoPrice?: number;
  promoLabel?: string;
  promoStart?: string;
  promoEnd?: string;
  isAvailable: boolean;
};

export type NominalOption = {
  value: number;
  price: number;
  promoPrice?: number;
  promoLabel?: string;
  promoStart?: string;
  promoEnd?: string;
  isAvailable: boolean;
};

export type PulsaProvider = {
  id: string;
  label: string;
  isAvailable: boolean;
  nominals: NominalOption[];
};

type ProductBase = {
  id: string;
  name: string;
  category: string;
  description: string;
  terms?: string[];
  isAvailable: boolean;
  requirements: Requirement[];
};

export type VariantsProduct = ProductBase & {
  kind: "variants";
  variants: VariantOption[];
};

export type TokenProduct = ProductBase & {
  kind: "token";
  nominals: NominalOption[];
};

export type PulsaProduct = ProductBase & {
  kind: "pulsa";
  providers: PulsaProvider[];
};

export type Product = VariantsProduct | TokenProduct | PulsaProduct;

function slugifyIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildUniqueId(baseId: string, usedIds: Set<string>) {
  const normalizedBase = slugifyIdPart(baseId) || "item";
  let candidate = normalizedBase;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

// Backward-compat helper:
// data lama kind "pulsa" (dengan providers) otomatis dipecah
// jadi beberapa produk "token" terpisah per provider.
export function normalizeCatalogProducts(products: Product[]) {
  const normalized: Product[] = [];
  const usedIds = new Set<string>();

  function pushProduct(product: Product) {
    const nextId = buildUniqueId(product.id, usedIds);
    usedIds.add(nextId);
    normalized.push(nextId === product.id ? product : { ...product, id: nextId });
  }

  products.forEach((product) => {
    if (product.kind !== "pulsa") {
      pushProduct(product);
      return;
    }

    if (!product.providers.length) {
      return;
    }

    product.providers.forEach((provider) => {
      const providerKey = slugifyIdPart(provider.id || provider.label) || "provider";
      const providerProduct: TokenProduct = {
        id: `${product.id}-${providerKey}`,
        kind: "token",
        name: provider.label || product.name,
        category: product.category,
        description: product.description,
        terms: product.terms,
        isAvailable: product.isAvailable && provider.isAvailable,
        nominals: provider.nominals,
        requirements: product.requirements,
      };
      pushProduct(providerProduct);
    });
  });

  return normalized;
}

// Edit semua produk di file ini:
// - tambah/hapus item baru
// - ubah harga
// - ubah varian/nominal
// - atur status tersedia via isAvailable
// - atur promo via promoPrice (opsional) dan promoLabel (opsional)
// - atur jadwal promo via promoStart/promoEnd (opsional, format ISO datetime)
export const CATALOG_PRODUCTS: Product[] = [
  {
    id: "canva-pro",
    kind: "variants",
    name: "Canva Pro",
    category: "Premium",
    description: "Aktivasi akun Canva Pro, proses cepat saat jam operasional.",
    terms: [
      "Akun wajib aktif dan email valid.",
      "Garansi sesuai masa aktif paket yang dipilih.",
      "Kesalahan data dari pembeli di luar tanggung jawab seller.",
    ],
    isAvailable: true,
    variants: [
      { id: "1-bulan", label: "1 Bulan", price: 25000, isAvailable: true },
      { id: "3-bulan", label: "3 Bulan", price: 70000, isAvailable: true },
      { id: "1-tahun", label: "1 Tahun", price: 250000, isAvailable: true },
    ],
    requirements: [
      {
        key: "activationEmail",
        label: "Email akun untuk aktivasi",
        placeholder: "contoh@gmail.com",
        type: "email",
      },
    ],
  },
  {
    id: "youtube-premium",
    kind: "variants",
    name: "YouTube Premium",
    category: "Premium",
    description: "Aktivasi premium dengan panduan sampai selesai.",
    terms: [
      "Pastikan email akun YouTube/Google valid.",
      "Akun tidak boleh sedang melanggar kebijakan Google.",
      "Garansi mengikuti durasi paket aktif.",
    ],
    isAvailable: true,
    variants: [
      { id: "1-bulan", label: "1 Bulan", price: 22000, isAvailable: true },
      {
        id: "3-bulan",
        label: "3 Bulan",
        price: 65000,
        promoPrice: 59000,
        promoLabel: "Promo Spesial",
        isAvailable: true,
      },
      { id: "1-tahun", label: "1 Tahun", price: 230000, isAvailable: true },
    ],
    requirements: [
      {
        key: "activationEmail",
        label: "Email akun untuk aktivasi",
        placeholder: "contoh@gmail.com",
        type: "email",
      },
    ],
  },
  {
    id: "netflix-premium",
    kind: "variants",
    name: "Netflix Premium",
    category: "Premium",
    description: "Sharing akun Netflix premium sesuai varian yang dipilih.",
    terms: [
      "Dilarang mengubah profil utama tanpa izin.",
      "Dilarang mengganti password akun sharing.",
      "Pelanggaran aturan akun bisa menyebabkan garansi gugur.",
    ],
    isAvailable: true,
    variants: [
      { id: "1p-1bulan", label: "1 Profile - 1 Bulan", price: 35000, isAvailable: true },
      { id: "2p-1bulan", label: "2 Profile - 1 Bulan", price: 65000, isAvailable: true },
      { id: "1p-3bulan", label: "1 Profile - 3 Bulan", price: 95000, isAvailable: true },
    ],
    requirements: [
      {
        key: "netflixEmail",
        label: "Email akun Netflix",
        placeholder: "contoh@gmail.com",
        type: "text",
      },
    ],
  },
  {
    id: "pulsa-telkomsel",
    kind: "token",
    name: "Telkomsel",
    category: "Pulsa & Data",
    description: "Pulsa & data provider Telkomsel.",
    terms: [
      "Nomor tujuan harus aktif dan benar.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
      "Salah input nomor oleh pembeli tidak bisa refund.",
    ],
    isAvailable: true,
    nominals: [
      { value: 5000, price: 6000, isAvailable: true },
      { value: 10000, price: 11000, isAvailable: true },
      { value: 15000, price: 16000, isAvailable: true },
      { value: 25000, price: 26000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
      { value: 100000, price: 101000, isAvailable: true },
    ],
    requirements: [
      {
        key: "targetPhone",
        label: "Nomor HP tujuan",
        placeholder: "08xxxxxxxxxx",
        type: "tel",
      },
    ],
  },
  {
    id: "pulsa-indosat",
    kind: "token",
    name: "Indosat",
    category: "Pulsa & Data",
    description: "Pulsa & data provider Indosat.",
    terms: [
      "Nomor tujuan harus aktif dan benar.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
      "Salah input nomor oleh pembeli tidak bisa refund.",
    ],
    isAvailable: true,
    nominals: [
      { value: 5000, price: 6000, isAvailable: true },
      { value: 10000, price: 11000, isAvailable: true },
      { value: 25000, price: 26000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
      { value: 100000, price: 101000, isAvailable: true },
    ],
    requirements: [
      {
        key: "targetPhone",
        label: "Nomor HP tujuan",
        placeholder: "08xxxxxxxxxx",
        type: "tel",
      },
    ],
  },
  {
    id: "pulsa-smartfren",
    kind: "token",
    name: "Smartfren",
    category: "Pulsa & Data",
    description: "Pulsa & data provider Smartfren.",
    terms: [
      "Nomor tujuan harus aktif dan benar.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
      "Salah input nomor oleh pembeli tidak bisa refund.",
    ],
    isAvailable: true,
    nominals: [
      { value: 5000, price: 6000, isAvailable: true },
      { value: 10000, price: 11000, isAvailable: true },
      { value: 15000, price: 16000, isAvailable: true },
      { value: 25000, price: 26000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
      { value: 100000, price: 101000, isAvailable: true },
    ],
    requirements: [
      {
        key: "targetPhone",
        label: "Nomor HP tujuan",
        placeholder: "08xxxxxxxxxx",
        type: "tel",
      },
    ],
  },
  {
    id: "pulsa-three",
    kind: "token",
    name: "Three",
    category: "Pulsa & Data",
    description: "Pulsa & data provider Three.",
    terms: [
      "Nomor tujuan harus aktif dan benar.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
      "Salah input nomor oleh pembeli tidak bisa refund.",
    ],
    isAvailable: true,
    nominals: [
      { value: 5000, price: 6000, isAvailable: true },
      { value: 10000, price: 11000, isAvailable: true },
      { value: 20000, price: 21000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
      { value: 100000, price: 101000, isAvailable: true },
    ],
    requirements: [
      {
        key: "targetPhone",
        label: "Nomor HP tujuan",
        placeholder: "08xxxxxxxxxx",
        type: "tel",
      },
    ],
  },
  {
    id: "pulsa-xl",
    kind: "token",
    name: "XL",
    category: "Pulsa & Data",
    description: "Pulsa & data provider XL.",
    terms: [
      "Nomor tujuan harus aktif dan benar.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
      "Salah input nomor oleh pembeli tidak bisa refund.",
    ],
    isAvailable: true,
    nominals: [
      { value: 5000, price: 6000, isAvailable: true },
      { value: 10000, price: 11000, isAvailable: true },
      { value: 15000, price: 16000, isAvailable: true },
      { value: 25000, price: 26000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
    ],
    requirements: [
      {
        key: "targetPhone",
        label: "Nomor HP tujuan",
        placeholder: "08xxxxxxxxxx",
        type: "tel",
      },
    ],
  },
  {
    id: "pulsa-axis",
    kind: "token",
    name: "Axis",
    category: "Pulsa & Data",
    description: "Pulsa & data provider Axis.",
    terms: [
      "Nomor tujuan harus aktif dan benar.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
      "Salah input nomor oleh pembeli tidak bisa refund.",
    ],
    isAvailable: true,
    nominals: [
      { value: 5000, price: 6000, isAvailable: true },
      { value: 10000, price: 11000, isAvailable: true },
      { value: 15000, price: 16000, isAvailable: true },
      { value: 25000, price: 26000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
    ],
    requirements: [
      {
        key: "targetPhone",
        label: "Nomor HP tujuan",
        placeholder: "08xxxxxxxxxx",
        type: "tel",
      },
    ],
  },
  {
    id: "pulsa-byu",
    kind: "token",
    name: "By.U",
    category: "Pulsa & Data",
    description: "Pulsa & data provider By.U.",
    terms: [
      "Nomor tujuan harus aktif dan benar.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
      "Salah input nomor oleh pembeli tidak bisa refund.",
    ],
    isAvailable: true,
    nominals: [
      { value: 5000, price: 6000, isAvailable: true },
      { value: 10000, price: 11000, isAvailable: true },
      { value: 15000, price: 16000, isAvailable: true },
      { value: 25000, price: 26000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
    ],
    requirements: [
      {
        key: "targetPhone",
        label: "Nomor HP tujuan",
        placeholder: "08xxxxxxxxxx",
        type: "tel",
      },
    ],
  },
  {
    id: "token-listrik-fast",
    kind: "token",
    name: "Token Listrik Fast Proses",
    category: "Token Listrik",
    description: "Token listrik proses cepat untuk kebutuhan mendesak.",
    terms: [
      "Nomor meter wajib valid dan aktif.",
      "Estimasi proses lebih cepat saat jam operasional.",
      "Token yang sudah terbit tidak bisa dibatalkan.",
    ],
    isAvailable: true,
    nominals: [
      { value: 20000, price: 22000, isAvailable: true },
      { value: 50000, price: 52000, isAvailable: true },
      { value: 100000, price: 102000, isAvailable: true },
      { value: 200000, price: 202000, isAvailable: true },
      { value: 500000, price: 502000, isAvailable: true },
    ],
    requirements: [
      {
        key: "meterNumber",
        label: "Nomor meter",
        placeholder: "Masukkan nomor meter",
        type: "text",
      },
    ],
  },
  {
    id: "token-listrik-slow",
    kind: "token",
    name: "Token Listrik Slow Proses",
    category: "Token Listrik",
    description: "Token listrik proses reguler dengan harga lebih hemat.",
    terms: [
      "Nomor meter wajib valid dan aktif.",
      "Estimasi proses lebih lambat dari layanan fast.",
      "Token yang sudah terbit tidak bisa dibatalkan.",
    ],
    isAvailable: true,
    nominals: [
      { value: 20000, price: 21000, isAvailable: true },
      { value: 50000, price: 51000, isAvailable: true },
      { value: 100000, price: 101000, isAvailable: true },
      { value: 200000, price: 201000, isAvailable: true },
      { value: 500000, price: 501000, isAvailable: true },
    ],
    requirements: [
      {
        key: "meterNumber",
        label: "Nomor meter",
        placeholder: "Masukkan nomor meter",
        type: "text",
      },
    ],
  },
  {
    id: "topup-mobile-legends",
    kind: "variants",
    name: "Topup Mobile Legends",
    category: "Topup Game",
    description: "Top-up diamond Mobile Legends cepat dan aman.",
    terms: [
      "User ID dan Zone ID wajib benar.",
      "Salah ID dari pembeli tidak bisa refund.",
      "Diamond masuk sesuai nominal paket yang dipilih.",
    ],
    isAvailable: true,
    variants: [
      { id: "86-diamond", label: "86 Diamond", price: 22000, isAvailable: true },
      { id: "172-diamond", label: "172 Diamond", price: 43000, isAvailable: true },
      { id: "257-diamond", label: "257 Diamond", price: 64000, isAvailable: true },
      { id: "344-diamond", label: "344 Diamond", price: 85000, isAvailable: true },
    ],
    requirements: [
      {
        key: "mlUserId",
        label: "User ID Mobile Legends",
        placeholder: "Contoh: 123456789",
        type: "text",
      },
      {
        key: "mlZoneId",
        label: "Zone ID",
        placeholder: "Contoh: 1234",
        type: "text",
      },
    ],
  },
  {
    id: "topup-free-fire",
    kind: "variants",
    name: "Topup Free Fire",
    category: "Topup Game",
    description: "Top-up diamond Free Fire instant saat jam operasional.",
    terms: [
      "User ID wajib benar dan akun aktif.",
      "Salah input ID dari pembeli tidak bisa refund.",
      "Proses mengikuti antrean saat jam ramai.",
    ],
    isAvailable: true,
    variants: [
      { id: "70-diamond", label: "70 Diamond", price: 10000, isAvailable: true },
      { id: "140-diamond", label: "140 Diamond", price: 20000, isAvailable: true },
      { id: "355-diamond", label: "355 Diamond", price: 50000, isAvailable: true },
      { id: "720-diamond", label: "720 Diamond", price: 98000, isAvailable: true },
    ],
    requirements: [
      {
        key: "ffUserId",
        label: "User ID Free Fire",
        placeholder: "Contoh: 123456789",
        type: "text",
      },
    ],
  },
  {
    id: "topup-roblox",
    kind: "variants",
    name: "Topup Roblox",
    category: "Topup Game",
    description: "Top-up Robux untuk akun Roblox kamu.",
    terms: [
      "Username Roblox wajib benar dan bisa ditemukan.",
      "Kesalahan username dari pembeli tidak bisa refund.",
      "Estimasi proses mengikuti antrean order.",
    ],
    isAvailable: true,
    variants: [
      { id: "80-robux", label: "80 Robux", price: 19000, isAvailable: true },
      { id: "160-robux", label: "160 Robux", price: 36000, isAvailable: true },
      { id: "400-robux", label: "400 Robux", price: 90000, isAvailable: true },
      { id: "800-robux", label: "800 Robux", price: 178000, isAvailable: true },
    ],
    requirements: [
      {
        key: "robloxUsername",
        label: "Username Roblox",
        placeholder: "Nama akun Roblox",
        type: "text",
      },
    ],
  },
];
