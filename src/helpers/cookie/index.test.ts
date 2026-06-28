import { describe, expect, it } from "bun:test";
import { createContext } from "../../context";
import {
	deleteCookie,
	getCookie,
	getSignedCookie,
	setCookie,
	setSignedCookie,
	signCookie,
	verifyCookie,
} from "./index";

describe("Helpers: Cookie", () => {
	it("should parse an existing cookie", () => {
		const req = new Request("http://localhost/", {
			headers: { Cookie: "foo=bar; user=john%20doe" },
		});
		const c = createContext(req, {});

		expect(getCookie(c, "foo")).toBe("bar");
		expect(getCookie(c, "user")).toBe("john doe");
		expect(getCookie(c, "missing")).toBeUndefined();
	});

	it("should set a cookie with options", () => {
		const req = new Request("http://localhost/");
		const c = createContext(req, {});

		setCookie(c, "session", "123", {
			httpOnly: true,
			secure: true,
			path: "/",
			maxAge: 3600,
			sameSite: "strict",
		});

		const setCookieHeader = c.header().get("Set-Cookie");
		expect(setCookieHeader).toContain("session=123");
		expect(setCookieHeader).toContain("HttpOnly");
		expect(setCookieHeader).toContain("Secure");
		expect(setCookieHeader).toContain("Path=/");
		expect(setCookieHeader).toContain("Max-Age=3600");
		expect(setCookieHeader).toContain("SameSite=Strict");
	});

	it("should support multiple cookies in Set-Cookie via append", () => {
		const req = new Request("http://localhost/");
		const c = createContext(req, {});

		setCookie(c, "foo", "1");
		setCookie(c, "bar", "2");

		// Context headers wrap standard Headers, which handles multiple Set-Cookie headers properly.
		// In Node/Bun, get("Set-Cookie") joins them with comma, which is technically valid for getting.
		// To properly test append, we check the underlying Headers object if we need, but string match works for tests.
		const combined = c.header().get("Set-Cookie");
		expect(combined).toContain("foo=1");
		expect(combined).toContain("bar=2");
	});

	it("should delete a cookie by setting maxAge to 0", () => {
		const req = new Request("http://localhost/");
		const c = createContext(req, {});

		deleteCookie(c, "foo", { path: "/" });

		const setCookieHeader = c.header().get("Set-Cookie");
		expect(setCookieHeader).toContain("foo=");
		expect(setCookieHeader).toContain("Max-Age=0");
		expect(setCookieHeader).toContain("Path=/");
	});

	describe("Signed Cookies", () => {
		const SECRET = "super-secret-key-12345";

		it("should sign and verify a cookie value", async () => {
			const signed = await signCookie("my-value", SECRET);
			expect(signed.startsWith("my-value.")).toBe(true);

			const verified = await verifyCookie(signed, SECRET);
			expect(verified).toBe("my-value");
		});

		it("should fail verification if tampered with", async () => {
			const signed = await signCookie("my-value", SECRET);

			// Tamper value
			const tamperedValue = signed.replace("my-value", "my-admin");
			expect(await verifyCookie(tamperedValue, SECRET)).toBe(false);

			// Tamper signature
			const tamperedSig = `${signed.slice(0, -1)}a`;
			expect(await verifyCookie(tamperedSig, SECRET)).toBe(false);
		});

		it("should fail verification with wrong secret", async () => {
			const signed = await signCookie("my-value", SECRET);
			expect(await verifyCookie(signed, "wrong-secret")).toBe(false);
		});

		it("should set and get signed cookies from Context", async () => {
			const req1 = new Request("http://localhost/");

			const c1 = createContext(req1, {});

			await setSignedCookie(c1, "secure_session", "admin-data", SECRET);

			const setCookieStr = c1.header().get("Set-Cookie")!;
			// Extract the exact signed value from the header
			const match = setCookieStr.match(/secure_session=([^;]+)/);
			const signedValue = decodeURIComponent(match?.[1] || "");

			const req2 = new Request("http://localhost/", {
				headers: { Cookie: `secure_session=${signedValue}` },
			});

			const c2 = createContext(req2, {});

			const result = await getSignedCookie(c2, "secure_session", SECRET);
			expect(result).toBe("admin-data");
		});
	});
});
