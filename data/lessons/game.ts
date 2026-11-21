import type { Track } from '../types';
import { gameLoopModule } from './game/m1-game-loop';
import { mathModule } from './game/m2-math';
import { ecsModule } from './game/m3-ecs';
import { physicsModule } from './game/m4-physics';
import { aiModule } from './game/m5-ai';
import { graphicsModule } from './game/m6-graphics';
import { feelModule } from './game/m7-feel';
import { architectureModule } from './game/m8-architecture';
import { netcodeModule } from './game/m9-netcode';

/**
 * Game Development — a complete zero-to-engine-architect curriculum.
 * Each module lives in its own file under ./game/ so chapters are easy to extend.
 * Every chapter is fully authored (no locked/"coming soon" placeholders).
 * Legacy lesson IDs (game-fixed-timestep, game-astar) are preserved so saved XP survives.
 *
 *  1. The Game Loop & Fixed Timestep
 *  2. Game Mathematics: Vectors, Matrices & Quaternions
 *  3. Entity Component System & Data-Oriented Design
 *  4. Physics & Collision Detection
 *  5. Pathfinding & Game AI
 *  6. Graphics & the GPU Pipeline (WebGPU + WGSL)
 *  7. Input, Camera & Game Feel
 *  8. Scenes, Memory & Persistence
 *  9. Multiplayer Netcode
 */
export const gameTrack: Track = {
  id: 'game',
  title: 'Game Development',
  short: 'Game',
  tagline: 'Engine loops, game math, ECS, physics, A* & behavior trees, WebGPU shaders, game feel and rollback netcode.',
  accent: 'crimson',
  icon: 'gamepad',
  modules: [
    gameLoopModule,
    mathModule,
    ecsModule,
    physicsModule,
    aiModule,
    graphicsModule,
    feelModule,
    architectureModule,
    netcodeModule,
  ],
};
