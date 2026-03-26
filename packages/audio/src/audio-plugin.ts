import type { VibePlugin, World, EntityId } from '@vigame/core';
import { addComponent } from '@vigame/core';
import { AudioSource, AudioListener } from './components.js';

// Store AudioContext per world
const audioContextMap = new WeakMap<World, AudioContext>();
const bufferCache = new Map<string, AudioBuffer>();
const activeNodes = new WeakMap<World, Map<EntityId, AudioBufferSourceNode>>();

export function getAudioContext(world: World): AudioContext | undefined {
  return audioContextMap.get(world);
}

export function AudioPlugin(): VibePlugin {
  return {
    name: 'AudioPlugin',
    setup(world: World) {
      // AudioContext is browser-only; skip in Node
      if (typeof AudioContext !== 'undefined') {
        audioContextMap.set(world, new AudioContext());
        activeNodes.set(world, new Map());
      }
    },
    systems(_world: World) {
      return []; // Audio is event-driven, not tick-based
    },
    teardown(world: World) {
      const ctx = audioContextMap.get(world);
      if (ctx) {
        void ctx.close();
        audioContextMap.delete(world);
      }
    },
    vgxTags() {
      return {
        'audio-source'(world: World, eid: EntityId, attrs: Record<string, string>) {
          addComponent(world, eid, AudioSource, {
            src: attrs['src'] ?? '',
            volume: Number(attrs['volume'] ?? '1') || 1,
            loop: attrs['loop'] === 'true',
            autoPlay: attrs['auto-play'] === 'true',
            spatial: attrs['spatial'] === 'true',
          });
        },
        'audio-listener'(world: World, eid: EntityId, _attrs: Record<string, string>) {
          addComponent(world, eid, AudioListener, {});
        },
      };
    },
  };
}

export async function playSound(world: World, src: string, options?: { volume?: number; loop?: boolean }): Promise<void> {
  const ctx = audioContextMap.get(world);
  if (!ctx) return; // browser-only; graceful in Node

  let buffer = bufferCache.get(src);
  if (!buffer) {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    buffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCache.set(src, buffer);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = options?.loop ?? false;

  const gainNode = ctx.createGain();
  gainNode.gain.value = options?.volume ?? 1;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();
}

export function resumeAudio(world: World): void {
  const ctx = audioContextMap.get(world);
  if (ctx?.state === 'suspended') void ctx.resume();
}
