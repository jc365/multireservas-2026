import { Link, useLocation } from 'react-router-dom';

const adminTabs = [
  { to: '/admin/tenants', label: 'Tenants', icon: 'domain' },
  { to: '/admin/bitacora', label: 'Bitacora', icon: 'history' },
  { to: '/admin/config', label: 'Config', icon: 'settings' },
];

export default function AdminSubNav() {
  const location = useLocation();

  return (
    <div className="flex gap-1 mb-6 border-b border-outline-variant/30">
      {adminTabs.map((tab) => {
        const isActive =
          location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
