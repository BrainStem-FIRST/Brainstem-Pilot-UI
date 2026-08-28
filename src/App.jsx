import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { HomeLogoLink } from './components/AppLogo';
import PageNotFound from './lib/PageNotFound';
import Welcome from './pages/Welcome';
import Home from './pages/Home';
import Settings from './pages/Settings';
import StringBuilderList from './pages/StringBuilderList';
import AutoWorkspace from './pages/AutoWorkspace';
import SubsystemConfigPage from './pages/SubsystemConfigPage';
import AutoSimulator from './pages/AutoSimulator';
import LibraryIndex from './pages/LibraryIndex';
import { FieldConfigProvider } from './context/FieldConfigContext';
import { LeagueProvider } from './context/LeagueContext';
import { hasProjectDir } from './lib/projectFolder';

/**
 * Every screen past the welcome gate reads and writes the open project folder. Without one,
 * dataService quietly falls back to localStorage — so an auto built before opening a project
 * looked saved but never reached the user's repo. Sending them back to the gate makes the
 * requirement explicit instead of silently losing work.
 *
 * The directory handle lives in memory only, so a page reload lands here too.
 */
function RequireProject({ children }) {
  if (!hasProjectDir()) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  // Keyed on the path so navigating to a working screen clears a crashed one — without the
  // key, a boundary that has caught once stays caught and every later route renders the
  // error instead of the page.
  const location = useLocation();
  return (
    <LeagueProvider>
      <FieldConfigProvider>
        <HomeLogoLink />
        <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/home" element={<RequireProject><Home /></RequireProject>} />
          <Route path="/settings" element={<RequireProject><Settings /></RequireProject>} />
          <Route path="/string-builder" element={<RequireProject><StringBuilderList /></RequireProject>} />
          <Route path="/auto-workspace/:id" element={<RequireProject><AutoWorkspace /></RequireProject>} />
          <Route path="/subsystem-config" element={<RequireProject><SubsystemConfigPage /></RequireProject>} />
          <Route path="/auto-simulator" element={<RequireProject><AutoSimulator /></RequireProject>} />
          <Route path="/auto-simulator/:id" element={<RequireProject><AutoSimulator /></RequireProject>} />
          <Route path="/library" element={<RequireProject><LibraryIndex /></RequireProject>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
        </ErrorBoundary>
      </FieldConfigProvider>
    </LeagueProvider>
  );
}

// There is no server under the desktop build — index.html is loaded from disk, where a
// path-based URL has nothing to serve it. The hash router keeps every route inside the one
// document. The web build keeps clean paths (404.html bounces deep links back to index).
const Router = __DESKTOP_BUILD__ ? HashRouter : BrowserRouter;
const routerBasename = __DESKTOP_BUILD__ ? '/' : import.meta.env.BASE_URL;

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <ErrorBoundary>
        <Router basename={routerBasename}>
          <AppRoutes />
        </Router>
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App
