import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from './BrandMark';
import { ConfirmDialog } from './ConfirmDialog';

const menu = [
  {
    to: '/dashboard',
    label: 'Inicio',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
      </svg>
    ),
  },
  {
    to: '/productos',
    label: 'Producto',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 8.5h8.2v6.2a4 4 0 0 1-8.2 0V8.5z" />
        <path d="M16.2 10h1.6a2 2 0 0 1 0 4h-1.6" />
        <path d="M10.2 5.5c.4.8.4 1.4 0 2.2M13.2 5c.4.8.4 1.4 0 2.2" />
      </svg>
    ),
  },
  {
    to: '/ventas',
    label: 'Venta',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 7.5h11l-.8 8.2a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8L6.5 7.5z" />
        <path d="M9 7.5V6.2A3 3 0 0 1 12 3.2 3 3 0 0 1 15 6.2v1.3" />
      </svg>
    ),
  },
  {
    to: '/gastos',
    label: 'Gasto',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
        <path d="M3.5 10.5h17" />
      </svg>
    ),
  },
  {
    to: '/historial',
    label: 'Historial',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 8.5V12l2.5 1.8" />
      </svg>
    ),
  },
];

export function AppLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandMark />
          <div className="brand-copy">
            <p className="brand-name">
              <span className="brand-name-punto">Punto</span>{' '}
              <span className="brand-name-cafe">Café</span>
            </p>
            <p className="brand-tagline">Cafetería · Ventas y gastos</p>
          </div>
        </div>

        <p className="nav-label">Menú</p>
        <nav className="sidebar-nav" aria-label="Principal">
          {menu.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="logout" type="button" onClick={() => setConfirmLogout(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h7A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 10 18.5V17" />
            <path d="M13 12H4m0 0 2.5-2.5M4 12l2.5 2.5" />
          </svg>
          Cerrar sesión
        </button>
      </aside>

      <main className="content">
        <Outlet />
      </main>

      {confirmLogout ? (
        <ConfirmDialog
          title="Cerrar sesión"
          message="¿Seguro que quieres salir de Punto Café?"
          confirmLabel="Cerrar sesión"
          cancelLabel="Cancelar"
          danger={false}
          onCancel={() => setConfirmLogout(false)}
          onConfirm={handleLogout}
        />
      ) : null}
    </div>
  );
}
