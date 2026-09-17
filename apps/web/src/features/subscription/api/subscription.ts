import { supabase } from '@/lib/supabase';
import type {
  BillingCycle,
  OrganizationSubscription,
  SubscriptionTierId,
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
