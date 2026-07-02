import { Routes, Route } from "react-router-dom";
import { DataProvider } from "./context/DataContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import NavigateCatchAll from "./components/NavigateCatchAll.jsx";
import Shell from "./layout/Shell.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import LiveFeed from "./pages/LiveFeed.jsx";
import MapView from "./pages/MapView.jsx";
import Attacks from "./pages/Attacks.jsx";
import Groups from "./pages/Groups.jsx";
import DeploymentAnalysis from "./pages/DeploymentAnalysis.jsx";
import Victims from "./pages/Victims.jsx";
import Leaks from "./pages/Leaks.jsx";
import BreachAnalysis from "./pages/BreachAnalysis.jsx";
import Reports from "./pages/Reports.jsx";
import Profile from "./pages/Profile.jsx";
import Settings from "./pages/Settings.jsx";
import VictimAnalysis from "./pages/VictimAnalysis.jsx";
import PhishingScanner from "./pages/PhishingScanner.jsx";
import CyberCrimeReporting from "./pages/CyberCrimeReporting.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DataProvider>
                <Shell />
              </DataProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="live" element={<LiveFeed />} />
          <Route path="map" element={<MapView />} />
          <Route path="attacks" element={<Attacks />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/deploy/:groupEnc" element={<DeploymentAnalysis />} />
          <Route path="victims" element={<Victims />} />
          <Route path="analysis/:victimId" element={<VictimAnalysis />} />
          <Route path="leaks" element={<Leaks />} />
          <Route path="leaks/breach/:victimId" element={<BreachAnalysis />} />
          <Route path="reports" element={<Reports />} />
          <Route path="phishing-scanner" element={<PhishingScanner />} />
          <Route path="crime-reporting" element={<CyberCrimeReporting />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NavigateCatchAll />} />
      </Routes>
    </AuthProvider>
  );
}
