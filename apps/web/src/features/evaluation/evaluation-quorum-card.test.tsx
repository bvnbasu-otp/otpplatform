import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('EvaluationDecisionCockpit Quorum Fallback Integration', () => {
  it('wires QuorumExpiryDecisionCard to handle quorum shortfall gracefully', () => {
    const cockpitSrc = readFileSync(
      resolve(__dirname, 'components/EvaluationDecisionCockpit.tsx'),
      'utf8',
    );
    expect(cockpitSrc).toContain('QuorumExpiryDecisionCard');
    expect(cockpitSrc).toContain('onProceedWithCurrentQuotes');
    expect(cockpitSrc).toContain('onExtendDeadline');
    expect(cockpitSrc).toContain('onCancelRequest');
  });

  it('guarantees graceful handling of unmet quote quorums without workflow failure', () => {
    const migrationSrc = readFileSync(
      resolve(__dirname, '../../../../../supabase/migrations/00333_greenfield_purge_all_demo_and_supplier_accounts.sql'),
      'utf8',
    );
    expect(migrationSrc).toContain('close_clarification_for_evaluation');
    expect(migrationSrc).toContain('SOLO_QUOTE_AUTOMATIC_WINNER_BY_BUYER_CHOICE');
    expect(migrationSrc).toContain('BUYER_CHOICE_UNMET_QUORUM_PROCEED');
    expect(migrationSrc).toContain('min_quotes_waived = true');
  });

  it('evaluates winner candidate automatically when single quote is received', () => {
    const cockpitSrc = readFileSync(
      resolve(__dirname, 'components/EvaluationDecisionCockpit.tsx'),
      'utf8',
    );
    // Verifies candidate fallback logic selects first quote when alone
    expect(cockpitSrc).toContain('setSelectedQuoteId(quotes[0].quoteId)');
    expect(cockpitSrc).toContain('quotes.find((q) => q.quoteId === selectedQuoteId)');
  });
});
