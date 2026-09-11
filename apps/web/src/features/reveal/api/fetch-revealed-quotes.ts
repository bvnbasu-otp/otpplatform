import { supabase } from '@/lib/supabase';

export interface RevealedQuoteRow {
  quoteId: string;
  anonymousLabel: string;
  supplierId: string;
  businessName: string;
  phone: string | null;
  email: string | null;
  status: string;
  totalCost: number;
  deliveryDays: number | null;
  warrantyMonths: number | null;
}

interface RevealedDbRow {
  quote_id: string;
  anonymous_label: string;
  supplier_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  total_cost: number | null;
  delivery_days: number | null;
  warranty_months: number | null;
}

function mapRow(row: RevealedDbRow): RevealedQuoteRow {
  return {
    quoteId: row.quote_id,
    anonymousLabel: row.anonymous_label,
    supplierId: row.supplier_id,
    businessName: row.business_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    totalCost: Number(row.total_cost ?? 0),
    deliveryDays: row.delivery_days,
    warrantyMonths: row.warranty_months,
  };
}

export async function fetchRevealedQuotes(rfqId: string): Promise<
  { ok: true; quotes: RevealedQuoteRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('quotes_revealed')
    .select(
      'quote_id, anonymous_label, supplier_id, business_name, phone, email, status, total_cost, delivery_days, warranty_months',
    )
    .eq('rfq_id', rfqId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, quotes: (data as RevealedDbRow[]).map(mapRow) };
}
