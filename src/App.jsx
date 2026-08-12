import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Welcome from './pages/Welcome';
import AutoBuilder from './pages/AutoBuilder';
import AutoList from './pages/AutoList';
import Settings from './pages/Settings';
import StringBuilderList from './pages/StringBuilderList';
import SkeletonBuilder from './pages/SkeletonBuilder';
import ChildBuilder from './pages/ChildBuilder';
import SubsystemConfigPage from './pages/SubsystemConfigPage';
import AutoSimulator from './pages/AutoSimulator';
import Documentation from './pages/Documentation';
import { FieldConfigProvider } from './context/FieldConfigContext';
import { LeagueProvider } from './context/LeagueContext';

function AppRoutes() {
  return (
    <LeagueProvider>
      <FieldConfigProvider>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/autos" element={<AutoList />} />
          <Route path="/auto-builder/:id" element={<AutoBuilder />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/string-builder" element={<StringBuilderList />} />
          <Route path="/skeleton-builder/:id" element={<SkeletonBuilder />} />
          <Route path="/child-builder/:id" element={<ChildBuilder />} />
          <Route path="/subsystem-config" element={<SubsystemConfigPage />} />
          <Route path="/auto-simulator" element={<AutoSimulator />} />
          <Route path="/auto-simulator/:id" element={<AutoSimulator />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </FieldConfigProvider>
    </LeagueProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router basename={import.meta.env.BASE_URL}>
        <AppRoutes />
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App
