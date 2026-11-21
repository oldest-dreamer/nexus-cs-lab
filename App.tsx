import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { TrackView } from './components/TrackView';
import { LessonView } from './components/LessonView';
import { AuthModal } from './components/AuthModal';
import { Toasts } from './components/Toasts';
import { LabHost } from './labs';
import { LABS, locateLesson, trackById } from './data/tracks';
import { useHashRoute, type Route } from './hooks/useHashRoute';

const SIDEBAR_KEY = 'nexus-cs-labs:sidebar-collapsed';

export default function App() {
  const { route, navigate } = useHashRoute();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    document.title = titleFor(route);
  }, [route]);

  return (
    <div className="flex h-full overflow-hidden bg-obsidian">
      <Sidebar
        route={route}
        navigate={navigate}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMobileOpen(true)} onOpenAuth={() => setAuthOpen(true)} />
        <main id="nexus-main" className="flex-1 overflow-y-auto">
          <Page route={route} navigate={navigate} />
        </main>
      </div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      <Toasts />
    </div>
  );
}

function Page({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  switch (route.name) {
    case 'home':
      return <Dashboard navigate={navigate} />;
    case 'track': {
      const track = trackById(route.trackId);
      return track ? <TrackView track={track} navigate={navigate} /> : <NotFound navigate={navigate} />;
    }
    case 'lesson': {
      const loc = locateLesson(route.trackId, route.lessonId);
      return loc ? <LessonView key={loc.lesson.id} loc={loc} navigate={navigate} /> : <NotFound navigate={navigate} />;
    }
    case 'lab': {
      const meta = LABS.find((l) => l.id === route.labId)!;
      return (
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-8">
          <button className="flex items-center gap-1 text-sm text-mute hover:text-ink" onClick={() => navigate({ name: 'home' })}>
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </button>
          <h1 className="text-3xl font-extrabold text-white">{meta.title}</h1>
          <p className="text-slate-400">{meta.blurb}</p>
          <LabHost id={route.labId} />
        </div>
      );
    }
  }
}

function NotFound({ navigate }: { navigate: (r: Route) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="font-mono text-6xl font-bold text-nx-crimson">404</div>
      <p className="text-slate-400">Segmentation fault: that chapter doesn't exist (yet).</p>
      <button className="nx-btn-primary" onClick={() => navigate({ name: 'home' })}>Back to dashboard</button>
    </div>
  );
}

function titleFor(route: Route): string {
  const base = 'NEXUS CS LABS';
  if (route.name === 'lesson') {
    const loc = locateLesson(route.trackId, route.lessonId);
    return loc ? `${loc.lesson.title} · ${base}` : base;
  }
  if (route.name === 'track') return `${trackById(route.trackId)?.title ?? 'Track'} · ${base}`;
  if (route.name === 'lab') return `${LABS.find((l) => l.id === route.labId)?.title} · ${base}`;
  return base;
}
