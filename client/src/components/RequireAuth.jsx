import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/** Blocks dashboard until session is restored or user is redirected to sign-in. */
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="cw-shell"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          gridTemplateColumns: "1fr",
          background: "#05080f",
        }}
      >
        <div className="cw-intel-splash" role="status" aria-live="polite" aria-label="Loading session">
          <div className="cw-intel-splash-ring" aria-hidden />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
