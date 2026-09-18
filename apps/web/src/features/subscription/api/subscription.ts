import { supabase } from '@/lib/supabase';
import type {
  ApplyWalletCreditsParams,
  ApplyWalletCreditsResult,
  BillingCycle,
  OrganizationSubscription,
  OrganizationWalletData,
  SubscriptionTierId,
  WalletTransactionData,
} from '../types';
import { resolveTierForOrgType } from '../types';

export async function fetchOrganizationSubscription(
  organizationId: string,
): Promise<{ ok: true; subscription: OrganizationSubscription } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('get_organization_subscription', {
      p_organization_id: organizationId,
    });

    if (error) {
      // Fallback to direct table query if RPC is not loaded
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, org_type, subscription_tier, subscription_status, subscription_plan, subscription_started_at, subscription_expires_at, free_rfq_credits, rfq_credits_used, payment_reference')
        .eq('id', organizationId)
        .maybeSingle();

      if (orgError || !orgData) {
        return { ok: false, error: orgError?.message || 'Organization not found' };
      }

      const now = new Date();
      const expiresAt = orgData.subscription_expires_at ? new Date(orgData.subscription_expires_at) : new Date(now.getTime() + 30 * 86400000);
      const isExpired = expiresAt.getTime() < now.getTime();
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        ok: true,
        subscription: {
          organizationId: orgData.id,
          organizationName: orgData.name,
          orgType: orgData.org_type,
          tierId: (orgData.subscription_tier as SubscriptionTierId) || resolveTierForOrgType(orgData.org_type),
          status: isExpired ? 'EXPIRED' : ((orgData.subscription_status as any) || 'ACTIVE'),
          plan: (orgData.subscription_plan as BillingCycle) || 'MONTHLY',
          startedAt: orgData.subscription_started_at || now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          daysRemaining,
          isExpired,
          freeRfqCredits: typeof (orgData as any).free_rfq_credits === 'number' ? (orgData as any).free_rfq_credits : 1,
          rfqCreditsUsed: typeof (orgData as any).rfq_credits_used === 'number' ? (orgData as any).rfq_credits_used : 0,
          paymentReference: orgData.payment_reference || undefined,
        },
      };
    }

    const payload = data as Record<string, any>;
    if (!payload || !payload.ok) {
      return { ok: false, error: payload?.error || 'Failed to retrieve subscription' };
    }

    return {
      ok: true,
      subscription: {
        organizationId: payload.organization_id,
        organizationName: payload.organization_name,
        orgType: payload.org_type,
        tierId: payload.tier as SubscriptionTierId,
        status: payload.status,
        plan: payload.plan as BillingCycle,
        startedAt: payload.started_at,
        expiresAt: payload.expires_at,
        daysRemaining: Number(payload.days_remaining ?? 0),
        isExpired: Boolean(payload.is_expired),
        freeRfqCredits: typeof payload.free_rfq_credits === 'number' ? payload.free_rfq_credits : 1,
        rfqCreditsUsed: typeof payload.rfq_credits_used === 'number' ? payload.rfq_credits_used : 0,
        paymentReference: payload.payment_reference || undefined,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error fetching subscription' };
  }
}

export interface ProcessPaymentParams {
  organizationId: string;
  tierId: SubscriptionTierId;
  cycle: BillingCycle;
  amount: number;
  paymentRef: string;
  upiId?: string;
}

export async function processSubscriptionPayment(
  params: ProcessPaymentParams,
): Promise<{ ok: true; newExpiresAt: string; message: string } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('process_subscription_payment', {
      p_organization_id: params.organizationId,
      p_tier: params.tierId,
      p_cycle: params.cycle,
      p_amount: params.amount,
      p_payment_ref: params.paymentRef,
      p_upi_id: params.upiId || 'pay@otp',
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const res = data as Record<string, any>;
    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Payment processing failed' };
    }

    return {
      ok: true,
      newExpiresAt: res.new_expires_at,
      message: res.message || 'Payment verified and plan activated!',
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Payment RPC error' };
  }
}

/**
 * Atomic Backend RPC Validation for Sourcing Access & Fast-Track Credits (DEF-001)
 *
 * Validates whether an organization has active subscription access or available
 * free RFQ sourcing credits via the atomic backend RPC get_organization_subscription.
 */
export async function validateOrganizationSourcingAccess(
  organizationId: string,
): Promise<{
  hasAccess: boolean;
  isExpired: boolean;
  freeRfqCredits: number;
  rfqCreditsUsed: number;
  reason?: string;
}> {
  try {
    const res = await fetchOrganizationSubscription(organizationId);
    if (!res.ok) {
      return {
        hasAccess: false,
        isExpired: true,
        freeRfqCredits: 0,
        rfqCreditsUsed: 0,
        reason: res.error || 'Failed to validate organization subscription',
      };
    }

    const { subscription } = res;
    const hasRemainingCredits = (subscription.freeRfqCredits ?? 0) > (subscription.rfqCreditsUsed ?? 0);
    const hasActivePlan = !subscription.isExpired || subscription.status === 'ACTIVE';
    const hasAccess = hasActivePlan || hasRemainingCredits;

    return {
      hasAccess,
      isExpired: subscription.isExpired,
      freeRfqCredits: subscription.freeRfqCredits ?? 0,
      rfqCreditsUsed: subscription.rfqCreditsUsed ?? 0,
      reason: hasAccess
        ? undefined
        : 'Subscription expired and zero fast-track sourcing credits available. Please renew or add credits to continue.',
    };
  } catch (err: any) {
    return {
      hasAccess: false,
      isExpired: true,
      freeRfqCredits: 0,
      rfqCreditsUsed: 0,
      reason: err?.message || 'Error validating sourcing credits',
    };
  }
}

/**
 * Fetches organization wallet balance and status.
 */
export async function fetchOrganizationWallet(
  organizationId: string,
): Promise<{ ok: true; wallet: OrganizationWalletData } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('get_organization_wallet', {
      p_organization_id: organizationId,
    });

    if (error) {
      // Fallback to direct query
      const { data: walletData, error: walletError } = await supabase
        .from('organization_wallets')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (walletError || !walletData) {
        return {
          ok: true,
          wallet: {
            walletId: 'default',
            organizationId,
            balanceCredits: 0,
            status: 'ACTIVE',
          },
        };
      }

      return {
        ok: true,
        wallet: {
          walletId: walletData.id,
          organizationId: walletData.organization_id,
          balanceCredits: Number(walletData.balance_credits ?? 0),
          status: walletData.status,
          createdAt: walletData.created_at,
          updatedAt: walletData.updated_at,
        },
      };
    }

    const payload = data as Record<string, any>;
    if (!payload || !payload.ok) {
      return { ok: false, error: payload?.error || 'Failed to retrieve wallet' };
    }

    return {
      ok: true,
      wallet: {
        walletId: payload.wallet_id,
        organizationId: payload.organization_id,
        balanceCredits: Number(payload.balance_credits ?? 0),
        status: payload.status,
        createdAt: payload.created_at,
        updatedAt: payload.updated_at,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error fetching wallet' };
  }
}

/**
 * Fetches paginated ledger transactions for organization wallet.
 */
export async function fetchWalletTransactions(
  organizationId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<{ ok: true; transactions: WalletTransactionData[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('get_wallet_transactions', {
      p_organization_id: organizationId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      const { data: txData, error: txError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (txError || !txData) {
        return { ok: true, transactions: [] };
      }

      return {
        ok: true,
        transactions: txData.map((t: any) => ({
          id: t.id,
          organizationId: t.organization_id,
          walletId: t.wallet_id,
          txType: t.tx_type,
          amount: Number(t.amount ?? 0),
          openingBalance: Number(t.opening_balance ?? 0),
          closingBalance: Number(t.closing_balance ?? 0),
          sourceEntityType: t.source_entity_type,
          sourceEntityId: t.source_entity_id,
          idempotencyKey: t.idempotency_key,
          notes: t.notes,
          createdAt: t.created_at,
        })),
      };
    }

    const payload = data as Record<string, any>;
    if (!payload || !payload.ok) {
      return { ok: false, error: payload?.error || 'Failed to retrieve transactions' };
    }

    const list = Array.isArray(payload.transactions) ? payload.transactions : [];
    return {
      ok: true,
      transactions: list.map((t: any) => ({
        id: t.id,
        organizationId: t.organization_id,
        walletId: t.wallet_id,
        txType: t.tx_type,
        amount: Number(t.amount ?? 0),
        openingBalance: Number(t.opening_balance ?? 0),
        closingBalance: Number(t.closing_balance ?? 0),
        sourceEntityType: t.source_entity_type,
        sourceEntityId: t.source_entity_id,
        idempotencyKey: t.idempotency_key,
        notes: t.notes,
        createdAt: t.created_at,
      })),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error fetching transactions' };
  }
}

/**
 * Applies wallet credits toward subscription renewal/activation.
 */
export async function applyWalletCreditsToSubscription(
  params: ApplyWalletCreditsParams,
): Promise<ApplyWalletCreditsResult> {
  try {
    const { data, error } = await supabase.rpc('apply_wallet_credits_to_subscription_atomic', {
      p_org_id: params.organizationId,
      p_tier: params.tierId,
      p_cycle: params.cycle,
      p_credits_to_apply: params.creditsToApply,
      p_idempotency_key: params.idempotencyKey || null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const res = data as Record<string, any>;
    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Failed to apply wallet credits' };
    }

    return {
      ok: true,
      creditsApplied: res.credits_applied,
      openingBalance: res.opening_balance,
      remainingBalance: res.remaining_balance,
      newExpiresAt: res.new_expires_at,
      transactionId: res.transaction_id,
      message: res.message || 'Subscription renewed using OTP Wallet Credits',
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Wallet redemption RPC error' };
  }
}
