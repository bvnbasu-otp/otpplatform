import { supabase } from '@/lib/supabase';
import { recomputeEvaluations } from '@/features/evaluation/api/fetch-quote-evaluations';
import { discoverAndInvite, openRfq } from '@/features/requirement/api/rfq-lifecycle';

export interface SimulateQuotesResult {
  ok: boolean;
  rfqId?: string;
  quotesSubmitted?: number;
  totalQuotes?: number;
  error?: string;
  message?: string;
}

/**
 * Automatically or manually simulates 3-5 realistic, competitive sealed quotes
 * from verified demo suppliers for the given RFQ.
 */
export async function simulateQuotesForRfq(
  rfqId: string,
  options?: { count?: number; force?: boolean }
): Promise<SimulateQuotesResult> {
  const targetCount = Math.max(3, Math.min(options?.count ?? 4, 6));

  if (!rfqId) {
    return { ok: false, error: 'Missing RFQ identifier' };
  }

  // 1. Try primary database RPC: seed_simulated_quotes_for_rfq
  try {
    const { data: seedData, error: seedError } = await supabase.rpc(
      'seed_simulated_quotes_for_rfq',
      {
        p_rfq_id: rfqId,
        p_count: targetCount,
      }
    );

    if (!seedError && seedData) {
      const res = seedData as {
        ok?: boolean;
        success?: boolean;
        quotes_submitted?: number;
        total_quotes?: number;
      };
      if (res.ok || res.success) {
        // Trigger background evaluation recomputation
        void recomputeEvaluations(rfqId);

        return {
          ok: true,
          rfqId,
          quotesSubmitted: res.quotes_submitted ?? targetCount,
          totalQuotes: res.total_quotes ?? targetCount,
          message: `Successfully generated ${res.quotes_submitted ?? targetCount} simulated quotes`,
        };
      }
    }
  } catch {
    // Continue to secondary RPC / client fallback
  }

  // 2. Try secondary database RPC: auto_submit_pilot_quotes
  try {
    const { data: autoData, error: autoError } = await supabase.rpc(
      'auto_submit_pilot_quotes',
      {
        p_rfq_id: rfqId,
      }
    );

    if (!autoError && autoData) {
      const res = autoData as {
        ok?: boolean;
        success?: boolean;
        quotes_submitted?: number;
        total_quotes?: number;
      };
      if (res.ok || res.success) {
        void recomputeEvaluations(rfqId);

        return {
          ok: true,
          rfqId,
          quotesSubmitted: res.quotes_submitted ?? targetCount,
          totalQuotes: res.total_quotes ?? targetCount,
          message: `Successfully generated ${res.quotes_submitted ?? targetCount} simulated quotes`,
        };
      }
    }
  } catch {
    // Fall back to robust direct insertion
  }

  // 3. Fallback: Client-driven generation & persistence
  try {
    // Ensure suppliers are invited first
    await discoverAndInvite(rfqId);

    // Fetch RFQ & Requirement details
    const { data: rfqRow } = await supabase
      .from('rfqs')
      .select('id, requirement_id, organization_id, created_by, status')
      .eq('id', rfqId)
      .maybeSingle();

    if (!rfqRow) {
      return { ok: false, error: 'RFQ not found' };
    }

    const { data: reqRow } = await supabase
      .from('requirements')
      .select('id, title, description, commercial, quantity')
      .eq('id', rfqRow.requirement_id)
      .maybeSingle();

    // Fetch existing invitations
    const { data: invitations } = await supabase
      .from('rfq_invitations')
      .select('id, supplier_id, anonymous_label, status')
      .eq('rfq_id', rfqId);

    let activeInvites = invitations ?? [];

    if (activeInvites.length === 0) {
      // Fetch available active suppliers
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, business_name, rating_avg')
        .eq('status', 'ACTIVE')
        .limit(targetCount);

      if (suppliers && suppliers.length > 0) {
        const newInvites = [];
        for (let i = 0; i < suppliers.length; i++) {
          const s = suppliers[i];
          if (!s) continue;
          const label = `Supplier ${String.fromCharCode(65 + i)}`;
          const fallbackInvite = {
            id: `inv-${s.id}-${rfqId}`,
            supplier_id: s.id,
            anonymous_label: label,
            status: 'INVITED',
          };
          const { data: inv } = await supabase
            .from('rfq_invitations')
            .insert({
              rfq_id: rfqId,
              supplier_id: s.id,
              anonymous_label: label,
              status: 'INVITED',
              match_score: Math.min(98, 75 + Math.round((s.rating_avg || 4) * 4)),
              match_reasons: ['category_match', 'verified_active', 'location_match'],
            })
            .select('id, supplier_id, anonymous_label, status')
            .maybeSingle();

          newInvites.push(inv || fallbackInvite);
        }
        activeInvites = newInvites;
      }
    }

    // Determine baseline pricing from budget or category
    let baseUnit = 35000;
    const comm = (reqRow?.commercial ?? {}) as Record<string, any>;
    const rawBudget = Number(comm.budgetAmount ?? comm.targetBudget ?? comm.estimatedTotal ?? 0);

    if (rawBudget > 0) {
      baseUnit = Math.round(rawBudget / 1.18);
    } else if (reqRow?.quantity && Number(reqRow.quantity) > 0) {
      baseUnit = Math.min(250000, Number(reqRow.quantity) * 3500);
    }

    let quotesCount = 0;
    const now = new Date().toISOString();

    for (let idx = 0; idx < Math.min(activeInvites.length, targetCount); idx++) {
      const inv = activeInvites[idx];
      if (!inv) continue;

      // Tier pricing variations
      let multiplier = 1.0;
      let transportRatio = 0.03;
      let deliveryDays = 3;
      let warrantyMonths = 12;
      let paymentDays = 30;
      let fitScore = 94;
      let notes = 'Standard verified tier: Complete delivery, professional setup, and dedicated on-site support included.';
      let tierName = 'Standard Balanced Tier';

      if (idx === 1) {
        multiplier = 1.12;
        transportRatio = 0;
        deliveryDays = 2;
        warrantyMonths = 24;
        paymentDays = 30;
        fitScore = 98;
        notes = 'Premium grade tier: Grade-A seasoned materials, expedited 48-hour delivery, zero transit damage guarantee.';
        tierName = 'Premium Quality Tier';
      } else if (idx === 2) {
        multiplier = 0.92;
        transportRatio = 0.05;
        deliveryDays = 5;
        warrantyMonths = 6;
        paymentDays = 15;
        fitScore = 88;
        notes = 'Cost-optimized commercial tier: High volume economy pricing, standard clearing and return logistics.';
        tierName = 'Cost-Optimized Economy Tier';
      } else if (idx === 3) {
        multiplier = 0.97;
        transportRatio = 0.02;
        deliveryDays = 1;
        warrantyMonths = 12;
        paymentDays = 30;
        fitScore = 92;
        notes = 'Regional fast-track tier: Local warehouse stock ready for immediate dispatch with same-day setup assistance.';
        tierName = 'Regional Fast-Track Tier';
      } else if (idx >= 4) {
        multiplier = 1.05;
        transportRatio = 0.01;
        deliveryDays = 3;
        warrantyMonths = 18;
        paymentDays = 45;
        fitScore = 95;
        notes = 'Enterprise specialist tier: ISO certified manufacturing, dedicated technical account manager.';
        tierName = 'Specialist Enterprise Tier';
      }

      const basePrice = Math.round(baseUnit * multiplier);
      const gstAmount = Math.round(basePrice * 0.18);
      const cgstAmount = Math.round(gstAmount / 2);
      const sgstAmount = gstAmount - cgstAmount;
      const transportCost = Math.round(basePrice * transportRatio);
      const totalCost = basePrice + gstAmount + transportCost;

      const fallbackQuoteId = `sim-quote-${inv.supplier_id}-${rfqId}`;

      // Upsert quote record
      const { data: quote, error: quoteErr } = await supabase
        .from('quotes')
        .upsert(
          {
            rfq_id: rfqId,
            supplier_id: inv.supplier_id,
            invitation_id: inv.id,
            status: 'FINAL',
            current_version: 1,
            submitted_at: now,
            updated_at: now,
          },
          { onConflict: 'invitation_id' }
        )
        .select('id')
        .single();

      const effectiveQuoteId = quote?.id || fallbackQuoteId;

      if (!quoteErr) {
        // Upsert quote version snapshot
        await supabase.from('quote_versions').upsert(
          {
            quote_id: effectiveQuoteId,
            version: 1,
            snapshot: {
              basePrice,
              gstAmount,
              cgstAmount,
              sgstAmount,
              transportCost,
              totalCost,
              currency: 'INR',
              deliveryDays,
              warrantyMonths,
              paymentTermsDays: paymentDays,
              responseTimeHours: 2,
              technicalFit: fitScore,
              certification: true,
              simulated: true,
              tierName,
              quoteNotes: notes,
            },
            notes,
            created_by: rfqRow.created_by,
            created_at: now,
          },
          { onConflict: 'quote_id,version' }
        );

        // Update invitation status
        await supabase
          .from('rfq_invitations')
          .update({ status: 'QUOTED', viewed_at: now })
          .eq('id', inv.id);

        quotesCount++;
      }
    }

    // Ensure RFQ is in OPEN status
    if (rfqRow.status === 'DRAFT') {
      await openRfq(rfqId);
    }

    // Rescore evaluations
    void recomputeEvaluations(rfqId);

    return {
      ok: true,
      rfqId,
      quotesSubmitted: quotesCount,
      totalQuotes: quotesCount,
      message: `Generated ${quotesCount} simulated supplier quotes`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to simulate quotes';
    return { ok: false, error: message };
  }
}

/**
 * Checks if the RFQ currently has 0 quotes and seeds simulated quotes if so.
 */
export async function ensureSimulatedQuotesForRfq(
  rfqId: string
): Promise<SimulateQuotesResult> {
  if (!rfqId) return { ok: false, error: 'Missing RFQ ID' };

  try {
    const { data: viewData, error: viewErr } = await supabase
      .from('quotes_identity_protected')
      .select('quote_id')
      .eq('rfq_id', rfqId);

    if (!viewErr && viewData && viewData.length >= 3) {
      return { ok: true, rfqId, totalQuotes: viewData.length, quotesSubmitted: 0 };
    }

    const { data: rawData, error: rawErr } = await supabase
      .from('quotes')
      .select('id')
      .eq('rfq_id', rfqId)
      .in('status', ['FINAL', 'SUBMITTED', 'REVEALED']);

    if (!rawErr && rawData && rawData.length >= 3) {
      return { ok: true, rfqId, totalQuotes: rawData.length, quotesSubmitted: 0 };
    }
  } catch {
    // Proceed to simulate
  }

  return simulateQuotesForRfq(rfqId);
}
