import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/layout/Layout';

const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const TopologyPage = lazy(() => import('./features/topology/TopologyPage'));
const TopologyDetailsPage = lazy(() => import('./features/topology/TopologyDetailsPage'));
const RoutingPage = lazy(() => import('./features/routing/RoutingPage'));
const FlowsPage = lazy(() => import('./features/flows/FlowsPage'));
const MonitoringPage = lazy(() => import('./features/monitoring/MonitoringPage'));
const TerminalPage = lazy(() => import('./features/terminal/TerminalPage'));
const RoutersPage = lazy(() => import('./features/routers/RoutersPage'));
const LearnPage = lazy(() => import('./features/learn/LearnPage'));

function Loading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', color: 'var(--color-text-muted)' }}>
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<Loading />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="topology"
          element={
            <Suspense fallback={<Loading />}>
              <TopologyPage />
            </Suspense>
          }
        />
        <Route
          path="topology/details"
          element={
            <Suspense fallback={<Loading />}>
              <TopologyDetailsPage />
            </Suspense>
          }
        />
        <Route
          path="routing"
          element={
            <Suspense fallback={<Loading />}>
              <RoutingPage />
            </Suspense>
          }
        />
        <Route
          path="flows"
          element={
            <Suspense fallback={<Loading />}>
              <FlowsPage />
            </Suspense>
          }
        />
        <Route
          path="monitoring"
          element={
            <Suspense fallback={<Loading />}>
              <MonitoringPage />
            </Suspense>
          }
        />
        <Route
          path="terminal"
          element={
            <Suspense fallback={<Loading />}>
              <TerminalPage />
            </Suspense>
          }
        />
        <Route
          path="routers"
          element={
            <Suspense fallback={<Loading />}>
              <RoutersPage />
            </Suspense>
          }
        />
        <Route
          path="learn"
          element={
            <Suspense fallback={<Loading />}>
              <LearnPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
