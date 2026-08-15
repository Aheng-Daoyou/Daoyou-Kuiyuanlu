export const BLACK_MARKET_APPROVED_PRICE_TOKEN = '【核定报价】';

export function finalizeBlackMarketReply(input: {
  draft: string;
  approvedPrice?: number;
  maxLength?: number;
}): string | undefined {
  const draft = input.draft.trim();
  const maxLength = input.maxLength ?? 180;
  if (!draft) return undefined;

  const tokenCount = draft.split(BLACK_MARKET_APPROVED_PRICE_TOKEN).length - 1;
  const requiresPrice = input.approvedPrice != null;
  if (tokenCount !== (requiresPrice ? 1 : 0)) return undefined;

  if (
    requiresPrice &&
    (!Number.isSafeInteger(input.approvedPrice) || input.approvedPrice! < 1)
  ) {
    return undefined;
  }

  const body = requiresPrice
    ? draft.replace(
        BLACK_MARKET_APPROVED_PRICE_TOKEN,
        `${input.approvedPrice!.toLocaleString('zh-CN')}灵石`,
      )
    : draft;
  const normalized = body.replace(/灵石(?:\s*灵石)+/gu, '灵石').trim();
  return normalized.length <= maxLength ? normalized : undefined;
}
