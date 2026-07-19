import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function Header() {
  async function handleLogout() {
    await api.logout();
    window.location.href = "/";
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between px-6 py-3">
        <Link to="/" className="text-sm font-semibold tracking-wide text-slate-100">
          🎬 Editor CRM
        </Link>
        <button onClick={handleLogout} className="text-xs font-medium text-slate-400 hover:text-slate-200">
          Log out
        </button>
      </div>
    </header>
  );
}
