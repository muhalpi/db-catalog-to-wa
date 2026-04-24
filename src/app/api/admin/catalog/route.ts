import { NextResponse } from "next/server";
import type { Product } from "@/data/catalog";
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from "@/lib/admin-session";
import {
  isCatalogDatabaseConfigured,
  loadCatalogProducts,
  saveCatalogProducts,
} from "@/lib/catalog-storage";

function hasValidAdminSession(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.split("=")[1];

  if (!sessionCookie) {
    return false;
  }

  return isAdminSessionValid(decodeURIComponent(sessionCookie));
}

export async function GET(request: Request) {
  if (!hasValidAdminSession(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const products = await loadCatalogProducts();
  return NextResponse.json({
    products,
    databaseConfigured: isCatalogDatabaseConfigured(),
  });
}

export async function PUT(request: Request) {
  if (!hasValidAdminSession(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { products?: Product[] }
    | null;
  const products = body?.products;

  if (!Array.isArray(products)) {
    return NextResponse.json(
      { message: "Payload products tidak valid." },
      { status: 400 },
    );
  }

  try {
    await saveCatalogProducts(products);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menyimpan katalog.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
