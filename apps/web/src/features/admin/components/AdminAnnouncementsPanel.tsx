import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';

interface AnnouncementRow {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: string;
  audience: string;
  status: string;
  publishAt: string;
  expiresAt?: string | null;
  createdAt: string;
}

export function AdminAnnouncementsPanel() {
  const [list, setList] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('PLATFORM_NOTICE');
  const [severity, setSeverity] = useState('INFO');
  const [audience, setAudience] = useState('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadAnnouncements() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('admin_manage_announcement', {
        p_action: 'LIST',
        p_payload: {},
      });
      if (rpcError) throw rpcError;
      if (data && data.announcements) {
        setList(data.announcements as AnnouncementRow[]);
      }
    } catch (err: any) {
      console.error('Failed to list announcements:', err);
      setError(err.message || 'Failed to list announcements');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('admin_manage_announcement', {
        p_action: 'CREATE',
        p_payload: {
          title: title.trim(),
          message: message.trim(),
          category,
          severity,
          audience,
          status: 'PUBLISHED',
          publishAt: new Date().toISOString(),
        },
      });
      if (rpcError) throw rpcError;

      setTitle('');
      setMessage('');
      await loadAnnouncements();
    } catch (err: any) {
      console.error('Failed to create announcement:', err);
      setError(err.message || 'Failed to create announcement');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleArchive(id: string) {
    try {
      setLoading(true);
      const { error: rpcError } = await supabase.rpc('admin_manage_announcement', {
        p_action: 'ARCHIVE',
        p_id: id,
        p_payload: {},
      });
      if (rpcError) throw rpcError;
      await loadAnnouncements();
    } catch (err: any) {
      console.error('Failed to archive announcement:', err);
      setError(err.message || 'Failed to archive announcement');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Announcement Form */}
      <Card
        title="📢 Broadcast Platform Announcement"
        description="Publish announcements, release notes, maintenance warnings, or critical notices across the ecosystem."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title" required>
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="e.g. Scheduled Network Upgrade at 2:00 AM IST"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              )}
            </Field>

            <Field label="Category" required>
              {({ id }) => (
                <Select
                  id={id}
                  options={[
                    { value: 'PLATFORM_NOTICE', label: 'Platform Notice' },
                    { value: 'NEW_VERSION', label: 'New Version Release' },
                    { value: 'NEW_FEATURE', label: 'New Feature' },
                    { value: 'PLANNED_MAINTENANCE', label: 'Planned Maintenance' },
                    { value: 'EMERGENCY_MAINTENANCE', label: 'Emergency Notice' },
                    { value: 'SECURITY_UPDATE', label: 'Security Update' },
                  ]}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              )}
            </Field>

            <Field label="Severity" required>
              {({ id }) => (
                <Select
                  id={id}
                  options={[
                    { value: 'INFO', label: 'Info (Standard)' },
                    { value: 'LOW', label: 'Low' },
                    { value: 'MEDIUM', label: 'Medium (Yellow Warning)' },
                    { value: 'HIGH', label: 'High (Orange Notice)' },
                    { value: 'CRITICAL', label: 'Critical (Red Alert)' },
                  ]}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                />
              )}
            </Field>

            <Field label="Target Audience" required>
              {({ id }) => (
                <Select
                  id={id}
                  options={[
                    { value: 'ALL', label: 'All Users (Public + Signed In)' },
                    { value: 'BUYER', label: 'Buyers Only' },
                    { value: 'SUPPLIER', label: 'Suppliers Only' },
                    { value: 'ADMIN', label: 'Platform Admins Only' },
                  ]}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Announcement Message" required>
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                placeholder="Detailed message displayed on banners and notifications…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            )}
          </Field>

          {error && <p className="text-xs text-rose-600 font-medium">⚠️ {error}</p>}

          <Button
            type="submit"
            disabled={isSubmitting || !title.trim() || !message.trim()}
            busy={isSubmitting}
            busyLabel="Publishing Broadcast…"
            className="w-full sm:w-auto"
          >
            🚀 Publish Announcement
          </Button>
        </form>
      </Card>

      {/* Announcements List */}
      <Card
        title="Active & Historical Platform Announcements"
        description="All broadcast items and their current visibility status."
      >
        {loading && list.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading announcements…</p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No announcements found.</p>
        ) : (
          <div className="divide-y">
            {list.map((item) => (
              <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-xs text-foreground">{item.title}</span>
                    <Badge tone={item.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      {item.status}
                    </Badge>
                    <Badge tone="info">{item.audience}</Badge>
                    <Badge
                      tone={
                        item.severity === 'CRITICAL' || item.severity === 'HIGH'
                          ? 'danger'
                          : item.severity === 'MEDIUM'
                          ? 'warning'
                          : 'neutral'
                      }
                    >
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.message}</p>
                </div>

                {item.status !== 'ARCHIVED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleArchive(item.id)}
                    className="text-xs text-rose-600 hover:text-rose-700"
                  >
                    Archive
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
