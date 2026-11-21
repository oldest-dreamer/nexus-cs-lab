import type { Track } from '../types';
import { platformModule } from './app/m1-platform';
import { uiNavigationModule } from './app/m2-ui-navigation';
import { stateModule } from './app/m3-state';
import { persistenceModule } from './app/m4-persistence';
import { offlineSyncModule } from './app/m5-offline-sync';
import { networkingModule } from './app/m6-networking';
import { securityModule } from './app/m7-security';
import { nativePushModule } from './app/m8-native-push';
import { performanceShippingModule } from './app/m9-performance-shipping';

/**
 * App Development — a complete zero-to-production mobile engineering curriculum.
 * Each module lives in its own file under ./app/ so chapters are easy to extend.
 * Every chapter is fully authored (no locked/"coming soon" placeholders).
 *
 * 1. Mobile OS Lifecycle & Rendering Engines
 * 2. Mobile UI, Navigation & Gesture Ergonomics
 * 3. Mobile State Architecture
 * 4. On-Device Persistence & Embedded Databases
 * 5. Offline-First Sync Engines & Conflict Resolution
 * 6. Resilient Mobile Networking
 * 7. Mobile Security & On-Device Auth
 * 8. Native Hardware, Push & Deep Linking
 * 9. 60/120fps Profiling & Store Shipping
 */
export const appTrack: Track = {
  id: 'app',
  title: 'App Development',
  short: 'App',
  tagline: 'Mobile lifecycles, native-thread gestures, SQLite, offline-first sync, secure storage, push and shipping to the stores.',
  accent: 'amber',
  icon: 'smartphone',
  modules: [
    platformModule,
    uiNavigationModule,
    stateModule,
    persistenceModule,
    offlineSyncModule,
    networkingModule,
    securityModule,
    nativePushModule,
    performanceShippingModule,
  ],
};
