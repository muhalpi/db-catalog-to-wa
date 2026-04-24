import * as XLSX from "xlsx";
import type { Product, Requirement, VariantOption, NominalOption } from "@/data/catalog";

type NormalizedRow = Record<string, string>;

const PRODUCT_SHEET_CANDIDATES = ["Products", "Product", "Produk"];
const ENTRY_SHEET_CANDIDATES = ["Entries", "Entry", "Varian", "Nominal"];
const PULSA_SHEET_CANDIDATES = ["PulsaEntries", "Pulsa", "PulsaNominals"];

function normalizeHeader(key: string) {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toCellString(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 16);
  }

  return String(value).trim();
}

function normalizeRow(row: Record<string, unknown>) {
  const normalized: NormalizedRow = {};

  Object.entries(row).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = toCellString(value);
  });

  return normalized;
}

function getSheetName(
  workbook: XLSX.WorkBook,
  candidates: string[],
  required = false,
) {
  const sheetName = workbook.SheetNames.find((name) =>
    candidates.some((candidate) => name.toLowerCase() === candidate.toLowerCase()),
  );

  if (sheetName) {
    return sheetName;
  }

  if (!required) {
    return undefined;
  }

  throw new Error(
    `Sheet wajib tidak ditemukan. Cek salah satu nama: ${candidates.join(", ")}`,
  );
}

function getRows(workbook: XLSX.WorkBook, sheetCandidates: string[], required = false) {
  const sheetName = getSheetName(workbook, sheetCandidates, required);
  if (!sheetName) {
    return [] as NormalizedRow[];
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [] as NormalizedRow[];
  }

  return XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      blankrows: false,
    })
    .map(normalizeRow);
}

function getValue(row: NormalizedRow, keys: string[]) {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const value = row[normalizedKey];
    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return "";
}

function parseBoolean(input: string, fallback = true) {
  const value = input.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "ya", "y", "on", "aktif", "available"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "tidak", "n", "off", "nonaktif", "disabled"].includes(value)) {
    return false;
  }

  return fallback;
}

function parseRequiredNumber(input: string, context: string) {
  const normalized = input.replace(/[^0-9-]/g, "");
  if (!normalized || normalized === "-") {
    throw new Error(`${context} wajib berupa angka.`);
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`${context} wajib berupa angka valid.`);
  }

  return value;
}

function parseOptionalNumber(input: string) {
  if (!input.trim()) {
    return undefined;
  }

  return parseRequiredNumber(input, "Kolom angka opsional");
}

function toSlug(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function parseLines(input: string) {
  return input
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTerms(input: string) {
  const terms = parseLines(input).map((line) =>
    line.replace(/^[-*\u2022]\s*/, "").trim(),
  );

  return terms.length ? terms : ["Syarat baru"];
}

function normalizeFieldType(typeInput: string): Requirement["type"] {
  const value = typeInput.trim().toLowerCase();
  if (value === "email" || value === "tel") {
    return value;
  }

  return "text";
}

function parseRequirements(input: string) {
  const rows = parseLines(input);

  const requirements = rows
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      if (!parts[0] && !parts[1]) {
        return null;
      }

      const sourceLabel = parts[1] || parts[0] || `Field ${index + 1}`;
      return {
        key: toSlug(parts[0] || sourceLabel, `field-${index + 1}`),
        label: sourceLabel,
        placeholder: parts[2] || "Isi detail",
        type: normalizeFieldType(parts[3] || "text"),
      } satisfies Requirement;
    })
    .filter((item): item is Requirement => Boolean(item));

  if (requirements.length) {
    return requirements;
  }

  return [
    {
      key: "detail",
      label: "Detail",
      placeholder: "Isi detail",
      type: "text",
    },
  ] satisfies Requirement[];
}

function parsePromoFields(row: NormalizedRow) {
  const promoPrice = parseOptionalNumber(
    getValue(row, ["promo_price", "promo", "harga_promo"]),
  );

  return {
    promoPrice,
    promoLabel: getValue(row, ["promo_label", "label_promo"]) || undefined,
    promoStart: getValue(row, ["promo_start", "mulai"]) || undefined,
    promoEnd: getValue(row, ["promo_end", "selesai"]) || undefined,
  };
}

export function importCatalogFromWorkbookBuffer(buffer: ArrayBuffer): Product[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const productRows = getRows(workbook, PRODUCT_SHEET_CANDIDATES, true);
  const entryRows = getRows(workbook, ENTRY_SHEET_CANDIDATES, false);
  const pulsaRows = getRows(workbook, PULSA_SHEET_CANDIDATES, false);

  if (!productRows.length) {
    throw new Error("Sheet produk kosong. Isi minimal 1 baris produk.");
  }

  const products: Product[] = [];
  const productMap = new Map<string, Product>();

  productRows.forEach((row, rowIndex) => {
    const id = getValue(row, ["id", "product_id"]);
    const name = getValue(row, ["name", "nama", "product_name"]);
    const kind = getValue(row, ["kind", "tipe"]).toLowerCase();

    if (!id) {
      throw new Error(`Products baris ${rowIndex + 2}: kolom id wajib diisi.`);
    }
    if (!name) {
      throw new Error(`Products baris ${rowIndex + 2}: kolom name wajib diisi.`);
    }
    if (!["variants", "token", "pulsa"].includes(kind)) {
      throw new Error(
        `Products baris ${rowIndex + 2}: kind harus salah satu dari variants/token/pulsa.`,
      );
    }

    if (productMap.has(id)) {
      throw new Error(`Products baris ${rowIndex + 2}: id produk '${id}' duplikat.`);
    }

    const base = {
      id,
      name,
      kind: kind as Product["kind"],
      category: getValue(row, ["category", "kategori"]) || "Lainnya",
      description: getValue(row, ["description", "deskripsi"]) || "",
      isAvailable: parseBoolean(
        getValue(row, ["is_available", "available", "aktif"]),
        true,
      ),
      terms: parseTerms(getValue(row, ["terms", "syarat"])),
      requirements: parseRequirements(
        getValue(row, ["requirements", "fields", "checkout_fields"]),
      ),
    };

    let product: Product;
    if (base.kind === "variants") {
      product = { ...base, kind: "variants", variants: [] };
    } else if (base.kind === "token") {
      product = { ...base, kind: "token", nominals: [] };
    } else {
      product = { ...base, kind: "pulsa", providers: [] };
    }

    products.push(product);
    productMap.set(product.id, product);
  });

  entryRows.forEach((row, rowIndex) => {
    const productId = getValue(row, ["product_id", "id_produk"]);
    if (!productId) {
      return;
    }

    const product = productMap.get(productId);
    if (!product) {
      throw new Error(
        `Entries baris ${rowIndex + 2}: product_id '${productId}' tidak ditemukan di Products.`,
      );
    }

    if (product.kind === "pulsa") {
      return;
    }

    const price = parseRequiredNumber(
      getValue(row, ["price", "harga"]),
      `Entries baris ${rowIndex + 2} kolom price`,
    );
    const isAvailable = parseBoolean(
      getValue(row, ["is_available", "available", "aktif"]),
      true,
    );
    const promo = parsePromoFields(row);

    if (product.kind === "variants") {
      const label = getValue(row, ["label", "variant_label", "nama_varian"]) || "Varian";
      const id =
        getValue(row, ["entry_id", "variant_id", "id_varian"]) ||
        toSlug(label, `varian-${product.variants.length + 1}`);

      if (product.variants.some((variant) => variant.id === id)) {
        throw new Error(
          `Entries baris ${rowIndex + 2}: variant id '${id}' duplikat untuk produk '${productId}'.`,
        );
      }

      const variant: VariantOption = {
        id,
        label,
        price,
        isAvailable,
        ...promo,
      };
      product.variants.push(variant);
      return;
    }

    const nominalValue = parseRequiredNumber(
      getValue(row, ["nominal", "nominal_value", "value"]),
      `Entries baris ${rowIndex + 2} kolom nominal`,
    );

    if (product.nominals.some((nominal) => nominal.value === nominalValue)) {
      throw new Error(
        `Entries baris ${rowIndex + 2}: nominal '${nominalValue}' duplikat untuk produk '${productId}'.`,
      );
    }

    const nominal: NominalOption = {
      value: nominalValue,
      price,
      isAvailable,
      ...promo,
    };
    product.nominals.push(nominal);
  });

  pulsaRows.forEach((row, rowIndex) => {
    const productId = getValue(row, ["product_id", "id_produk"]);
    if (!productId) {
      return;
    }

    const product = productMap.get(productId);
    if (!product) {
      throw new Error(
        `PulsaEntries baris ${rowIndex + 2}: product_id '${productId}' tidak ditemukan di Products.`,
      );
    }
    if (product.kind !== "pulsa") {
      throw new Error(
        `PulsaEntries baris ${rowIndex + 2}: product '${productId}' bukan tipe pulsa.`,
      );
    }

    const providerLabel =
      getValue(row, ["provider_label", "provider", "nama_provider"]) || "Provider";
    const providerId =
      getValue(row, ["provider_id", "id_provider"]) ||
      toSlug(providerLabel, `provider-${product.providers.length + 1}`);
    const providerAvailable = parseBoolean(
      getValue(row, ["provider_available", "provider_aktif"]),
      true,
    );

    let provider = product.providers.find((item) => item.id === providerId);
    if (!provider) {
      provider = {
        id: providerId,
        label: providerLabel,
        isAvailable: providerAvailable,
        nominals: [],
      };
      product.providers.push(provider);
    }

    const nominalValue = parseRequiredNumber(
      getValue(row, ["nominal", "nominal_value", "value"]),
      `PulsaEntries baris ${rowIndex + 2} kolom nominal`,
    );
    if (provider.nominals.some((nominal) => nominal.value === nominalValue)) {
      throw new Error(
        `PulsaEntries baris ${rowIndex + 2}: nominal '${nominalValue}' duplikat untuk provider '${providerId}'.`,
      );
    }

    const price = parseRequiredNumber(
      getValue(row, ["price", "harga"]),
      `PulsaEntries baris ${rowIndex + 2} kolom price`,
    );
    const isAvailable = parseBoolean(
      getValue(row, ["is_available", "available", "aktif"]),
      true,
    );
    const promo = parsePromoFields(row);

    provider.nominals.push({
      value: nominalValue,
      price,
      isAvailable,
      ...promo,
    });
  });

  products.forEach((product) => {
    if (product.kind === "variants" && product.variants.length === 0) {
      throw new Error(
        `Produk '${product.id}' bertipe variants, tapi belum punya baris di sheet Entries.`,
      );
    }

    if (product.kind === "token" && product.nominals.length === 0) {
      throw new Error(
        `Produk '${product.id}' bertipe token, tapi belum punya baris di sheet Entries.`,
      );
    }

    if (product.kind === "pulsa") {
      if (product.providers.length === 0) {
        throw new Error(
          `Produk '${product.id}' bertipe pulsa, tapi belum punya baris di sheet PulsaEntries.`,
        );
      }

      const providerWithoutNominal = product.providers.find(
        (provider) => provider.nominals.length === 0,
      );
      if (providerWithoutNominal) {
        throw new Error(
          `Provider '${providerWithoutNominal.id}' pada produk '${product.id}' belum punya nominal.`,
        );
      }
    }
  });

  return products;
}

export function downloadCatalogImportTemplate() {
  const workbook = XLSX.utils.book_new();

  const productRows = [
    {
      id: "canva-pro",
      name: "Canva Pro",
      kind: "variants",
      category: "Premium",
      description: "Aktivasi akun Canva Pro",
      is_available: "true",
      terms: "Akun aktif\nGaransi sesuai masa aktif",
      requirements:
        "activationEmail|Email akun untuk aktivasi|contoh@gmail.com|email",
    },
    {
      id: "token-fast",
      name: "Token Fast Proses",
      kind: "token",
      category: "Token Listrik",
      description: "Token listrik proses cepat",
      is_available: "true",
      terms: "Nomor meter wajib benar",
      requirements: "meterNumber|Nomor meter|Masukkan nomor meter|text",
    },
    {
      id: "pulsa-telkomsel",
      name: "Pulsa Telkomsel",
      kind: "pulsa",
      category: "Pulsa & Data",
      description: "Pulsa provider Telkomsel",
      is_available: "true",
      terms: "Nomor aktif",
      requirements: "targetPhone|Nomor HP tujuan|08xxxxxxxxxx|tel",
    },
  ];

  const entryRows = [
    {
      product_id: "canva-pro",
      entry_id: "1-bulan",
      label: "1 Bulan",
      nominal: "",
      price: 25000,
      promo_price: "",
      promo_label: "",
      promo_start: "",
      promo_end: "",
      is_available: "true",
    },
    {
      product_id: "canva-pro",
      entry_id: "3-bulan",
      label: "3 Bulan",
      nominal: "",
      price: 70000,
      promo_price: 65000,
      promo_label: "Promo Bundling",
      promo_start: "",
      promo_end: "",
      is_available: "true",
    },
    {
      product_id: "token-fast",
      entry_id: "",
      label: "",
      nominal: 100000,
      price: 102000,
      promo_price: "",
      promo_label: "",
      promo_start: "",
      promo_end: "",
      is_available: "true",
    },
  ];

  const pulsaRows = [
    {
      product_id: "pulsa-telkomsel",
      provider_id: "telkomsel",
      provider_label: "Telkomsel",
      provider_available: "true",
      nominal: 5000,
      price: 6000,
      promo_price: "",
      promo_label: "",
      promo_start: "",
      promo_end: "",
      is_available: "true",
    },
    {
      product_id: "pulsa-telkomsel",
      provider_id: "telkomsel",
      provider_label: "Telkomsel",
      provider_available: "true",
      nominal: 10000,
      price: 11000,
      promo_price: "",
      promo_label: "",
      promo_start: "",
      promo_end: "",
      is_available: "true",
    },
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(productRows),
    "Products",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(entryRows),
    "Entries",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(pulsaRows),
    "PulsaEntries",
  );

  XLSX.writeFile(workbook, "catalog-import-template.xlsx");
}
