/* Ukrainian plurals for the SEO audit. Shared by seoChecks.ts and
 * listingScore.ts — a second copy is how "13 тегів" in one block ends up
 * "13 теги" in the other. */

/** 1 символ / 2 символи / 5 символів. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export const chars = (n: number) => `${n} ${plural(n, "символ", "символи", "символів")}`;
export const tagWord = (n: number) => `${n} ${plural(n, "тег", "теги", "тегів")}`;
export const photoWord = (n: number) => `${n} ${plural(n, "фото", "фото", "фото")}`;
