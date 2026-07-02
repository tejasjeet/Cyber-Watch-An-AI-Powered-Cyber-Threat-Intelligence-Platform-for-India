import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useData } from "../context/DataContext.jsx";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";

/** First-load splash: spinner until intel feed is ready, then routes. */
export default function Shell() {
  const { loading } = useData();
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const contentRef = useRef(null);

  useEffect(() => {
    if (!loading) {
      const id = window.setTimeout(() => setReady(true), 700);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [loading]);

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (contentRef.current) contentRef.current.scrollTop = 0;
    };
    resetScroll();
    requestAnimationFrame(resetScroll);
  }, [location.pathname]);

  return (
    <div className="cw-shell">
      <Sidebar />
      <div className="cw-main">
        <TopBar />
        <div ref={contentRef} className="cw-content cw-content-main">
          {!ready ? (
            <div className="cw-intel-splash" role="status" aria-live="polite" aria-label="Loading">
              <div className="cw-intel-splash-ring" aria-hidden />
            </div>
          ) : (
            <div key={location.pathname} className="cw-route-enter">
              <Outlet />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
