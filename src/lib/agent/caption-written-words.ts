import type { AlignedCaptionWord } from "../timeline/caption-grouping";

/**
 * A caption word as it should read on screen, timed by the spoken words it covers. MFA aligns the
 * spoken form of a script ("zero point two two", "nas dock"); the written script says "0.22" and
 * "Nasdaq". Each unit pairs one written word with its run of aligned spoken words.
 */
export type WrittenCaptionUnit = { word: string; start: number; end: number; spoken: AlignedCaptionWord[] };

const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: Array<[number, string]> = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"], [100, "hundred"]];

function wholeNumberWords(n: number): string[] {
  if (n < 20) return [ONES[n]!];
  if (n < 100) return [TENS[Math.floor(n / 10)]!, ...(n % 10 ? [ONES[n % 10]!] : [])];
  for (const [size, name] of SCALES) {
    if (n >= size) return [...wholeNumberWords(Math.floor(n / size)), name, ...(n % size ? wholeNumberWords(n % size) : [])];
  }
  return [String(n)];
}

/** How many words a written token is likely spoken as: "0.22" → 4, "4.99%" → 5, "S&P" → 3, "10-K" → 2. */
export function spokenWordCount(token: string) {
  let count = 0;
  const rest = token.replace(/\$?(\d[\d,]*)?(\.\d+)?(%)?/g, (match, whole?: string, fraction?: string, percent?: string) => {
    if (!whole && !fraction) return match;
    const n = whole ? Number(whole.replace(/,/g, "")) : 0;
    count += (whole && Number.isSafeInteger(n) ? wholeNumberWords(n).length : whole ? whole.length : 0)
      + (fraction ? fraction.length : 0) + (percent ? 1 : 0);
    return " ";
  });
  count += rest.replace(/&/g, " and ").split(/[\s\-–—/]+/).filter((part) => /[a-z]/i.test(part)).length;
  return Math.max(1, count);
}

const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Longest common subsequence of normalised tokens: the runs between matches are where the
 * written and spoken forms differ. Paragraph-sized inputs keep the table small. */
function matchedPairs(written: string[], spoken: string[]) {
  const n = written.length, m = spoken.length;
  if (n * m > 25_000_000) throw new Error("Written text is too long to match in one piece; separate paragraphs with a blank line as in the reviewed text");
  const lengths = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i * (m + 1) + j] = normal(written[i]!) === normal(spoken[j]!) && normal(written[i]!) !== ""
        ? lengths[(i + 1) * (m + 1) + j + 1]! + 1
        : Math.max(lengths[(i + 1) * (m + 1) + j]!, lengths[i * (m + 1) + j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (normal(written[i]!) === normal(spoken[j]!) && normal(written[i]!) !== "") { pairs.push([i, j]); i += 1; j += 1; }
    else if (lengths[(i + 1) * (m + 1) + j]! >= lengths[i * (m + 1) + j + 1]!) i += 1;
    else j += 1;
  }
  return pairs;
}

function unitsForRun(written: string[], spoken: AlignedCaptionWord[]): WrittenCaptionUnit[] {
  if (!spoken.length) return [];
  if (!written.length) return spoken.map((word) => ({ word: word.word, start: word.start, end: word.end, spoken: [word] }));
  const units: WrittenCaptionUnit[] = [];
  let next = 0;
  written.forEach((token, index) => {
    const take = index === written.length - 1 ? spoken.length - next : Math.min(spokenWordCount(token), spoken.length - next);
    const run = spoken.slice(next, next + take);
    next += take;
    if (run.length) units.push({ word: token, start: run[0]!.start, end: run[run.length - 1]!.end, spoken: run });
    // A written word with no spoken words left joins the previous one ("Q3 2026" said as one run).
    else if (units.length) units[units.length - 1]!.word += ` ${token}`;
  });
  return units;
}

function paragraphUnits(written: string[], spoken: AlignedCaptionWord[]) {
  const units: WrittenCaptionUnit[] = [];
  let wi = 0, sj = 0;
  for (const [i, j] of [...matchedPairs(written, spoken.map((word) => word.word)), [written.length, spoken.length] as [number, number]]) {
    units.push(...unitsForRun(written.slice(wi, i), spoken.slice(sj, j)));
    if (i < written.length) units.push({ word: written[i]!, start: spoken[j]!.start, end: spoken[j]!.end, spoken: [spoken[j]!] });
    wi = i + 1; sj = j + 1;
  }
  return units;
}

/**
 * Pair each aligned spoken word with the written script. Words match where they agree (ignoring
 * case and punctuation); where they differ, each written word takes as many spoken words as it is
 * likely said with. Spoken words the script leaves out are kept as spoken. When the written text
 * and the reviewed text have the same paragraphs, each paragraph is matched on its own.
 */
export function writtenCaptionUnits(aligned: readonly AlignedCaptionWord[], writtenText: string, reviewedText?: string): WrittenCaptionUnit[] {
  const paragraphs = (text: string) => text.split(/\n\s*\n/).map((part) => part.split(/\s+/).filter(Boolean)).filter((part) => part.length);
  const writtenParagraphs = paragraphs(writtenText);
  const reviewedParagraphs = reviewedText ? paragraphs(reviewedText) : [];
  const sizes = reviewedParagraphs.map((part) => part.length);
  if (reviewedParagraphs.length > 1 && reviewedParagraphs.length === writtenParagraphs.length && sizes.reduce((a, b) => a + b, 0) === aligned.length) {
    const units: WrittenCaptionUnit[] = [];
    let offset = 0;
    writtenParagraphs.forEach((written, index) => {
      units.push(...paragraphUnits(written, aligned.slice(offset, offset + sizes[index]!)));
      offset += sizes[index]!;
    });
    return units;
  }
  return paragraphUnits(writtenParagraphs.flat(), [...aligned]);
}
