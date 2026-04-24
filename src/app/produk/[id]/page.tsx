import Link from "next/link";
import { notFound } from "next/navigation";
import type { Product } from "@/data/catalog";
import { DetailCheckoutForm } from "@/components/buyer/detail-checkout-form";
import { loadCatalogProducts } from "@/lib/catalog-storage";

export const dynamic = "force-dynamic";

const CURRENCY_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID");

type OptionPricing = {
  price: number;
  promoPrice?: number;
  promoStart?: string;
  promoEnd?: string;
};

function formatCurrency(value: number) {
  return CURRENCY_FORMATTER.format(value);
}

function formatNominal(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function parsePromoDate(value?: string) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getDisplayPrice(option: OptionPricing) {
  const now = Date.now();
  const promoPrice = option.promoPrice;
  const start = parsePromoDate(option.promoStart);
  const end = parsePromoDate(option.promoEnd);
  const promoActive =
    typeof promoPrice === "number" &&
    promoPrice < option.price &&
    (start === null || now >= start) &&
    (end === null || now <= end);

  if (promoActive && typeof promoPrice === "number") {
    return {
      finalPrice: promoPrice,
      originalPrice: option.price,
      hasPromo: true,
    };
  }

  return {
    finalPrice: option.price,
    originalPrice: option.price,
    hasPromo: false,
  };
}

function getProductTerms(product: Product) {
  const customTerms = (product.terms ?? [])
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  if (customTerms.length > 0) {
    return customTerms;
  }

  const commonTerms = [
    "Pastikan data checkout yang kamu isi sudah benar sebelum submit.",
    "Harga dapat berubah sewaktu-waktu mengikuti update katalog.",
    "Order diproses pada jam operasional toko (10.00-22.00 WIB).",
  ];

  if (product.category === "Topup Game") {
    return [
      ...commonTerms,
      "Wajib isi User ID/Zone ID (jika diminta) dengan benar.",
      "Salah input ID yang dikirim pembeli tidak bisa direfund.",
      "Jika terjadi kendala, kirim bukti transaksi dan screenshot akun.",
    ];
  }

  if (product.category === "Token Listrik") {
    return [
      ...commonTerms,
      "Nomor meter wajib valid dan aktif.",
      "Token yang sudah berhasil terbit tidak dapat dibatalkan.",
      "Simpan kode token setelah transaksi berhasil diproses.",
    ];
  }

  if (product.category === "Pulsa & Data") {
    return [
      ...commonTerms,
      "Nomor tujuan harus aktif dan tidak dalam masa tenggang.",
      "Pastikan provider dan nominal yang dipilih sudah sesuai.",
      "Pulsa/data yang sudah masuk tidak dapat dibatalkan.",
    ];
  }

  return [
    ...commonTerms,
    "Garansi mengikuti aturan tiap layanan premium.",
    "Jika ada kendala login/aktivasi, admin akan bantu proses klaim.",
  ];
}

function renderOptions(product: Product) {
  if (product.kind === "variants") {
    return (
      <ul className="space-y-2">
        {product.variants.map((variant) => {
          const pricing = getDisplayPrice(variant);

          return (
            <li
              key={variant.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span>{variant.label}</span>
                {!variant.isAvailable ? (
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    Tidak tersedia
                  </span>
                ) : null}
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">
                  {formatCurrency(pricing.finalPrice)}
                </p>
                {pricing.hasPromo ? (
                  <p className="text-xs text-slate-400 line-through">
                    {formatCurrency(pricing.originalPrice)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  if (product.kind === "token") {
    return (
      <ul className="space-y-2">
        {product.nominals.map((nominal) => {
          const pricing = getDisplayPrice(nominal);

          return (
            <li
              key={nominal.value}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span>Nominal {formatNominal(nominal.value)}</span>
                {!nominal.isAvailable ? (
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    Tidak tersedia
                  </span>
                ) : null}
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">
                  {formatCurrency(pricing.finalPrice)}
                </p>
                {pricing.hasPromo ? (
                  <p className="text-xs text-slate-400 line-through">
                    {formatCurrency(pricing.originalPrice)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {product.providers.map((provider) => (
        <section
          key={provider.id}
          className="rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900">{provider.label}</h4>
            {!provider.isAvailable ? (
              <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                Tidak tersedia
              </span>
            ) : null}
          </div>
          <ul className="space-y-1">
            {provider.nominals.map((nominal) => {
              const pricing = getDisplayPrice(nominal);

              return (
                <li
                  key={`${provider.id}-${nominal.value}`}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{formatNominal(nominal.value)}</span>
                    {!nominal.isAvailable ? (
                      <span className="text-xs text-rose-700">off</span>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(pricing.finalPrice)}
                    </span>
                    {pricing.hasPromo ? (
                      <span className="ml-2 text-xs text-slate-400 line-through">
                        {formatCurrency(pricing.originalPrice)}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const products = await loadCatalogProducts();
  const product = products.find((entry) => entry.id === id);

  if (!product) {
    notFound();
  }

  const terms = getProductTerms(product);

  return (
    <main className="min-h-screen bg-[#f5f3ff] px-3 py-6 text-slate-900 sm:px-5">
      <div className="mx-auto w-full max-w-4xl space-y-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Kembali ke katalog
        </Link>

        <section className="rounded-2xl bg-gradient-to-br from-[#c849db] via-[#6f3ed8] to-[#2a30ae] p-4 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#f5e79f]">
            {product.category}
          </p>
          <h1 className="mt-1 text-xl font-bold">{product.name}</h1>
          <p className="mt-2 text-sm text-violet-100">{product.description}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <h2 className="text-base font-semibold text-slate-900">Daftar Opsi & Harga</h2>
          <div className="mt-3">{renderOptions(product)}</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          <h2 className="text-base font-semibold text-slate-900">Syarat & Ketentuan</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </section>

        <DetailCheckoutForm product={product} />
      </div>
    </main>
  );
}
