import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import PageNotFound from './lib/PageNotFound';
import Welcome from './pages/Welcome';
import Settings from './pages/Settings';
import StringBuilderList from './pages/StringBuilderList';
import AutoWorkspace from './pages/AutoWorkspace';
import SubsystemConfigPage from './pages/SubsystemConfigPage';
import AutoSimulator from './pages/AutoSimulator';
import Documentation from './pages/Documentation';
import LibraryIndex from './pages/LibraryIndex';
import { FieldConfigProvider } from './context/FieldConfigContext';
import { LeagueProvider } from './context/LeagueContext';

function AppRoutes() {
  // Keyed on the path so navigating to a working screen clears a crashed one — without the
  // key, a boundary that has caught once stays caught and every later route renders the
  // error instead of the page.
  const location = useLocation();
  return (
    <LeagueProvider>
      <FieldConfigProvider>
        <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/string-builder" element={<StringBuilderList />} />
          <Route path="/auto-workspace/:id" element={<AutoWorkspace />} />
          <Route path="/subsystem-config" element={<SubsystemConfigPage />} />
          <Route path="/auto-simulator" element={<AutoSimulator />} />
          <Route path="/auto-simulator/:id" element={<AutoSimulator />} />
          <Route path="/library" element={<LibraryIndex />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
        </ErrorBoundary>
      </FieldConfigProvider>
    </LeagueProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <ErrorBoundary>
        <Router basename={import.meta.env.BASE_URL}>
          <AppRoutes />
        </Router>
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App
