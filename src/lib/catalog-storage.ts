import { Pool } from "pg";
import {
  CATALOG_PRODUCTS,
  normalizeCatalogProducts,
  type Product,
} from "@/data/catalog";

const CATALOG_ROW_ID = "default";

declare global {
  var __catalogPool: Pool | undefined;
}

function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    const sslMode = url.searchParams.get("sslmode");
    const hasLibpqCompat = url.searchParams.has("uselibpqcompat");
    const needsCompatFlag =
      sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca";

    if (needsCompatFlag && !hasLibpqCompat) {
      url.searchParams.set("uselibpqcompat", "true");
      return url.toString();
    }

    return url.toString();
  } catch {
    return raw;
  }
}

function getPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    return null;
  }

  if (!global.__catalogPool) {
    global.__catalogPool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? false
        : {
            rejectUnauthorized: false,
          },
    });
  }

  return global.__catalogPool;
}

async function ensureCatalogTable(pool: Pool) {
  await pool.query(`
    create table if not exists catalog_configs (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
}

function isValidCatalogPayload(value: unknown): value is Product[] {
  return Array.isArray(value);
}

export function isCatalogDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

export async function loadCatalogProducts() {
  const pool = getPool();
  if (!pool) {
    return normalizeCatalogProducts(CATALOG_PRODUCTS);
  }

  await ensureCatalogTable(pool);

  const result = await pool.query<{ data: unknown }>(
    "select data from catalog_configs where id = $1 limit 1",
    [CATALOG_ROW_ID],
  );

  if (!result.rowCount) {
    await pool.query(
      `
      insert into catalog_configs (id, data)
      values ($1, $2::jsonb)
      on conflict (id) do update
      set data = excluded.data, updated_at = now()
      `,
      [CATALOG_ROW_ID, JSON.stringify(normalizeCatalogProducts(CATALOG_PRODUCTS))],
    );
    return normalizeCatalogProducts(CATALOG_PRODUCTS);
  }

  const payload = result.rows[0]?.data;
  if (!isValidCatalogPayload(payload)) {
    return normalizeCatalogProducts(CATALOG_PRODUCTS);
  }

  return normalizeCatalogProducts(payload);
}

export async function saveCatalogProducts(products: Product[]) {
  const pool = getPool();
  if (!pool) {
    throw new Error("DATABASE_URL belum diset. Simpan katalog memerlukan database.");
  }

  await ensureCatalogTable(pool);
  await pool.query(
    `
    insert into catalog_configs (id, data)
    values ($1, $2::jsonb)
    on conflict (id) do update
    set data = excluded.data, updated_at = now()
    `,
    [CATALOG_ROW_ID, JSON.stringify(normalizeCatalogProducts(products))],
  );
}
