import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from './components/Guards';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Browse from './pages/Browse';
import Compare from './pages/Compare';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';

// Heavier screens are split out so the shopping pages load quickly
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Tracking = lazy(() => import('./pages/Tracking'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Scraper = lazy(() => import('./pages/admin/Scraper'));
const Products = lazy(() => import('./pages/admin/Products'));
const Categories = lazy(() => import('./pages/admin/Categories'));
const Users = lazy(() => import('./pages/admin/Users'));

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="category/:slug" element={<Browse />} />
          <Route path="search" element={<Browse />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="compare" element={<Compare />} />
          <Route path="signin" element={<SignIn />} />
          <Route path="signup" element={<SignUp />} />

          <Route element={<RequireAuth />}>
            <Route path="tracking" element={<Tracking />} />
            <Route path="account/password" element={<ChangePassword />} />
          </Route>

          <Route path="admin" element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="scraper" element={<Scraper />} />
              <Route path="products" element={<Products />} />
              <Route path="categories" element={<Categories />} />
              <Route path="users" element={<Users />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
