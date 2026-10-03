import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import LoginForm from './LoginForm';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeId } from '../context/ThemeContext';
import { useAdminTenant } from '../context/AdminTenantContext';
import { can } from '../utils/roleConfig';
import type { Permission } from '../utils/roleConfig';
import { useI18n } from '../i18n';

interface NavItem {
  to: string;
  icon: string;
  labelKey: string;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: 'dashboard', labelKey: 'nav.dashboard' },
  { to: '/services', icon: 'event_available', labelKey: 'nav.services', permission: 'viewServices' },
  { to: '/services/create', icon: 'add_circle', labelKey: 'nav.createService', permission: 'editServices' },
  { to: '/employees', icon: 'group', labelKey: 'nav.employees', permission: 'viewEmployees' },
  { to: '/employees/create', icon: 'person_add', labelKey: 'nav.createEmployee', permission: 'editEmployees' },
  { to: '/reservations', icon: 'event', labelKey: 'nav.reservations', permission: 'viewReservations' },
  { to: '/agenda', icon: 'calendar_month', labelKey: 'nav.agenda', permission: 'viewReservations' },
  { to: '/reservations/create', icon: 'add_task', labelKey: 'nav.createReservation', permission: 'editReservations' },
  { to: '/tenant-config', icon: 'tune', labelKey: 'nav.tenantConfig', permission: 'editTenantConfig' },
];

const DEMO_USER_MAP: Record<string, string> = {
  'owner@demo.com': 'owner',
  'employee@demo.com': 'employee',
  'admin@demo.com': 'admin',
  'client@demo.com': 'client',
};

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshUser, login, logout } = useUser();
  const { theme, setTheme, toggleTheme, themes, getThemeLabel } = useTheme();
  const { ownerMode, tenantId, exitOwnerMode } = useAdminTenant();
  const { t } = useI18n();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [demoEnabled, setDemoEnabled] = useState(() => !!localStorage.getItem('token'));
  const [selectedRole, setSelectedRole] = useState('admin');
  const [demoError, setDemoError] = useState('');
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const token = localStorage.getItem('token');
  const isAuthenticated = !!token;

  const sidebarWidth = collapsed ? 'w-16' : 'w-[280px]';
  const mainMargin = collapsed ? 'ml-16' : 'ml-[280px]';

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      refreshUser();
    } else if (isDemoMode) {
      setSelectedRole('admin');
      setDemoEnabled(true);
      handleDemoLogin('admin');
    }
    setInitialLoadDone(true);
  }, []);

  useEffect(() => {
    if (!initialLoadDone) return;

    if (!user) {
      return;
    }

    const isDemoUser = user.email in DEMO_USER_MAP;

    if (isDemoUser) {
      setDemoEnabled(true);
      const role = DEMO_USER_MAP[user.email] || 'admin';
      setSelectedRole(role);
    } else {
      setDemoEnabled(false);
    }
  }, [user, initialLoadDone]);

  const handleDemoLogin = async (role: string) => {
    setDemoError('');
    try {
      await login({ xUserId: role });
      navigate('/dashboard');
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : t('nav.demoLoginFailed'));
    }
  };

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };

  const toggleDemo = async () => {
    if (demoEnabled) {
      logout();
      setDemoEnabled(false);
      return;
    }

    setDemoError('');
    try {
      await login({ xUserId: selectedRole });
      setDemoEnabled(true);
      navigate('/dashboard');
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : t('nav.demoLoginFailed'));
    }
  };

  const handleRoleChange = async (role: string) => {
    if (role === selectedRole) return;
    setSelectedRole(role);
    if (demoEnabled) {
      setDemoError('');
      try {
        await login({ xUserId: role });
        navigate('/dashboard');
      } catch (err) {
        setDemoError(err instanceof Error ? err.message : t('nav.demoLoginFailed'));
      }
    }
  };

  const handleLogout = () => {
    logout();
    setDemoEnabled(false);
  };

  const handleLogin = () => {
    refreshUser();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* SideNavBar */}
      <nav className={`fixed left-0 top-0 h-full ${sidebarWidth} bg-background border-r border-outline-variant/30 flex flex-col py-8 z-50 transition-all duration-300`}>
        {/* Header */}
        <div className={`mb-10 ${collapsed ? 'px-3' : 'px-6'}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="w-10 h-10 rounded bg-surface-container-high border border-outline-variant/30 flex items-center justify-center hover:bg-surface-container-low transition-colors shrink-0"
              aria-label="Toggle sidebar"
            >
              <span className="material-symbols-outlined text-on-surface-variant">
                {collapsed ? 'menu_open' : 'menu'}
              </span>
            </button>
            {!collapsed && (
              <div className="overflow-hidden">
                <h2 className="font-headline-md text-headline-md text-primary font-bold tracking-tight whitespace-nowrap">
                  Events Starter
                </h2>
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mt-1 whitespace-nowrap">
                  {t('nav.adminPanel')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Nav Items */}
        <div className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            if (item.permission && !(user && can(user.role, item.permission))) {
              return null;
            }
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? t(item.labelKey) : undefined}
                className={`flex items-center gap-4 py-3 transition-colors duration-200 active:scale-[0.98] ${collapsed ? 'justify-center px-3' : 'px-6'
                  } ${isActive
                    ? 'text-primary border-l-2 border-primary bg-surface-container-high'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                  }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                {!collapsed && <span>{t(item.labelKey)}</span>}
              </Link>
            );
          })}
          {user?.role === 'admin' && (
            <Link
              to="/admin/bitacora"
              title={collapsed ? t('nav.admin') : undefined}
              className={`flex items-center gap-4 py-3 transition-colors duration-200 active:scale-[0.98] ${collapsed ? 'justify-center px-3' : 'px-6'
                } ${location.pathname.startsWith('/admin')
                  ? 'text-primary border-l-2 border-primary bg-surface-container-high'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                }`}
            >
              <span className="material-symbols-outlined">admin_panel_settings</span>
              {!collapsed && <span>{t('nav.admin')}</span>}
            </Link>
          )}
        </div>

        {/* Bottom Section */}
        <div className={`mt-auto ${collapsed ? 'px-2' : 'px-6'} space-y-3`}>
          {/* Theme Selector */}
          {collapsed ? (
            <button
              onClick={toggleTheme}
              title={getThemeLabel(theme)}
              className="w-full bg-surface-container-high text-on-surface font-title-sm text-title-sm py-3 rounded hover:bg-surface-container-low transition-colors flex items-center justify-center px-0"
            >
              <span className="material-symbols-outlined text-[18px]">palette</span>
            </button>
          ) : (
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
                {t('nav.theme')}
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeId)}
                className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-2 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
              >
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          )}
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title={collapsed ? t('nav.logout') : undefined}
            className={`w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 rounded hover:bg-primary transition-colors flex items-center justify-center gap-2 ${collapsed ? 'px-0' : 'px-4'
              }`}
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            {!collapsed && t('nav.logout')}
          </button>
        </div>

        {/* Demo Mode Toggle - Always visible at bottom when VITE_DEMO_MODE=true */}
        {isDemoMode && (
          <div className={`${collapsed ? 'px-2 mb-2' : 'px-6 mb-4'}`}>
            <div className="bg-surface-container rounded-lg p-3 border border-outline-variant/20">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  {collapsed ? t('nav.demo') : t('nav.demoMode')}
                </span>
                <div
                  className={`relative w-10 h-5 rounded-full transition-colors ${demoEnabled ? 'bg-primary-container' : 'bg-surface-container-high'
                    }`}
                  onClick={toggleDemo}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${demoEnabled
                      ? 'left-5 bg-on-primary-container'
                      : 'left-0.5 bg-outline'
                      }`}
                  />
                </div>
              </label>

              {demoError && (
                <p className="text-xs text-error mt-2">{demoError}</p>
              )}

              {demoEnabled && !collapsed && (
                <select
                  value={selectedRole}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="block mt-2 w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="owner">Owner</option>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* TopAppBar */}
      <header className={`fixed top-0 right-0 ${mainMargin} h-16 bg-background/80 backdrop-blur-md border-b border-outline-variant/20 flex justify-between items-center px-margin-desktop w-[calc(100%-0rem)] z-40 transition-all duration-300`}>
        <div className="flex items-center gap-4 ml-auto">
          {demoEnabled && (
            <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-full font-label-caps uppercase">
              {t('nav.demoActivated')}
            </span>
          )}
          {user && (
            <div className="flex items-center gap-2 ml-2">
              <div className="text-right">
                <p className="text-sm font-medium text-on-surface leading-tight">{user.name}</p>
                <p className="text-xs text-on-surface-variant leading-tight">{user.email}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/30 overflow-hidden flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant text-sm">person</span>
              </div>
            </div>
          )}
          {!user && (
            <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/30 overflow-hidden ml-2 cursor-pointer flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant text-sm">person</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={`${mainMargin} pt-16 min-h-screen px-margin-desktop py-10 max-w-container-max transition-all duration-300`}>
        {isAuthenticated && ownerMode && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-3 bg-primary/10 border border-primary/40 rounded-xl px-4 py-3"
          >
            <div className="flex items-center gap-2 text-sm text-on-surface">
              <span className="material-symbols-outlined text-primary text-[18px]">shield_person</span>
              <span>
                {t('nav.ownerBanner')}{' '}
                <strong className="font-semibold">{tenantId}</strong>
              </span>
            </div>
            <button
              onClick={() => {
                exitOwnerMode();
                navigate(`/admin/tenants/${tenantId}`);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-on-primary rounded-lg hover:opacity-90"
            >
              {t('nav.exitOwnerMode')}
            </button>
          </div>
        )}
        {isAuthenticated ? <Outlet /> : <LoginForm onLoginSuccess={handleLogin} />}
      </main>
    </div>
  );
}
