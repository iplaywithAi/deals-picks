import { PackageSearch, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Pagination from '../components/Pagination';
import ProductCard from '../components/ProductCard';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { CategoryIcon } from '../lib/icons';
import { plural } from '../lib/format';

const STORES = [
  { value: '', label: 'All stores' },
  { value: 'jumia', label: 'Jumia' },
  { value: 'kilimall', label: 'Kilimall' },
];

const SORTS = [
  { value: 'newest', label: 'Recently updated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'name', label: 'Name, A to Z' },
];

const DISCOUNTS = [
  { value: '', label: 'Any' },
  { value: '10', label: '10% or more' },
  { value: '20', label: '20% or more' },
  { value: '30', label: '30% or more' },
  { value: '50', label: '50% or more' },
];

export default function Browse() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [priceDraft, setPriceDraft] = useState({ min: params.get('min') || '', max: params.get('max') || '' });

  const q = params.get('q') || '';
  const page = Number(params.get('page')) || 1;
  const sort = params.get('sort') || 'newest';
  const source = params.get('source') || '';
  const min = params.get('min') || '';
  const max = params.get('max') || '';
  const discount = params.get('discount') || '';

  const category = categories.find((c) => c.slug === slug);

  useEffect(() => {
    api.get('/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setPriceDraft({ min, max });
  }, [min, max]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ sort, page: String(page), limit: '24' });
    if (slug) qs.set('category', slug);
    if (q) qs.set('q', q);
    if (source) qs.set('source', source);
    if (min) qs.set('min', min);
    if (max) qs.set('max', max);
    if (discount) qs.set('minDiscount', discount);

    setResult(null);
    setError('');
    api
      .get(`/products?${qs}`)
      .then((data) => !cancelled && setResult(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [slug, q, sort, page, source, min, max, discount, reloadKey]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    });
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  const applyPrices = (event) => {
    event.preventDefault();
    update({ min: priceDraft.min, max: priceDraft.max });
  };

  const title = slug ? category?.name || 'Category' : q ? `Results for "${q}"` : 'All products';
  const icon = category?.icon;
  const hasFilters = source || min || max || discount;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-start gap-4">
        {slug && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200">
            <CategoryIcon name={icon} className="h-6 w-6" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {result ? plural(result.total, 'listing') : 'Loading listings'}
            {category?.description && slug ? ` · ${category.description}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Filters">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
            </h2>
            {(hasFilters || sort !== 'newest') && (
              <button
                type="button"
                className="text-xs font-medium text-teal-800 hover:underline"
                onClick={() => update({ source: '', min: '', max: '', discount: '', sort: '' })}
              >
                Reset
              </button>
            )}
          </div>

          <div>
            <label htmlFor="sort" className="label">Sort by</label>
            <select id="sort" className="input" value={sort} onChange={(e) => update({ sort: e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="store" className="label">Store</label>
            <select id="store" className="input" value={source} onChange={(e) => update({ source: e.target.value })}>
              {STORES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <form onSubmit={applyPrices}>
            <p className="label">Price (KSh)</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="Minimum price"
                inputMode="numeric"
                placeholder="Min"
                className="input"
                value={priceDraft.min}
                onChange={(e) => setPriceDraft({ ...priceDraft, min: e.target.value.replace(/\D/g, '') })}
              />
              <input
                aria-label="Maximum price"
                inputMode="numeric"
                placeholder="Max"
                className="input"
                value={priceDraft.max}
                onChange={(e) => setPriceDraft({ ...priceDraft, max: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <button type="submit" className="btn-secondary mt-2 w-full">Apply price</button>
          </form>

          <fieldset>
            <legend className="label">Minimum discount</legend>
            <div className="space-y-2">
              {DISCOUNTS.map((d) => (
                <label key={d.value || 'any'} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="discount"
                    className="h-4 w-4 accent-slate-900"
                    checked={discount === d.value}
                    onChange={() => update({ discount: d.value })}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </fieldset>
        </aside>

        <section aria-live="polite">
          {error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : !result ? (
            <Spinner label="Loading listings" />
          ) : result.items.length === 0 ? (
            <EmptyState icon={PackageSearch} title="No listings match these filters">
              Try a different store, a wider price range, or a smaller discount.
            </EmptyState>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
                {result.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <Pagination page={result.page} pages={result.pages} onChange={(p) => update({ page: p })} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
