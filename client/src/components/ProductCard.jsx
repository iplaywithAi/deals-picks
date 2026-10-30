import { Scale, ShoppingBag, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompare } from '../context/CompareContext';
import { useToast } from '../context/ToastContext';
import { formatKES, sourceLabel } from '../lib/format';
import { SourceBadge } from './ui';

function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <ShoppingBag className="h-8 w-8 text-slate-300" strokeWidth={1.5} aria-hidden="true" />;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
    />
  );
}

export default function ProductCard({ product }) {
  const compare = useCompare();
  const toast = useToast();
  const selected = compare.has(product.id);

  const toggleCompare = () => {
    if (!selected && compare.full) {
      toast(`You can compare up to ${compare.limit} products. Remove one first.`, 'error');
      return;
    }
    if (selected) {
      compare.remove(product.id);
    } else {
      compare.add(product.id);
    }
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm">
      <Link
        to={`/products/${product.id}`}
        className="relative flex h-36 items-center justify-center overflow-hidden bg-slate-50 p-4 sm:h-44 sm:p-5"
        tabIndex={-1}
        aria-hidden="true"
      >
        <ProductImage src={product.image} alt="" />
        {product.discountPct > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
            -{Math.round(product.discountPct)}%
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <SourceBadge source={product.source} label={sourceLabel(product.source)} />
          {product.rating && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Star className="h-3.5 w-3.5 fill-slate-400 text-slate-400" aria-hidden="true" />
              {Number(product.rating).toFixed(1)}
            </span>
          )}
        </div>

        <Link
          to={`/products/${product.id}`}
          className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-slate-900 hover:underline"
        >
          {product.name}
        </Link>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-base font-semibold text-slate-900">{formatKES(product.price)}</p>
            {product.oldPrice && (
              <p className="text-xs text-slate-400 line-through">{formatKES(product.oldPrice)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCompare}
            aria-pressed={selected}
            title={selected ? 'Remove from compare' : 'Add to compare'}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              selected
                ? 'border-teal-700 bg-teal-50 text-teal-800'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            <Scale className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{selected ? 'Remove from compare' : 'Add to compare'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
