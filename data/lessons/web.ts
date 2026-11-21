import type { Track } from '../types';
import { howTheWebWorksModule } from './web/m1-how-the-web-works';
import { renderingCssModule } from './web/m2-rendering-css';
import { jsEngineModule } from './web/m3-js-engine';
import { typescriptModule } from './web/m4-typescript';
import { reactModule } from './web/m5-react';
import { backendApisModule } from './web/m6-backend-apis';
import { authSecurityModule } from './web/m7-auth-security';
import { postgresModule } from './web/m8-postgres';
import { deliveryModule } from './web/m9-delivery';
import { testingSystemsModule } from './web/m10-testing-systems';

/**
 * Web Development — a complete zero-to-senior full-stack curriculum.
 * Each module lives in its own file under ./web/ so chapters are easy to extend.
 * Every chapter is fully authored (no locked/"coming soon" placeholders).
 *
 *  1. How the Web Works Under the Hood
 *  2. Browser Rendering & Modern CSS Layout
 *  3. JavaScript Engine Internals
 *  4. TypeScript for Production Systems
 *  5. Modern React 19 Architecture & Performance
 *  6. Backend APIs & Real-Time Protocols
 *  7. Authentication, Sessions & Multi-Tenant Security
 *  8. PostgreSQL & Database Performance
 *  9. Caching, Build Tooling & Deployment
 * 10. Testing & Web System Design
 */
export const webTrack: Track = {
  id: 'web',
  title: 'Web Development',
  short: 'Web',
  tagline: 'From DNS and the pixel pipeline to React 19, secure APIs, PostgreSQL, caching, CI/CD and system design.',
  accent: 'cyan',
  icon: 'globe',
  modules: [
    howTheWebWorksModule,
    renderingCssModule,
    jsEngineModule,
    typescriptModule,
    reactModule,
    backendApisModule,
    authSecurityModule,
    postgresModule,
    deliveryModule,
    testingSystemsModule,
  ],
};
