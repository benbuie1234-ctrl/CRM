import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, PortalProject } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

export default function ClientPortal() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<{ client: { name: string }; projects: PortalProject[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api
      .getClientPortal(slug)
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-slate-400">This link isn't valid.</p>
      </div>
    );
  }

  if (!data) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  const { client, projects } = data;

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="mb-1 text-sm text-slate-400">Project hub for</p>
        <h1 className="mb-8 text-2xl font-semibold text-slate-100">{client.name}</h1>

        {projects.length === 0 ? (
          <p className="text-sm text-slate-400">No projects yet.</p>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project.id} className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-100">{project.name}</h2>
                  <StatusBadge status={project.status} />
                </div>

                <div className="space-y-3">
                  {project.instructions && (
                    <div>
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                        Instructions
                      </h3>
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{project.instructions}</p>
                    </div>
                  )}

                  {project.footage_link && (
                    <div>
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                        Footage
                      </h3>
                      <a
                        href={project.footage_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-400 hover:text-brand-300"
                      >
                        Open footage link ↗
                      </a>
                    </div>
                  )}

                  {project.export_link ? (
                    <div className="rounded-lg bg-emerald-500/10 p-3">
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-400">
                        Final Export
                      </h3>
                      <a
                        href={project.export_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
                      >
                        Watch / Download Final Video ↗
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">The final export hasn't been posted yet.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
