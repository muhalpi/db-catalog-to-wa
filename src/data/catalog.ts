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

// Edit semua produk di file ini:
// - tambah/hapus item baru
// - ubah harga
// - ubah varian/nominal/provider
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
    isAvailable: true,
    variants: [
      { id: "1-bulan", label: "1 Bulan", price: 25000, isAvailable: true },
      { id: "3-bulan", label: "3 Bulan", price: 70000, isAvailable: false },
      { id: "1-tahun", label: "1 Tahun", price: 250000, isAvailable: false },
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
    id: "token-pln",
    kind: "token",
    name: "Token Listrik",
    category: "Token Listrik",
    description: "Pilih nominal token PLN yang kamu butuhkan.",
    isAvailable: true,
    nominals: [
      { value: 20000, price: 20000, isAvailable: true },
      { value: 50000, price: 50000, isAvailable: true },
      { value: 100000, price: 100000, isAvailable: true },
      { value: 200000, price: 200000, isAvailable: true },
      { value: 500000, price: 500000, isAvailable: true },
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
    id: "pulsa-reguler",
    kind: "pulsa",
    name: "Pulsa",
    category: "Pulsa",
    description: "Pilih provider dan nominal yang tersedia.",
    isAvailable: true,
    providers: [
      {
        id: "telkomsel",
        label: "Telkomsel",
        isAvailable: true,
        nominals: [
          { value: 5000, price: 5000, isAvailable: true },
          { value: 10000, price: 10000, isAvailable: true },
          { value: 15000, price: 15000, isAvailable: true },
          { value: 25000, price: 25000, isAvailable: true },
          {
            value: 50000,
            price: 50000,
            promoPrice: 47000,
            promoLabel: "Diskon",
            isAvailable: true,
          },
          { value: 100000, price: 100000, isAvailable: true },
        ],
      },
      {
        id: "indosat",
        label: "Indosat",
        isAvailable: true,
        nominals: [
          { value: 5000, price: 5000, isAvailable: true },
          { value: 10000, price: 10000, isAvailable: true },
          { value: 25000, price: 25000, isAvailable: true },
          { value: 50000, price: 50000, isAvailable: true },
          { value: 100000, price: 100000, isAvailable: true },
        ],
      },
      {
        id: "xl",
        label: "XL",
        isAvailable: true,
        nominals: [
          { value: 5000, price: 5000, isAvailable: true },
          { value: 10000, price: 10000, isAvailable: true },
          { value: 15000, price: 15000, isAvailable: true },
          { value: 25000, price: 25000, isAvailable: true },
          { value: 50000, price: 50000, isAvailable: true },
        ],
      },
      {
        id: "tri",
        label: "Tri",
        isAvailable: true,
        nominals: [
          { value: 5000, price: 5000, isAvailable: true },
          { value: 10000, price: 10000, isAvailable: true },
          { value: 20000, price: 20000, isAvailable: true },
          { value: 50000, price: 50000, isAvailable: true },
        ],
      },
      {
        id: "smartfren",
        label: "Smartfren",
        isAvailable: true,
        nominals: [
          { value: 10000, price: 10000, isAvailable: true },
          { value: 20000, price: 20000, isAvailable: true },
          { value: 50000, price: 50000, isAvailable: true },
          { value: 100000, price: 100000, isAvailable: true },
        ],
      },
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
];
