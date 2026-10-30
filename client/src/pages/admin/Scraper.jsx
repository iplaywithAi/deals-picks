import { CalendarClock, Loader2, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState, Field, PageHeader, Spinner, StatusPill, EmptyState } from '../../components/ui';
import Modal from '../../components/Modal';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { formatDateTime, sourceLabel, timeAgo } from '../../lib/format';
import { FREQUENCIES, describeSchedule, frequencyFor } from '../../lib/schedule';

const blankSchedule = {
  name: '',
  source: 'jumia',
  categoryId: '',
  query: '',
  pages: 3,
  frequency: FREQUENCIES[2].value,
  customCron: '',
  enabled: true,
};

function ScheduleForm({ initial, sources, categories, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const pickCategory = (categoryId) => {
    const category = categories.find((c) => String(c.id) === categoryId);
    setForm((current) => ({
      ...current,
      categoryId,
      query: current.query || category?.defaultQuery || '',
      name: current.name || (category ? `${category.name} (${sourceLabel(current.source)})` : ''),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const cron = form.frequency === 'custom' ? form.customCron.trim() : form.frequency;
    const found = {};
    if (!form.name.trim()) found.name = 'Give the schedule a name';
    if (!form.query.trim()) found.query = 'Enter a search term';
    if (!cron) found.frequency = 'Enter a cron expression';
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = {
      name: form.name.trim(),
      source: form.source,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      query: form.query.trim(),
      pages: Number(form.pages),
      cron,
      enabled: form.enabled,
    };

    setSaving(true);
    try {
      if (initial.id) await api.put(`/admin/schedules/${initial.id}`, payload);
      else await api.post('/admin/schedules', payload);
      toast(initial.id ? 'Schedule updated' : 'Schedule created');
      onSaved();
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id="schedule-form" onSubmit={submit} className="space-y-5">
      {errors.form && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{errors.form}</p>}

      <Field label="Schedule name" htmlFor="sch-name" error={errors.name}>
        <input id="sch-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Phones, nightly" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store" htmlFor="sch-source">
          <select id="sch-source" className="input" value={form.source} onChange={(e) => set('source', e.target.value)}>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}{s.status === 'experimental' ? ' (experimental)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" htmlFor="sch-category" hint="Optional. Listings are filed under it.">
          <select id="sch-category" className="input" value={form.categoryId} onChange={(e) => pickCategory(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Search term" htmlFor="sch-query" error={errors.query}>
          <input id="sch-query" className="input" value={form.query} onChange={(e) => set('query', e.target.value)} placeholder="smartphone" />
        </Field>
        <Field label="Pages" htmlFor="sch-pages" hint="1 to 20">
          <input id="sch-pages" type="number" min="1" max="20" className="input" value={form.pages} onChange={(e) => set('pages', e.target.value)} />
        </Field>
      </div>

      <Field label="Frequency" htmlFor="sch-frequency" error={errors.frequency}>
        <select id="sch-frequency" className="input" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </Field>

      {form.frequency === 'custom' && (
        <Field label="Cron expression" htmlFor="sch-cron" hint="Five fields: minute hour day month weekday. Times are Africa/Nairobi.">
          <input id="sch-cron" className="input font-mono text-xs" value={form.customCron} onChange={(e) => set('customCron', e.target.value)} placeholder="30 6 * * 1-5" />
        </Field>
      )}

      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        Enabled
      </label>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : initial.id ? 'Save changes' : 'Create schedule'}
        </button>
      </div>
    </form>
  );
}

export default function Scraper() {
  const toast = useToast();
  const [schedules, setSchedules] = useState(null);
  const [runs, setRuns] = useState(null);
  const [sources, setSources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [quick, setQuick] = useState({ source: 'jumia', categoryId: '', query: '', pages: 3 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.get('/admin/schedules'), api.get('/admin/runs?limit=40')])
      .then(([s, r]) => {
        setSchedules(s.schedules);
        setRuns(r.runs);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    api.get('/admin/sources').then((d) => setSources(d.sources)).catch(() => {});
    api.get('/admin/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, [load]);

  const inFlight = runs?.some((r) => r.status === 'queued' || r.status === 'running');
  useEffect(() => {
    if (!inFlight) return undefined;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [inFlight, load]);

  const pickQuickCategory = (categoryId) => {
    const category = categories.find((c) => String(c.id) === categoryId);
    setQuick((current) => ({ ...current, categoryId, query: category?.defaultQuery || current.query }));
  };

  const runNow = async (event) => {
    event.preventDefault();
    if (!quick.query.trim()) return toast('Enter a search term first', 'error');
    setBusy(true);
    try {
      await api.post('/admin/scrape', {
        source: quick.source,
        query: quick.query.trim(),
        pages: Number(quick.pages),
        categoryId: quick.categoryId ? Number(quick.categoryId) : null,
      });
      toast('Scrape queued');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const runAllCategories = async () => {
    setBusy(true);
    try {
      const data = await api.post('/admin/scrape/all', { source: quick.source, pages: Number(quick.pages) });
      toast(`Queued ${data.queued} categories`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const runSchedule = async (schedule) => {
    try {
      await api.post(`/admin/schedules/${schedule.id}/run`);
      toast(`"${schedule.name}" queued`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleSchedule = async (schedule) => {
    try {
      await api.put(`/admin/schedules/${schedule.id}`, {
        name: schedule.name,
        source: schedule.source,
        categoryId: schedule.categoryId,
        query: schedule.query,
        pages: schedule.pages,
        cron: schedule.cron,
        enabled: !schedule.enabled,
      });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const deleteSchedule = async (schedule) => {
    if (!window.confirm(`Delete the schedule "${schedule.name}"? Past runs are kept.`)) return;
    try {
      await api.del(`/admin/schedules/${schedule.id}`);
      toast('Schedule deleted');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const openEditor = (schedule) => {
    setEditor(
      schedule
        ? {
            ...blankSchedule,
            id: schedule.id,
            name: schedule.name,
            source: schedule.source,
            categoryId: schedule.categoryId ? String(schedule.categoryId) : '',
            query: schedule.query,
            pages: schedule.pages,
            frequency: frequencyFor(schedule.cron),
            customCron: schedule.cron,
            enabled: !!schedule.enabled,
          }
        : { ...blankSchedule }
    );
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!schedules || !runs) return <Spinner label="Loading scraper" />;

  return (
    <div>
      <PageHeader
        title="Scraper"
        description="Schedule price collection, run it on demand, and review what happened."
        actions={
          <button type="button" className="btn-primary" onClick={() => openEditor(null)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New schedule
          </button>
        }
      />

      <section className="card p-5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-slate-700" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900">Run now</h2>
        </div>
        <form onSubmit={runNow} className="mt-4 grid gap-4 md:grid-cols-[150px_1fr_1fr_90px]">
          <Field label="Store" htmlFor="q-source">
            <select id="q-source" className="input" value={quick.source} onChange={(e) => setQuick({ ...quick, source: e.target.value })}>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Category" htmlFor="q-category">
            <select id="q-category" className="input" value={quick.categoryId} onChange={(e) => pickQuickCategory(e.target.value)}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Search term" htmlFor="q-query">
            <input id="q-query" className="input" value={quick.query} onChange={(e) => setQuick({ ...quick, query: e.target.value })} placeholder="air fryer" />
          </Field>
          <Field label="Pages" htmlFor="q-pages">
            <input id="q-pages" type="number" min="1" max="20" className="input" value={quick.pages} onChange={(e) => setQuick({ ...quick, pages: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <button type="submit" disabled={busy} className="btn-primary">
              <Play className="h-4 w-4" aria-hidden="true" />
              Run this search
            </button>
            <button type="button" disabled={busy} onClick={runAllCategories} className="btn-secondary">
              Run every category
            </button>
          </div>
        </form>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Schedules</h2>
        </div>
        {schedules.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={CalendarClock} title="No schedules yet" action={<button type="button" className="btn-primary" onClick={() => openEditor(null)}>Create a schedule</button>}>
              Schedules run a search automatically, for example every morning, and file results under a category.
            </EmptyState>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Schedule</th>
                  <th className="th">Search</th>
                  <th className="th">Timing</th>
                  <th className="th">Last run</th>
                  <th className="th">Active</th>
                  <th className="th text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td className="td">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{sourceLabel(s.source)}{s.categoryName ? ` · ${s.categoryName}` : ''}</p>
                    </td>
                    <td className="td">
                      <p>{s.query}</p>
                      <p className="text-xs text-slate-500">{s.pages} page{s.pages === 1 ? '' : 's'}</p>
                    </td>
                    <td className="td">
                      <p>{describeSchedule(s.cron)}</p>
                      <p className="font-mono text-[11px] text-slate-400">{s.cron}</p>
                    </td>
                    <td className="td">
                      {s.lastStatus ? (
                        <div className="flex items-center gap-2">
                          <StatusPill status={s.lastStatus} />
                          <span className="text-xs text-slate-500">{timeAgo(s.lastRunAt)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Not run yet</span>
                      )}
                    </td>
                    <td className="td">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!s.enabled}
                        onClick={() => toggleSchedule(s)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${s.enabled ? 'bg-slate-900' : 'bg-slate-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        <span className="sr-only">{s.enabled ? 'Disable' : 'Enable'} {s.name}</span>
                      </button>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-ghost px-2" onClick={() => runSchedule(s)} aria-label={`Run ${s.name} now`} title="Run now">
                          <Play className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="btn-ghost px-2" onClick={() => openEditor(s)} aria-label={`Edit ${s.name}`} title="Edit">
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="btn-ghost px-2 hover:text-rose-700" onClick={() => deleteSchedule(s)} aria-label={`Delete ${s.name}`} title="Delete">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Run history</h2>
          {inFlight && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Updating
            </span>
          )}
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Runs appear here once a scrape starts.</p>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Status</th>
                  <th className="th">Started</th>
                  <th className="th">Search</th>
                  <th className="th">Trigger</th>
                  <th className="th text-right">Found</th>
                  <th className="th text-right">Saved</th>
                  <th className="th">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="td"><StatusPill status={run.status} /></td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(run.startedAt)}</td>
                    <td className="td">
                      <p>{sourceLabel(run.source)} · {run.query}</p>
                      <p className="text-xs text-slate-500">{run.categoryName || 'No category'} · {run.pages} page{run.pages === 1 ? '' : 's'}</p>
                    </td>
                    <td className="td text-xs text-slate-600">{run.scheduleName || (run.origin === 'manual' ? 'Manual' : run.origin)}</td>
                    <td className="td text-right tabular-nums">{run.itemsFound}</td>
                    <td className="td text-right tabular-nums">{run.itemsSaved}</td>
                    <td className="td max-w-xs">
                      {run.error ? (
                        <p className="truncate text-xs text-rose-700" title={run.error}>{run.error}</p>
                      ) : run.status === 'success' ? (
                        <span className="text-xs text-slate-500">Completed</span>
                      ) : (
                        <span className="text-xs text-slate-400">In progress</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Edit schedule' : 'New schedule'}
        footer={null}
      >
        {editor && (
          <ScheduleForm
            key={editor.id || 'new'}
            initial={editor}
            sources={sources}
            categories={categories}
            onCancel={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
