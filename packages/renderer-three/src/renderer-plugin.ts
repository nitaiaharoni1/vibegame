import * as THREE from 'three';
import type { World, EntityId, VibePlugin } from '@vigame/core';
import {
  query,
  queryFirst,
  addEntity,
  addComponent,
  getComponent,
  hasComponent,
  Phase,
} from '@vigame/core';
import {
  Transform3D,
  Mesh3D,
  Camera3D,
  AmbientLight,
  DirectionalLight,
  CameraFollow,
} from './components.js';

// ---------------------------------------------------------------------------
// Internal state symbols / keys
// ---------------------------------------------------------------------------

const RENDERER_KEY = Symbol('three.renderer');
const SCENE_KEY = Symbol('three.scene');
const CAMERA_KEY = Symbol('three.camera');
const MESH_MAP_KEY = Symbol('three.meshMap');
const LIGHT_MAP_KEY = Symbol('three.lightMap');

type ThreeState = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  meshMap: Map<EntityId, THREE.Object3D>;
  lightMap: Map<EntityId, THREE.Light>;
};

function getState(world: World): ThreeState {
  const ext = world as unknown as Record<symbol, ThreeState | undefined>;
  const state = ext[RENDERER_KEY];
  if (!state) throw new Error('ThreeRendererPlugin not initialised on this world');
  return state;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ThreeRendererConfig {
  canvas?: HTMLCanvasElement;
  antialias?: boolean;
  shadows?: boolean;
  clearColor?: string;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function buildGeometry(shape: string, size: string): THREE.BufferGeometry {
  const parts = size
    .trim()
    .split(/\s+/)
    .map(Number)
    .map((n) => (isNaN(n) ? 1 : n));

  const get = (i: number, fallback = 1): number =>
    parts[i] !== undefined ? (parts[i] as number) : fallback;

  switch (shape) {
    case 'box':
      return new THREE.BoxGeometry(get(0, 1), get(1, 1), get(2, 1));
    case 'sphere':
      return new THREE.SphereGeometry(get(0, 1), 32, 16);
    case 'capsule':
      return new THREE.CapsuleGeometry(get(0, 0.5), get(1, 1), 8, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(get(0, 0.5), get(0, 0.5), get(1, 1), 32);
    case 'plane':
      return new THREE.PlaneGeometry(get(0, 1), get(1, 1));
    case 'cone':
      return new THREE.ConeGeometry(get(0, 0.5), get(1, 1), 32);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

// ---------------------------------------------------------------------------
// ThreeRenderSystem
// ---------------------------------------------------------------------------

function ThreeRenderSystem(state: ThreeState) {
  return {
    name: 'ThreeRenderSystem',
    phase: Phase.Render,
    execute(world: World, _delta: number): void {
      const { renderer, scene, camera, meshMap, lightMap } = state;

      // --- Sync meshes ---
      const meshEntities = query(world, [Transform3D, Mesh3D]);
      for (const eid of meshEntities) {
        const transform = getComponent(world, eid, Transform3D)!;
        const mesh3d = getComponent(world, eid, Mesh3D)!;

        let obj = meshMap.get(eid);
        if (!obj) {
          const geo = buildGeometry(mesh3d.shape, mesh3d.size);
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(mesh3d.color),
            wireframe: mesh3d.wireframe,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = mesh3d.castShadow;
          mesh.receiveShadow = mesh3d.receiveShadow;
          scene.add(mesh);
          meshMap.set(eid, mesh);
          obj = mesh;
        } else {
          // Update material color in case it changed
          const mesh = obj as THREE.Mesh;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.color.set(mesh3d.color);
            mat.wireframe = mesh3d.wireframe;
          }
        }

        obj.position.set(transform.px, transform.py, transform.pz);
        obj.rotation.set(
          THREE.MathUtils.degToRad(transform.rx),
          THREE.MathUtils.degToRad(transform.ry),
          THREE.MathUtils.degToRad(transform.rz),
        );
        obj.scale.set(transform.sx, transform.sy, transform.sz);
      }

      // Remove orphaned meshes
      for (const [eid, obj] of meshMap) {
        if (!world.entities.has(eid) || !hasComponent(world, eid, Mesh3D)) {
          scene.remove(obj);
          meshMap.delete(eid);
        }
      }

      // --- Sync ambient lights ---
      const ambientEntities = query(world, [AmbientLight]);
      for (const eid of ambientEntities) {
        const comp = getComponent(world, eid, AmbientLight)!;
        let light = lightMap.get(eid) as THREE.AmbientLight | undefined;
        if (!light || !(light instanceof THREE.AmbientLight)) {
          if (light) scene.remove(light);
          light = new THREE.AmbientLight(comp.color, comp.intensity);
          scene.add(light);
          lightMap.set(eid, light);
        } else {
          light.color.set(comp.color);
          light.intensity = comp.intensity;
        }
      }

      // --- Sync directional lights ---
      const dirLightEntities = query(world, [DirectionalLight]);
      for (const eid of dirLightEntities) {
        const comp = getComponent(world, eid, DirectionalLight)!;
        let light = lightMap.get(eid) as THREE.DirectionalLight | undefined;
        if (!light || !(light instanceof THREE.DirectionalLight)) {
          if (light) scene.remove(light);
          light = new THREE.DirectionalLight(comp.color, comp.intensity);
          light.castShadow = comp.castShadow;
          scene.add(light);
          lightMap.set(eid, light);
        } else {
          light.color.set(comp.color);
          light.intensity = comp.intensity;
          light.castShadow = comp.castShadow;
        }

        // Sync position from Transform3D if present
        if (hasComponent(world, eid, Transform3D)) {
          const t = getComponent(world, eid, Transform3D)!;
          light.position.set(t.px, t.py, t.pz);
        }
      }

      // Remove orphaned lights
      for (const [eid, light] of lightMap) {
        const isAmbient = world.entities.has(eid) && hasComponent(world, eid, AmbientLight);
        const isDir = world.entities.has(eid) && hasComponent(world, eid, DirectionalLight);
        if (!isAmbient && !isDir) {
          scene.remove(light);
          lightMap.delete(eid);
        }
      }

      // --- Camera sync ---
      const cameraEid = queryFirst(world, [Camera3D, Transform3D]);
      if (cameraEid !== undefined) {
        const cam3d = getComponent(world, cameraEid, Camera3D)!;
        const transform = getComponent(world, cameraEid, Transform3D)!;

        if (cam3d.active) {
          camera.fov = cam3d.fov;
          camera.near = cam3d.near;
          camera.far = cam3d.far;
          camera.updateProjectionMatrix();

          camera.position.set(transform.px, transform.py, transform.pz);
          camera.rotation.set(
            THREE.MathUtils.degToRad(transform.rx),
            THREE.MathUtils.degToRad(transform.ry),
            THREE.MathUtils.degToRad(transform.rz),
          );
        }
      }

      // --- CameraFollow ---
      const followEid = queryFirst(world, [CameraFollow]);
      if (followEid !== undefined) {
        const follow = getComponent(world, followEid, CameraFollow)!;
        // find target by name using queryName equivalent: scan names
        // We use the world component directly
        const nameStore = world.components.get('__name__');
        if (nameStore && follow.targetName) {
          for (const [tid, raw] of nameStore) {
            const r = raw as unknown as { name: string };
            if (r.name === follow.targetName && hasComponent(world, tid, Transform3D)) {
              const t = getComponent(world, tid, Transform3D)!;
              camera.position.set(
                t.px,
                t.py + follow.height,
                t.pz + follow.distance,
              );
              camera.lookAt(t.px, t.py, t.pz);
              break;
            }
          }
        }
      }

      // Resize renderer to match canvas
      const canvas = renderer.domElement;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
    },
  };
}

// ---------------------------------------------------------------------------
// VGX tag handlers
// ---------------------------------------------------------------------------

function parsePos(pos: string | undefined): [number, number, number] {
  if (!pos) return [0, 0, 0];
  const parts = pos.trim().split(/\s+/).map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function makeVgxTags(_world: World) {
  return {
    transform(w: World, eid: EntityId, attrs: Record<string, string>): void {
      const [px, py, pz] = parsePos(attrs['pos']);
      addComponent(w, eid, Transform3D, {
        px,
        py,
        pz,
        rx: attrs['rx'] !== undefined ? Number(attrs['rx']) : 0,
        ry: attrs['ry'] !== undefined ? Number(attrs['ry']) : 0,
        rz: attrs['rz'] !== undefined ? Number(attrs['rz']) : 0,
        sx: attrs['sx'] !== undefined ? Number(attrs['sx']) : 1,
        sy: attrs['sy'] !== undefined ? Number(attrs['sy']) : 1,
        sz: attrs['sz'] !== undefined ? Number(attrs['sz']) : 1,
      });
    },

    mesh(w: World, eid: EntityId, attrs: Record<string, string>): void {
      addComponent(w, eid, Mesh3D, {
        shape: (attrs['shape'] as ReturnType<typeof Mesh3D.defaults>['shape']) ?? 'box',
        color: attrs['color'] ?? '#ffffff',
        size: attrs['size'] ?? '1',
        wireframe: attrs['wireframe'] === 'true',
        castShadow: attrs['cast-shadow'] !== 'false',
        receiveShadow: attrs['receive-shadow'] !== 'false',
      });
    },

    camera(w: World, eid: EntityId, attrs: Record<string, string>): void {
      addComponent(w, eid, Camera3D, {
        fov: attrs['fov'] !== undefined ? Number(attrs['fov']) : 75,
        near: attrs['near'] !== undefined ? Number(attrs['near']) : 0.1,
        far: attrs['far'] !== undefined ? Number(attrs['far']) : 1000,
        active: attrs['active'] !== 'false',
      });
    },

    'ambient-light'(w: World, eid: EntityId, attrs: Record<string, string>): void {
      addComponent(w, eid, AmbientLight, {
        color: attrs['color'] ?? '#ffffff',
        intensity: attrs['intensity'] !== undefined ? Number(attrs['intensity']) : 0.5,
      });
    },

    'directional-light'(w: World, eid: EntityId, attrs: Record<string, string>): void {
      addComponent(w, eid, DirectionalLight, {
        color: attrs['color'] ?? '#ffffff',
        intensity: attrs['intensity'] !== undefined ? Number(attrs['intensity']) : 1.0,
        castShadow: attrs['cast-shadow'] !== 'false',
      });
    },

    'camera-follow'(w: World, eid: EntityId, attrs: Record<string, string>): void {
      addComponent(w, eid, CameraFollow, {
        targetName: attrs['target'] ?? '',
        distance: attrs['distance'] !== undefined ? Number(attrs['distance']) : 8,
        height: attrs['height'] !== undefined ? Number(attrs['height']) : 5,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// ThreeRendererPlugin
// ---------------------------------------------------------------------------

export function ThreeRendererPlugin(config?: ThreeRendererConfig): VibePlugin {
  let state: ThreeState;

  return {
    name: 'ThreeRendererPlugin',

    setup(world: World): void {
      const canvas = config?.canvas;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: config?.antialias ?? true,
      });

      if (canvas) {
        renderer.setSize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, false);
      } else {
        renderer.setSize(800, 600);
      }

      renderer.shadowMap.enabled = config?.shadows ?? false;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      if (config?.clearColor) {
        renderer.setClearColor(new THREE.Color(config.clearColor));
      }

      const scene = new THREE.Scene();
      const aspect = canvas
        ? (canvas.clientWidth || canvas.width) / (canvas.clientHeight || canvas.height)
        : 800 / 600;
      const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      const meshMap = new Map<EntityId, THREE.Object3D>();
      const lightMap = new Map<EntityId, THREE.Light>();

      state = { renderer, scene, camera, meshMap, lightMap };

      // Store state on world
      (world as unknown as Record<symbol, ThreeState>)[RENDERER_KEY] = state;

      // Register component defs
      world.componentDefs.set(Transform3D.name, Transform3D as import('@vigame/core').ComponentDef);
      world.componentDefs.set(Mesh3D.name, Mesh3D as import('@vigame/core').ComponentDef);
      world.componentDefs.set(Camera3D.name, Camera3D as import('@vigame/core').ComponentDef);
      world.componentDefs.set(CameraFollow.name, CameraFollow as import('@vigame/core').ComponentDef);
      world.componentDefs.set(AmbientLight.name, AmbientLight as import('@vigame/core').ComponentDef);
      world.componentDefs.set(DirectionalLight.name, DirectionalLight as import('@vigame/core').ComponentDef);
    },

    systems(_world: World) {
      return [ThreeRenderSystem(state)];
    },

    vgxTags() {
      return makeVgxTags({} as World);
    },
  };
}

export { getState as getThreeState };
