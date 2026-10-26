import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Rol } from './api/types';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Empty, Spinner } from './components/ui';
import { Settings } from './pages/admin/Settings';
import { Users } from './pages/admin/Users';
import { AssetDetail } from './pages/assets/AssetDetail';
import { AssetForm } from './pages/assets/AssetForm';
import { AssetsList } from './pages/assets/AssetsList';
import { PartDetail } from './pages/inventory/PartDetail';
import { PartForm } from './pages/inventory/PartForm';
import { PartsList } from './pages/inventory/PartsList';
import { Login } from './pages/Login';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Verificando sesión…" />;
  if (!user) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Oculta pantallas por rol. La seguridad real está en la API; esto solo evita mostrar lo que no aplica. */
function OnlyRoles({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? <>{children}</> : <Empty title="No tiene permiso para ver esta sección" />;
}

export function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/maquinas" replace />} />
        <Route path="maquinas" element={<AssetsList />} />
        <Route path="maquinas/nueva" element={<OnlyRoles roles={['ADMIN']}><AssetForm /></OnlyRoles>} />
        <Route path="maquinas/:id" element={<AssetDetail />} />
        <Route path="maquinas/:id/editar" element={<OnlyRoles roles={['ADMIN']}><AssetForm /></OnlyRoles>} />
        <Route path="inventario" element={<PartsList />} />
        <Route path="inventario/nuevo" element={<OnlyRoles roles={['ADMIN']}><PartForm /></OnlyRoles>} />
        <Route path="inventario/:id" element={<PartDetail />} />
        <Route path="inventario/:id/editar" element={<OnlyRoles roles={['ADMIN']}><PartForm /></OnlyRoles>} />
        <Route path="usuarios" element={<OnlyRoles roles={['ADMIN']}><Users /></OnlyRoles>} />
        <Route path="configuracion" element={<OnlyRoles roles={['ADMIN']}><Settings /></OnlyRoles>} />
        <Route path="*" element={<Empty title="Página no encontrada" />} />
      </Route>
    </Routes>
  );
}
