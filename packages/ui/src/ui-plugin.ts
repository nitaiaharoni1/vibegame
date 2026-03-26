import type { VibePlugin, World } from '@vigame/core';
import { defineSystem, query, getComponent } from '@vigame/core';
import { HealthBar, ScoreDisplay } from './components.js';
import { UIPanel, removeOverlay } from './overlay.js';

export function UIPlugin(): VibePlugin {
  const panels = new Map<string, UIPanel>();

  return {
    name: 'UIPlugin',
    setup(_world: World) {},

    systems(_world: World) {
      return [
        defineSystem({
          name: 'UISync',
          phase: 3, // Render — after all game logic
          execute(world: World, _delta: number) {
            if (typeof document === 'undefined') return;

            // Render HealthBars
            const healthBarEntities = query(world, [HealthBar]);
            for (const eid of healthBarEntities) {
              const hb = getComponent(world, eid, HealthBar)!;
              const panelId = `vigame-healthbar-${eid}`;

              // Find the tracked entity's Health component
              let current = 100;
              let max = 100;
              if (hb.entityName) {
                const store = (world.components as Map<string, Map<number, Record<string, unknown>>>).get('Health');
                if (store) {
                  for (const [, data] of store) {
                    current = (data['current'] as number) ?? 100;
                    max = (data['max'] as number) ?? 100;
                    break; // just take the first match for simplicity
                  }
                }
              }

              const pct = max > 0 ? (current / max) * 100 : 0;
              let panel = panels.get(panelId);
              if (!panel) {
                panel = new UIPanel(panelId, `position:absolute;left:${hb.x}px;top:${hb.y}px;width:${hb.width}px;height:${hb.height}px;`);
                panels.set(panelId, panel);
              }
              panel.setHTML(`<div style="width:100%;height:100%;background:${hb.backgroundColor};border-radius:3px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${hb.color};transition:width 0.1s;"></div></div>`);
            }

            // Render ScoreDisplays
            const scoreDisplayEntities = query(world, [ScoreDisplay]);
            for (const eid of scoreDisplayEntities) {
              const sd = getComponent(world, eid, ScoreDisplay)!;
              const panelId = `vigame-score-${eid}`;

              let scoreValue = 0;
              const store = (world.components as Map<string, Map<number, Record<string, unknown>>>).get('Score');
              if (store) {
                for (const [, data] of store) {
                  scoreValue = (data['value'] as number) ?? 0;
                  break;
                }
              }

              let panel = panels.get(panelId);
              if (!panel) {
                panel = new UIPanel(panelId, `position:absolute;left:${sd.x}px;top:${sd.y}px;font-size:${sd.fontSize}px;color:${sd.color};font-family:monospace;text-shadow:1px 1px 2px #000;`);
                panels.set(panelId, panel);
              }
              panel.setHTML(`${sd.prefix}${scoreValue}`);
            }
          },
        }),
      ];
    },

    teardown(_world: World) {
      for (const panel of panels.values()) panel.remove();
      panels.clear();
      removeOverlay();
    },
  };
}
