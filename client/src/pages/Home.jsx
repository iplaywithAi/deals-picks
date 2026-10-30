import { ArrowRight, Search, TrendingDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { EmptyState, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { CategoryIcon } from '../lib/icons';
import { plural } from '../lib/format';

const POPULAR_SEARCHES = ['iPhone', 'Smart TV', 'Air fryer', 'Sneakers', 'Laptop bag', 'Gaming controller'];

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState(null);
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    api.get('/categories').then((d) => setCategories(d.categories)).catch(() => setCategories([]));
    api.get('/products/deals?limit=8').then((d) => setDeals(d.items)).catch(() => setDeals([]));
  }, []);

  const search = (term) => navigate(`/search?q=${encodeURIComponent(term)}`);

  const submit = (event) => {
    event.preventDefault();
    if (query.trim()) search(query.trim());
  };

  return (
    <div>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="text-sm font-medium text-slate-500">Jumia, Kilimall and more in one place</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Find the best price before you buy.
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600">
            Compare prices across Kenyan online stores, see how prices have moved, and flag items the moment they reach your target.
          </p>

          <form onSubmit={submit} role="search" className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="hero-search" className="sr-only">
                Search products
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="hero-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What are you looking for?"
                className="input h-12 rounded-xl pl-11 text-base"
              />
            </div>
            <button type="submit" className="btn-primary h-12 px-6 text-base">
              Compare prices
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Popular:</span>
            {POPULAR_SEARCHES.map((term) => (
              <button key={term} type="button" onClick={() => search(term)} className="chip">
                {term}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="categories" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-lg font-semibold text-slate-900">Browse by category</h2>
        <p className="mt-1 text-sm text-slate-500">Pick a department to see every tracked listing.</p>

        {!categories ? (
          <Spinner label="Loading categories" />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.slug}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <CategoryIcon name={category.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{category.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{plural(category.productCount, 'listing')}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <TrendingDown className="h-5 w-5 text-teal-700" aria-hidden="true" />
              Biggest price drops
            </h2>
            <p className="mt-1 text-sm text-slate-500">Listings with the steepest discounts right now.</p>
          </div>
          <Link to="/search?sort=discount" className="btn-ghost hidden sm:inline-flex">
            See all
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {!deals ? (
          <Spinner label="Loading deals" />
        ) : deals.length === 0 ? (
          <EmptyState icon={TrendingDown} title="No discounted listings yet">
            Discounts appear once the scraper has collected listings with a previous price.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {deals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
