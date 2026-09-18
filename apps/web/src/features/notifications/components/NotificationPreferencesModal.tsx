import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { NotificationCategory, NotificationChannel } from '@otp/domain';

export interface NotificationPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  organizationId?: string | null;
  onSaved?: () => void;
}

const CATEGORY_OPTIONS: Array<{ category: NotificationCategory; label: string; description: string }> = [
  {
    category: 'RFQ_INVITATION',
    label: 'RFQ Invitations',
    description: 'Invitations to submit quotations for relevant sourcing requirements',
  },
  {
    category: 'QUOTE_SUBMITTED',
    label: 'Quotation Updates',
    description: 'Notifications when suppliers submit quotations or revised terms',
  },
  {
    category: 'AWARD_DECISION',
    label: 'Award & Reveal Decisions',
    description: 'Governance approvals, award decisions, and identity reveal confirmations',
  },
  {
    category: 'WORK_ORDER_ISSUED',
    label: 'Work Orders & Commitments',
    description: 'Issuance and confirmation of purchase orders and execution work orders',
  },
  {
    category: 'MILESTONE_SUBMITTED',
    label: 'Milestone Submissions',
    description: 'Supplier milestone completion reports and deliverables ready for review',
  },
  {
    category: 'INSPECTION_COMPLETED',
    label: 'Quality & Inspection Sign-Offs',
    description: 'Digital sign-offs, inspection results, and rework requests',
  },
  {
    category: 'DISPUTE_OPENED',
    label: 'Dispute & Exception Alerts',
    description: 'Structured exceptions, SLA countdowns, and escalation notifications',
  },
  {
    category: 'PAYMENT_CONFIRMED',
    label: 'Settlement & Payment Confirmations',
    description: 'Direct UTR bank settlement records and payment voucher receipts',
  },
];

export const NotificationPreferencesModal: React.FC<NotificationPreferencesModalProps> = ({
  isOpen,
  onClose,
  userId,
  organizationId,
  onSaved,
}) => {
  const [channels, setChannels] = useState<Record<NotificationChannel, boolean>>({
    WHATSAPP: true,
    SMS: true,
    EMAIL: true,
    IN_APP: true,
  });
  const [optOuts, setOptOuts] = useState<NotificationCategory[]>([]);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;

    async function loadPreferences() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          if (data.channel_preferences) {
            setChannels({
              WHATSAPP: data.channel_preferences.WHATSAPP !== false,
              SMS: data.channel_preferences.SMS !== false,
              EMAIL: data.channel_preferences.EMAIL !== false,
              IN_APP: data.channel_preferences.IN_APP !== false,
            });
          }
          if (Array.isArray(data.category_opt_outs)) {
            setOptOuts(data.category_opt_outs as NotificationCategory[]);
          }
          if (data.phone_number) setPhone(data.phone_number);
          if (data.email) setEmail(data.email);
          if (data.quiet_hours_start) setQuietHoursStart(data.quiet_hours_start);
          if (data.quiet_hours_end) setQuietHoursEnd(data.quiet_hours_end);
        }
      } catch (err: any) {
        console.error('Failed to load notification preferences:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPreferences();
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleChannelToggle = (ch: NotificationChannel) => {
    setChannels((prev) => ({
      ...prev,
      [ch]: !prev[ch],
    }));
  };

  const handleCategoryToggle = (cat: NotificationCategory) => {
    setOptOuts((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('update_notification_preferences_atomic', {
        p_user_id: userId,
        p_organization_id: organizationId || null,
        p_channel_preferences: channels,
        p_category_opt_outs: optOuts,
        p_phone_number: phone || null,
        p_email: email || null,
        p_quiet_hours_start: quietHoursStart || null,
        p_quiet_hours_end: quietHoursEnd || null,
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Notification preferences updated successfully.' });
      if (onSaved) onSaved();
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Omnichannel Notification Preferences</h2>
            <p className="text-xs text-muted-foreground">
              Configure communication channels, WhatsApp delivery, quiet hours, and event categories.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Loading preferences...</div>
        ) : (
          <div className="mt-4 space-y-6">
            {message && (
              <div
                className={`rounded-xl p-3 text-xs font-semibold ${
                  message.type === 'success'
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Delivery Channels */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Delivery Channels
              </h3>
              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['WHATSAPP', 'SMS', 'EMAIL', 'IN_APP'] as NotificationChannel[]).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleChannelToggle(ch)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-colors ${
                      channels[ch]
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="text-base mb-1">
                      {ch === 'WHATSAPP' && '💬'}
                      {ch === 'SMS' && '📱'}
                      {ch === 'EMAIL' && '✉️'}
                      {ch === 'IN_APP' && '🔔'}
                    </span>
                    <span className="text-xs font-semibold">{ch.replace('_', ' ')}</span>
                    <span className="text-[10px] mt-0.5">{channels[ch] ? 'Enabled' : 'Disabled'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Direct Contact Information */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-foreground">WhatsApp / SMS Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="procurement@organization.com"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Quiet Hours Window */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Quiet Hours (Do Not Disturb)
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Non-critical alerts received during quiet hours are suppressed or batched until morning.
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">From:</span>
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">To:</span>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Category Opt-Outs */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Notification Categories
              </h3>
              <div className="mt-2.5 space-y-2">
                {CATEGORY_OPTIONS.map((opt) => {
                  const isOptedOut = optOuts.includes(opt.category);
                  return (
                    <label
                      key={opt.category}
                      className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!isOptedOut}
                        onChange={() => handleCategoryToggle(opt.category)}
                        className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">{opt.label}</span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              !isOptedOut
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {!isOptedOut ? 'Subscribed' : 'Opted Out'}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
};
