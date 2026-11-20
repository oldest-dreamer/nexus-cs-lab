import { useCallback, useEffect, useState } from 'react';
import { LAB_IDS, type LabId } from '../data/types';

/**
 * Tiny dependency-free hash router.
 *   #/                         → dashboard
 *   #/track/:trackId           → track overview
 *   #/track/:trackId/:lessonId → lesson
 *   #/lab/:labId               → standalone lab
 * Hash routing works on any static host (GitHub Pages, AI Studio, Netlify) with no rewrites.
 */
export type Route =
  | { name: 'home' }
  | { name: 'track'; trackId: string }
  | { name: 'lesson'; trackId: string; lessonId: string }
  | { name: 'lab'; labId: LabId };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'track' && parts[1] && parts[2]) return { name: 'lesson', trackId: parts[1], lessonId: parts[2] };
  if (parts[0] === 'track' && parts[1]) return { name: 'track', trackId: parts[1] };
  if (parts[0] === 'lab' && (LAB_IDS as readonly string[]).includes(parts[1])) return { name: 'lab', labId: parts[1] as LabId };
  return { name: 'home' };
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'track':
      return `#/track/${encodeURIComponent(r.trackId)}`;
    case 'lesson':
      return `#/track/${encodeURIComponent(r.trackId)}/${encodeURIComponent(r.lessonId)}`;
    case 'lab':
      return `#/lab/${r.labId}`;
  }
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      document.getElementById('nexus-main')?.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = routeToHash(r);
  }, []);

  return { route, navigate };
}
