import { ExternalLink, PackageSearch, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, PageHeader, SourceBadge, Spinner } from '../../components/ui';
import Pagination from '../../components/Pagination';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { formatKES, formatDateTime, sourceLabel } from '../../lib/format';

export default function Products() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  // Debounce typing so each keystroke does not hit the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    api.get('/admin/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(page) });
    if (term) qs.set('q', term);
    if (source) qs.set('source', source);
    setError('');
    api
      .get(`/admin/products?${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [term, source, page, reload]);

  const changeCategory = async (product, categoryId) => {
    try {
      await api.patch(`/admin/products/${product.id}`, { categoryId: categoryId ? Number(categoryId) : null });
      toast('Category updated');
      setReload((n) => n + 1);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (product) => {
    if (!window.confirm(`Remove "${product.name}" and its price history?`)) return;
    try {
      await api.del(`/admin/products/${product.id}`);
      toast('Listing removed');
      setReload((n) => n + 1);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Products" description="Every listing collected by the scraper. Re-file or remove them here." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            aria-label="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            className="input pl-9"
          />
        </div>
        <select aria-label="Filter by store" className="input sm:w-44" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
          <option value="">All stores</option>
          <option value="jumia">Jumia</option>
          <option value="kilimall">Kilimall</option>
          <option value="sample">Sample data</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : !data ? (
        <Spinner label="Loading products" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No products found">
          Adjust the search or run a scrape to collect listings.
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Product</th>
                  <th className="th">Store</th>
                  <th className="th">Category</th>
                  <th className="th text-right">Price</th>
                  <th className="th">Last seen</th>
                  <th className="th text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((product) => (
                  <tr key={product.id}>
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-50">
                          {product.image ? <img src={product.image} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : <PackageSearch className="h-4 w-4 text-slate-300" aria-hidden="true" />}
                        </span>
                        <a href={`/products/${product.id}`} className="line-clamp-2 max-w-xs font-medium text-slate-900 hover:underline">
                          {product.name}
                        </a>
                      </div>
                    </td>
                    <td className="td"><SourceBadge source={product.source} label={sourceLabel(product.source)} /></td>
                    <td className="td">
                      <select
                        aria-label={`Category for ${product.name}`}
                        className="input py-1.5 text-xs"
                        value={product.categoryId ?? ''}
                        onChange={(e) => changeCategory(product, e.target.value)}
                      >
                        <option value="">Uncategorised</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td text-right tabular-nums">
                      <p className="font-medium text-slate-900">{formatKES(product.price)}</p>
                      {product.oldPrice && <p className="text-xs text-slate-400 line-through">{formatKES(product.oldPrice)}</p>}
                    </td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(product.lastSeenAt)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <a href={product.url} target="_blank" rel="noopener noreferrer" className="btn-ghost px-2" aria-label="Open listing on store" title="Open on store">
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                        <button type="button" onClick={() => remove(product)} className="btn-ghost px-2 hover:text-rose-700" aria-label={`Remove ${product.name}`} title="Remove">
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

      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
