import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { EmptyState, ErrorState, Field, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { CategoryIcon, ICON_MAP } from '../../lib/icons';
import { plural } from '../../lib/format';

const blank = { id: null, name: '', icon: 'Package', description: '', defaultQuery: '' };

function CategoryForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.name.trim().length < 2) return setError('Enter a category name');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      icon: form.icon,
      description: form.description.trim(),
      defaultQuery: form.defaultQuery.trim(),
    };
    try {
      if (form.id) await api.put(`/admin/categories/${form.id}`, payload);
      else await api.post('/admin/categories', payload);
      toast(form.id ? 'Category updated' : 'Category created');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <Field label="Name" htmlFor="cat-name" hint={form.name ? `URL: /category/${form.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : null}>
        <input id="cat-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Kitchen & Dining" />
      </Field>

      <fieldset>
        <legend className="label">Icon</legend>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
          {Object.keys(ICON_MAP).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => set('icon', name)}
              aria-pressed={form.icon === name}
              aria-label={name}
              title={name}
              className={`flex h-10 items-center justify-center rounded-lg border transition ${
                form.icon === name ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <CategoryIcon name={name} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Description" htmlFor="cat-desc" hint="Shown under the category name.">
        <input id="cat-desc" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={200} />
      </Field>

      <Field label="Default search term" htmlFor="cat-query" hint="Used by “Run every category” on the scraper page.">
        <input id="cat-query" className="input" value={form.defaultQuery} onChange={(e) => set('defaultQuery', e.target.value)} placeholder="kettle" maxLength={120} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save category'}</button>
      </div>
    </form>
  );
}

export default function Categories() {
  const toast = useToast();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);

  const load = () => {
    setError('');
    api.get('/admin/categories').then((d) => setCategories(d.categories)).catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const remove = async (category) => {
    const message = `Delete "${category.name}"? Its ${category.productCount} listing(s) stay in the catalogue but become uncategorised.`;
    if (!window.confirm(message)) return;
    try {
      await api.del(`/admin/categories/${category.id}`);
      toast('Category deleted');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!categories) return <Spinner label="Loading categories" />;

  return (
    <div>
      <PageHeader
        title="Categories"
        description="The departments shoppers browse. Each has a default search term used by bulk scrapes."
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditor({ ...blank })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New category
          </button>
        }
      />

      {categories.length === 0 ? (
        <EmptyState icon={Tags} title="No categories" action={<button type="button" className="btn-primary" onClick={() => setEditor({ ...blank })}>Create one</button>}>
          Categories group listings for shoppers.
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[680px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Category</th>
                  <th className="th">Default search</th>
                  <th className="th">Listings</th>
                  <th className="th text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                          <CategoryIcon name={category.icon} />
                        </span>
                        <div>
                          <p className="font-medium text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-500">/category/{category.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td">{category.defaultQuery || <span className="text-slate-400">Not set</span>}</td>
                    <td className="td">{plural(category.productCount, 'listing')}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost px-2"
                          aria-label={`Edit ${category.name}`}
                          title="Edit"
                          onClick={() =>
                            setEditor({
                              id: category.id,
                              name: category.name,
                              icon: category.icon,
                              description: category.description || '',
                              defaultQuery: category.defaultQuery || '',
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="btn-ghost px-2 hover:text-rose-700" aria-label={`Delete ${category.name}`} title="Delete" onClick={() => remove(category)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? 'Edit category' : 'New category'}>
        {editor && (
          <CategoryForm
            key={editor.id || 'new'}
            initial={editor}
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
