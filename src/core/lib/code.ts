import type { CodeRecord, Config } from "../types";
import { generateToken } from "./session";

/**
 * Exchange codes are short-lived: the app's server trades one for the verified
 * identity immediately after the browser lands back on its redirect_uri.
 */
const CODE_TTL_SECONDS = 120;

function codeKey(code: string): string {
  return `code:${code}`;
}

export async function issueCode(config: Config, record: CodeRecord): Promise<string> {
  const code = generateToken();
  await config.store.put(codeKey(code), JSON.stringify(record), CODE_TTL_SECONDS);
  return code;
}

/** Reads and immediately destroys the code, so it can only be spent once. */
export async function redeemCode(config: Config, code: string): Promise<CodeRecord | null> {
  const key = codeKey(code);
  const raw = await config.store.get(key);
  if (!raw) return null;
  await config.store.delete(key);
  return JSON.parse(raw) as CodeRecord;
}
