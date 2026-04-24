"use client";

import {
  Fragment,
  FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  CATALOG_PRODUCTS,
  normalizeCatalogProducts,
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

const DEFAULT_PRODUCTS = normalizeCatalogProducts(CATALOG_PRODUCTS);
const DEFAULT_PRODUCT_MAP = new Map(
  DEFAULT_PRODUCTS.map((product) => [product.id, product]),
);

const CART_STORAGE_KEY = "katalog-wa-cart-v1";
const THEME_STORAGE_KEY = "katalog-wa-theme-v1";
const EMPTY_CART: Record<string, number> = {};
const LINE_KEY_SEPARATOR = "::";
const PULSA_KEY_SEPARATOR = "~";
const PULSA_PROVIDER_KEY_SEPARATOR = "@@";

const STORE_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const ALL_CATEGORY_LABEL = "Semua";
const CATEGORY_SORT_ORDER: Record<string, number> = {
  Premium: 0,
  "Pulsa & Data": 1,
  "Token Listrik": 2,
  "Topup Game": 3,
};

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

function subscribeThemeChange(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      onStoreChange();
    }
  };
  const handleThemeChange = () => onStoreChange();
  const handleMediaChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener("theme-change", handleThemeChange);
  mediaQuery.addEventListener("change", handleMediaChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("theme-change", handleThemeChange);
    mediaQuery.removeEventListener("change", handleMediaChange);
  };
}

function getThemeClientSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark") {
    return true;
  }

  if (savedTheme === "light") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getThemeServerSnapshot() {
  return false;
}

function setThemePreference(isDarkMode: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  window.dispatchEvent(new Event("theme-change"));
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

function getCategoryRank(category: string) {
  return CATEGORY_SORT_ORDER[category] ?? 999;
}

function sortProducts(products: Product[]) {
  return [...products].sort((a, b) => {
    const rankDifference = getCategoryRank(a.category) - getCategoryRank(b.category);
    if (rankDifference !== 0) {
      return rankDifference;
    }

    const categoryCompare = a.category.localeCompare(b.category, "id", {
      sensitivity: "base",
    });
    if (categoryCompare !== 0) {
      return categoryCompare;
    }

    return a.name.localeCompare(b.name, "id", {
      sensitivity: "base",
      numeric: true,
    });
  });
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

function buildPulsaProviderKey(productId: string, providerId: string) {
  return `${productId}${PULSA_PROVIDER_KEY_SEPARATOR}${providerId}`;
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

function buildDefaultSelectionMap(products: Product[]) {
  return products.reduce<Record<string, string>>((accumulator, product) => {
    if (product.kind === "pulsa") {
      product.providers.forEach((provider) => {
        const defaultNominal = getFirstAvailableNominal(provider.nominals);
        if (!defaultNominal) {
          return;
        }

        const providerKey = buildPulsaProviderKey(product.id, provider.id);
        accumulator[providerKey] =
          `${provider.id}${PULSA_KEY_SEPARATOR}${defaultNominal.value}`;
      });

      return accumulator;
    }

    accumulator[product.id] = getDefaultSelection(product);
    return accumulator;
  }, {});
}

function resolveCartLine(
  lineKey: string,
  productMap: Map<string, Product>,
): ResolvedCartLine | null {
  const parsed = parseLineKey(lineKey);
  if (!parsed) {
    return null;
  }

  const product = productMap.get(parsed.productId);
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

function sanitizeCartEntries(
  rawCart: Record<string, number>,
  productMap: Map<string, Product>,
) {
  return Object.entries(rawCart).reduce<Record<string, number>>(
    (accumulator, [lineKey, quantity]) => {
      if (quantity <= 0) {
        return accumulator;
      }

      if (!resolveCartLine(lineKey, productMap)) {
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

  const [products, setProducts] = useState<Product[]>(() =>
    sortProducts(DEFAULT_PRODUCTS),
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
      return sanitizeCartEntries(parsed, DEFAULT_PRODUCT_MAP);
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      return {};
    }
  });

  const [selectionByProduct, setSelectionByProduct] = useState<Record<string, string>>(() =>
    buildDefaultSelectionMap(DEFAULT_PRODUCTS),
  );

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_LABEL);
  const [productSearch, setProductSearch] = useState("");
  const [isCheckoutPanelOpen, setIsCheckoutPanelOpen] = useState(false);
  const [animatedProductId, setAnimatedProductId] = useState<string | null>(null);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDarkMode = useSyncExternalStore(
    subscribeThemeChange,
    getThemeClientSnapshot,
    getThemeServerSnapshot,
  );

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchCatalog() {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const body = (await response.json().catch(() => null)) as
        | { products?: Product[] }
        | null;

      if (!cancelled && Array.isArray(body?.products)) {
        setProducts(sortProducts(body.products));
      }
    }

    fetchCatalog().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveSelectionByProduct = useMemo(() => {
    const mergedSelection = buildDefaultSelectionMap(products);

    Object.entries(selectionByProduct).forEach(([selectionKey, selectedValue]) => {
      if (selectedValue) {
        mergedSelection[selectionKey] = selectedValue;
      }
    });

    return mergedSelection;
  }, [products, selectionByProduct]);

  const normalizedCart = useMemo(
    () => sanitizeCartEntries(cart, productMap),
    [cart, productMap],
  );

  useEffect(() => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify(normalizedCart),
    );
  }, [normalizedCart]);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isCheckoutPanelOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCheckoutPanelOpen]);

  const visibleCart = useMemo(() => {
    return isHydrated ? normalizedCart : EMPTY_CART;
  }, [isHydrated, normalizedCart]);

  const cartItems = useMemo<CartItem[]>(() => {
    return Object.entries(visibleCart).flatMap(([lineKey, quantity]) => {
      const resolved = resolveCartLine(lineKey, productMap);
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
  }, [visibleCart, productMap]);

  const cartCountByCard = useMemo(() => {
    return cartItems.reduce<Record<string, number>>((accumulator, item) => {
      const parsedLine = parseLineKey(item.lineKey);
      if (!parsedLine) {
        return accumulator;
      }

      const product = productMap.get(parsedLine.productId);
      if (!product) {
        return accumulator;
      }

      if (product.kind === "pulsa") {
        const parsedPulsa = parsePulsaVariantKey(parsedLine.variantKey);
        if (!parsedPulsa) {
          return accumulator;
        }

        const providerKey = buildPulsaProviderKey(product.id, parsedPulsa.providerId);
        accumulator[providerKey] = (accumulator[providerKey] ?? 0) + item.quantity;
        return accumulator;
      }

      accumulator[item.productId] = (accumulator[item.productId] ?? 0) + item.quantity;
      return accumulator;
    }, {});
  }, [cartItems, productMap]);

  const total = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  }, [cartItems]);

  const categoryTabs = useMemo(
    () => [ALL_CATEGORY_LABEL, ...new Set(products.map((product) => product.category))],
    [products],
  );

  const resolvedActiveCategory = categoryTabs.includes(activeCategory)
    ? activeCategory
    : ALL_CATEGORY_LABEL;

  const filteredProducts = useMemo(() => {
    const normalizedKeyword = productSearch.trim().toLowerCase();

    return products.filter((product) => {
      const matchCategory =
        resolvedActiveCategory === ALL_CATEGORY_LABEL ||
        product.category === resolvedActiveCategory;

      if (!matchCategory) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const providerSearchText =
        product.kind === "pulsa"
          ? ` ${product.providers.map((provider) => provider.label).join(" ")}`
          : "";
      const searchableText =
        `${product.name} ${product.category} ${product.description}${providerSearchText}`.toLowerCase();
      return searchableText.includes(normalizedKeyword);
    });
  }, [productSearch, products, resolvedActiveCategory]);

  const isWhatsAppConfigured = STORE_WHATSAPP_NUMBER.length > 8;

  function updateSelection(selectionId: string, value: string) {
    setSelectionByProduct((previous) => ({
      ...previous,
      [selectionId]: value,
    }));
  }

  function updateQuantity(lineKey: string, cardId: string, nextQuantity: number) {
    setErrorMessage("");

    const currentQuantity = normalizedCart[lineKey] ?? 0;
    if (currentQuantity === nextQuantity) {
      return;
    }

    const isAddAction = nextQuantity > currentQuantity;
    if (isAddAction && !resolveCartLine(lineKey, productMap)) {
      return;
    }

    setAnimatedProductId(cardId);
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
    setIsCheckoutPanelOpen(false);
  }

  function renderCheckoutContent(showTitle = true) {
    return (
      <>
        {showTitle ? (
          <>
            <h2 className="text-base font-semibold">Checkout</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Setelah submit, kamu akan diarahkan ke WhatsApp admin.
            </p>
          </>
        ) : null}

        <div
          className={`${showTitle ? "mt-4" : ""} rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/90 dark:shadow-black/30`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ringkasan Keranjang
          </p>
          {cartItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Belum ada produk dipilih.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {cartItems.map((item) => (
                <li key={item.lineKey} className="flex items-start justify-between gap-3">
                  <div>
                    <span>
                      {item.displayName} x{item.quantity}
                      {item.hasPromo ? (
                        <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Promo
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <strong>{formatCurrency(item.subtotal)}</strong>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.lineKey, item.productId, 0)}
                      className="rounded-md border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-slate-200 pt-2 text-sm font-semibold dark:border-slate-700">
            Total: {formatCurrency(total)}
          </p>
        </div>

        <form className="mt-3 space-y-2.5" onSubmit={handleCheckout}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nama pembeli</span>
            <input
              type="text"
              value={buyerName}
              onChange={(event) => setBuyerName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-violet-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Nama lengkap"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nomor WhatsApp pembeli</span>
            <input
              type="tel"
              value={buyerPhone}
              onChange={(event) => setBuyerPhone(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-violet-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                className="space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700"
              >
                <legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
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
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-violet-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        placeholder={field.placeholder}
                      />
                    </label>
                  );
                })}
              </fieldset>
            );
          })}

          {errorMessage ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-gradient-to-r from-[#5d35d7] to-[#2f36b8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isWhatsAppConfigured}
          >
            Checkout via WhatsApp
          </button>
        </form>
      </>
    );
  }

  return (
    <div
      className={`${isDarkMode ? "dark" : ""} min-h-screen bg-[#f5f3ff] text-slate-900 transition-colors dark:bg-[#0f1220] dark:text-slate-100`}
    >
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-6 pb-24 sm:px-5 lg:px-7 xl:pb-8">
        <section className="flex justify-end">
          <button
            type="button"
            role="switch"
            aria-checked={isDarkMode}
            onClick={() => setThemePreference(!isDarkMode)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span>{isDarkMode ? "Dark" : "Light"}</span>
            <span
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${
                isDarkMode ? "bg-violet-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isDarkMode ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </span>
          </button>
        </section>

        <section className="rounded-2xl bg-gradient-to-br from-[#c849db] via-[#6f3ed8] to-[#2a30ae] px-5 py-6 text-white shadow-lg dark:from-[#3f1b59] dark:via-[#2c2368] dark:to-[#1a245f] dark:shadow-violet-950/40">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#f5e79f]">
              Dejitaru Shop
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Premium Apps &amp; Digital Services
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-violet-100 sm:text-base">
              Cepat, Murah, Bergaransi
            </p>
            <p className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#f5e79f] sm:text-xs">
              BUKA SETIAP HARI JAM 10.00-22.00 WIB
            </p>
          </div>
        </section>

        {!isWhatsAppConfigured ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Set `NEXT_PUBLIC_WHATSAPP_NUMBER` dulu agar tombol checkout bisa dipakai.
            Contoh isi: `6281234567890`.
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {categoryTabs.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition sm:text-xs ${
                    resolvedActiveCategory === category
                      ? "bg-[#4f2fd6] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Cari produk..."
                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none transition focus:border-violet-600 lg:w-72 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {filteredProducts.length}/{products.length} produk
              </span>
            </div>
          </div>
        </section>

        <section>
          <div className="grid content-start items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {filteredProducts.map((product, productIndex) => {
              const showCategorySeparator =
                productIndex > 0 &&
                filteredProducts[productIndex - 1]?.category !== product.category;
              const categorySeparator = showCategorySeparator ? (
                <div
                  key={`separator-${product.id}`}
                  className="sm:col-span-2 xl:col-span-4"
                >
                  <div className="flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                      {product.category}
                    </span>
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>
                </div>
              ) : null;

              if (product.kind === "pulsa") {
                return (
                  <Fragment key={product.id}>
                    {categorySeparator}
                    {product.providers.map((provider) => {
                      const providerKey = buildPulsaProviderKey(product.id, provider.id);
                      const defaultNominal = getFirstAvailableNominal(provider.nominals);
                      if (!defaultNominal) {
                        return null;
                      }

                      const rawProviderSelection =
                        effectiveSelectionByProduct[providerKey] ??
                        `${provider.id}${PULSA_KEY_SEPARATOR}${defaultNominal.value}`;
                      const parsedProviderSelection = parsePulsaVariantKey(rawProviderSelection);
                      const selectedNominal =
                        provider.nominals.find(
                          (item) => item.value === parsedProviderSelection?.nominalValue,
                        ) ?? defaultNominal;
                      const pricing = getPricingInfo(selectedNominal);
                      const lineKey = buildLineKey(
                        product.id,
                        `${provider.id}${PULSA_KEY_SEPARATOR}${selectedNominal.value}`,
                      );
                      const quantity = visibleCart[lineKey] ?? 0;
                      const isUnavailable =
                        !product.isAvailable || !provider.isAvailable || !selectedNominal.isAvailable;
                      const isInCart = (cartCountByCard[providerKey] ?? 0) > 0;
                      const isAnimated = animatedProductId === providerKey;

                      return (
                        <article
                          key={`${product.id}-${provider.id}`}
                          className={`flex flex-col rounded-2xl border p-2.5 shadow-sm transition sm:p-3 ${
                            isInCart
                              ? "border-violet-300 bg-violet-50/70 shadow-violet-100 dark:border-violet-500/60 dark:bg-violet-500/15 dark:shadow-violet-950/40"
                              : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                          } ${isUnavailable ? "opacity-75" : ""} ${isAnimated ? "cart-pop ring-2 ring-violet-200" : ""}`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {product.category}
                            </span>
                            <div className="flex flex-col items-end gap-1">
                              {isUnavailable ? (
                                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                  Tidak tersedia
                                </span>
                              ) : isInCart ? (
                                <span
                                  className={`rounded-full bg-[#4f2fd6] px-2.5 py-1 text-[11px] font-semibold text-white ${
                                    isAnimated ? "badge-pop" : ""
                                  }`}
                                >
                                  Di keranjang
                                </span>
                              ) : null}
                              <span className="text-sm font-semibold text-[#3a2cc0] dark:text-violet-300">
                                {formatCurrency(pricing.effectivePrice)}
                              </span>
                              {pricing.hasPromo ? (
                                <span className="text-xs text-slate-400 line-through dark:text-slate-500">
                                  {formatCurrency(selectedNominal.price)}
                                </span>
                              ) : null}
                              {pricing.hasPromo && pricing.promoLabel ? (
                                <span className="text-[11px] font-semibold text-emerald-700">
                                  {pricing.promoLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <h2 className="text-sm font-semibold sm:text-base">{provider.label}</h2>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 sm:mt-2 sm:text-sm">
                            {product.description}
                          </p>

                          <label className="mt-3 block text-sm">
                            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Nominal</span>
                            <select
                              value={String(selectedNominal.value)}
                              onChange={(event) =>
                                updateSelection(
                                  providerKey,
                                  `${provider.id}${PULSA_KEY_SEPARATOR}${event.target.value}`,
                                )
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {provider.nominals.map((option) => (
                                <option
                                  key={`${provider.id}-${option.value}`}
                                  value={String(option.value)}
                                  disabled={!option.isAvailable}
                                >
                                  {formatOptionPriceText(formatNominal(option.value), option)}
                                  {!option.isAvailable ? " - Tidak tersedia" : ""}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="mt-3">
                            <Link
                              href={`/produk/${product.id}`}
                              className="inline-flex items-center rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/60"
                            >
                              Detail S&amp;K
                            </Link>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between sm:mt-3">
                            <button
                              type="button"
                              onClick={() => updateQuantity(lineKey, providerKey, quantity - 1)}
                              disabled={quantity === 0}
                              aria-label={`Kurangi ${provider.label}`}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
                              onClick={() => updateQuantity(lineKey, providerKey, quantity + 1)}
                              aria-label={
                                isUnavailable
                                  ? `${provider.label} tidak tersedia`
                                  : `Tambah ${provider.label}`
                              }
                              disabled={isUnavailable}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f2fd6] text-white transition hover:bg-[#4124c0] disabled:cursor-not-allowed disabled:bg-slate-300"
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
                  </Fragment>
                );
              }

              const rawSelection =
                effectiveSelectionByProduct[product.id] ?? getDefaultSelection(product);
              const isAnimated = animatedProductId === product.id;
              const isInCart = (cartCountByCard[product.id] ?? 0) > 0;

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
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Varian</span>
                    <select
                      value={selectedVariant.id}
                      onChange={(event) => updateSelection(product.id, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                const nominalLabel =
                  product.category === "Pulsa & Data" ? "Nominal pulsa" : "Nominal token";

                lineKey = buildLineKey(product.id, String(selectedNominal.value));
                displayedPrice = pricing.effectivePrice;
                originalPrice = selectedNominal.price;
                hasPromo = pricing.hasPromo;
                promoLabel = pricing.promoLabel ?? "";
                quantity = visibleCart[lineKey] ?? 0;
                isUnavailable = isUnavailable || !selectedNominal.isAvailable;

                variantControl = (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">{nominalLabel}</span>
                    <select
                      value={String(selectedNominal.value)}
                      onChange={(event) => updateSelection(product.id, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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

              return (
                <Fragment key={product.id}>
                  {categorySeparator}
                  <article
                    className={`flex flex-col rounded-2xl border p-2.5 shadow-sm transition sm:p-3 ${
                      isInCart
                        ? "border-violet-300 bg-violet-50/70 shadow-violet-100 dark:border-violet-500/60 dark:bg-violet-500/15 dark:shadow-violet-950/40"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                    } ${isUnavailable ? "opacity-75" : ""} ${isAnimated ? "cart-pop ring-2 ring-violet-200" : ""}`}
                  >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {product.category}
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      {isUnavailable ? (
                        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                          Tidak tersedia
                        </span>
                      ) : isInCart ? (
                        <span
                          className={`rounded-full bg-[#4f2fd6] px-2.5 py-1 text-[11px] font-semibold text-white ${
                            isAnimated ? "badge-pop" : ""
                          }`}
                        >
                          Di keranjang
                        </span>
                      ) : null}
                      <span className="text-sm font-semibold text-[#3a2cc0] dark:text-violet-300">
                        {formatCurrency(displayedPrice)}
                      </span>
                      {hasPromo ? (
                        <span className="text-xs text-slate-400 line-through dark:text-slate-500">
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

                  <h2 className="text-sm font-semibold sm:text-base">{product.name}</h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 sm:mt-2 sm:text-sm">
                    {product.description}
                  </p>

                  {variantControl}

                  <div className="mt-3">
                    <Link
                      href={`/produk/${product.id}`}
                      className="inline-flex items-center rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/60"
                    >
                      Detail S&amp;K
                    </Link>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between sm:mt-3">
                    <button
                      type="button"
                      onClick={() => updateQuantity(lineKey, product.id, quantity - 1)}
                      disabled={quantity === 0}
                      aria-label={`Kurangi ${product.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f2fd6] text-white transition hover:bg-[#4124c0] disabled:cursor-not-allowed disabled:bg-slate-300"
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
                </Fragment>
              );
            })}

            {filteredProducts.length === 0 ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 sm:col-span-2 xl:col-span-4">
                Tidak ada produk yang cocok dengan filter saat ini.
              </article>
            ) : null}
          </div>

        </section>

        <div className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:right-4">
          <button
            type="button"
            onClick={() => setIsCheckoutPanelOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-[#5d35d7] to-[#2f36b8] px-4 py-2.5 text-left text-white shadow-lg sm:w-auto sm:gap-3"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="20" r="1.25" />
                <circle cx="18" cy="20" r="1.25" />
                <path d="M2 3h2l2 11h11l2-8H6.5" />
              </svg>
              Keranjang
            </span>
            <span className="text-xs font-medium">
              {cartItems.length} item - {formatCurrency(total)}
            </span>
          </button>
        </div>

        {isCheckoutPanelOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              onClick={() => setIsCheckoutPanelOpen(false)}
              className="absolute inset-0 bg-slate-900/55 dark:bg-black/70"
              aria-label="Tutup panel checkout"
            />
            <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/20 dark:border-violet-500/30 dark:bg-[#0b1020] dark:shadow-black/60">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-[#10162a]">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">Keranjang Belanja</h2>
                  <span className="rounded-full bg-[#f3cf4a] px-2 py-0.5 text-xs font-semibold text-slate-900">
                    {cartItems.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCheckoutPanelOpen(false)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  X
                </button>
              </div>
              <div className="flex-1 overflow-y-auto bg-white p-3 dark:bg-[#0b1020]">
                {renderCheckoutContent(false)}
              </div>
            </aside>
          </div>
        ) : null}

        <footer className="pt-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
          Copyright 2026 Dejitaru Shop. Solusi Kebutuhan Digitalmu.
        </footer>
      </main>
    </div>
  );
}

