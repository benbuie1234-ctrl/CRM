import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Project } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

export default function SharePage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<{ project: Project; client: { name: string } } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api
      .getShared(slug)
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-slate-400">This link isn't valid or the project was removed.</p>
      </div>
    );
  }

  if (!data) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  const { project, client } = data;

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="mb-1 text-sm text-slate-400">{client.name}</p>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-100">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>

        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          {project.instructions && (
            <div>
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Instructions</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-300">{project.instructions}</p>
            </div>
          )}

          {project.footage_link && (
            <div>
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Footage</h2>
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
            <div className="rounded-lg bg-emerald-500/10 p-4">
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-400">Final Export</h2>
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
            <p className="text-sm text-slate-400">The final export hasn't been posted yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
