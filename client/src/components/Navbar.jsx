import { Bell, ChevronDown, KeyRound, LogOut, Menu, Scale, Search, ShieldCheck, TrendingDown, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompare } from '../context/CompareContext';
import { BRAND } from '../lib/brand';

const navClass = ({ isActive }) =>
  `inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition ${
    isActive ? 'font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'
  }`;

const menuItemClass =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600';

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'U';

function SearchForm({ className = '' }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const term = query.trim();
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };

  return (
    <form onSubmit={submit} role="search" className={`relative ${className}`}>
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        id="site-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search phones, TVs, shoes…"
        className="input h-10 rounded-full pl-9"
      />
    </form>
  );
}

// The account menu opens only when the profile is clicked. Sign out lives inside it.
function ProfileMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-sm text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white" aria-hidden="true">
          {initialsOf(user.name)}
        </span>
        <span className="max-w-[8rem] truncate">{user.name.split(' ')[0]}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="border-b border-slate-100 px-3 pb-3 pt-2">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <div className="py-1">
            <Link role="menuitem" to="/tracking" className={menuItemClass}>
              <Bell className="h-4 w-4" aria-hidden="true" />
              Price tracking
            </Link>
            <Link role="menuitem" to="/account/password" className={menuItemClass}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Change password
            </Link>
          </div>
          <div className="border-t border-slate-100 pt-1">
            <button role="menuitem" type="button" onClick={onSignOut} className={`${menuItemClass} text-rose-700 hover:text-rose-800`}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, isAdmin, signOut } = useAuth();
  const { ids } = useCompare();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
  }, [location.pathname, location.search]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <TrendingDown className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
        </Link>

        <SearchForm className="mx-2 hidden min-w-0 flex-1 md:block" />

        <nav className="ml-auto hidden shrink-0 items-center md:flex" aria-label="Main">
          <NavLink to="/" end className={navClass}>
            Browse
          </NavLink>
          <NavLink to="/compare" className={navClass}>
            <Scale className="h-4 w-4" aria-hidden="true" />
            Compare
            {ids.length > 0 && (
              <span className="rounded-full bg-slate-900 px-1.5 text-[11px] leading-5 text-white">{ids.length}</span>
            )}
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={navClass}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="ml-1 hidden shrink-0 items-center md:flex">
          {user ? (
            <ProfileMenu user={user} onSignOut={handleSignOut} />
          ) : (
            <>
              <Link to="/signin" className="btn-ghost">
                Sign in
              </Link>
              <Link to="/signup" className="btn-primary">
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="btn-ghost ml-auto p-2 md:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-5 pt-4 md:hidden">
          <SearchForm />
          <nav className="mt-4 flex flex-col gap-1" aria-label="Mobile">
            <NavLink to="/" end className={navClass}>Browse</NavLink>
            <NavLink to="/compare" className={navClass}>
              Compare{ids.length > 0 ? ` (${ids.length})` : ''}
            </NavLink>
            {user && <NavLink to="/tracking" className={navClass}>Price tracking</NavLink>}
            {isAdmin && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
          </nav>
          <div className="mt-4 border-t border-slate-200 pt-4">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setAccountOpen((value) => !value)}
                  aria-expanded={accountOpen}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white" aria-hidden="true">
                    {initialsOf(user.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{user.name}</span>
                    <span className="block truncate text-xs text-slate-500">{user.email}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition ${accountOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {accountOpen && (
                  <div className="mt-2 flex flex-col gap-1 pl-2">
                    <Link to="/account/password" className={menuItemClass}>
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      Change password
                    </Link>
                    <button type="button" onClick={handleSignOut} className={`${menuItemClass} text-rose-700`}>
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link to="/signin" className="btn-secondary">Sign in</Link>
                <Link to="/signup" className="btn-primary">Sign up</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
