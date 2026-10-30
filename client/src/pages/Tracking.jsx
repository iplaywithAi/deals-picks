import { BellRing, Check, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, SourceBadge, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatKES, sourceLabel, timeAgo } from '../lib/format';

export default function Tracking() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({});

  const load = () => {
    setError('');
    api
      .get('/tracking')
      .then((d) => {
        setItems(d.items);
        setDrafts(Object.fromEntries(d.items.map((i) => [i.id, i.targetPrice ?? ''])));
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const saveTarget = async (item) => {
    const raw = drafts[item.id];
    const targetPrice = raw === '' ? null : Number(raw);
    try {
      await api.post('/tracking', { productId: item.id, targetPrice });
      toast('Target price saved');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (item) => {
    try {
      await api.del(`/tracking/${item.id}`);
      toast('Removed from your list');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState message={error} onRetry={load} /></div>;
  if (!items) return <Spinner label="Loading your tracking list" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Price tracking</h1>
        <p className="mt-1 text-sm text-slate-500">Items you follow. Each one is flagged when it reaches your target price.</p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="You are not tracking anything yet"
          action={<Link to="/" className="btn-primary">Find products</Link>}
        >
          Open any product and set a target price to start tracking it.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <Link to={`/products/${item.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-2">
                  {item.image ? (
                    <img src={item.image} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <BellRing className="h-6 w-6 text-slate-300" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <SourceBadge source={item.source} label={sourceLabel(item.source)} />
                  <span className="mt-1.5 line-clamp-2 block text-sm font-medium text-slate-900">{item.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">Checked {timeAgo(item.lastSeenAt)}</span>
                </span>
              </Link>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:flex-nowrap">
                <div className="min-w-[7rem]">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Now</p>
                  <p className="text-base font-semibold text-slate-900">{formatKES(item.price)}</p>
                  {item.previousPrice && item.previousPrice !== item.price && (
                    <p className="text-xs text-slate-500">was {formatKES(item.previousPrice)}</p>
                  )}
                </div>

                <div>
                  <label htmlFor={`target-${item.id}`} className="text-xs uppercase tracking-wide text-slate-500">
                    Target (KSh)
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id={`target-${item.id}`}
                      inputMode="numeric"
                      value={drafts[item.id] ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, [item.id]: e.target.value.replace(/\D/g, '') })}
                      placeholder="Not set"
                      className="input w-32"
                    />
                    <button type="button" onClick={() => saveTarget(item)} className="btn-secondary px-3" aria-label="Save target price">
                      <Save className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="min-w-[8rem]">
                  {item.reachedTarget ? (
                    <span className="pill bg-teal-50 text-teal-800 ring-teal-700/20">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Target reached
                    </span>
                  ) : item.targetPrice ? (
                    <span className="text-xs text-slate-500">{formatKES(item.price - item.targetPrice)} above target</span>
                  ) : (
                    <span className="text-xs text-slate-500">No target set</span>
                  )}
                </div>

                <button type="button" onClick={() => remove(item)} className="btn-ghost text-rose-700 hover:bg-rose-50 hover:text-rose-800" aria-label="Stop tracking">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
