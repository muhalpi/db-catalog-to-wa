import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  isAdminAuthConfigured,
  isAdminSessionValid,
} from "@/lib/admin-session";
import {
  isCatalogDatabaseConfigured,
  loadCatalogProducts,
} from "@/lib/catalog-storage";
import { CatalogAdminEditor } from "@/components/admin/catalog-admin-editor";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isAdminAuthConfigured()) {
    return (
      <main className="min-h-screen bg-[#f4f6f8] px-3 py-6 sm:px-4">
        <div className="mx-auto w-full max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">
          <h1 className="text-lg font-semibold">Admin belum dikonfigurasi</h1>
          <p className="mt-2 text-xs">
            Set environment variable `ADMIN_PASSWORD` dan `ADMIN_SESSION_SECRET`
            dulu agar halaman admin bisa dipakai.
          </p>
        </div>
      </main>
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!isAdminSessionValid(sessionToken)) {
    redirect("/admin/login");
  }

  const products = await loadCatalogProducts();
  const databaseConfigured = isCatalogDatabaseConfigured();

  return (
    <main className="min-h-screen bg-[#f4f6f8]">
      <CatalogAdminEditor
        initialProducts={products}
        databaseConfigured={databaseConfigured}
      />
    </main>
  );
}
