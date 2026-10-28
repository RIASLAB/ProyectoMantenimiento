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
import { Pending } from './pages/Pending';
import { Notifications } from './pages/Notifications';
import { Indicators } from './pages/Indicators';
import { EquipmentTypes } from './pages/assets/EquipmentTypes';
import { EquipmentSummary } from './pages/assets/EquipmentSummary';
import { BulkImport } from './pages/admin/BulkImport';
import { OrderDetail } from './pages/orders/OrderDetail';
import { OrdersList } from './pages/orders/OrdersList';
import { Plans } from './pages/orders/Plans';
import { ReportFault } from './pages/orders/ReportFault';
import { PurchaseDetail } from './pages/purchases/PurchaseDetail';
import { PurchasesList } from './pages/purchases/PurchasesList';
import { FillChecklist } from './pages/quality/FillChecklist';
import { QualityHome } from './pages/quality/QualityHome';
import { QualitySetup } from './pages/quality/QualitySetup';
import { RecordTemperature } from './pages/quality/RecordTemperature';

/** Página de inicio según el rol: el autorizador llega directo a las compras por aprobar. */
function Home() {
  const { user } = useAuth();
  return <Navigate to={user?.rol === 'AUTORIZADOR' ? '/compras' : '/ordenes'} replace />;
}

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
        <Route index element={<Home />} />
        <Route path="pendientes" element={<Pending />} />
        <Route path="notificaciones" element={<Notifications />} />
        <Route path="compras" element={<OnlyRoles roles={['ADMIN', 'AUTORIZADOR', 'TECNICO']}><PurchasesList /></OnlyRoles>} />
        <Route path="compras/:id" element={<OnlyRoles roles={['ADMIN', 'AUTORIZADOR', 'TECNICO']}><PurchaseDetail /></OnlyRoles>} />
        <Route path="ordenes" element={<OrdersList />} />
        <Route path="ordenes/reportar" element={<ReportFault />} />
        <Route path="ordenes/planes" element={<OnlyRoles roles={['ADMIN', 'AUTORIZADOR', 'TECNICO']}><Plans /></OnlyRoles>} />
        <Route path="ordenes/:id" element={<OrderDetail />} />
        <Route path="calidad" element={<QualityHome />} />
        <Route path="calidad/temperatura" element={<RecordTemperature />} />
        <Route path="calidad/checklist/:id" element={<FillChecklist />} />
        <Route path="calidad/configuracion" element={<OnlyRoles roles={['ADMIN']}><QualitySetup /></OnlyRoles>} />
        <Route path="maquinas" element={<AssetsList />} />
        <Route path="maquinas/tipos" element={<EquipmentTypes />} />
        <Route path="maquinas/por-area" element={<OnlyRoles roles={['ADMIN', 'AUTORIZADOR', 'TECNICO']}><EquipmentSummary /></OnlyRoles>} />
        <Route path="maquinas/nueva" element={<OnlyRoles roles={['ADMIN']}><AssetForm /></OnlyRoles>} />
        <Route path="maquinas/:id" element={<AssetDetail />} />
        <Route path="maquinas/:id/editar" element={<OnlyRoles roles={['ADMIN']}><AssetForm /></OnlyRoles>} />
        <Route path="inventario" element={<PartsList />} />
        <Route path="inventario/nuevo" element={<OnlyRoles roles={['ADMIN']}><PartForm /></OnlyRoles>} />
        <Route path="inventario/:id" element={<PartDetail />} />
        <Route path="inventario/:id/editar" element={<OnlyRoles roles={['ADMIN']}><PartForm /></OnlyRoles>} />
        <Route path="indicadores" element={<OnlyRoles roles={['ADMIN', 'AUTORIZADOR']}><Indicators /></OnlyRoles>} />
        <Route path="usuarios" element={<OnlyRoles roles={['ADMIN']}><Users /></OnlyRoles>} />
        <Route path="configuracion/carga-masiva" element={<OnlyRoles roles={['ADMIN']}><BulkImport /></OnlyRoles>} />
        <Route path="configuracion" element={<OnlyRoles roles={['ADMIN']}><Settings /></OnlyRoles>} />
        <Route path="*" element={<Empty title="Página no encontrada" />} />
      </Route>
    </Routes>
  );
}
