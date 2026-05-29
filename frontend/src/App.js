import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
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
