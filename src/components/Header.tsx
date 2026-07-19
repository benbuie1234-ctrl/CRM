import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";

export default function Header() {
  const location = useLocation();

  async function handleLogout() {
    await api.logout();
    window.location.href = "/";
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm font-semibold tracking-wide text-slate-100">
            🎬 Editor CRM
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/"
              className={location.pathname === "/" ? "text-slate-100" : "text-slate-400 hover:text-slate-200"}
            >
              Clients
            </Link>
            <Link
              to="/calendar"
              className={
                location.pathname === "/calendar" ? "text-slate-100" : "text-slate-400 hover:text-slate-200"
              }
            >
              Calendar
            </Link>
          </nav>
        </div>
        <button onClick={handleLogout} className="text-xs font-medium text-slate-400 hover:text-slate-200">
          Log out
        </button>
      </div>
    </header>
  );
}
