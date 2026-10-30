import { Check, Copy, Download, Link2, Scale, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, SourceBadge, Spinner } from '../components/ui';
import { useCompare } from '../context/CompareContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatDateTime, formatKES, formatShortDate, sourceLabel } from '../lib/format';

// Another store's listing counts as the same product only above this similarity
const MATCH_MIN = 60;
const LINE_COLOURS = ['#0f766e', '#1e293b', '#b45309', '#0369a1'];
const ID_PATTERN = /^\d{1,12}$/;

// The cheapest listing from a different store that looks like the same product
function bestElsewhere(item, alternatives) {
  const matches = alternatives.filter((a) => a.source !== item.source && a.matchPct >= MATCH_MIN);
  if (!matches.length) return null;
  return matches.reduce((best, a) => (a.price < best.price ? a : best));
}

function toCsv(items, elsewhere) {
  const header = [
    'Product', 'Store', 'Price (KSh)', 'Previous price (KSh)', 'Discount %', 'Lowest seen (KSh)',
    'Highest seen (KSh)', 'Rating', 'Category', 'Same product elsewhere (KSh)', 'Elsewhere store', 'Listing URL',
  ];
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = items.map((item) => {
    const match = elsewhere[item.id];
    return [
      item.name, sourceLabel(item.source), item.price, item.oldPrice, item.discountPct, item.lowestPrice,
      item.highestPrice, item.rating, item.categoryName, match?.price, match ? sourceLabel(match.source) : '', item.url,
    ].map(cell).join(',');
  });
  return [header.map(cell).join(','), ...lines].join('\n');
}

function download(filename, text) {
  // The BOM lets Excel read the KSh and accented text correctly
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Compare() {
  const { ids, remove, clear, replace } = useCompare();
  const toast = useToast();
  const [params] = useSearchParams();
  const [items, setItems] = useState(null);
  const [extra, setExtra] = useState({ alternatives: {}, history: {} });
  const [error, setError] = useState('');
  const [diffOnly, setDiffOnly] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const key = ids.join(',');

  // A shared link (?ids=a,b) fills the basket before anything else loads
  useEffect(() => {
    const shared = (params.get('ids') || '')
      .split(',')
      .filter((id) => ID_PATTERN.test(id))
      .map(Number)
      .slice(0, 4);
    if (shared.length && shared.join(',') !== key) replace(shared);
    // Only when the link itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('ids')]);

  useEffect(() => {
    if (!ids.length) {
      setItems([]);
      return;
    }
    setError('');
    api
      .get(`/products/compare?ids=${key}`)
      .then((d) => setItems(d.items))
      .catch((err) => setError(err.message));
    // ids is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Same-product matches at other stores and price history for each item
  useEffect(() => {
    if (!items || !items.length) return;
    let cancelled = false;
    Promise.all(
      items.map(async (item) => {
        const [alt, detail] = await Promise.all([
          api.get(`/products/${item.id}/alternatives`).then((d) => d.items).catch(() => []),
          api.get(`/products/${item.id}`).then((d) => d.history).catch(() => []),
        ]);
        return [item.id, alt, detail];
      })
    ).then((results) => {
      if (cancelled) return;
      setExtra({
        alternatives: Object.fromEntries(results.map(([id, alt]) => [id, alt])),
        history: Object.fromEntries(results.map(([id, , history]) => [id, history])),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const elsewhere = useMemo(() => {
    if (!items) return {};
    return Object.fromEntries(items.map((item) => [item.id, bestElsewhere(item, extra.alternatives[item.id] || [])]));
  }, [items, extra.alternatives]);

  const chartData = useMemo(() => {
    if (!items) return [];
    const byTime = new Map();
    items.forEach((item) =>
      (extra.history[item.id] || []).forEach((point) => {
        if (!byTime.has(point.recordedAt)) byTime.set(point.recordedAt, { time: point.recordedAt });
        byTime.get(point.recordedAt)[`p_${item.id}`] = point.price;
      })
    );
    return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  }, [items, extra.history]);

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState message={error} /></div>;
  if (!items) return <Spinner label="Loading comparison" />;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={Scale}
          title="Nothing to compare yet"
          action={<Link to="/" className="btn-primary">Browse products</Link>}
        >
          Use the scale icon on any listing to add it here. You can compare up to 4 products side by side.
        </EmptyState>
      </div>
    );
  }

  const prices = items.map((i) => i.price);
  const bestPrice = Math.min(...prices);
  const highest = Math.max(...prices);
  const best = items.find((i) => i.price === bestPrice);
  const gap = highest - bestPrice;
  const shareLink = `${window.location.origin}/compare?ids=${key}`;

  const rows = [
    {
      label: 'Store',
      value: (i) => sourceLabel(i.source),
      render: (i) => <SourceBadge source={i.source} label={sourceLabel(i.source)} />,
    },
    {
      label: 'Current price',
      value: (i) => i.price,
      render: (i) => (
        <span className={`inline-flex flex-wrap items-center gap-2 text-base ${i.price === bestPrice ? 'font-semibold text-teal-800' : 'text-slate-900'}`}>
          {formatKES(i.price)}
          {i.price === bestPrice && (
            <span className="pill bg-teal-50 text-teal-800 ring-teal-700/20">
              <Check className="h-3 w-3" aria-hidden="true" />
              Best price
            </span>
          )}
        </span>
      ),
    },
    {
      label: 'Compared with best',
      value: (i) => i.price - bestPrice,
      render: (i) =>
        i.price === bestPrice ? (
          <span className="text-teal-800">Lowest</span>
        ) : (
          <span>
            +{formatKES(i.price - bestPrice)}{' '}
            <span className="text-xs text-slate-500">({Math.round(((i.price - bestPrice) / bestPrice) * 100)}% more)</span>
          </span>
        ),
    },
    {
      label: 'Same product elsewhere',
      value: (i) => elsewhere[i.id]?.price ?? null,
      render: (i) => {
        const match = elsewhere[i.id];
        return match ? (
          <span>
            {formatKES(match.price)} at {sourceLabel(match.source)}{' '}
            <span className="text-xs text-slate-500">({match.matchPct}% match)</span>
          </span>
        ) : (
          <span className="text-slate-400">No close match found</span>
        );
      },
    },
    { label: 'Previous price', value: (i) => i.oldPrice, render: (i) => (i.oldPrice ? <span className="line-through text-slate-400">{formatKES(i.oldPrice)}</span> : '—') },
    { label: 'Discount', value: (i) => i.discountPct, render: (i) => (i.discountPct ? `-${Math.round(i.discountPct)}%` : '—') },
    { label: 'Lowest seen', value: (i) => i.lowestPrice, render: (i) => formatKES(i.lowestPrice) },
    { label: 'Highest seen', value: (i) => i.highestPrice, render: (i) => formatKES(i.highestPrice) },
    { label: 'Rating', value: (i) => i.rating, render: (i) => (i.rating ? `${Number(i.rating).toFixed(1)} / 5` : '—') },
    { label: 'Category', value: (i) => i.categoryName, render: (i) => i.categoryName || '—' },
    { label: 'Last checked', value: (i) => i.lastSeenAt, render: (i) => formatDateTime(i.lastSeenAt) },
  ];

  // A row differs when its values are not all the same across the items
  const visibleRows = rows.filter((row) => !diffOnly || new Set(items.map((i) => String(row.value(i)))).size > 1);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast('Link copied. Anyone who opens it sees this comparison.');
    } catch {
      toast('Could not copy automatically. Select the link and copy it.', 'error');
    }
  };

  const exportCsv = () => {
    download('beiwatch-comparison.csv', toCsv(items, elsewhere));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compare products</h1>
          <p className="mt-1 text-sm text-slate-500">Up to four listings side by side. Saved in this browser.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShareOpen((v) => !v)} className="btn-secondary" aria-expanded={shareOpen}>
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Share
          </button>
          <button type="button" onClick={exportCsv} className="btn-secondary">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
          <button type="button" onClick={clear} className="btn-ghost">Clear all</button>
        </div>
      </div>

      {shareOpen && (
        <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <label htmlFor="share-link" className="text-sm font-medium text-slate-700 sm:shrink-0">Share link</label>
          <input id="share-link" readOnly value={shareLink} onFocus={(e) => e.target.select()} className="input min-w-0 flex-1 text-xs" />
          <button type="button" onClick={copyShareLink} className="btn-primary sm:shrink-0">
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy
          </button>
        </div>
      )}

      {items.length >= 2 && gap > 0 && (
        <section className="card mb-6 grid gap-4 p-5 sm:grid-cols-3" aria-label="Summary">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lowest price</p>
            <p className="mt-1 text-xl font-semibold text-teal-800">{formatKES(bestPrice)}</p>
            <p className="mt-1 truncate text-sm text-slate-600">{best.name}, {sourceLabel(best.source)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">You save up to</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{formatKES(gap)}</p>
            <p className="mt-1 text-sm text-slate-600">Compared with the highest price here</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cheapest elsewhere</p>
            {(() => {
              const cheaper = items
                .map((i) => ({ item: i, match: elsewhere[i.id] }))
                .filter((x) => x.match && x.match.price < x.item.price)
                .sort((a, b) => a.match.price - b.match.price)[0];
              return cheaper ? (
                <>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{formatKES(cheaper.match.price)}</p>
                  <p className="mt-1 text-sm text-slate-600">At {sourceLabel(cheaper.match.source)}, {cheaper.match.matchPct}% match</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-600">No cheaper match found at another store.</p>
              );
            })()}
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600" />
          Show only differences
        </label>
        <p className="text-xs text-slate-500">Scroll the table sideways on small screens.</p>
      </div>

      <div className="card table-scroll">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="sticky left-0 z-10 w-36 bg-slate-50 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Product</th>
              {items.map((item) => (
                <th key={item.id} className="min-w-[180px] px-4 py-4 align-top text-left font-normal">
                  <div className="flex h-28 items-center justify-center rounded-lg bg-slate-50 p-3">
                    {item.image ? (
                      <img src={item.image} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                    ) : (
                      <Scale className="h-8 w-8 text-slate-300" aria-hidden="true" />
                    )}
                  </div>
                  <Link to={`/products/${item.id}`} className="mt-3 line-clamp-2 block text-sm font-medium text-slate-900 hover:underline">
                    {item.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-700"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.label} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-600">{row.label}</th>
                {items.map((item) => (
                  <td key={item.id} className="px-4 py-3 text-sm text-slate-800">{row.render(item)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-4 py-4 text-left text-sm font-medium text-slate-600">Listing</th>
              {items.map((item) => (
                <td key={item.id} className="px-4 py-4">
                  <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary w-full">
                    View on {sourceLabel(item.source)}
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {items.some((i) => (extra.history[i.id] || []).length > 1) && (
        <section className="card mt-6 p-4 sm:p-5" aria-label="Price history">
          <h2 className="text-base font-semibold text-slate-900">Price history</h2>
          <p className="mt-1 text-sm text-slate-500">How each listing's price has moved over time.</p>
          <div className="mt-4 h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="time" tickFormatter={formatShortDate} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={(v) => Number(v).toLocaleString('en-KE')} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={64} />
                <Tooltip labelFormatter={formatDateTime} formatter={(v) => formatKES(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {items.map((item, index) => (
                  <Line
                    key={item.id}
                    type="monotone"
                    dataKey={`p_${item.id}`}
                    name={item.name.length > 32 ? `${item.name.slice(0, 32)}…` : item.name}
                    stroke={LINE_COLOURS[index % LINE_COLOURS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <p className="mt-4 text-xs text-slate-500">
        {ids.length < 4 ? `You can add ${4 - ids.length} more. ` : ''}Prices can change at any time, so confirm on the store before buying. Matches at other stores are estimates based on product names.
      </p>
    </div>
  );
}
