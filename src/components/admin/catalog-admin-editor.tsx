"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  NominalOption,
  Product,
  PulsaProvider,
  Requirement,
  VariantOption,
} from "@/data/catalog";

type Props = {
  initialProducts: Product[];
  databaseConfigured: boolean;
};

type EditorMode = "detail" | "list";

const CATEGORY_OPTIONS = [
  "Premium",
  "Pulsa & Data",
  "Token Listrik",
  "Topup Game",
];

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}-${Date.now()}`;
}

function toNumber(input: string, fallback = 0) {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(input: string) {
  if (!input.trim()) {
    return undefined;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

function toDateTimeLocalInput(value?: string) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocalInput(value: string) {
  return value || undefined;
}

function createRequirement(): Requirement {
  return {
    key: createId("field"),
    label: "Label field",
    placeholder: "Isi detail",
    type: "text",
  };
}

function createVariant(): VariantOption {
  return {
    id: createId("variant"),
    label: "Varian baru",
    price: 0,
    isAvailable: true,
  };
}

function createNominal(): NominalOption {
  return {
    value: 0,
    price: 0,
    isAvailable: true,
  };
}

function createProvider(): PulsaProvider {
  return {
    id: createId("provider"),
    label: "Provider baru",
    isAvailable: true,
    nominals: [createNominal()],
  };
}

function createProduct(kind: Product["kind"]): Product {
  const base = {
    id: createId("product"),
    name: "Produk Baru",
    category: "Lainnya",
    description: "Deskripsi produk",
    terms: ["Syarat baru"],
    isAvailable: true,
    requirements: [createRequirement()],
  };

  if (kind === "variants") {
    return {
      ...base,
      kind,
      variants: [createVariant()],
    };
  }

  if (kind === "token") {
    return {
      ...base,
      kind,
      nominals: [createNominal()],
    };
  }

  return {
    ...base,
    kind,
    providers: [createProvider()],
  };
}

function getProductSummary(product: Product) {
  if (product.kind === "variants") {
    return `${product.variants.length} varian`;
  }

  if (product.kind === "token") {
    return `${product.nominals.length} nominal`;
  }

  const nominalCount = product.providers.reduce(
    (total, provider) => total + provider.nominals.length,
    0,
  );
  return `${product.providers.length} provider, ${nominalCount} nominal`;
}

function getProductKindLabel(product: Product) {
  if (product.kind === "token" && product.category === "Pulsa & Data") {
    return "pulsa/data";
  }

  return product.kind;
}

function getNominalSectionTitle(product: Product) {
  if (product.category === "Pulsa & Data") {
    return "Nominal Pulsa";
  }

  return "Nominal Token";
}

function serializeTerms(terms?: string[]) {
  return (terms ?? []).map((term) => `- ${term}`).join("\n");
}

function parseTermsInput(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

export function CatalogAdminEditor({
  initialProducts,
  databaseConfigured,
}: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [editorMode, setEditorMode] = useState<EditorMode>("detail");
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [expandedPricingProductIndex, setExpandedPricingProductIndex] = useState<
    number | null
  >(null);
  const [collapsingPricingProductIndex, setCollapsingPricingProductIndex] =
    useState<number | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [termsDraftByProduct, setTermsDraftByProduct] = useState<
    Record<string, string>
  >({});
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const safeActiveProductIndex =
    products.length === 0 ? 0 : Math.min(activeProductIndex, products.length - 1);
  const safeExpandedPricingProductIndex =
    expandedPricingProductIndex !== null &&
    expandedPricingProductIndex >= 0 &&
    expandedPricingProductIndex < products.length
      ? expandedPricingProductIndex
      : null;

  useEffect(
    () => () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    },
    [],
  );

  function markPricingRowAsCollapsing(productIndex: number) {
    setCollapsingPricingProductIndex(productIndex);

    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }

    collapseTimerRef.current = setTimeout(() => {
      setCollapsingPricingProductIndex((previous) =>
        previous === productIndex ? null : previous,
      );
      collapseTimerRef.current = null;
    }, 220);
  }

  async function saveCatalog() {
    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/admin/catalog", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ products }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setErrorMessage(body?.message ?? "Gagal menyimpan katalog.");
        return;
      }

      setStatusMessage("Perubahan katalog berhasil disimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  async function reloadCatalog() {
    setIsReloading(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/admin/catalog");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setErrorMessage(body?.message ?? "Gagal memuat ulang katalog.");
        return;
      }

      const body = (await response.json()) as { products: Product[] };
      setProducts(body.products);
      setTermsDraftByProduct({});
      setStatusMessage("Katalog terbaru berhasil dimuat.");
    } finally {
      setIsReloading(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function addProduct(kind: Product["kind"]) {
    setProducts((previous) => [...previous, createProduct(kind)]);
    setTermsDraftByProduct({});
    setActiveProductIndex(products.length);
  }

  function addPulsaDataProduct() {
    const nextProduct = createProduct("token");
    setProducts((previous) => [
      ...previous,
      {
        ...nextProduct,
        name: "Provider Baru",
        category: "Pulsa & Data",
        description: "Pilih nominal pulsa/data untuk provider ini.",
      },
    ]);
    setTermsDraftByProduct({});
    setActiveProductIndex(products.length);
  }

  function updateProductAt(
    productIndex: number,
    updater: (product: Product) => Product,
  ) {
    setProducts((previous) =>
      previous.map((item, index) =>
        index === productIndex ? updater(item) : item,
      ),
    );
  }

  function removeProductAt(productIndex: number) {
    setProducts((previous) =>
      previous.filter((_, index) => index !== productIndex),
    );
    setTermsDraftByProduct({});
    setExpandedPricingProductIndex((previous) => {
      if (previous === null) {
        return previous;
      }

      if (previous === productIndex) {
        return null;
      }

      if (previous > productIndex) {
        return previous - 1;
      }

      return previous;
    });
    setCollapsingPricingProductIndex((previous) => {
      if (previous === null) {
        return previous;
      }

      if (previous === productIndex) {
        return null;
      }

      if (previous > productIndex) {
        return previous - 1;
      }

      return previous;
    });
  }

  function togglePricingSheet(productIndex: number) {
    setActiveProductIndex(productIndex);

    if (safeExpandedPricingProductIndex === productIndex) {
      markPricingRowAsCollapsing(productIndex);
      setExpandedPricingProductIndex(null);
      return;
    }

    if (safeExpandedPricingProductIndex !== null) {
      markPricingRowAsCollapsing(safeExpandedPricingProductIndex);
    }

    setExpandedPricingProductIndex(productIndex);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 py-5 text-[13px] leading-5 sm:px-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Katalog</h1>
            <p className="mt-1 text-xs text-slate-600">
              Edit produk lewat form, lalu klik simpan.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Logout
          </button>
        </div>

        {!databaseConfigured ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            `DATABASE_URL` belum diset, jadi perubahan belum bisa disimpan permanen.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addProduct("variants")}
            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-100"
          >
            + Produk Variants
          </button>
          <button
            type="button"
            onClick={() => addProduct("token")}
            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-100"
          >
            + Produk Token
          </button>
          <button
            type="button"
            onClick={addPulsaDataProduct}
            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-100"
          >
            + Produk Pulsa/Data
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mode Editor
          </span>
          <button
            type="button"
            onClick={() => setEditorMode("list")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              editorMode === "list"
                ? "bg-teal-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Daftar Produk
          </button>
          <button
            type="button"
            onClick={() => setEditorMode("detail")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              editorMode === "detail"
                ? "bg-teal-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Form Detail
          </button>
        </div>

        {products.length > 0 && editorMode === "detail" ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Navigasi Produk
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setActiveProductIndex((previous) => Math.max(0, previous - 1))
                }
                disabled={safeActiveProductIndex <= 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveProductIndex((previous) =>
                    Math.min(products.length - 1, previous + 1),
                  )
                }
                disabled={safeActiveProductIndex >= products.length - 1}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Berikutnya
              </button>
              <select
                value={safeActiveProductIndex}
                onChange={(event) =>
                  setActiveProductIndex(Number(event.target.value))
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-teal-600"
              >
                {products.map((product, index) => (
                  <option key={`nav-${index}`} value={index}>
                    {index + 1}. {product.name} ({getProductKindLabel(product)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveCatalog}
            disabled={isSaving}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Menyimpan..." : "Simpan Katalog"}
          </button>
          <button
            type="button"
            onClick={reloadCatalog}
            disabled={isReloading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReloading ? "Memuat..." : "Muat Ulang dari DB"}
          </button>
        </div>

        {statusMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
            {errorMessage}
          </p>
        ) : null}
      </header>

      {editorMode === "list" ? (
        <section>
          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Sheet Produk
              </h2>
              <span className="text-sm text-slate-500">{products.length} produk</span>
            </div>

            <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-[880px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="border-b border-slate-200 px-2 py-2">#</th>
                    <th className="border-b border-slate-200 px-2 py-2">Nama</th>
                    <th className="border-b border-slate-200 px-2 py-2">ID</th>
                    <th className="border-b border-slate-200 px-2 py-2">Tipe</th>
                    <th className="border-b border-slate-200 px-2 py-2">Kategori</th>
                    <th className="border-b border-slate-200 px-2 py-2">Aktif</th>
                    <th className="border-b border-slate-200 px-2 py-2">Item</th>
                    <th className="border-b border-slate-200 px-2 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, productIndex) => (
                    <Fragment key={`sheet-product-${productIndex}`}>
                      <tr
                        onClick={() => {
                          setActiveProductIndex(productIndex);
                          if (
                            safeExpandedPricingProductIndex !== null &&
                            safeExpandedPricingProductIndex !== productIndex
                          ) {
                            markPricingRowAsCollapsing(
                              safeExpandedPricingProductIndex,
                            );
                            setExpandedPricingProductIndex(null);
                          }
                        }}
                        className={`align-top transition ${
                          productIndex === safeActiveProductIndex
                            ? "bg-teal-50"
                            : "odd:bg-white even:bg-slate-50/50"
                        }`}
                      >
                        <td className="border-b border-slate-100 px-2 py-2 font-medium text-slate-600">
                          {productIndex + 1}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2">
                          <input
                            type="text"
                            value={product.name}
                            onChange={(event) =>
                              updateProductAt(productIndex, (item) => ({
                                ...item,
                                name: event.target.value,
                              }))
                            }
                            className="h-8 w-28 rounded-md border border-slate-300 px-2"
                          />
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2">
                          <input
                            type="text"
                            value={product.id}
                            onChange={(event) =>
                              updateProductAt(productIndex, (item) => ({
                                ...item,
                                id: event.target.value,
                              }))
                            }
                            className="h-8 w-24 rounded-md border border-slate-300 px-2"
                          />
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2">
                          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {getProductKindLabel(product)}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2">
                          <select
                            value={product.category}
                            onChange={(event) =>
                              updateProductAt(productIndex, (item) => ({
                                ...item,
                                category: event.target.value,
                              }))
                            }
                            title={product.category}
                            className="h-8 w-24 rounded-md border border-slate-300 px-2"
                          >
                            {[...new Set([...CATEGORY_OPTIONS, product.category])].map(
                              (category) => (
                                <option
                                  key={`sheet-category-${productIndex}-${category}`}
                                  value={category}
                                >
                                  {category}
                                </option>
                              ),
                            )}
                          </select>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={product.isAvailable}
                              onChange={(event) =>
                                updateProductAt(productIndex, (item) => ({
                                  ...item,
                                  isAvailable: event.target.checked,
                                }))
                              }
                              className="h-4 w-4"
                            />
                            <span className="text-xs">{product.isAvailable ? "On" : "Off"}</span>
                          </label>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600">
                              {getProductSummary(product)}
                            </span>
                            <button
                              type="button"
                              title={
                                product.kind === "variants"
                                  ? "Tambah varian"
                                  : product.kind === "token"
                                    ? "Tambah nominal"
                                    : "Tambah provider"
                              }
                              aria-label={
                                product.kind === "variants"
                                  ? "Tambah varian"
                                  : product.kind === "token"
                                    ? "Tambah nominal"
                                    : "Tambah provider"
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                updateProductAt(productIndex, (item) => {
                                  if (item.kind === "variants") {
                                    return {
                                      ...item,
                                      variants: [...item.variants, createVariant()],
                                    };
                                  }

                                  if (item.kind === "token") {
                                    return {
                                      ...item,
                                      nominals: [...item.nominals, createNominal()],
                                    };
                                  }

                                  return {
                                    ...item,
                                    providers: [...item.providers, createProvider()],
                                  };
                                });
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                            >
                              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                                <path
                                  d="M10 4.5v11M4.5 10h11"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              title="Buka form detail"
                              aria-label="Buka form detail"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveProductIndex(productIndex);
                                setEditorMode("detail");
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                            >
                              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                                <path
                                  d="M3 10s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4Z"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <circle cx="10" cy="10" r="1.8" fill="currentColor" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              title={
                                safeExpandedPricingProductIndex === productIndex
                                  ? "Tutup sheet harga"
                                  : "Buka sheet harga"
                              }
                              aria-label={
                                safeExpandedPricingProductIndex === productIndex
                                  ? "Tutup sheet harga"
                                  : "Buka sheet harga"
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePricingSheet(productIndex);
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                            >
                              <svg
                                viewBox="0 0 20 20"
                                className={`h-3.5 w-3.5 transition-transform ${
                                  safeExpandedPricingProductIndex === productIndex
                                    ? "rotate-180"
                                    : ""
                                }`}
                                fill="none"
                              >
                                <path
                                  d="m5.5 8 4.5 4.5L14.5 8"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              title="Hapus produk"
                              aria-label="Hapus produk"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeProductAt(productIndex);
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300 text-rose-700 transition hover:bg-rose-50"
                            >
                              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                                <path
                                  d="M5.5 6h9M8 6V4.8c0-.44.36-.8.8-.8h2.4c.44 0 .8.36.8.8V6m-5.6 0 .5 8.2c.03.43.39.8.82.8h4.6c.43 0 .79-.37.82-.8L14 6"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {safeExpandedPricingProductIndex === productIndex ||
                      collapsingPricingProductIndex === productIndex ? (
                        <tr className="bg-slate-50/40">
                          <td
                            colSpan={8}
                            className="border-b border-slate-100 p-0"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div
                              className={`pricing-sheet-collapse ${
                                safeExpandedPricingProductIndex === productIndex
                                  ? "is-open"
                                  : ""
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="p-2">
                                  <section className="rounded-xl border border-slate-200 bg-white">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">
                                    {product.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {product.id} - {getProductKindLabel(product)}
                                  </p>
                                </div>

                                {product.kind === "variants" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateProductAt(productIndex, (item) =>
                                        item.kind === "variants"
                                          ? {
                                              ...item,
                                              variants: [...item.variants, createVariant()],
                                            }
                                          : item,
                                      )
                                    }
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                                  >
                                    + Tambah Varian
                                  </button>
                                ) : null}

                                {product.kind === "token" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateProductAt(productIndex, (item) =>
                                        item.kind === "token"
                                          ? {
                                              ...item,
                                              nominals: [...item.nominals, createNominal()],
                                            }
                                          : item,
                                      )
                                    }
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                                  >
                                    + Tambah Nominal
                                  </button>
                                ) : null}

                                {product.kind === "pulsa" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateProductAt(productIndex, (item) =>
                                        item.kind === "pulsa"
                                          ? {
                                              ...item,
                                              providers: [...item.providers, createProvider()],
                                            }
                                          : item,
                                      )
                                    }
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                                  >
                                    + Tambah Provider
                                  </button>
                                ) : null}
                              </div>

                              {product.kind === "variants" ? (
                                <div className="max-h-[360px] overflow-auto">
                                  <table className="min-w-[980px] border-collapse text-sm">
                                    <thead className="sticky top-0 z-10 bg-white">
                                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                                        <th className="border-b border-slate-200 px-2 py-2">#</th>
                                        <th className="border-b border-slate-200 px-2 py-2">ID</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Label</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Harga</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Promo</th>
                                        <th className="border-b border-slate-200 px-2 py-2">
                                          Label Promo
                                        </th>
                                        <th className="border-b border-slate-200 px-2 py-2">Mulai</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Selesai</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Aktif</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {product.variants.map((variant, variantIndex) => (
                                        <tr
                                          key={`sheet-variant-${productIndex}-${variantIndex}`}
                                          className="odd:bg-white even:bg-slate-50/50"
                                        >
                                          <td className="border-b border-slate-100 px-2 py-2 text-slate-600">
                                            {variantIndex + 1}
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="text"
                                              value={variant.id}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              id: event.target.value,
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-24 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="text"
                                              value={variant.label}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              label: event.target.value,
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="number"
                                              value={variant.price}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              price: toNumber(
                                                                event.target.value,
                                                              ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="number"
                                              value={variant.promoPrice ?? ""}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              promoPrice: toOptionalNumber(
                                                                event.target.value,
                                                              ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="text"
                                              value={variant.promoLabel ?? ""}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              promoLabel:
                                                                event.target.value ||
                                                                undefined,
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-24 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="datetime-local"
                                              value={toDateTimeLocalInput(
                                                variant.promoStart,
                                              )}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              promoStart:
                                                                fromDateTimeLocalInput(
                                                                  event.target.value,
                                                                ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-32 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="datetime-local"
                                              value={toDateTimeLocalInput(variant.promoEnd)}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              promoEnd:
                                                                fromDateTimeLocalInput(
                                                                  event.target.value,
                                                                ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-32 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="checkbox"
                                              checked={variant.isAvailable}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === variantIndex
                                                          ? {
                                                              ...entry,
                                                              isAvailable:
                                                                event.target.checked,
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <button
                                              type="button"
                                              title="Hapus varian"
                                              aria-label="Hapus varian"
                                              onClick={() =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "variants") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    variants: item.variants.filter(
                                                      (_, entryIndex) =>
                                                        entryIndex !== variantIndex,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300 text-rose-700 transition hover:bg-rose-50"
                                            >
                                              <svg
                                                viewBox="0 0 20 20"
                                                className="h-3.5 w-3.5"
                                                fill="none"
                                              >
                                                <path
                                                  d="M5.5 6h9M8 6V4.8c0-.44.36-.8.8-.8h2.4c.44 0 .8.36.8.8V6m-5.6 0 .5 8.2c.03.43.39.8.82.8h4.6c.43 0 .79-.37.82-.8L14 6"
                                                  stroke="currentColor"
                                                  strokeWidth="1.5"
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                />
                                              </svg>
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}

                              {product.kind === "token" ? (
                                <div className="max-h-[360px] overflow-auto">
                                  <table className="min-w-[900px] border-collapse text-sm">
                                    <thead className="sticky top-0 z-10 bg-white">
                                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                                        <th className="border-b border-slate-200 px-2 py-2">#</th>
                                        <th className="border-b border-slate-200 px-2 py-2">
                                          {getNominalSectionTitle(product)}
                                        </th>
                                        <th className="border-b border-slate-200 px-2 py-2">Harga</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Promo</th>
                                        <th className="border-b border-slate-200 px-2 py-2">
                                          Label Promo
                                        </th>
                                        <th className="border-b border-slate-200 px-2 py-2">Mulai</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Selesai</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Aktif</th>
                                        <th className="border-b border-slate-200 px-2 py-2">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {product.nominals.map((nominal, nominalIndex) => (
                                        <tr
                                          key={`sheet-token-${productIndex}-${nominalIndex}`}
                                          className="odd:bg-white even:bg-slate-50/50"
                                        >
                                          <td className="border-b border-slate-100 px-2 py-2 text-slate-600">
                                            {nominalIndex + 1}
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="number"
                                              value={nominal.value}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === nominalIndex
                                                          ? {
                                                              ...entry,
                                                              value: toNumber(
                                                                event.target.value,
                                                              ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-32 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="number"
                                              value={nominal.price}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === nominalIndex
                                                          ? {
                                                              ...entry,
                                                              price: toNumber(
                                                                event.target.value,
                                                              ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="number"
                                              value={nominal.promoPrice ?? ""}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === nominalIndex
                                                          ? {
                                                              ...entry,
                                                              promoPrice: toOptionalNumber(
                                                                event.target.value,
                                                              ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="text"
                                              value={nominal.promoLabel ?? ""}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === nominalIndex
                                                          ? {
                                                              ...entry,
                                                              promoLabel:
                                                                event.target.value ||
                                                                undefined,
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-24 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="datetime-local"
                                              value={toDateTimeLocalInput(
                                                nominal.promoStart,
                                              )}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === nominalIndex
                                                          ? {
                                                              ...entry,
                                                              promoStart:
                                                                fromDateTimeLocalInput(
                                                                  event.target.value,
                                                                ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-32 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="datetime-local"
                                              value={toDateTimeLocalInput(nominal.promoEnd)}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === nominalIndex
                                                          ? {
                                                              ...entry,
                                                              promoEnd:
                                                                fromDateTimeLocalInput(
                                                                  event.target.value,
                                                                ),
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-8 w-32 rounded-md border border-slate-300 px-2"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <input
                                              type="checkbox"
                                              checked={nominal.isAvailable}
                                              onChange={(event) =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.map(
                                                      (entry, entryIndex) =>
                                                        entryIndex === nominalIndex
                                                          ? {
                                                              ...entry,
                                                              isAvailable:
                                                                event.target.checked,
                                                            }
                                                          : entry,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                          </td>
                                          <td className="border-b border-slate-100 px-2 py-2">
                                            <button
                                              type="button"
                                              title="Hapus nominal"
                                              aria-label="Hapus nominal"
                                              onClick={() =>
                                                updateProductAt(productIndex, (item) => {
                                                  if (item.kind !== "token") {
                                                    return item;
                                                  }

                                                  return {
                                                    ...item,
                                                    nominals: item.nominals.filter(
                                                      (_, entryIndex) =>
                                                        entryIndex !== nominalIndex,
                                                    ),
                                                  };
                                                })
                                              }
                                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300 text-rose-700 transition hover:bg-rose-50"
                                            >
                                              <svg
                                                viewBox="0 0 20 20"
                                                className="h-3.5 w-3.5"
                                                fill="none"
                                              >
                                                <path
                                                  d="M5.5 6h9M8 6V4.8c0-.44.36-.8.8-.8h2.4c.44 0 .8.36.8.8V6m-5.6 0 .5 8.2c.03.43.39.8.82.8h4.6c.43 0 .79-.37.82-.8L14 6"
                                                  stroke="currentColor"
                                                  strokeWidth="1.5"
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                />
                                              </svg>
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}

                              {product.kind === "pulsa" ? (
                                <div className="space-y-2 p-2">
                                  {product.providers.map((provider, providerIndex) => (
                                    <div
                                      key={`sheet-provider-${productIndex}-${providerIndex}`}
                                      className="rounded-lg border border-slate-200 p-2"
                                    >
                                      <div className="grid gap-2 sm:grid-cols-[130px_150px_130px_auto]">
                                        <input
                                          type="text"
                                          value={provider.id}
                                          onChange={(event) =>
                                            updateProductAt(productIndex, (item) => {
                                              if (item.kind !== "pulsa") {
                                                return item;
                                              }

                                              return {
                                                ...item,
                                                providers: item.providers.map(
                                                  (entry, entryIndex) =>
                                                    entryIndex === providerIndex
                                                      ? {
                                                          ...entry,
                                                          id: event.target.value,
                                                        }
                                                      : entry,
                                                ),
                                              };
                                            })
                                          }
                                          placeholder="Provider ID"
                                          className="h-8 w-full rounded-md border border-slate-300 px-2"
                                        />
                                        <input
                                          type="text"
                                          value={provider.label}
                                          onChange={(event) =>
                                            updateProductAt(productIndex, (item) => {
                                              if (item.kind !== "pulsa") {
                                                return item;
                                              }

                                              return {
                                                ...item,
                                                providers: item.providers.map(
                                                  (entry, entryIndex) =>
                                                    entryIndex === providerIndex
                                                      ? {
                                                          ...entry,
                                                          label: event.target.value,
                                                        }
                                                      : entry,
                                                ),
                                              };
                                            })
                                          }
                                          placeholder="Nama Provider"
                                          className="h-8 w-full rounded-md border border-slate-300 px-2"
                                        />
                                        <label className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-300 px-2 text-xs text-slate-700">
                                          <input
                                            type="checkbox"
                                            checked={provider.isAvailable}
                                            onChange={(event) =>
                                              updateProductAt(productIndex, (item) => {
                                                if (item.kind !== "pulsa") {
                                                  return item;
                                                }

                                                return {
                                                  ...item,
                                                  providers: item.providers.map(
                                                    (entry, entryIndex) =>
                                                      entryIndex === providerIndex
                                                        ? {
                                                            ...entry,
                                                            isAvailable:
                                                              event.target.checked,
                                                          }
                                                        : entry,
                                                  ),
                                                };
                                              })
                                            }
                                            className="h-4 w-4"
                                          />
                                          Provider aktif
                                        </label>
                                        <div className="flex flex-wrap gap-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateProductAt(productIndex, (item) => {
                                                if (item.kind !== "pulsa") {
                                                  return item;
                                                }

                                                return {
                                                  ...item,
                                                  providers: item.providers.map(
                                                    (entry, entryIndex) =>
                                                      entryIndex === providerIndex
                                                        ? {
                                                            ...entry,
                                                            nominals: [
                                                              ...entry.nominals,
                                                              createNominal(),
                                                            ],
                                                          }
                                                        : entry,
                                                  ),
                                                };
                                              })
                                            }
                                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                                          >
                                            + Nominal
                                          </button>
                                          <button
                                            type="button"
                                            title="Hapus provider"
                                            aria-label="Hapus provider"
                                            onClick={() =>
                                              updateProductAt(productIndex, (item) => {
                                                if (item.kind !== "pulsa") {
                                                  return item;
                                                }

                                                return {
                                                  ...item,
                                                  providers: item.providers.filter(
                                                    (_, entryIndex) =>
                                                      entryIndex !== providerIndex,
                                                  ),
                                                };
                                              })
                                            }
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300 text-rose-700 transition hover:bg-rose-50"
                                          >
                                            <svg
                                              viewBox="0 0 20 20"
                                              className="h-3.5 w-3.5"
                                              fill="none"
                                            >
                                              <path
                                                d="M5.5 6h9M8 6V4.8c0-.44.36-.8.8-.8h2.4c.44 0 .8.36.8.8V6m-5.6 0 .5 8.2c.03.43.39.8.82.8h4.6c.43 0 .79-.37.82-.8L14 6"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>

                                      <div className="mt-2 max-h-[300px] overflow-auto">
                                        <table className="min-w-[860px] border-collapse text-sm">
                                          <thead className="sticky top-0 z-10 bg-slate-50">
                                            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                #
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Nominal
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Harga
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Promo
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Label Promo
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Mulai
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Selesai
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Aktif
                                              </th>
                                              <th className="border-b border-slate-200 px-2 py-2">
                                                Aksi
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {provider.nominals.map((nominal, nominalIndex) => (
                                              <tr
                                                key={`sheet-pulsa-${productIndex}-${providerIndex}-${nominalIndex}`}
                                                className="odd:bg-white even:bg-slate-50/50"
                                              >
                                                <td className="border-b border-slate-100 px-2 py-2 text-slate-600">
                                                  {nominalIndex + 1}
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <input
                                                    type="number"
                                                    value={nominal.value}
                                                    onChange={(event) =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.map(
                                                                  (
                                                                    nominalEntry,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex ===
                                                                    nominalIndex
                                                                      ? {
                                                                          ...nominalEntry,
                                                                          value: toNumber(
                                                                            event.target.value,
                                                                          ),
                                                                        }
                                                                      : nominalEntry,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                                  />
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <input
                                                    type="number"
                                                    value={nominal.price}
                                                    onChange={(event) =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.map(
                                                                  (
                                                                    nominalEntry,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex ===
                                                                    nominalIndex
                                                                      ? {
                                                                          ...nominalEntry,
                                                                          price: toNumber(
                                                                            event.target.value,
                                                                          ),
                                                                        }
                                                                      : nominalEntry,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                                  />
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <input
                                                    type="number"
                                                    value={nominal.promoPrice ?? ""}
                                                    onChange={(event) =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.map(
                                                                  (
                                                                    nominalEntry,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex ===
                                                                    nominalIndex
                                                                      ? {
                                                                          ...nominalEntry,
                                                                          promoPrice:
                                                                            toOptionalNumber(
                                                                              event.target.value,
                                                                            ),
                                                                        }
                                                                      : nominalEntry,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="h-8 w-28 rounded-md border border-slate-300 px-2"
                                                  />
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <input
                                                    type="text"
                                                    value={nominal.promoLabel ?? ""}
                                                    onChange={(event) =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.map(
                                                                  (
                                                                    nominalEntry,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex ===
                                                                    nominalIndex
                                                                      ? {
                                                                          ...nominalEntry,
                                                                          promoLabel:
                                                                            event.target.value ||
                                                                            undefined,
                                                                        }
                                                                      : nominalEntry,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="h-8 w-24 rounded-md border border-slate-300 px-2"
                                                  />
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <input
                                                    type="datetime-local"
                                                    value={toDateTimeLocalInput(
                                                      nominal.promoStart,
                                                    )}
                                                    onChange={(event) =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.map(
                                                                  (
                                                                    nominalEntry,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex ===
                                                                    nominalIndex
                                                                      ? {
                                                                          ...nominalEntry,
                                                                          promoStart:
                                                                            fromDateTimeLocalInput(
                                                                              event.target.value,
                                                                            ),
                                                                        }
                                                                      : nominalEntry,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="h-8 w-32 rounded-md border border-slate-300 px-2"
                                                  />
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <input
                                                    type="datetime-local"
                                                    value={toDateTimeLocalInput(nominal.promoEnd)}
                                                    onChange={(event) =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.map(
                                                                  (
                                                                    nominalEntry,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex ===
                                                                    nominalIndex
                                                                      ? {
                                                                          ...nominalEntry,
                                                                          promoEnd:
                                                                            fromDateTimeLocalInput(
                                                                              event.target.value,
                                                                            ),
                                                                        }
                                                                      : nominalEntry,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="h-8 w-32 rounded-md border border-slate-300 px-2"
                                                  />
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <input
                                                    type="checkbox"
                                                    checked={nominal.isAvailable}
                                                    onChange={(event) =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.map(
                                                                  (
                                                                    nominalEntry,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex ===
                                                                    nominalIndex
                                                                      ? {
                                                                          ...nominalEntry,
                                                                          isAvailable:
                                                                            event.target.checked,
                                                                        }
                                                                      : nominalEntry,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="h-4 w-4"
                                                  />
                                                </td>
                                                <td className="border-b border-slate-100 px-2 py-2">
                                                  <button
                                                    type="button"
                                                    title="Hapus nominal"
                                                    aria-label="Hapus nominal"
                                                    onClick={() =>
                                                      updateProductAt(productIndex, (item) => {
                                                        if (item.kind !== "pulsa") {
                                                          return item;
                                                        }

                                                        return {
                                                          ...item,
                                                          providers: item.providers.map(
                                                            (entry, entryIndex) => {
                                                              if (
                                                                entryIndex !== providerIndex
                                                              ) {
                                                                return entry;
                                                              }

                                                              return {
                                                                ...entry,
                                                                nominals: entry.nominals.filter(
                                                                  (
                                                                    _,
                                                                    nominalEntryIndex,
                                                                  ) =>
                                                                    nominalEntryIndex !==
                                                                    nominalIndex,
                                                                ),
                                                              };
                                                            },
                                                          ),
                                                        };
                                                      })
                                                    }
                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300 text-rose-700 transition hover:bg-rose-50"
                                                  >
                                                    <svg
                                                      viewBox="0 0 20 20"
                                                      className="h-3.5 w-3.5"
                                                      fill="none"
                                                    >
                                                      <path
                                                        d="M5.5 6h9M8 6V4.8c0-.44.36-.8.8-.8h2.4c.44 0 .8.36.8.8V6m-5.6 0 .5 8.2c.03.43.39.8.82.8h4.6c.43 0 .79-.37.82-.8L14 6"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                      />
                                                    </svg>
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                                  </section>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : (

        products.map((product, productIndex) => {
        if (productIndex !== safeActiveProductIndex) {
          return null;
        }

        const termsDraftKey = `${product.id}:${productIndex}`;
        const termsText = termsDraftByProduct[termsDraftKey] ?? serializeTerms(product.terms);

        return (
        <article
          key={`product-${productIndex}`}
          className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              {product.name} ({getProductKindLabel(product)})
            </h2>
            <button
              type="button"
              onClick={() =>
                setProducts((previous) =>
                  previous.filter((_, index) => index !== productIndex),
                )
              }
              className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              Hapus Produk
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">ID Produk</span>
              <input
                type="text"
                value={product.id}
                onChange={(event) =>
                  setProducts((previous) =>
                    previous.map((item, index) =>
                      index === productIndex
                        ? { ...item, id: event.target.value }
                        : item,
                    ),
                  )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Nama Produk</span>
              <input
                type="text"
                value={product.name}
                onChange={(event) =>
                  setProducts((previous) =>
                    previous.map((item, index) =>
                      index === productIndex
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Kategori</span>
              <select
                value={product.category}
                onChange={(event) =>
                  setProducts((previous) =>
                    previous.map((item, index) =>
                      index === productIndex
                        ? { ...item, category: event.target.value }
                        : item,
                    ),
                  )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
              >
                {[...new Set([...CATEGORY_OPTIONS, product.category])].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={product.isAvailable}
                onChange={(event) =>
                  setProducts((previous) =>
                    previous.map((item, index) =>
                      index === productIndex
                        ? { ...item, isAvailable: event.target.checked }
                        : item,
                    ),
                  )
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              Produk tersedia
            </label>
          </div>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Deskripsi</span>
            <textarea
              value={product.description}
              onChange={(event) =>
                setProducts((previous) =>
                  previous.map((item, index) =>
                    index === productIndex
                      ? { ...item, description: event.target.value }
                      : item,
                  ),
                )
              }
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
            />
          </label>

          <section className="mt-4 rounded-xl border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">S&K Produk</h3>
            <textarea
              value={termsText}
              onChange={(event) => {
                const nextText = event.target.value;
                const nextTerms = parseTermsInput(nextText);

                setTermsDraftByProduct((previous) => ({
                  ...previous,
                  [termsDraftKey]: nextText,
                }));

                setProducts((previous) =>
                  previous.map((item, index) =>
                    index === productIndex ? { ...item, terms: nextTerms } : item,
                  ),
                );
              }}
              rows={5}
              placeholder="- Garansi 1x24 jam&#10;- Wajib kirim data lengkap"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Tulis per baris. Bisa pakai awalan -, *, atau bullet.
            </p>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Field Checkout</h3>
              <button
                type="button"
                onClick={() =>
                  setProducts((previous) =>
                    previous.map((item, index) =>
                      index === productIndex
                        ? {
                            ...item,
                            requirements: [...item.requirements, createRequirement()],
                          }
                        : item,
                    ),
                  )
                }
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                + Tambah Field
              </button>
            </div>

            <div className="space-y-2">
              {product.requirements.map((field, fieldIndex) => (
                <div
                  key={`field-${productIndex}-${fieldIndex}`}
                  className="grid gap-2 sm:grid-cols-5"
                >
                  <input
                    type="text"
                    value={field.key}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, index) => {
                          if (index !== productIndex) {
                            return item;
                          }

                          const nextFields = item.requirements.map((entry, entryIndex) =>
                            entryIndex === fieldIndex
                              ? { ...entry, key: event.target.value }
                              : entry,
                          );

                          return { ...item, requirements: nextFields };
                        }),
                      )
                    }
                    placeholder="key"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    value={field.label}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, index) => {
                          if (index !== productIndex) {
                            return item;
                          }

                          const nextFields = item.requirements.map((entry, entryIndex) =>
                            entryIndex === fieldIndex
                              ? { ...entry, label: event.target.value }
                              : entry,
                          );

                          return { ...item, requirements: nextFields };
                        }),
                      )
                    }
                    placeholder="Label"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    value={field.placeholder}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, index) => {
                          if (index !== productIndex) {
                            return item;
                          }

                          const nextFields = item.requirements.map((entry, entryIndex) =>
                            entryIndex === fieldIndex
                              ? { ...entry, placeholder: event.target.value }
                              : entry,
                          );

                          return { ...item, requirements: nextFields };
                        }),
                      )
                    }
                    placeholder="Placeholder"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <select
                    value={field.type}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, index) => {
                          if (index !== productIndex) {
                            return item;
                          }

                          const nextFields = item.requirements.map((entry, entryIndex) =>
                            entryIndex === fieldIndex
                              ? {
                                  ...entry,
                                  type: event.target.value as Requirement["type"],
                                }
                              : entry,
                          );

                          return { ...item, requirements: nextFields };
                        }),
                      )
                    }
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="text">text</option>
                    <option value="email">email</option>
                    <option value="tel">tel</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setProducts((previous) =>
                        previous.map((item, index) => {
                          if (index !== productIndex) {
                            return item;
                          }

                          return {
                            ...item,
                            requirements: item.requirements.filter(
                              (_, entryIndex) => entryIndex !== fieldIndex,
                            ),
                          };
                        }),
                      )
                    }
                    className="rounded-lg border border-rose-300 px-2 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </section>

          {product.kind === "variants" ? (
            <section className="mt-4 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Daftar Varian</h3>
                <button
                  type="button"
                  onClick={() =>
                    setProducts((previous) =>
                      previous.map((item, index) =>
                        index === productIndex && item.kind === "variants"
                          ? { ...item, variants: [...item.variants, createVariant()] }
                          : item,
                      ),
                    )
                  }
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  + Tambah Varian
                </button>
              </div>

              <div className="space-y-2">
                {product.variants.map((variant, variantIndex) => (
                  <div
                    key={`variant-${productIndex}-${variantIndex}`}
                    className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-4"
                  >
                    <input
                      type="text"
                      value={variant.id}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.map((entry, entryIndex) =>
                                entryIndex === variantIndex
                                  ? { ...entry, id: event.target.value }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="ID varian"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      value={variant.label}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.map((entry, entryIndex) =>
                                entryIndex === variantIndex
                                  ? { ...entry, label: event.target.value }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Label"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      value={variant.price}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.map((entry, entryIndex) =>
                                entryIndex === variantIndex
                                  ? { ...entry, price: toNumber(event.target.value) }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Harga normal"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={variant.isAvailable}
                        onChange={(event) =>
                          setProducts((previous) =>
                            previous.map((item, index) => {
                              if (index !== productIndex || item.kind !== "variants") {
                                return item;
                              }

                              return {
                                ...item,
                                variants: item.variants.map((entry, entryIndex) =>
                                  entryIndex === variantIndex
                                    ? { ...entry, isAvailable: event.target.checked }
                                    : entry,
                                ),
                              };
                            }),
                          )
                        }
                        className="h-4 w-4"
                      />
                      Available
                    </label>
                    <input
                      type="number"
                      value={variant.promoPrice ?? ""}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.map((entry, entryIndex) =>
                                entryIndex === variantIndex
                                  ? {
                                      ...entry,
                                      promoPrice: toOptionalNumber(event.target.value),
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Harga promo (opsional)"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      value={variant.promoLabel ?? ""}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.map((entry, entryIndex) =>
                                entryIndex === variantIndex
                                  ? {
                                      ...entry,
                                      promoLabel: event.target.value || undefined,
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Label promo"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(variant.promoStart)}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.map((entry, entryIndex) =>
                                entryIndex === variantIndex
                                  ? {
                                      ...entry,
                                      promoStart: fromDateTimeLocalInput(event.target.value),
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Mulai promo"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(variant.promoEnd)}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.map((entry, entryIndex) =>
                                entryIndex === variantIndex
                                  ? {
                                      ...entry,
                                      promoEnd: fromDateTimeLocalInput(event.target.value),
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Selesai promo"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "variants") {
                              return item;
                            }

                            return {
                              ...item,
                              variants: item.variants.filter(
                                (_, entryIndex) => entryIndex !== variantIndex,
                              ),
                            };
                          }),
                        )
                      }
                      className="rounded-lg border border-rose-300 px-2 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      Hapus Varian
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {product.kind === "token" ? (
            <section className="mt-4 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">
                  {getNominalSectionTitle(product)}
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setProducts((previous) =>
                      previous.map((item, index) =>
                        index === productIndex && item.kind === "token"
                          ? { ...item, nominals: [...item.nominals, createNominal()] }
                          : item,
                      ),
                    )
                  }
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  + Tambah Nominal
                </button>
              </div>

              <div className="space-y-2">
                {product.nominals.map((nominal, nominalIndex) => (
                  <div
                    key={`nominal-${productIndex}-${nominalIndex}`}
                    className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-4"
                  >
                    <input
                      type="number"
                      value={nominal.value}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "token") {
                              return item;
                            }

                            return {
                              ...item,
                              nominals: item.nominals.map((entry, entryIndex) =>
                                entryIndex === nominalIndex
                                  ? { ...entry, value: toNumber(event.target.value) }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Nominal"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      value={nominal.price}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "token") {
                              return item;
                            }

                            return {
                              ...item,
                              nominals: item.nominals.map((entry, entryIndex) =>
                                entryIndex === nominalIndex
                                  ? { ...entry, price: toNumber(event.target.value) }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Harga normal"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      value={nominal.promoPrice ?? ""}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "token") {
                              return item;
                            }

                            return {
                              ...item,
                              nominals: item.nominals.map((entry, entryIndex) =>
                                entryIndex === nominalIndex
                                  ? {
                                      ...entry,
                                      promoPrice: toOptionalNumber(event.target.value),
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Harga promo"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={nominal.isAvailable}
                        onChange={(event) =>
                          setProducts((previous) =>
                            previous.map((item, index) => {
                              if (index !== productIndex || item.kind !== "token") {
                                return item;
                              }

                              return {
                                ...item,
                                nominals: item.nominals.map((entry, entryIndex) =>
                                  entryIndex === nominalIndex
                                    ? { ...entry, isAvailable: event.target.checked }
                                    : entry,
                                ),
                              };
                            }),
                          )
                        }
                        className="h-4 w-4"
                      />
                      Available
                    </label>
                    <input
                      type="text"
                      value={nominal.promoLabel ?? ""}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "token") {
                              return item;
                            }

                            return {
                              ...item,
                              nominals: item.nominals.map((entry, entryIndex) =>
                                entryIndex === nominalIndex
                                  ? {
                                      ...entry,
                                      promoLabel: event.target.value || undefined,
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Label promo"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(nominal.promoStart)}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "token") {
                              return item;
                            }

                            return {
                              ...item,
                              nominals: item.nominals.map((entry, entryIndex) =>
                                entryIndex === nominalIndex
                                  ? {
                                      ...entry,
                                      promoStart: fromDateTimeLocalInput(event.target.value),
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Mulai promo"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(nominal.promoEnd)}
                      onChange={(event) =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "token") {
                              return item;
                            }

                            return {
                              ...item,
                              nominals: item.nominals.map((entry, entryIndex) =>
                                entryIndex === nominalIndex
                                  ? {
                                      ...entry,
                                      promoEnd: fromDateTimeLocalInput(event.target.value),
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      placeholder="Selesai promo"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "token") {
                              return item;
                            }

                            return {
                              ...item,
                              nominals: item.nominals.filter(
                                (_, entryIndex) => entryIndex !== nominalIndex,
                              ),
                            };
                          }),
                        )
                      }
                      className="rounded-lg border border-rose-300 px-2 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      Hapus Nominal
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {product.kind === "pulsa" ? (
            <section className="mt-4 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Provider Pulsa</h3>
                <button
                  type="button"
                  onClick={() =>
                    setProducts((previous) =>
                      previous.map((item, index) =>
                        index === productIndex && item.kind === "pulsa"
                          ? { ...item, providers: [...item.providers, createProvider()] }
                          : item,
                      ),
                    )
                  }
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  + Tambah Provider
                </button>
              </div>

              <div className="space-y-3">
                {product.providers.map((provider, providerIndex) => (
                  <div
                    key={`provider-${productIndex}-${providerIndex}`}
                    className="rounded-lg border border-slate-200 p-2"
                  >
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input
                        type="text"
                        value={provider.id}
                        onChange={(event) =>
                          setProducts((previous) =>
                            previous.map((item, index) => {
                              if (index !== productIndex || item.kind !== "pulsa") {
                                return item;
                              }

                              return {
                                ...item,
                                providers: item.providers.map((entry, entryIndex) =>
                                  entryIndex === providerIndex
                                    ? { ...entry, id: event.target.value }
                                    : entry,
                                ),
                              };
                            }),
                          )
                        }
                        placeholder="Provider ID"
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        value={provider.label}
                        onChange={(event) =>
                          setProducts((previous) =>
                            previous.map((item, index) => {
                              if (index !== productIndex || item.kind !== "pulsa") {
                                return item;
                              }

                              return {
                                ...item,
                                providers: item.providers.map((entry, entryIndex) =>
                                  entryIndex === providerIndex
                                    ? { ...entry, label: event.target.value }
                                    : entry,
                                ),
                              };
                            }),
                          )
                        }
                        placeholder="Label provider"
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={provider.isAvailable}
                          onChange={(event) =>
                            setProducts((previous) =>
                              previous.map((item, index) => {
                                if (index !== productIndex || item.kind !== "pulsa") {
                                  return item;
                                }

                                return {
                                  ...item,
                                  providers: item.providers.map((entry, entryIndex) =>
                                    entryIndex === providerIndex
                                      ? {
                                          ...entry,
                                          isAvailable: event.target.checked,
                                        }
                                      : entry,
                                  ),
                                };
                              }),
                            )
                          }
                          className="h-4 w-4"
                        />
                        Available
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setProducts((previous) =>
                            previous.map((item, index) => {
                              if (index !== productIndex || item.kind !== "pulsa") {
                                return item;
                              }

                              return {
                                ...item,
                                providers: item.providers.filter(
                                  (_, entryIndex) => entryIndex !== providerIndex,
                                ),
                              };
                            }),
                          )
                        }
                        className="rounded-lg border border-rose-300 px-2 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                      >
                        Hapus Provider
                      </button>
                    </div>

                    <div className="mt-2 space-y-2">
                      {provider.nominals.map((nominal, nominalIndex) => (
                        <div
                          key={`provider-nominal-${productIndex}-${providerIndex}-${nominalIndex}`}
                          className="grid gap-2 sm:grid-cols-4"
                        >
                          <input
                            type="number"
                            value={nominal.value}
                            onChange={(event) =>
                              setProducts((previous) =>
                                previous.map((item, index) => {
                                  if (index !== productIndex || item.kind !== "pulsa") {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    providers: item.providers.map((entry, entryIndex) => {
                                      if (entryIndex !== providerIndex) {
                                        return entry;
                                      }

                                      return {
                                        ...entry,
                                        nominals: entry.nominals.map(
                                          (nominalEntry, nominalEntryIndex) =>
                                            nominalEntryIndex === nominalIndex
                                              ? {
                                                  ...nominalEntry,
                                                  value: toNumber(event.target.value),
                                                }
                                              : nominalEntry,
                                        ),
                                      };
                                    }),
                                  };
                                }),
                              )
                            }
                            placeholder="Nominal"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          <input
                            type="number"
                            value={nominal.price}
                            onChange={(event) =>
                              setProducts((previous) =>
                                previous.map((item, index) => {
                                  if (index !== productIndex || item.kind !== "pulsa") {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    providers: item.providers.map((entry, entryIndex) => {
                                      if (entryIndex !== providerIndex) {
                                        return entry;
                                      }

                                      return {
                                        ...entry,
                                        nominals: entry.nominals.map(
                                          (nominalEntry, nominalEntryIndex) =>
                                            nominalEntryIndex === nominalIndex
                                              ? {
                                                  ...nominalEntry,
                                                  price: toNumber(event.target.value),
                                                }
                                              : nominalEntry,
                                        ),
                                      };
                                    }),
                                  };
                                }),
                              )
                            }
                            placeholder="Harga"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          <input
                            type="number"
                            value={nominal.promoPrice ?? ""}
                            onChange={(event) =>
                              setProducts((previous) =>
                                previous.map((item, index) => {
                                  if (index !== productIndex || item.kind !== "pulsa") {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    providers: item.providers.map((entry, entryIndex) => {
                                      if (entryIndex !== providerIndex) {
                                        return entry;
                                      }

                                      return {
                                        ...entry,
                                        nominals: entry.nominals.map(
                                          (nominalEntry, nominalEntryIndex) =>
                                            nominalEntryIndex === nominalIndex
                                              ? {
                                                  ...nominalEntry,
                                                  promoPrice: toOptionalNumber(
                                                    event.target.value,
                                                  ),
                                                }
                                              : nominalEntry,
                                        ),
                                      };
                                    }),
                                  };
                                }),
                              )
                            }
                            placeholder="Harga promo"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={nominal.isAvailable}
                              onChange={(event) =>
                                setProducts((previous) =>
                                  previous.map((item, index) => {
                                    if (index !== productIndex || item.kind !== "pulsa") {
                                      return item;
                                    }

                                    return {
                                      ...item,
                                      providers: item.providers.map(
                                        (entry, entryIndex) => {
                                          if (entryIndex !== providerIndex) {
                                            return entry;
                                          }

                                          return {
                                            ...entry,
                                            nominals: entry.nominals.map(
                                              (nominalEntry, nominalEntryIndex) =>
                                                nominalEntryIndex === nominalIndex
                                                  ? {
                                                      ...nominalEntry,
                                                      isAvailable:
                                                        event.target.checked,
                                                    }
                                                  : nominalEntry,
                                            ),
                                          };
                                        },
                                      ),
                                    };
                                  }),
                                )
                              }
                              className="h-4 w-4"
                            />
                            Available
                          </label>
                          <input
                            type="text"
                            value={nominal.promoLabel ?? ""}
                            onChange={(event) =>
                              setProducts((previous) =>
                                previous.map((item, index) => {
                                  if (index !== productIndex || item.kind !== "pulsa") {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    providers: item.providers.map(
                                      (entry, entryIndex) => {
                                        if (entryIndex !== providerIndex) {
                                          return entry;
                                        }

                                        return {
                                          ...entry,
                                          nominals: entry.nominals.map(
                                            (nominalEntry, nominalEntryIndex) =>
                                              nominalEntryIndex === nominalIndex
                                                ? {
                                                    ...nominalEntry,
                                                    promoLabel:
                                                      event.target.value ||
                                                      undefined,
                                                  }
                                                : nominalEntry,
                                          ),
                                        };
                                      },
                                    ),
                                  };
                                }),
                              )
                            }
                            placeholder="Label promo"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          <input
                            type="datetime-local"
                            value={toDateTimeLocalInput(nominal.promoStart)}
                            onChange={(event) =>
                              setProducts((previous) =>
                                previous.map((item, index) => {
                                  if (index !== productIndex || item.kind !== "pulsa") {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    providers: item.providers.map(
                                      (entry, entryIndex) => {
                                        if (entryIndex !== providerIndex) {
                                          return entry;
                                        }

                                        return {
                                          ...entry,
                                          nominals: entry.nominals.map(
                                            (nominalEntry, nominalEntryIndex) =>
                                              nominalEntryIndex === nominalIndex
                                                ? {
                                                    ...nominalEntry,
                                                    promoStart: fromDateTimeLocalInput(
                                                      event.target.value,
                                                    ),
                                                  }
                                                : nominalEntry,
                                          ),
                                        };
                                      },
                                    ),
                                  };
                                }),
                              )
                            }
                            placeholder="Mulai promo"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          <input
                            type="datetime-local"
                            value={toDateTimeLocalInput(nominal.promoEnd)}
                            onChange={(event) =>
                              setProducts((previous) =>
                                previous.map((item, index) => {
                                  if (index !== productIndex || item.kind !== "pulsa") {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    providers: item.providers.map(
                                      (entry, entryIndex) => {
                                        if (entryIndex !== providerIndex) {
                                          return entry;
                                        }

                                        return {
                                          ...entry,
                                          nominals: entry.nominals.map(
                                            (nominalEntry, nominalEntryIndex) =>
                                              nominalEntryIndex === nominalIndex
                                                ? {
                                                    ...nominalEntry,
                                                    promoEnd: fromDateTimeLocalInput(
                                                      event.target.value,
                                                    ),
                                                  }
                                                : nominalEntry,
                                          ),
                                        };
                                      },
                                    ),
                                  };
                                }),
                              )
                            }
                            placeholder="Selesai promo"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setProducts((previous) =>
                                previous.map((item, index) => {
                                  if (index !== productIndex || item.kind !== "pulsa") {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    providers: item.providers.map(
                                      (entry, entryIndex) => {
                                        if (entryIndex !== providerIndex) {
                                          return entry;
                                        }

                                        return {
                                          ...entry,
                                          nominals: entry.nominals.filter(
                                            (_, nominalEntryIndex) =>
                                              nominalEntryIndex !== nominalIndex,
                                          ),
                                        };
                                      },
                                    ),
                                  };
                                }),
                              )
                            }
                            className="rounded-lg border border-rose-300 px-2 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                          >
                            Hapus Nominal
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setProducts((previous) =>
                          previous.map((item, index) => {
                            if (index !== productIndex || item.kind !== "pulsa") {
                              return item;
                            }

                            return {
                              ...item,
                              providers: item.providers.map((entry, entryIndex) =>
                                entryIndex === providerIndex
                                  ? {
                                      ...entry,
                                      nominals: [...entry.nominals, createNominal()],
                                    }
                                  : entry,
                              ),
                            };
                          }),
                        )
                      }
                      className="mt-2 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      + Tambah Nominal Provider
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </article>
      );
      }))
      }
    </div>
  );
}
