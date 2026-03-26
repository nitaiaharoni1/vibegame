import Phaser from 'phaser';
import type { VibePlugin, World, EntityId } from '@vigame/core';
import { defineSystem, query, getComponent, addComponent, queryName } from '@vigame/core';
import { Transform2D, Sprite2D, Camera2D, ArcadeBody2D, Text2D } from './components.js';

export interface PhaserRendererOptions {
  canvas?: HTMLCanvasElement;
  width?: number;
  height?: number;
  backgroundColor?: string;
  pixelArt?: boolean;
  physics?: boolean; // enable arcade physics
}

interface PhaserState {
  game: Phaser.Game;
  scene: Phaser.Scene;
  gameObjects: Map<EntityId, Phaser.GameObjects.GameObject>;
  initialized: boolean;
}

const phaserStateMap = new WeakMap<World, PhaserState>();

export function getPhaserState(world: World): PhaserState {
  const state = phaserStateMap.get(world);
  if (!state) throw new Error('[vigame] PhaserRenderer not initialized');
  return state;
}

export function PhaserRendererPlugin(options: PhaserRendererOptions = {}): VibePlugin {
  const width = options.width ?? 800;
  const height = options.height ?? 600;

  return {
    name: 'PhaserRendererPlugin',
    setup(world: World) {
      // Phaser is browser-only
      if (typeof window === 'undefined') return;

      // We use a deferred approach: Phaser creates the scene asynchronously
      // Store a placeholder state
      const state: PhaserState = {
        game: null as unknown as Phaser.Game,
        scene: null as unknown as Phaser.Scene,
        gameObjects: new Map(),
        initialized: false,
      };
      phaserStateMap.set(world, state);

      const vigameScene = {
        key: 'VigameScene',
        create(this: Phaser.Scene) {
          state.scene = this;
          state.initialized = true;
          if (options.physics) {
            this.physics.world.gravity.y = 300;
          }
        },
        update(_time: number, _delta: number) {
          // Systems handle updates via ECS
        },
      };

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width,
        height,
        backgroundColor: options.backgroundColor ?? '#1a1a2e',
        ...(options.canvas !== undefined ? { canvas: options.canvas } : {}),
        scene: vigameScene,
        pixelArt: options.pixelArt ?? false,
        ...(options.physics ? {
          physics: {
            default: 'arcade',
            arcade: { gravity: { x: 0, y: 300 }, debug: false },
          },
        } : {}),
      };

      state.game = new Phaser.Game(config);
    },

    systems(_world: World) {
      return [
        defineSystem({
          name: 'PhaserSceneSync',
          phase: 3, // Render
          execute(world: World, _delta: number) {
            const state = phaserStateMap.get(world);
            if (!state?.initialized) return;
            const scene = state.scene;

            // Sync Sprite2D entities
            const spriteEntities = query(world, [Transform2D, Sprite2D]);
            for (const eid of spriteEntities) {
              const t = getComponent(world, eid, Transform2D)!;
              const s = getComponent(world, eid, Sprite2D)!;

              let go = state.gameObjects.get(eid) as Phaser.GameObjects.Sprite | undefined;
              if (!go) {
                go = scene.add.sprite(t.x, t.y, s.texture, s.frame || undefined);
                state.gameObjects.set(eid, go);
              }

              go.setPosition(t.x, t.y);
              go.setRotation(t.rotation);
              go.setScale(t.scaleX, t.scaleY);
              go.setTint(s.tint);
              go.setAlpha(s.alpha);
              go.setVisible(s.visible);
              go.setDepth(s.depth);
              go.setFlip(s.flipX, s.flipY);
            }

            // Sync Text2D entities
            const textEntities = query(world, [Transform2D, Text2D]);
            for (const eid of textEntities) {
              const t = getComponent(world, eid, Transform2D)!;
              const txt = getComponent(world, eid, Text2D)!;

              let go = state.gameObjects.get(eid) as Phaser.GameObjects.Text | undefined;
              if (!go) {
                go = scene.add.text(t.x, t.y, txt.text, {
                  fontSize: `${txt.fontSize}px`,
                  color: txt.color,
                });
                state.gameObjects.set(eid, go);
              }

              go.setPosition(t.x, t.y);
              go.setText(txt.text);
              go.setDepth(txt.depth);
            }

            // Remove orphaned game objects — entity no longer has Sprite2D or Text2D
            const spriteSet = new Set(spriteEntities);
            const textSet = new Set(textEntities);
            for (const [eid, go] of state.gameObjects) {
              if (!spriteSet.has(eid) && !textSet.has(eid)) {
                go.destroy();
                state.gameObjects.delete(eid);
              }
            }

            // Camera follow
            const cameraEntities = query(world, [Camera2D]);
            for (const eid of cameraEntities) {
              const cam = getComponent(world, eid, Camera2D)!;
              if (!cam.active) continue;
              scene.cameras.main.setZoom(cam.zoom);
              if (cam.followTarget) {
                const tid = queryName(world, cam.followTarget);
                if (tid !== undefined) {
                  const go = state.gameObjects.get(tid);
                  if (go instanceof Phaser.GameObjects.Sprite) {
                    scene.cameras.main.startFollow(go, true, cam.lerpX, cam.lerpY);
                  }
                }
              }
            }
          },
        }),
      ];
    },

    teardown(world: World) {
      const state = phaserStateMap.get(world);
      if (state?.initialized) {
        for (const go of state.gameObjects.values()) go.destroy();
        state.gameObjects.clear();
        state.game.destroy(true);
      }
      phaserStateMap.delete(world);
    },

    vgxTags() {
      return {
        position(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Transform2D, {
            x: Number(attrs['x'] ?? '0') || 0,
            y: Number(attrs['y'] ?? '0') || 0,
          });
        },
        sprite(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Sprite2D, {
            texture: attrs['texture'] ?? 'default',
            frame: attrs['frame'] ?? '',
            tint: attrs['tint'] ? parseInt(attrs['tint'].replace('#', ''), 16) : 0xffffff,
          });
        },
        text(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Text2D, {
            text: attrs['content'] ?? attrs['text'] ?? '',
            fontSize: Number(attrs['font-size'] ?? '16') || 16,
            color: attrs['color'] ?? '#ffffff',
          });
        },
        'camera-2d'(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, Camera2D, {
            zoom: Number(attrs['zoom'] ?? '1') || 1,
            active: attrs['active'] !== 'false',
            followTarget: attrs['follow'] ?? '',
          });
        },
        'arcade-body'(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, ArcadeBody2D, {
            isStatic: attrs['static'] === 'true',
            gravityY: Number(attrs['gravity-y'] ?? '300') || 300,
            velocityX: Number(attrs['velocity-x'] ?? '0') || 0,
            velocityY: Number(attrs['velocity-y'] ?? '0') || 0,
            collideWorldBounds: attrs['collide-world-bounds'] === 'true',
          });
        },
      };
    },
  };

}
