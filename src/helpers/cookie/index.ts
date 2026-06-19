import type { Context } from "../../context";
import { parse, serialize, type CookieSerializeOptions } from "../../cookie";

export type CookieOptions = Omit<CookieSerializeOptions, "encode">;

/**
 * Parses and retrieves a cookie value from the request.
 */
export const getCookie = (c: Context, name: string): string | undefined => {
  const cookieHeader = c.req.headers.get("Cookie");
  if (!cookieHeader) return undefined;
  
  const cookies = parse(cookieHeader);
  return cookies[name];
};

/**
 * Sets a cookie in the response headers.
 */
export const setCookie = (c: Context, name: string, value: string, options: CookieOptions = {}) => {
  const cookieStr = serialize(name, value, options);
  c.header.append("Set-Cookie", cookieStr);
};

/**
 * Deletes a cookie by setting its maxAge to 0.
 */
export const deleteCookie = (c: Context, name: string, options: Omit<CookieOptions, "maxAge" | "expires"> = {}) => {
  setCookie(c, name, "", { ...options, maxAge: 0 });
};

// ── Signed Cookies ───────────────────────────────────────────────────────────

const encodeText = (text: string) => new TextEncoder().encode(text);

const getCryptoKey = async (secret: string): Promise<CryptoKey> => {
  return await crypto.subtle.importKey(
    "raw",
    encodeText(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

const bufToBase64Url = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * Signs a value using HMAC SHA-256.
 */
export const signCookie = async (value: string, secret: string): Promise<string> => {
  const key = await getCryptoKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encodeText(value));
  return `${value}.${bufToBase64Url(signature)}`;
};

/**
 * Verifies a signed value. Returns the original value if valid, or false if invalid.
 */
export const verifyCookie = async (signedValue: string, secret: string): Promise<string | false> => {
  const lastDot = signedValue.lastIndexOf(".");
  if (lastDot === -1) return false;
  
  const value = signedValue.slice(0, lastDot);
  const expectedSig = signedValue.slice(lastDot + 1);
  
  const key = await getCryptoKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encodeText(value));
  
  if (bufToBase64Url(signature) === expectedSig) {
    return value;
  }
  return false;
};

/**
 * Sets a signed cookie.
 */
export const setSignedCookie = async (c: Context, name: string, value: string, secret: string, options?: CookieOptions) => {
  const signed = await signCookie(value, secret);
  setCookie(c, name, signed, options);
};

/**
 * Gets and verifies a signed cookie.
 * @returns The verified value, undefined if missing, or false if the signature is invalid.
 */
export const getSignedCookie = async (c: Context, name: string, secret: string): Promise<string | undefined | false> => {
  const cookie = getCookie(c, name);
  if (!cookie) return undefined;
  return await verifyCookie(cookie, secret);
};
