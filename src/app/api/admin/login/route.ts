import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  isAdminAuthConfigured,
  isAdminPasswordValid,
} from "@/lib/admin-session";

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      { message: "Admin auth belum dikonfigurasi di environment variable." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { password?: string }
    | null;
  const password = body?.password?.trim() ?? "";

  if (!isAdminPasswordValid(password)) {
    return NextResponse.json(
      { message: "Password admin tidak valid." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
