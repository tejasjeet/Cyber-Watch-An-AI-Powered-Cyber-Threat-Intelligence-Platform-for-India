import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/** Unknown paths: signed-in users go home; others go to sign-in. */
export default function NavigateCatchAll() {
  const { user, loading } = useAuth();
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
        <div className="cw-intel-splash" role="status" aria-live="polite" aria-label="Loading">
          <div className="cw-intel-splash-ring" aria-hidden />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/" replace />;
}
