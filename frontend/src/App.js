// App.jsx / App.js
import React from 'react';
import {
  BrowserRouter,
  HashRouter,
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
import People from './pages/People'


// Use hash on GitHub Pages; browser locally
const Router =
  process.env.NODE_ENV === 'production' ? HashRouter : BrowserRouter;

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
          <Route path="/phoridae/newsletters" element={<PhoridNewsletters />} />
          <Route path="/phoridae/identificationKeys" element={<IdentificationKeys />} />
            <Route path="/phoridae/morphometrics" element={
              <ProtectedRoute>
                <Morphometrics />
              </ProtectedRoute>
            } />
          <Route path="/phoridae/photoGallery" element={<PhotoGallery />} />
          <Route path="/phoridae/crisis" element={<Crisis />} />
          <Route path="/phoridae/about" element={<About />} />
          <Route path="/phoridae/people" element={<People />} />



          {/* (Optional) catch-all to a NotFound page */}
          {/* <Route path="*" element={<NotFound />} /> */}
        </Routes>
        <Footer />
      </Router>
    </AuthProvider>
  );
}
