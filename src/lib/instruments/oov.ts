export const MFA_G2P_MODEL = "english_us_arpa";
export const MFA_G2P_MODEL_VERSION = "2.0.0rc4.dev19+ged818cb.d20220404";

export function mfaTokens(text: string): string[] {
  return Array.from(new Set((text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)*/g) ?? []).map((token) => token.replace(/^'+|'+$/g, "")).filter(Boolean)));
}

export function dictionaryWords(contents: string): Set<string> {
  const words = new Set<string>();
  for (const line of contents.split(/\r?\n/)) {
    const word = line.trim().split(/\s+/)[0];
    if (word) words.add(word.toLowerCase());
  }
  return words;
}

export function findOovTokens(text: string, dictionary: Set<string>): string[] {
  return mfaTokens(text).filter((token) => !dictionary.has(token));
}

export function parseG2pOutput(contents: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const [token, ...phones] = line.trim().split(/\s+/);
    if (token && phones.length && !result.has(token)) result.set(token.toLowerCase(), phones.join(" "));
  }
  return result;
}
