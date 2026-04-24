import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  isAdminSessionValid,
} from "@/lib/admin-session";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (isAdminSessionValid(sessionToken)) {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-3 py-6 sm:px-4">
      <AdminLoginForm />
    </main>
  );
}
