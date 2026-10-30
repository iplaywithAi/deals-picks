import { Bell, CalendarClock, CircleCheck, CircleX, PackageSearch, TrendingDown, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, PageHeader, Spinner, StatusPill } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, plural, sourceLabel } from '../../lib/format';

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{Number(value).toLocaleString('en-KE')}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/stats').then(setStats).catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!stats) return <Spinner label="Loading overview" />;

  const runs = Object.fromEntries(stats.runsLast24h.map((r) => [r.status, r.count]));
  const totalProducts = stats.totals.products || 1;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Health of the price collection pipeline and the catalogue."
        actions={
          <Link to="/admin/scraper" className="btn-primary">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Manage scraper
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={PackageSearch} label="Listings" value={stats.totals.products} hint={`Across ${plural(stats.totals.categories, 'category')}`} />
        <StatCard icon={Users} label="Users" value={stats.totals.users} />
        <StatCard icon={Bell} label="Tracked items" value={stats.totals.tracked} />
        <StatCard icon={CalendarClock} label="Active schedules" value={stats.totals.activeSchedules} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Runs in the last 24 hours</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <CircleCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <p className="mt-2 text-xl font-semibold text-slate-900">{runs.success || 0}</p>
              <p className="text-xs text-slate-500">Succeeded</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <CircleX className="h-4 w-4 text-rose-600" aria-hidden="true" />
              <p className="mt-2 text-xl font-semibold text-slate-900">{runs.failed || 0}</p>
              <p className="text-xs text-slate-500">Failed</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <TrendingDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <p className="mt-2 text-xl font-semibold text-slate-900">{(runs.queued || 0) + (runs.running || 0)}</p>
              <p className="text-xs text-slate-500">In progress</p>
            </div>
          </div>

          <h2 className="mt-8 text-sm font-semibold text-slate-900">Listings by store</h2>
          {stats.productsBySource.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No listings yet. Run a scrape to populate the catalogue.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {stats.productsBySource.map((row) => (
                <li key={row.source}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{sourceLabel(row.source)}</span>
                    <span className="text-slate-500">{row.count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(3, (row.count / totalProducts) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent runs</h2>
            <Link to="/admin/scraper" className="text-xs font-medium text-slate-600 hover:text-slate-900">View all</Link>
          </div>
          {stats.recentRuns.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No scrape runs yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {sourceLabel(run.source)} · {run.query}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(run.startedAt)} · {run.origin}</p>
                  </div>
                  <StatusPill status={run.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
