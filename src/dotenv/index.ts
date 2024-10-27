import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import packageJson from "../../package.json" with { type: "json" };

const version = packageJson.version;

const LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

export interface DotenvOptions {
  path?: string | string[];
  DOTENV_KEY?: string;
  processEnv?: NodeJS.ProcessEnv;
  encoding?: BufferEncoding;
  debug?: boolean;
  override?: boolean;
}

class Dotenv {
  version: string;
  private static LINE = LINE;

  constructor() {
    this.version = version;
  }

  static parse(src: Buffer | string): Record<string, string> {
    const obj: Record<string, string> = {};
    let lines = src.toString();
    lines = lines.replace(/\r\n?/gm, "\n");

    let match;
    while ((match = Dotenv.LINE.exec(lines)) != null) {
      const key = match[1];
      let value = (match[2] || "").trim();
      const maybeQuote = value[0];
      value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");

      if (maybeQuote === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      }

      obj[key] = value;
    }
    return obj;
  }

  static decrypt(encrypted: string, keyStr: string): string {
    const key = Buffer.from(keyStr.slice(-64), "hex");
    let ciphertext = Buffer.from(encrypted, "base64");

    const nonce = ciphertext.subarray(0, 12);
    const authTag = ciphertext.subarray(-16);
    ciphertext = ciphertext.subarray(12, -16);

    try {
      const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
      aesgcm.setAuthTag(authTag);
      return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
    } catch (e) {
      const error = e as Error;
      const isRange = error instanceof RangeError;
      const invalidKeyLength = error.message === "Invalid key length";
      const decryptionFailed =
        error.message === "Unsupported state or unable to authenticate data";

      if (isRange || invalidKeyLength) {
        throw new Error(
          "INVALID_DOTENV_KEY: It must be 64 characters long (or more)"
        );
      } else if (decryptionFailed) {
        throw new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
      } else {
        throw error;
      }
    }
  }

  private static _dotenvKey(options?: DotenvOptions): string {
    if (options?.DOTENV_KEY?.length! > 0) {
      return options!.DOTENV_KEY!;
    }

    if (process.env.DOTENV_KEY?.length! > 0) {
      return process.env.DOTENV_KEY!;
    }

    return "";
  }

  private static _resolveHome(envPath: string): string {
    return envPath[0] === "~"
      ? path.join(os.homedir(), envPath.slice(1))
      : envPath;
  }

  private static _vaultPath(options?: DotenvOptions): string | null {
    let possibleVaultPath: string | null = null;

    if (options?.path) {
      if (Array.isArray(options.path)) {
        for (const filepath of options.path) {
          if (fs.existsSync(filepath)) {
            possibleVaultPath = filepath.endsWith(".vault")
              ? filepath
              : `${filepath}.vault`;
          }
        }
      } else {
        possibleVaultPath = options.path.endsWith(".vault")
          ? options.path
          : `${options.path}.vault`;
      }
    } else {
      possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
    }

    return fs.existsSync(possibleVaultPath!) ? possibleVaultPath : null;
  }

  private static _instructions(
    result: { parsed: Record<string, string> },
    dotenvKey: string
  ): { ciphertext: string; key: string } {
    let uri: URL;
    try {
      uri = new URL(dotenvKey);
    } catch (error) {
      if ((error as Error & { code: string }).code === "ERR_INVALID_URL") {
        throw new Error(
          "INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development"
        );
      }
      throw error;
    }

    const key = uri.password;
    if (!key) {
      throw new Error("INVALID_DOTENV_KEY: Missing key part");
    }

    const environment = uri.searchParams.get("environment");
    if (!environment) {
      throw new Error("INVALID_DOTENV_KEY: Missing environment part");
    }

    const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
    const ciphertext = result.parsed[environmentKey];

    if (!ciphertext) {
      throw new Error(
        `NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`
      );
    }

    return { ciphertext, key };
  }

  private static _parseVault(options?: DotenvOptions): Record<string, string> {
    const vaultPath = Dotenv._vaultPath(options);
    if (!vaultPath) {
      throw new Error(
        "MISSING_DATA: Cannot parse .env.vault for an unknown reason"
      );
    }

    const result = Dotenv.configDotenv({ path: vaultPath });
    if (!result.parsed) {
      throw new Error(
        `MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`
      );
    }

    const keys = Dotenv._dotenvKey(options).split(",");
    let decrypted: string | undefined;

    for (const key of keys) {
      try {
        const attrs = Dotenv._instructions(result, key.trim());
        decrypted = Dotenv.decrypt(attrs.ciphertext, attrs.key);
        break;
      } catch (error) {
        if (keys.indexOf(key) + 1 >= keys.length) {
          throw error;
        }
      }
    }

    return Dotenv.parse(decrypted || "");
  }

  private static _log(message: string) {
    console.log(`[dotenv@${version}][INFO] ${message}`);
  }

  private static _warn(message: string) {
    console.warn(`[dotenv@${version}][WARN] ${message}`);
  }

  private static _debug(message: string) {
    console.info(`[dotenv@${version}][DEBUG] ${message}`);
  }

  static populate(
    processEnv: NodeJS.ProcessEnv,
    parsed: Record<string, string>,
    options: DotenvOptions = {}
  ) {
    const debug = Boolean(options.debug);
    const override = Boolean(options.override);

    if (typeof parsed !== "object") {
      throw new Error(
        "OBJECT_REQUIRED: Please check the processEnv argument being passed to populate"
      );
    }

    for (const key of Object.keys(parsed)) {
      if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
        if (override) {
          processEnv[key] = parsed[key];
        }
        if (debug) {
          if (override) {
            Dotenv._debug(`"${key}" is already defined and WAS overwritten`);
          } else {
            Dotenv._debug(
              `"${key}" is already defined and was NOT overwritten`
            );
          }
        }
      } else {
        processEnv[key] = parsed[key];
      }
    }
  }

  private static configDotenv(options?: DotenvOptions): {
    parsed: Record<string, string>;
    error?: Error;
  } {
    const dotenvPath = path.resolve(process.cwd(), ".env");
    let encoding: BufferEncoding = "utf8";
    const debug = Boolean(options?.debug);

    if (options?.encoding) {
      encoding = options.encoding;
    } else if (debug) {
      Dotenv._debug("No encoding is specified. UTF-8 is used by default");
    }

    let optionPaths = [dotenvPath];
    if (options?.path) {
      if (!Array.isArray(options.path)) {
        optionPaths = [Dotenv._resolveHome(options.path)];
      } else {
        optionPaths = options.path.map((filepath) =>
          Dotenv._resolveHome(filepath)
        );
      }
    }

    const parsedAll: Record<string, string> = {};
    let lastError: Error | undefined;

    for (const path of optionPaths) {
      try {
        const parsed = Dotenv.parse(fs.readFileSync(path, { encoding }));
        Dotenv.populate(parsedAll, parsed, options);
      } catch (e) {
        if (debug) {
          Dotenv._debug(`Failed to load ${path} ${(e as Error).message}`);
        }
        lastError = e as Error;
      }
    }

    Dotenv.populate(process.env, parsedAll, options);

    return lastError
      ? { parsed: parsedAll, error: lastError }
      : { parsed: parsedAll };
  }

  static config(options?: DotenvOptions) {
    if (Dotenv._dotenvKey(options).length === 0) {
      return Dotenv.configDotenv(options);
    }

    const vaultPath = Dotenv._vaultPath(options);

    if (!vaultPath) {
      Dotenv._warn(
        `You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`
      );
      return Dotenv.configDotenv(options);
    }

    return Dotenv._parseVault(options);
  }
}

export default Dotenv;
