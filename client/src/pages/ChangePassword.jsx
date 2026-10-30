import { useState } from 'react';
import { Field, PageHeader } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };

export default function ChangePassword() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.newPassword.length < 8) {
      setError('The new password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirm) {
      setError('The new passwords do not match.');
      return;
    }
    if (form.newPassword === form.currentPassword) {
      setError('Choose a password that is different from your current one.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm(EMPTY);
      toast('Your password has been changed. Other devices have been signed out.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <PageHeader title="Change password" description="Enter your current password, then choose a new one. Other devices will be signed out." />

      <form onSubmit={submit} className="card space-y-5 p-5 sm:p-6" noValidate>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <Field label="Current password" htmlFor="current-password">
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={form.currentPassword}
            onChange={update('currentPassword')}
            required
          />
        </Field>
        <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={form.newPassword}
            onChange={update('newPassword')}
            required
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password">
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={form.confirm}
            onChange={update('confirm')}
            required
          />
        </Field>
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
