import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Items from './pages/Items';
import CreateItem from './pages/CreateItem';
import ItemDetail from './pages/ItemDetail';
import BitacoraPage from './pages/admin/BitacoraPage';
import ConfigPage from './pages/admin/ConfigPage';
import Layout from './components/Layout';
import AdminSubNav from './components/AdminSubNav';
import { UserProvider, useUser } from './context/UserContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { UserCacheProvider } from './context/UserCacheContext';
import { ConfigProvider } from './context/ConfigContext';

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useUser();
  if (isLoading) return null;
  if (!isAdmin()) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AdminLayout() {
  return (
    <AdminGuard>
      <AdminSubNav />
      <Outlet />
    </AdminGuard>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <UserCacheProvider>
          <UserProvider>
            <ConfigProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="items" element={<Items />} />
                    <Route path="items/create" element={<CreateItem />} />
                    <Route path="items/:id" element={<ItemDetail />} />
                    <Route path="admin" element={<AdminLayout />}>
                      <Route index element={<Navigate to="/admin/bitacora" replace />} />
                      <Route path="bitacora" element={<BitacoraPage />} />
                      <Route path="config" element={<ConfigPage />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </ConfigProvider>
          </UserProvider>
        </UserCacheProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
