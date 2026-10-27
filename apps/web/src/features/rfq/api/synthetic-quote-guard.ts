import { supabase } from '@/lib/supabase';

export const SYNTHETIC_QUOTES_DISABLED_MESSAGE =
  'Simulated quotes are disabled. Real RFQs only receive genuine supplier quotes.';

/** Build-time demo flag. Anything other than the exact string 'true' is treated as off. */
export function readDemoBuildFlag(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

/**
 * Synthetic quotes are allowed only when BOTH the build is an explicit demo build
 * AND the RFQ row itself is flagged `is_demo = true`. Missing, null or ambiguous
 * values fail closed.
 */
export function isSyntheticQuoteGenerationAllowed(input: {
  demoBuildFlag: unknown;
  rfqIsDemo: unknown;
}): boolean {
  return input.demoBuildFlag === true && input.rfqIsDemo === true;
}

/** Resolves the guard against the live RFQ row. Any lookup failure denies. */
export async function assertSyntheticQuotesAllowed(
  rfqId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!rfqId) return { allowed: false, reason: 'Missing RFQ identifier' };
  if (!readDemoBuildFlag()) return { allowed: false, reason: SYNTHETIC_QUOTES_DISABLED_MESSAGE };

  try {
    const { data, error } = await supabase
      .from('rfqs')
      .select('id, is_demo')
      .eq('id', rfqId)
      .maybeSingle();
    if (error || !data) return { allowed: false, reason: SYNTHETIC_QUOTES_DISABLED_MESSAGE };
    const rfqIsDemo = (data as { is_demo?: unknown }).is_demo;
    if (!isSyntheticQuoteGenerationAllowed({ demoBuildFlag: true, rfqIsDemo })) {
      return { allowed: false, reason: SYNTHETIC_QUOTES_DISABLED_MESSAGE };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: SYNTHETIC_QUOTES_DISABLED_MESSAGE };
  }
}
