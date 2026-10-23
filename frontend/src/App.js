import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import PhoridNewsletters from './pages/PhoridNewsletters';
import IdentificationKeys from './pages/IdentificationKeys';
import Morphometrics from './pages/Morphometrics';
import PhotoGallery from './pages/PhotoGallery';
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import TaxonomyWorkbench from "./pages/TaxonomyWorkbench";
import TaxonomySection from "./components/taxonomy/TaxonomySection";
import SpeciesManager from "./components/taxonomy/SpeciesManager";
import GbifCache from './pages/GbifCache';
import Crisis from './pages/Crisis';
import About from './pages/About';
import People from './pages/People';
import GbifViewer from './pages/PhoridCatalogPublic';
import Literature from './pages/Literature';
import MoreResources from './pages/ProjectsAndNews';
import AminoAcid from './pages/AminoAcidTranslate';

const Router = BrowserRouter;

export default function App() {
  return (
    <AuthProvider>
      <Router /* basename ONLY if gh-pages repo subpath, e.g.: basename="/phorid.net" */>
        <Navbar />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<HomePage />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/taxonomy"
            element={
              <ProtectedRoute>
                <TaxonomyWorkbench />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="species" replace />} />
            <Route path="species" element={<SpeciesManager />} />
            <Route path="specimens" element={<TaxonomySection sectionKey="specimens" />} />
            <Route path="characters" element={<TaxonomySection sectionKey="characters" />} />
            <Route path="data-entry" element={<TaxonomySection sectionKey="data-entry" />} />
            <Route path="descriptions" element={<TaxonomySection sectionKey="descriptions" />} />
            <Route path="keys" element={<TaxonomySection sectionKey="keys" />} />
            <Route path="*" element={<Navigate to="/admin/taxonomy/species" replace />} />
          </Route>

          <Route
            path="/admin/morphometrics"
            element={
              <ProtectedRoute>
                <Morphometrics />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/literature"
            element={
              <ProtectedRoute>
                <Literature />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/amino-acid-translator"
            element={
              <ProtectedRoute>
                <AminoAcid />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/gbif-cache"
            element={
              <ProtectedRoute>
                <GbifCache />
              </ProtectedRoute>
            }
          />

          <Route path="/phoridae/newsletters" element={<PhoridNewsletters />} />
          <Route path="/phoridae/identification-keys" element={<IdentificationKeys />} />
          <Route path="/phoridae/photo-gallery" element={<PhotoGallery />} />
          <Route path="/phoridae/crisis" element={<Crisis />} />
          <Route path="/phoridae/about" element={<About />} />
          <Route path="/phoridae/people" element={<People />} />
          <Route path="/phoridae/gbif-viewer" element={<GbifViewer />} />
          <Route path="/phoridae/more-resources" element={<MoreResources />} />
        </Routes>
        <Footer />
      </Router>
    </AuthProvider>
  );
}
