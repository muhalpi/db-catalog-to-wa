import { NextResponse } from "next/server";
import { loadCatalogProducts } from "@/lib/catalog-storage";

export async function GET() {
  try {
    const products = await loadCatalogProducts();
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json(
      { message: "Gagal memuat katalog." },
      { status: 500 },
    );
  }
}
