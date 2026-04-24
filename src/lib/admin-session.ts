import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "catalog_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? "";
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminPasswordValid(inputPassword: string) {
  const expectedPassword = getAdminPassword();
  if (!expectedPassword) {
    return false;
  }

  return safeEqual(inputPassword, expectedPassword);
}

function signPayload(payload: string) {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createAdminSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function isAdminSessionValid(token?: string) {
  if (!token) {
    return false;
  }

  const secret = getSessionSecret();
  if (!secret) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(payload);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return Date.now() < expiresAt;
}

export function isAdminAuthConfigured() {
  return Boolean(getAdminPassword() && getSessionSecret());
}
