"use client";

import {
  FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CATALOG_PRODUCTS,
  type NominalOption,
  type Product,
  type PulsaProvider,
  type Requirement,
  type VariantOption,
} from "@/data/catalog";

type ResolvedCartLine = {
  lineKey: string;
  productId: string;
  displayName: string;
  unitPrice: number;
  hasPromo: boolean;
  promoLabel?: string;
  requirements: Requirement[];
};

type CartItem = ResolvedCartLine & {
  quantity: number;
  subtotal: number;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID");

const PRODUCTS = CATALOG_PRODUCTS;
const PRODUCT_MAP = new Map(PRODUCTS.map((product) => [product.id, product]));

const CART_STORAGE_KEY = "katalog-wa-cart-v1";
const EMPTY_CART: Record<string, number> = {};
const LINE_KEY_SEPARATOR = "::";
const PULSA_KEY_SEPARATOR = "~";

const STORE_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

type PriceOption = {
  price: number;
  promoPrice?: number;
  promoLabel?: string;
  promoStart?: string;
  promoEnd?: string;
};

type PricingInfo = {
  effectivePrice: number;
  hasPromo: boolean;
  promoLabel?: string;
};

function sanitizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

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
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

function isPromoWindowActive(option: PriceOption, nowTimestamp: number) {
  const startTimestamp = parsePromoDate(option.promoStart);
  const endTimestamp = parsePromoDate(option.promoEnd);

  if (startTimestamp !== null && nowTimestamp < startTimestamp) {
    return false;
  }

  if (endTimestamp !== null && nowTimestamp > endTimestamp) {
    return false;
  }

  return true;
}

function getPricingInfo(option: PriceOption): PricingInfo {
  const promoPrice = option.promoPrice;
  const nowTimestamp = Date.now();
  const isPromoActive =
    typeof promoPrice === "number" &&
    promoPrice >= 0 &&
    promoPrice < option.price &&
    isPromoWindowActive(option, nowTimestamp);

  if (!isPromoActive) {
    return {
      effectivePrice: option.price,
      hasPromo: false,
    };
  }

  return {
    effectivePrice: promoPrice,
    hasPromo: true,
    promoLabel: option.promoLabel,
  };
}

function formatOptionPriceText(label: string, option: PriceOption) {
  const pricing = getPricingInfo(option);
  if (!pricing.hasPromo) {
    return `${label} (${formatCurrency(option.price)})`;
  }

  return `${label} (${formatCurrency(pricing.effectivePrice)} promo, normal ${formatCurrency(option.price)})`;
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

function buildLineKey(productId: string, variantKey: string) {
  return `${productId}${LINE_KEY_SEPARATOR}${variantKey}`;
}

function parseLineKey(lineKey: string) {
  const separatorIndex = lineKey.indexOf(LINE_KEY_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }

  return {
    productId: lineKey.slice(0, separatorIndex),
    variantKey: lineKey.slice(separatorIndex + LINE_KEY_SEPARATOR.length),
  };
}

function parsePulsaVariantKey(variantKey: string) {
  const separatorIndex = variantKey.lastIndexOf(PULSA_KEY_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }

  const providerId = variantKey.slice(0, separatorIndex);
  const nominalValue = Number(variantKey.slice(separatorIndex + PULSA_KEY_SEPARATOR.length));
  if (!Number.isFinite(nominalValue)) {
    return null;
  }

  return {
    providerId,
    nominalValue,
  };
}

function getDefaultSelection(product: Product) {
  if (product.kind === "variants") {
    return getFirstAvailableVariant(product.variants)?.id ?? "";
  }

  if (product.kind === "token") {
    return String(getFirstAvailableNominal(product.nominals)?.value ?? "");
  }

  const defaultProvider = getFirstAvailableProvider(product.providers);
  const defaultNominal = defaultProvider
    ? getFirstAvailableNominal(defaultProvider.nominals)
    : undefined;

  if (!defaultProvider || !defaultNominal) {
    return "";
  }

  return `${defaultProvider.id}${PULSA_KEY_SEPARATOR}${defaultNominal.value}`;
}

function buildDefaultSelectionMap() {
  return PRODUCTS.reduce<Record<string, string>>((accumulator, product) => {
    accumulator[product.id] = getDefaultSelection(product);
    return accumulator;
  }, {});
}

function resolveCartLine(lineKey: string): ResolvedCartLine | null {
  const parsed = parseLineKey(lineKey);
  if (!parsed) {
    return null;
  }

  const product = PRODUCT_MAP.get(parsed.productId);
  if (!product || !product.isAvailable) {
    return null;
  }

  if (product.kind === "variants") {
    const variant = product.variants.find((item) => item.id === parsed.variantKey);
    if (!variant || !variant.isAvailable) {
      return null;
    }
    const pricing = getPricingInfo(variant);

    return {
      lineKey,
      productId: product.id,
      displayName: `${product.name} ${variant.label}`,
      unitPrice: pricing.effectivePrice,
      hasPromo: pricing.hasPromo,
      promoLabel: pricing.promoLabel,
      requirements: product.requirements,
    };
  }

  if (product.kind === "token") {
    const nominalValue = Number(parsed.variantKey);
    if (!Number.isFinite(nominalValue)) {
      return null;
    }

    const nominal = product.nominals.find((item) => item.value === nominalValue);
    if (!nominal || !nominal.isAvailable) {
      return null;
    }
    const pricing = getPricingInfo(nominal);

    return {
      lineKey,
      productId: product.id,
      displayName: `${product.name} ${formatNominal(nominal.value)}`,
      unitPrice: pricing.effectivePrice,
      hasPromo: pricing.hasPromo,
      promoLabel: pricing.promoLabel,
      requirements: product.requirements,
    };
  }

  const parsedPulsa = parsePulsaVariantKey(parsed.variantKey);
  if (!parsedPulsa) {
    return null;
  }

  const provider = product.providers.find((item) => item.id === parsedPulsa.providerId);
  if (!provider || !provider.isAvailable) {
    return null;
  }

  const nominal = provider.nominals.find((item) => item.value === parsedPulsa.nominalValue);
  if (!nominal || !nominal.isAvailable) {
    return null;
  }
  const pricing = getPricingInfo(nominal);

  return {
    lineKey,
    productId: product.id,
    displayName: `${product.name} ${provider.label} ${formatNominal(nominal.value)}`,
    unitPrice: pricing.effectivePrice,
    hasPromo: pricing.hasPromo,
    promoLabel: pricing.promoLabel,
    requirements: product.requirements,
  };
}

function sanitizeCartEntries(rawCart: Record<string, number>) {
  return Object.entries(rawCart).reduce<Record<string, number>>(
    (accumulator, [lineKey, quantity]) => {
      if (quantity <= 0) {
        return accumulator;
      }

      if (!resolveCartLine(lineKey)) {
        return accumulator;
      }

      accumulator[lineKey] = quantity;
      return accumulator;
    },
    {},
  );
}

export default function Home() {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [cart, setCart] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!savedCart) {
      return {};
    }

    try {
      const parsed = JSON.parse(savedCart) as Record<string, number>;
      return sanitizeCartEntries(parsed);
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      return {};
    }
  });

  const [selectionByProduct, setSelectionByProduct] = useState<Record<string, string>>(() =>
    buildDefaultSelectionMap(),
  );

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [animatedProductId, setAnimatedProductId] = useState<string | null>(null);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(sanitizeCartEntries(cart)));
  }, [cart]);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  const visibleCart = useMemo(() => {
    return isHydrated ? cart : EMPTY_CART;
  }, [isHydrated, cart]);

  const cartItems = useMemo<CartItem[]>(() => {
    return Object.entries(visibleCart).flatMap(([lineKey, quantity]) => {
      const resolved = resolveCartLine(lineKey);
      if (!resolved || quantity <= 0) {
        return [];
      }

      return [
        {
          ...resolved,
          quantity,
          subtotal: resolved.unitPrice * quantity,
        },
      ];
    });
  }, [visibleCart]);

  const cartCountByProduct = useMemo(() => {
    return cartItems.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.productId] = (accumulator[item.productId] ?? 0) + item.quantity;
      return accumulator;
    }, {});
  }, [cartItems]);

  const total = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  }, [cartItems]);

  const isWhatsAppConfigured = STORE_WHATSAPP_NUMBER.length > 8;

  function updateSelection(productId: string, value: string) {
    setSelectionByProduct((previous) => ({
      ...previous,
      [productId]: value,
    }));
  }

  function updateQuantity(lineKey: string, productId: string, nextQuantity: number) {
    setErrorMessage("");

    const currentQuantity = cart[lineKey] ?? 0;
    if (currentQuantity === nextQuantity) {
      return;
    }

    const isAddAction = nextQuantity > currentQuantity;
    if (isAddAction && !resolveCartLine(lineKey)) {
      return;
    }

    setAnimatedProductId(productId);
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    animationTimeoutRef.current = setTimeout(() => {
      setAnimatedProductId(null);
    }, 360);

    if (nextQuantity <= 0) {
      setExtraFields((previous) => {
        const nextFields: Record<string, string> = {};
        Object.entries(previous).forEach(([key, value]) => {
          if (!key.startsWith(`${lineKey}:`)) {
            nextFields[key] = value;
          }
        });

        return nextFields;
      });
    }

    setCart((previousCart) => {
      if (nextQuantity <= 0) {
        const nextCart = { ...previousCart };
        delete nextCart[lineKey];
        return nextCart;
      }

      return {
        ...previousCart,
        [lineKey]: nextQuantity,
      };
    });
  }

  function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!isWhatsAppConfigured) {
      setErrorMessage("Nomor WhatsApp toko belum diset di environment variable.");
      return;
    }

    if (cartItems.length === 0) {
      setErrorMessage("Keranjang masih kosong.");
      return;
    }

    if (!buyerName.trim() || !buyerPhone.trim()) {
      setErrorMessage("Nama dan nomor WhatsApp pembeli wajib diisi.");
      return;
    }

    const missingField = cartItems
      .flatMap((item) =>
        item.requirements.map((field) => ({
          ...field,
          inputKey: `${item.lineKey}:${field.key}`,
          itemName: item.displayName,
        })),
      )
      .find((field) => !extraFields[field.inputKey]?.trim());

    if (missingField) {
      setErrorMessage(
        `Field "${missingField.label}" untuk "${missingField.itemName}" masih kosong.`,
      );
      return;
    }

    const itemLines = cartItems.map((item) => {
      const promoTag = item.hasPromo ? " [Promo]" : "";
      return `- ${item.displayName}${promoTag} x${item.quantity} (${formatCurrency(item.subtotal)})`;
    });

    const detailLines = cartItems.flatMap((item) => {
      if (item.requirements.length === 0) {
        return [];
      }

      const itemDetailLines = item.requirements.map((field) => {
        const fieldKey = `${item.lineKey}:${field.key}`;
        return `  - ${field.label}: ${extraFields[fieldKey]}`;
      });

      return [`- ${item.displayName}:`, ...itemDetailLines];
    });

    const orderMessage = [
      "Halo kak, saya mau order dari website katalog.",
      "",
      "Daftar pesanan:",
      ...itemLines,
      "",
      `Total: ${formatCurrency(total)}`,
      "",
      "Data pembeli:",
      `- Nama: ${buyerName}`,
      `- WhatsApp: ${buyerPhone}`,
      "",
      "Detail tambahan:",
      ...detailLines,
      "",
      "Mohon info total final dan langkah pembayaran ya. Terima kasih.",
    ].join("\n");

    const targetNumber = sanitizePhone(STORE_WHATSAPP_NUMBER);
    const whatsappUrl = `https://wa.me/${targetNumber}?text=${encodeURIComponent(orderMessage)}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl bg-gradient-to-r from-[#0f766e] to-[#155e75] px-6 py-8 text-white shadow-lg">
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-teal-100">
            Katalog Digital
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Premium, Pulsa, dan Token Listrik
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-teal-100 sm:text-base">
            Pilih produk, isi detail checkout, lalu kirim pesanan otomatis ke WhatsApp admin.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs sm:text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1">Proses cepat saat online</span>
            <span className="rounded-full bg-white/15 px-3 py-1">Tanpa payment gateway</span>
            <span className="rounded-full bg-white/15 px-3 py-1">Checkout via WhatsApp</span>
          </div>
        </section>

        {!isWhatsAppConfigured ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Set `NEXT_PUBLIC_WHATSAPP_NUMBER` dulu agar tombol checkout bisa dipakai.
            Contoh isi: `6281234567890`.
          </section>
        ) : null}

        <section className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="grid content-start items-start gap-4 sm:grid-cols-2">
            {PRODUCTS.map((product) => {
              const rawSelection = selectionByProduct[product.id] ?? getDefaultSelection(product);
              const isAnimated = animatedProductId === product.id;
              const isInCart = (cartCountByProduct[product.id] ?? 0) > 0;

              let lineKey = "";
              let displayedPrice = 0;
              let originalPrice = 0;
              let hasPromo = false;
              let promoLabel = "";
              let quantity = 0;
              let isUnavailable = !product.isAvailable;
              let variantControl: ReactNode = null;

              if (product.kind === "variants") {
                const selectedVariant =
                  product.variants.find((item) => item.id === rawSelection) ??
                  getFirstAvailableVariant(product.variants);
                const pricing = getPricingInfo(selectedVariant);

                lineKey = buildLineKey(product.id, selectedVariant.id);
                displayedPrice = pricing.effectivePrice;
                originalPrice = selectedVariant.price;
                hasPromo = pricing.hasPromo;
                promoLabel = pricing.promoLabel ?? "";
                quantity = visibleCart[lineKey] ?? 0;
                isUnavailable = isUnavailable || !selectedVariant.isAvailable;

                variantControl = (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Varian</span>
                    <select
                      value={selectedVariant.id}
                      onChange={(event) => updateSelection(product.id, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600"
                    >
                      {product.variants.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={!option.isAvailable}
                        >
                          {formatOptionPriceText(option.label, option)}
                          {!option.isAvailable ? " - Tidak tersedia" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (product.kind === "token") {
                const selectedNominalValue = Number(rawSelection);
                const selectedNominal =
                  product.nominals.find((item) => item.value === selectedNominalValue) ??
                  getFirstAvailableNominal(product.nominals);
                const pricing = getPricingInfo(selectedNominal);

                lineKey = buildLineKey(product.id, String(selectedNominal.value));
                displayedPrice = pricing.effectivePrice;
                originalPrice = selectedNominal.price;
                hasPromo = pricing.hasPromo;
                promoLabel = pricing.promoLabel ?? "";
                quantity = visibleCart[lineKey] ?? 0;
                isUnavailable = isUnavailable || !selectedNominal.isAvailable;

                variantControl = (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Nominal token</span>
                    <select
                      value={String(selectedNominal.value)}
                      onChange={(event) => updateSelection(product.id, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600"
                    >
                      {product.nominals.map((option) => (
                        <option
                          key={option.value}
                          value={String(option.value)}
                          disabled={!option.isAvailable}
                        >
                          {formatOptionPriceText(formatNominal(option.value), option)}
                          {!option.isAvailable ? " - Tidak tersedia" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (product.kind === "pulsa") {
                const parsedPulsa = parsePulsaVariantKey(rawSelection);
                const selectedProvider =
                  product.providers.find((item) => item.id === parsedPulsa?.providerId) ??
                  getFirstAvailableProvider(product.providers);

                const selectedNominal =
                  selectedProvider.nominals.find(
                    (item) => item.value === parsedPulsa?.nominalValue,
                  ) ?? getFirstAvailableNominal(selectedProvider.nominals);
                const pricing = getPricingInfo(selectedNominal);

                lineKey = buildLineKey(
                  product.id,
                  `${selectedProvider.id}${PULSA_KEY_SEPARATOR}${selectedNominal.value}`,
                );
                displayedPrice = pricing.effectivePrice;
                originalPrice = selectedNominal.price;
                hasPromo = pricing.hasPromo;
                promoLabel = pricing.promoLabel ?? "";
                quantity = visibleCart[lineKey] ?? 0;
                isUnavailable =
                  isUnavailable || !selectedProvider.isAvailable || !selectedNominal.isAvailable;

                variantControl = (
                  <div className="mt-3 grid gap-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Provider</span>
                      <select
                        value={selectedProvider.id}
                        onChange={(event) => {
                          const nextProvider = product.providers.find(
                            (item) => item.id === event.target.value,
                          );

                          if (!nextProvider) {
                            return;
                          }

                          const nextNominal = getFirstAvailableNominal(nextProvider.nominals);
                          if (!nextNominal) {
                            return;
                          }

                          updateSelection(
                            product.id,
                            `${nextProvider.id}${PULSA_KEY_SEPARATOR}${nextNominal.value}`,
                          );
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600"
                      >
                        {product.providers.map((provider) => (
                          <option
                            key={provider.id}
                            value={provider.id}
                            disabled={!provider.isAvailable}
                          >
                            {provider.label}
                            {!provider.isAvailable ? " - Tidak tersedia" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Nominal pulsa</span>
                      <select
                        value={String(selectedNominal.value)}
                        onChange={(event) =>
                          updateSelection(
                            product.id,
                            `${selectedProvider.id}${PULSA_KEY_SEPARATOR}${event.target.value}`,
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600"
                      >
                        {selectedProvider.nominals.map((option) => (
                          <option
                            key={`${selectedProvider.id}-${option.value}`}
                            value={String(option.value)}
                            disabled={!option.isAvailable}
                          >
                            {formatOptionPriceText(formatNominal(option.value), option)}
                            {!option.isAvailable ? " - Tidak tersedia" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              }

              return (
                <article
                  key={product.id}
                  className={`flex flex-col rounded-2xl border p-4 shadow-sm transition ${
                    isInCart
                      ? "border-teal-300 bg-teal-50/60 shadow-teal-100"
                      : "border-slate-200 bg-white"
                  } ${isUnavailable ? "opacity-75" : ""} ${isAnimated ? "cart-pop ring-2 ring-teal-200" : ""}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {product.category}
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      {isUnavailable ? (
                        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                          Tidak tersedia
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            isInCart
                              ? `bg-teal-700 text-white ${isAnimated ? "badge-pop" : ""}`
                              : "invisible bg-transparent text-transparent"
                          }`}
                        >
                          Di keranjang
                        </span>
                      )}
                      <span className="text-sm font-semibold text-teal-700">
                        {formatCurrency(displayedPrice)}
                      </span>
                      {hasPromo ? (
                        <span className="text-xs text-slate-400 line-through">
                          {formatCurrency(originalPrice)}
                        </span>
                      ) : null}
                      {hasPromo && promoLabel ? (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          {promoLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <h2 className="text-lg font-semibold">{product.name}</h2>
                  <p className="mt-2 text-sm text-slate-600">{product.description}</p>

                  {variantControl}

                  <div className="mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => updateQuantity(lineKey, product.id, quantity - 1)}
                      disabled={quantity === 0}
                      aria-label={`Kurangi ${product.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    </button>

                    <span className="text-sm font-semibold">{quantity}</span>

                    <button
                      type="button"
                      onClick={() => updateQuantity(lineKey, product.id, quantity + 1)}
                      aria-label={
                        isUnavailable
                          ? `${product.name} tidak tersedia`
                          : `Tambah ${product.name}`
                      }
                      disabled={isUnavailable}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Checkout</h2>
            <p className="mt-1 text-sm text-slate-600">
              Setelah submit, kamu akan diarahkan ke WhatsApp admin.
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ringkasan Keranjang
              </p>
              {cartItems.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Belum ada produk dipilih.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {cartItems.map((item) => (
                    <li key={item.lineKey} className="flex items-start justify-between gap-2">
                      <span>
                        {item.displayName} x{item.quantity}
                        {item.hasPromo ? (
                          <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Promo
                          </span>
                        ) : null}
                      </span>
                      <strong>{formatCurrency(item.subtotal)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-slate-200 pt-2 text-sm font-semibold">
                Total: {formatCurrency(total)}
              </p>
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleCheckout}>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nama pembeli</span>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
                  placeholder="Nama lengkap"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nomor WhatsApp pembeli</span>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(event) => setBuyerPhone(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
                  placeholder="08xxxxxxxxxx"
                />
              </label>

              {cartItems.map((item) => {
                if (item.requirements.length === 0) {
                  return null;
                }

                return (
                  <fieldset
                    key={item.lineKey}
                    className="space-y-2 rounded-lg border border-slate-200 p-3"
                  >
                    <legend className="px-1 text-sm font-semibold text-slate-700">
                      Detail {item.displayName}
                    </legend>

                    {item.requirements.map((field) => {
                      const inputKey = `${item.lineKey}:${field.key}`;

                      return (
                        <label key={inputKey} className="block text-sm">
                          <span className="mb-1 block font-medium">{field.label}</span>
                          <input
                            type={field.type}
                            value={extraFields[inputKey] ?? ""}
                            onChange={(event) =>
                              setExtraFields((previous) => ({
                                ...previous,
                                [inputKey]: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
                            placeholder={field.placeholder}
                          />
                        </label>
                      );
                    })}
                  </fieldset>
                );
              })}

              {errorMessage ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-lg bg-[#08915f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#067d51] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!isWhatsAppConfigured}
              >
                Checkout via WhatsApp
              </button>
            </form>
          </aside>
        </section>
      </main>
    </div>
  );
}
