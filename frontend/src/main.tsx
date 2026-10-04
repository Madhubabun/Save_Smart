import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { CompareRunnerProvider } from './components/CompareRunner';
import { Layout } from './components/Layout';
import { EmptyState, LinkButton } from './components/ui';
import { Compare } from './pages/Compare';
import { Home } from './pages/Home';
import { Results } from './pages/Results';
import { AppStateProvider } from './state/AppState';
import { registerPwa } from './lib/pwa';

registerPwa();

// Less-used screens load on demand to keep the first load fast.
const Product = lazy(() => import('./pages/Product').then((m) => ({ default: m.Product })));
const SavedCarts = lazy(() => import('./pages/SavedCarts').then((m) => ({ default: m.SavedCarts })));
const Savings = lazy(() => import('./pages/Savings').then((m) => ({ default: m.Savings })));
const Alerts = lazy(() => import('./pages/Alerts').then((m) => ({ default: m.Alerts })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <CompareRunnerProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="compare" element={<Compare />} />
              <Route path="results/:id" element={<Results />} />
              <Route path="product/:id" element={<Product />} />
              <Route path="saved" element={<SavedCarts />} />
              <Route path="savings" element={<Savings />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<EmptyState icon="🧭" title="Page not found" action={<LinkButton to="/">Go home</LinkButton>} />} />
            </Route>
          </Routes>
        </CompareRunnerProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
