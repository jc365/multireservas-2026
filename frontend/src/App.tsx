import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Services from './pages/Services';
import CreateService from './pages/CreateService';
import ServiceDetail from './pages/ServiceDetail';
import Employees from './pages/Employees';
import CreateEmployee from './pages/CreateEmployee';
import EmployeeDetail from './pages/EmployeeDetail';
import Reservations from './pages/Reservations';
import CreateReservation from './pages/CreateReservation';
import ReservationDetail from './pages/ReservationDetail';
import CancelReservation from './pages/CancelReservation';
import TenantConfig from './pages/TenantConfig';
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
                  {/* Público (F3.3): cancelación por token, sin Layout ni auth */}
                  <Route path="/reservations/cancel/:token" element={<CancelReservation />} />
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="services" element={<Services />} />
                    <Route path="services/create" element={<CreateService />} />
                    <Route path="services/:id" element={<ServiceDetail />} />
                    <Route path="employees" element={<Employees />} />
                    <Route path="employees/create" element={<CreateEmployee />} />
                    <Route path="employees/:id" element={<EmployeeDetail />} />
                    <Route path="reservations" element={<Reservations />} />
                    <Route path="reservations/create" element={<CreateReservation />} />
                    <Route path="reservations/:id" element={<ReservationDetail />} />
                    <Route path="tenant-config" element={<TenantConfig />} />
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
