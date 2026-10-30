import { Search, ShieldCheck, Trash2, Users as UsersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  const load = (q = term) => {
    setError('');
    api
      .get(`/admin/users?q=${encodeURIComponent(q)}`)
      .then((d) => setUsers(d.users))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    const timer = setTimeout(() => load(term), 300);
    return () => clearTimeout(timer);
    // load is stable enough for this debounced search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const changeRole = async (user, role) => {
    try {
      await api.patch(`/admin/users/${user.id}`, { role });
      toast(`${user.name} is now ${role === 'admin' ? 'an admin' : 'a shopper'}`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (user) => {
    if (!window.confirm(`Delete ${user.name} (${user.email})? Their tracking list is removed too.`)) return;
    try {
      await api.del(`/admin/users/${user.id}`);
      toast('Account deleted');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Users" description="Shoppers and admins. Admins can manage the scraper, catalogue and accounts." />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input aria-label="Search users" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name or email" className="input pl-9 sm:max-w-md" />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : !users ? (
        <Spinner label="Loading users" />
      ) : users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No matching users" />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Email</th>
                  <th className="th">Role</th>
                  <th className="th text-right">Tracked</th>
                  <th className="th">Joined</th>
                  <th className="th text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isMe = u.id === me.id;
                  return (
                    <tr key={u.id}>
                      <td className="td font-medium text-slate-900">
                        {u.name} {isMe && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}
                      </td>
                      <td className="td">{u.email}</td>
                      <td className="td">
                        <select
                          aria-label={`Role for ${u.name}`}
                          value={u.role}
                          disabled={isMe}
                          onChange={(e) => changeRole(u, e.target.value)}
                          className="input w-32 py-1.5 text-xs disabled:bg-slate-50"
                        >
                          <option value="user">Shopper</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="td text-right tabular-nums">{u.trackedCount}</td>
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(u.createdAt)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          {u.role === 'admin' && <ShieldCheck className="mt-2 h-4 w-4 text-slate-400" aria-label="Admin" />}
                          <button
                            type="button"
                            disabled={isMe}
                            onClick={() => remove(u)}
                            className="btn-ghost px-2 hover:text-rose-700 disabled:opacity-30"
                            aria-label={`Delete ${u.name}`}
                            title={isMe ? 'You cannot delete your own account here' : 'Delete account'}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
