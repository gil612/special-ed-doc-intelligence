/**
 * Best-effort fix for PDFs whose content stream places Hebrew glyphs in
 * visual (rendered) order instead of logical (reading) order - a known
 * quirk of some older Hebrew PDF generators. Naive text extraction from
 * such a PDF yields text reversed character-by-character (which also
 * reverses word order, since reversing a whole "word word word" string
 * reverses both the words themselves and their sequence in one step).
 *
 * Detection relies on Hebrew final letters (ך ם ן ף ץ), which are only
 * ever correct at the END of a word. If more of them show up elsewhere in
 * their word than at the end, the run is very likely reversed.
 *
 * This is a heuristic patch, not a general BiDi engine: it only reverses
 * contiguous Hebrew-letter-and-space runs, so embedded digits/Latin/dates
 * are left untouched, but it can't rescue text corrupted by a broken font
 * encoding (a different failure mode - see cases/gil_2010.pdf discussion).
 */

const HEBREW_FINAL_LETTERS = new Set(["ך", "ם", "ן", "ף", "ץ"]);

function isLikelyReversed(hebrewCore: string): boolean {
  const words = hebrewCore.split(" ").filter((w) => w.length > 0);
  let correct = 0;
  let wrong = 0;
  for (const word of words) {
    const hasFinalLetter = [...word].some((ch) => HEBREW_FINAL_LETTERS.has(ch));
    if (!hasFinalLetter) continue;
    if (HEBREW_FINAL_LETTERS.has(word[word.length - 1])) {
      correct++;
    } else {
      wrong++;
    }
  }
  return wrong > correct;
}

const HEBREW_RUN_RE = /( *)([א-ת](?:[א-ת ]*[א-ת])?)( *)/g;

function fixLine(line: string): string {
  return line.replace(HEBREW_RUN_RE, (_match, lead: string, core: string, trail: string) => {
    if (!isLikelyReversed(core)) return lead + core + trail;
    const reversed = [...core].reverse().join("");
    return lead + reversed + trail;
  });
}

export function fixReversedHebrew(text: string): string {
  return text.split("\n").map(fixLine).join("\n");
}
