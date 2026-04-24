"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  NominalOption,
  Product,
  PulsaProvider,
  Requirement,
  VariantOption,
} from "@/data/catalog";

const STORE_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const PULSA_KEY_SEPARATOR = "~";

type PriceOption = {
  price: number;
  promoPrice?: number;
  promoStart?: string;
  promoEnd?: string;
};

type CheckoutSelection = {
  key: string;
  label: string;
  unitPrice: number;
  isAvailable: boolean;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID");

function formatCurrency(value: number) {
  return CURRENCY_FORMATTER.format(value);
}

function formatNominal(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function sanitizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

function parsePromoDate(value?: string) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getEffectivePrice(option: PriceOption) {
  const promoPrice = option.promoPrice;
  const now = Date.now();
  const start = parsePromoDate(option.promoStart);
  const end = parsePromoDate(option.promoEnd);
  const promoActive =
    typeof promoPrice === "number" &&
    promoPrice < option.price &&
    (start === null || now >= start) &&
    (end === null || now <= end);

  return promoActive ? promoPrice : option.price;
}

function getFirstAvailableVariant(options: VariantOption[]) {
  return options.find((option) => option.isAvailable) ?? options[0];
}

function getFirstAvailableNominal(options: NominalOption[]) {
  return options.find((option) => option.isAvailable) ?? options[0];
}

function getFirstAvailableProvider(providers: PulsaProvider[]) {
  return providers.find((provider) => provider.isAvailable) ?? providers[0];
}

function getDefaultSelectionKey(product: Product) {
  if (product.kind === "variants") {
    return getFirstAvailableVariant(product.variants)?.id ?? "";
  }

  if (product.kind === "token") {
    return String(getFirstAvailableNominal(product.nominals)?.value ?? "");
  }

  const provider = getFirstAvailableProvider(product.providers);
  const nominal = provider ? getFirstAvailableNominal(provider.nominals) : undefined;
  if (!provider || !nominal) {
    return "";
  }

  return `${provider.id}${PULSA_KEY_SEPARATOR}${nominal.value}`;
}

function parsePulsaSelection(selectionKey: string) {
  const separatorIndex = selectionKey.lastIndexOf(PULSA_KEY_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }

  const providerId = selectionKey.slice(0, separatorIndex);
  const nominalValue = Number(
    selectionKey.slice(separatorIndex + PULSA_KEY_SEPARATOR.length),
  );
  if (!Number.isFinite(nominalValue)) {
    return null;
  }

  return { providerId, nominalValue };
}

function resolveSelection(product: Product, selectionKey: string): CheckoutSelection | null {
  if (product.kind === "variants") {
    const variant = product.variants.find((item) => item.id === selectionKey);
    if (!variant) {
      return null;
    }

    return {
      key: variant.id,
      label: variant.label,
      unitPrice: getEffectivePrice(variant),
      isAvailable: product.isAvailable && variant.isAvailable,
    };
  }

  if (product.kind === "token") {
    const nominalValue = Number(selectionKey);
    if (!Number.isFinite(nominalValue)) {
      return null;
    }

    const nominal = product.nominals.find((item) => item.value === nominalValue);
    if (!nominal) {
      return null;
    }

    return {
      key: String(nominal.value),
      label: `Nominal ${formatNominal(nominal.value)}`,
      unitPrice: getEffectivePrice(nominal),
      isAvailable: product.isAvailable && nominal.isAvailable,
    };
  }

  const parsedPulsa = parsePulsaSelection(selectionKey);
  if (!parsedPulsa) {
    return null;
  }

  const provider = product.providers.find((item) => item.id === parsedPulsa.providerId);
  if (!provider) {
    return null;
  }

  const nominal = provider.nominals.find((item) => item.value === parsedPulsa.nominalValue);
  if (!nominal) {
    return null;
  }

  return {
    key: selectionKey,
    label: `${provider.label} ${formatNominal(nominal.value)}`,
    unitPrice: getEffectivePrice(nominal),
    isAvailable: product.isAvailable && provider.isAvailable && nominal.isAvailable,
  };
}

type Props = {
  product: Product;
};

export function DetailCheckoutForm({ product }: Props) {
  const [selectionKey, setSelectionKey] = useState(() => getDefaultSelectionKey(product));
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");

  const selection = useMemo(
    () => resolveSelection(product, selectionKey),
    [product, selectionKey],
  );
  const isWhatsAppConfigured = STORE_WHATSAPP_NUMBER.length > 8;

  const total = useMemo(() => {
    if (!selection) {
      return 0;
    }
    return selection.unitPrice * quantity;
  }, [selection, quantity]);

  const parsedPulsaSelection =
    product.kind === "pulsa" ? parsePulsaSelection(selectionKey) : null;
  const selectedProvider =
    product.kind === "pulsa"
      ? product.providers.find((provider) => provider.id === parsedPulsaSelection?.providerId)
      : null;

  function setRequirementValue(field: Requirement, value: string) {
    setExtraFields((previous) => ({
      ...previous,
      [field.key]: value,
    }));
  }

  function handleQuantity(step: -1 | 1) {
    setQuantity((previous) => Math.max(1, previous + step));
  }

  function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!isWhatsAppConfigured) {
      setErrorMessage("Nomor WhatsApp toko belum diset.");
      return;
    }

    if (!selection || !selection.isAvailable) {
      setErrorMessage("Opsi produk belum tersedia.");
      return;
    }

    if (!buyerName.trim() || !buyerPhone.trim()) {
      setErrorMessage("Nama dan nomor WhatsApp pembeli wajib diisi.");
      return;
    }

    const missingField = product.requirements.find(
      (field) => !(extraFields[field.key] ?? "").trim(),
    );
    if (missingField) {
      setErrorMessage(`Field "${missingField.label}" wajib diisi.`);
      return;
    }

    const detailLines = product.requirements.map((field) => {
      const value = (extraFields[field.key] ?? "").trim();
      return `- ${field.label}: ${value}`;
    });

    const messageLines = [
      "*Pesanan Baru*",
      "",
      "*Data Pembeli*",
      `- Nama: ${buyerName.trim()}`,
      `- WhatsApp: ${buyerPhone.trim()}`,
      "",
      "*Detail Pesanan*",
      `- Produk: ${product.name}`,
      `- Opsi: ${selection.label}`,
      `- Qty: ${quantity}`,
      `- Harga: ${formatCurrency(selection.unitPrice)}`,
      `- Total: ${formatCurrency(total)}`,
      ...(detailLines.length > 0 ? ["", "*Data Untuk Diproses*", ...detailLines] : []),
    ];

    const whatsappUrl = `https://wa.me/${sanitizePhone(STORE_WHATSAPP_NUMBER)}?text=${encodeURIComponent(messageLines.join("\n"))}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <h2 className="text-base font-semibold text-slate-900">Checkout Produk Ini</h2>
      <p className="mt-1 text-xs text-slate-600">
        Isi cepat dari halaman detail, lalu lanjut chat ke WhatsApp admin.
      </p>

      <form className="mt-3 space-y-2.5" onSubmit={handleCheckout}>
        {product.kind === "variants" ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Pilih varian</span>
            <select
              value={selectionKey}
              onChange={(event) => setSelectionKey(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
            >
              {product.variants.map((variant) => (
                <option key={variant.id} value={variant.id} disabled={!variant.isAvailable}>
                  {variant.label} - {formatCurrency(getEffectivePrice(variant))}
                  {!variant.isAvailable ? " (Tidak tersedia)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {product.kind === "token" ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Pilih nominal</span>
            <select
              value={selectionKey}
              onChange={(event) => setSelectionKey(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
            >
              {product.nominals.map((nominal) => (
                <option
                  key={nominal.value}
                  value={nominal.value}
                  disabled={!nominal.isAvailable}
                >
                  {formatNominal(nominal.value)} - {formatCurrency(getEffectivePrice(nominal))}
                  {!nominal.isAvailable ? " (Tidak tersedia)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {product.kind === "pulsa" ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Provider</span>
              <select
                value={selectedProvider?.id ?? ""}
                onChange={(event) => {
                  const provider = product.providers.find(
                    (item) => item.id === event.target.value,
                  );
                  const firstNominal = provider
                    ? getFirstAvailableNominal(provider.nominals)
                    : undefined;
                  if (!provider || !firstNominal) {
                    setSelectionKey("");
                    return;
                  }

                  setSelectionKey(`${provider.id}${PULSA_KEY_SEPARATOR}${firstNominal.value}`);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
              >
                {product.providers.map((provider) => (
                  <option
                    key={provider.id}
                    value={provider.id}
                    disabled={!provider.isAvailable}
                  >
                    {provider.label}
                    {!provider.isAvailable ? " (Tidak tersedia)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Nominal</span>
              <select
                value={parsedPulsaSelection?.nominalValue ?? ""}
                onChange={(event) => {
                  if (!selectedProvider) {
                    return;
                  }
                  setSelectionKey(
                    `${selectedProvider.id}${PULSA_KEY_SEPARATOR}${event.target.value}`,
                  );
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
              >
                {(selectedProvider?.nominals ?? []).map((nominal) => (
                  <option
                    key={nominal.value}
                    value={nominal.value}
                    disabled={!nominal.isAvailable}
                  >
                    {formatNominal(nominal.value)} - {formatCurrency(getEffectivePrice(nominal))}
                    {!nominal.isAvailable ? " (Tidak tersedia)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
          <span className="text-xs font-medium text-slate-700">Jumlah</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleQuantity(-1)}
              className="h-7 w-7 rounded-full border border-slate-300 text-base leading-none text-slate-700"
            >
              -
            </button>
            <span className="w-8 text-center text-xs font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => handleQuantity(1)}
              className="h-7 w-7 rounded-full bg-teal-700 text-base leading-none text-white"
            >
              +
            </button>
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Nama pembeli</span>
          <input
            type="text"
            value={buyerName}
            onChange={(event) => setBuyerName(event.target.value)}
            placeholder="Nama lengkap"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Nomor WhatsApp pembeli</span>
          <input
            type="tel"
            value={buyerPhone}
            onChange={(event) => setBuyerPhone(event.target.value)}
            placeholder="08xxxxxxxxxx"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
          />
        </label>

        {product.requirements.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{field.label}</span>
            <input
              type={field.type}
              value={extraFields[field.key] ?? ""}
              onChange={(event) => setRequirementValue(field, event.target.value)}
              placeholder={field.placeholder}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
            />
          </label>
        ))}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
          <p>
            Opsi: <span className="font-semibold">{selection?.label ?? "-"}</span>
          </p>
          <p>
            Total: <span className="font-semibold text-slate-900">{formatCurrency(total)}</span>
          </p>
        </div>

        {errorMessage ? (
          <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{errorMessage}</p>
        ) : null}

        <button
          type="submit"
          disabled={!isWhatsAppConfigured || !selection?.isAvailable || !product.isAvailable}
          className="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Checkout via WhatsApp
        </button>

        {!isWhatsAppConfigured ? (
          <p className="text-xs text-amber-700">
            Set NEXT_PUBLIC_WHATSAPP_NUMBER dulu agar tombol checkout bisa dipakai.
          </p>
        ) : null}
      </form>
    </section>
  );
}
