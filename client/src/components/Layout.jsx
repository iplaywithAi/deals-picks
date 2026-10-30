import { Outlet } from 'react-router-dom';
import { BRAND } from '../lib/brand';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}.
          </p>
          <p>Prices are collected periodically. Confirm the final price on the store before you pay.</p>
        </div>
      </footer>
    </div>
  );
}
