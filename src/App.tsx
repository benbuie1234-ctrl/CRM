import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import ClientDetail from "./pages/ClientDetail";
import ProjectDetail from "./pages/ProjectDetail";
import SharePage from "./pages/SharePage";
import ClientPortal from "./pages/ClientPortal";
import Login from "./pages/Login";
import Header from "./components/Header";
import AiChatPanel from "./components/AiChatPanel";
import { api, UnauthorizedError } from "./lib/api";

function useAuth() {
  const [status, setStatus] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    api
      .listClients()
      .then(() => setStatus("in"))
      .catch((e) => setStatus(e instanceof UnauthorizedError ? "out" : "in"));
  }, []);

  return { status, setStatus };
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, setStatus } = useAuth();

  if (status === "checking") {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }
  if (status === "out") {
    return <Login onSuccess={() => setStatus("in")} />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/share/:slug" element={<SharePage />} />
      <Route path="/portal/:slug" element={<ClientPortal />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <div className="flex">
              <div className="min-w-0 flex-1">
                <Header />
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/clients/:clientId" element={<ClientDetail />} />
                  <Route path="/clients/:clientId/projects/:projectId" element={<ProjectDetail />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
              <AiChatPanel />
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
