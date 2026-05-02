import { supabase } from '@/integrations/supabase/client';

/**
 * Transfer remaining activity credits from old plan to new plan,
 * and mark the old subscription as superseded.
 * Returns the number of credits carried over (0 if none).
 */
export async function carryOverRemainingCredits(userId: string, newPlanId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('grant_remaining_credits_on_upgrade' as any, {
      _user_id: userId,
      _new_plan_id: newPlanId,
    });
    if (error) {
      console.warn('Failed to carry over credits:', error);
      return 0;
    }
    return Number(data) || 0;
  } catch (e) {
    console.warn('Carry-over credits error:', e);
    return 0;
  }
}

interface CreateInvoiceParams {
  userId: string;
  subscriptionId?: string | null;
  planId: string;
  planName: string;
  amount: number; // base amount (before tax)
  currency: string;
  paymentMethod?: string;
  paymentReference?: string;
  billingName?: string;
  billingEmail?: string;
  billingCountry?: string;
  taxRate?: number; // e.g. 0.15 for 15%
  status?: 'paid' | 'pending' | 'failed' | 'refunded';
}

/**
 * Create an invoice record after a successful payment / free activation.
 */
export async function createInvoice(params: CreateInvoiceParams) {
  const taxRate = params.taxRate ?? 0;
  const amount = Number(params.amount) || 0;
  const taxAmount = Number((amount * taxRate).toFixed(2));
  const totalAmount = Number((amount + taxAmount).toFixed(2));

  try {
    const { data, error } = await supabase
      .from('invoices' as any)
      .insert({
        user_id: params.userId,
        subscription_id: params.subscriptionId || null,
        plan_id: params.planId,
        plan_name: params.planName,
        amount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: params.currency,
        status: params.status || 'paid',
        payment_method: params.paymentMethod || null,
        payment_reference: params.paymentReference || null,
        billing_name: params.billingName || null,
        billing_email: params.billingEmail || null,
        billing_country: params.billingCountry || null,
      } as any)
      .select()
      .single();

    if (error) {
      console.warn('Failed to create invoice:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('Create invoice error:', e);
    return null;
  }
}
