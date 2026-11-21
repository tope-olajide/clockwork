/**
 * Kane reports its balance as a human-readable line, for example:
 * `Available credits: 7815.6558`. Parsing is deliberately narrow so an update
 * banner or unrelated number can never be mistaken for the balance.
 */
export function parseKaneCreditBalance(output: string): number | undefined {
  const match = output.match(/Available credits:\s*([\d,]+(?:\.\d+)?)/i);
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export function kaneCreditsExhausted(credits: number | undefined): boolean {
  return credits !== undefined && credits <= 0;
}
