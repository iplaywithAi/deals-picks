import { BellRing, Check, ExternalLink, Scale, ShoppingBag, Trash2, TrendingDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PriceChart from '../components/PriceChart';
import ProductCard from '../components/ProductCard';
import { EmptyState, ErrorState, SourceBadge, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCompare } from '../context/CompareContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatDateTime, formatKES, sourceLabel } from '../lib/format';

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const compare = useCompare();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(null);
  const [targetInput, setTargetInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setData(null);
    setError('');
    setImageFailed(false);
    api.get(`/products/${id}`).then(setData).catch((err) => setError(err.message));
    api.get(`/products/${id}/alternatives`).then((d) => setAlternatives(d.items)).catch(() => setAlternatives([]));
  }, [id]);

  useEffect(() => {
    if (!user) {
      setTracking(null);
      return;
    }
    api
      .get('/tracking')
      .then((d) => {
        const match = d.items.find((item) => String(item.id) === String(id));
        setTracking(match || null);
        setTargetInput(match?.targetPrice ?? '');
      })
      .catch(() => {});
  }, [user, id]);

  const product = data?.product;

  const cheapestElsewhere = useMemo(() => {
    if (!product) return null;
    const all = [product, ...alternatives];
    return all.reduce((best, item) => (item.price < best.price ? item : best), product);
  }, [product, alternatives]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState message={error} />
      </div>
    );
  }
  if (!product) return <Spinner label="Loading product" />;

  const isCheapest = cheapestElsewhere?.id === product.id;
  const selected = compare.has(product.id);

  const saveTarget = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const targetPrice = targetInput === '' ? null : Number(targetInput);
      await api.post('/tracking', { productId: product.id, targetPrice });
      setTracking({ id: product.id, targetPrice, reachedTarget: targetPrice != null && product.price <= targetPrice });
      toast(targetPrice ? `We will flag this at ${formatKES(targetPrice)} or below` : 'Now tracking this product');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const stopTracking = async () => {
    try {
      await api.del(`/tracking/${product.id}`);
      setTracking(null);
      setTargetInput('');
      toast('Removed from your tracking list');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleCompare = () => {
    if (!selected && compare.full) {
      toast(`You can compare up to ${compare.limit} products. Remove one first.`, 'error');
      return;
    }
    if (selected) compare.remove(product.id);
    else compare.add(product.id);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-slate-800">Home</Link>
        <span className="mx-2">/</span>
        {product.categorySlug ? (
          <Link to={`/category/${product.categorySlug}`} className="hover:text-slate-800">{product.categoryName}</Link>
        ) : (
          <span>Uncategorised</span>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="card flex h-80 items-center justify-center overflow-hidden bg-slate-50 p-8 sm:h-96">
          {product.image && !imageFailed ? (
            <img src={product.image} alt={product.name} onError={() => setImageFailed(true)} className="max-h-full max-w-full object-contain" />
          ) : (
            <ShoppingBag className="h-16 w-16 text-slate-300" strokeWidth={1.25} aria-hidden="true" />
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={product.source} label={sourceLabel(product.source)} />
            {isCheapest && alternatives.length > 0 && (
              <span className="pill bg-teal-50 text-teal-800 ring-teal-700/20">
                <Check className="h-3 w-3" aria-hidden="true" />
                Lowest of {alternatives.length + 1} listings
              </span>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-slate-900">{product.name}</h1>

          <div className="mt-5 flex items-end gap-3">
            <p className="text-3xl font-semibold text-slate-900">{formatKES(product.price)}</p>
            {product.oldPrice && <p className="pb-1 text-base text-slate-400 line-through">{formatKES(product.oldPrice)}</p>}
            {product.discountPct > 0 && (
              <span className="pb-1 text-sm font-medium text-slate-900">-{Math.round(product.discountPct)}%</span>
            )}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-slate-200 py-5 sm:grid-cols-3">
            <Stat label="Lowest seen" value={formatKES(product.lowestPrice)} />
            <Stat label="Highest seen" value={formatKES(product.highestPrice)} />
            <Stat label="Last checked" value={formatDateTime(product.lastSeenAt)} />
          </dl>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href={product.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary flex-1">
              View on {sourceLabel(product.source)}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <button type="button" onClick={toggleCompare} aria-pressed={selected} className={selected ? 'btn-secondary flex-1 border-teal-700 text-teal-800' : 'btn-secondary flex-1'}>
              <Scale className="h-4 w-4" aria-hidden="true" />
              {selected ? 'In compare list' : 'Add to compare'}
            </button>
          </div>

          <div className="card mt-6 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BellRing className="h-4 w-4 text-slate-700" aria-hidden="true" />
              Price tracking
            </h2>
            {!user ? (
              <p className="mt-2 text-sm text-slate-600">
                <Link to={`/signin?next=/products/${product.id}`} className="font-medium text-slate-900 underline underline-offset-2">Sign in</Link>{' '}
                to track this product and set a target price.
              </p>
            ) : (
              <form onSubmit={saveTarget} className="mt-3 space-y-3">
                <label htmlFor="target" className="text-sm text-slate-600">
                  Tell me when it drops to (KSh)
                </label>
                <div className="flex gap-2">
                  <input
                    id="target"
                    inputMode="numeric"
                    placeholder={String(Math.round(product.price * 0.9))}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value.replace(/\D/g, ''))}
                    className="input"
                  />
                  <button type="submit" disabled={saving} className="btn-primary shrink-0">
                    {tracking ? 'Update' : 'Track'}
                  </button>
                </div>
                {tracking && (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {tracking.reachedTarget ? (
                        <span className="font-medium text-teal-800">Target reached</span>
                      ) : (
                        'Tracking on your list'
                      )}
                    </span>
                    <button type="button" onClick={stopTracking} className="inline-flex items-center gap-1 hover:text-rose-700">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Stop tracking
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      <section className="card mt-10 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <TrendingDown className="h-4 w-4 text-teal-700" aria-hidden="true" />
              Price history
            </h2>
            <p className="mt-1 text-sm text-slate-500">A new point is recorded whenever the price changes.</p>
          </div>
        </div>
        <PriceChart history={data.history} />
      </section>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-slate-900">Similar listings</h2>
        <p className="mt-1 text-sm text-slate-500">Matching products in the same category, sorted by price.</p>
        {alternatives.length === 0 ? (
          <div className="mt-5">
            <EmptyState icon={Scale} title="No close matches yet">
              Matches appear when the same product is listed by another store and scraped.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {alternatives.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
