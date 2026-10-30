import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatKES, formatShortDate } from '../lib/format';

export default function PriceChart({ history }) {
  if (history.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Price history builds up with each scrape. Check back after the next run.
      </p>
    );
  }

  const data = history.map((point) => ({ date: formatShortDate(point.recordedAt), price: point.price }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={72}
            domain={['auto', 'auto']}
            tickFormatter={(value) => Number(value).toLocaleString('en-KE')}
          />
          <Tooltip
            formatter={(value) => [formatKES(value), 'Price']}
            contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
          />
          <Line type="stepAfter" dataKey="price" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
