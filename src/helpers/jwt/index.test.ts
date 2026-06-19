import { describe, it, expect } from "bun:test";
import { sign, verify, decode } from "./index";

describe("Helpers: JWT", () => {
  const SECRET = "super-secret-key-12345";

  it("should sign and verify a token", async () => {
    const payload = { userId: 123, role: "admin" };
    const token = await sign(payload, SECRET);
    
    expect(token.split(".").length).toBe(3);

    const verified = await verify(token, SECRET);
    expect(verified.userId).toBe(123);
    expect(verified.role).toBe("admin");
  });

  it("should decode a token without verifying", async () => {
    const payload = { userId: 123, role: "admin" };
    const token = await sign(payload, SECRET);

    const decoded = decode(token);
    expect(decoded.header.alg).toBe("HS256");
    expect(decoded.payload.userId).toBe(123);
  });

  it("should fail to verify with wrong secret", async () => {
    const payload = { userId: 123 };
    const token = await sign(payload, SECRET);

    expect(verify(token, "wrong-secret")).rejects.toThrow("Invalid JWT signature");
  });

  it("should fail if token is expired", async () => {
    const exp = Math.floor(Date.now() / 1000) - 10; // Expired 10s ago
    const token = await sign({ exp }, SECRET);

    expect(verify(token, SECRET)).rejects.toThrow("JWT expired");
  });

  it("should fail if token is not yet valid (nbf)", async () => {
    const nbf = Math.floor(Date.now() / 1000) + 10; // Valid in 10s
    const token = await sign({ nbf }, SECRET);

    expect(verify(token, SECRET)).rejects.toThrow("JWT not yet valid");
  });
});
