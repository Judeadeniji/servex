export type Algorithm = "HS256" | "HS384" | "HS512";

const encodeText = (text: string) => new TextEncoder().encode(text);
const decodeText = (buf: ArrayBuffer) => new TextDecoder().decode(buf);

const bufToBase64Url = (buf: ArrayBuffer): string => {
	const bytes = new Uint8Array(buf);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
};

const base64UrlToBuf = (b64url: string): ArrayBuffer => {
	let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
	while (b64.length % 4) b64 += "=";
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
};

const getCryptoKey = async (
	secret: string,
	alg: Algorithm,
	usages: KeyUsage[],
): Promise<CryptoKey> => {
	const hash = alg.replace("HS", "SHA-"); // HS256 -> SHA-256
	return await crypto.subtle.importKey(
		"raw",
		encodeText(secret),
		{ name: "HMAC", hash },
		false,
		usages,
	);
};

export const sign = async (
	payload: Record<string, unknown>,
	secret: string,
	alg: Algorithm = "HS256",
): Promise<string> => {
	const header = { alg, typ: "JWT" };
	const encodedHeader = bufToBase64Url(
		encodeText(JSON.stringify(header)).buffer,
	);
	const encodedPayload = bufToBase64Url(
		encodeText(JSON.stringify(payload)).buffer,
	);

	const dataToSign = `${encodedHeader}.${encodedPayload}`;
	const key = await getCryptoKey(secret, alg, ["sign"]);

	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encodeText(dataToSign),
	);
	return `${dataToSign}.${bufToBase64Url(signature)}`;
};

export const verify = async (
	token: string,
	secret: string,
	alg: Algorithm = "HS256",
): Promise<Record<string, unknown>> => {
	const parts = token.split(".");
	if (parts.length !== 3) throw new Error("Invalid JWT format");

	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	const dataToSign = `${encodedHeader}.${encodedPayload}`;

	const key = await getCryptoKey(secret, alg, ["verify"]);
	const signatureBuf = base64UrlToBuf(encodedSignature);

	const isValid = await crypto.subtle.verify(
		"HMAC",
		key,
		signatureBuf,
		encodeText(dataToSign),
	);
	if (!isValid) throw new Error("Invalid JWT signature");

	const payload = JSON.parse(decodeText(base64UrlToBuf(encodedPayload)));

	if (payload.exp && Date.now() >= payload.exp * 1000) {
		throw new Error("JWT expired");
	}
	if (payload.nbf && Date.now() < payload.nbf * 1000) {
		throw new Error("JWT not yet valid");
	}

	return payload;
};

export const decode = (
	token: string,
): { header: unknown; payload: unknown } => {
	const parts = token.split(".");
	if (parts.length !== 3) throw new Error("Invalid JWT format");
	return {
		header: JSON.parse(decodeText(base64UrlToBuf(parts[0]))),
		payload: JSON.parse(decodeText(base64UrlToBuf(parts[1]))),
	};
};
