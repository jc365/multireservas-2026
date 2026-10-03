import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';

const adminTabs = [
  { to: '/admin/tenants', labelKey: 'admin.nav.tenants', icon: 'domain' },
  { to: '/admin/bitacora', labelKey: 'admin.nav.bitacora', icon: 'history' },
  { to: '/admin/config', labelKey: 'admin.nav.config', icon: 'settings' },
];

export default function AdminSubNav() {
  const location = useLocation();
  const { t } = useI18n();

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
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
