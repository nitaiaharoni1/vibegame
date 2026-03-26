import RAPIER from '@dimforge/rapier3d-compat';
import type { World, EntityId, VibePlugin } from '@vigame/core';
import { defineSystem, query, getComponent, hasComponent, Phase } from '@vigame/core';
import { RigidBody, Collider } from './components.js';

export interface PhysicsState {
  physicsWorld: RAPIER.World;
  bodies: Map<EntityId, RAPIER.RigidBody>;
  colliders: Map<EntityId, RAPIER.Collider>;
  gravity: [number, number, number];
}

const physicsStateMap = new WeakMap<World, PhysicsState>();

export function getPhysicsState(world: World): PhysicsState | undefined {
  return physicsStateMap.get(world);
}

function getTransformData(
  world: World,
  eid: EntityId
): { px: number; py: number; pz: number; rx: number; ry: number; rz: number } | undefined {
  const store = world.components.get('Transform3D');
  if (!store?.has(eid)) return undefined;
  const data = store.get(eid)!;
  return {
    px: (data['px'] as number) ?? 0,
    py: (data['py'] as number) ?? 0,
    pz: (data['pz'] as number) ?? 0,
    rx: (data['rx'] as number) ?? 0,
    ry: (data['ry'] as number) ?? 0,
    rz: (data['rz'] as number) ?? 0,
  };
}

function setTransformData(
  world: World,
  eid: EntityId,
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number
): void {
  const store = world.components.get('Transform3D');
  if (!store?.has(eid)) return;
  const data = store.get(eid)!;
  data['px'] = px;
  data['py'] = py;
  data['pz'] = pz;
  data['rx'] = rx;
  data['ry'] = ry;
  data['rz'] = rz;
}

export interface PhysicsPluginOptions {
  gravity?: [number, number, number];
  timestep?: number;
}

export async function createPhysicsPlugin(options: PhysicsPluginOptions = {}): Promise<VibePlugin> {
  await RAPIER.init();

  const gravity = options.gravity ?? [0, -9.81, 0];
  const timestep = options.timestep ?? 1 / 60;
  let accumulator = 0;

  return {
    name: 'PhysicsPlugin',
    setup(world: World) {
      const physicsWorld = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
      physicsStateMap.set(world, {
        physicsWorld,
        bodies: new Map(),
        colliders: new Map(),
        gravity,
      });
    },
    systems(world: World) {
      return [
        defineSystem({
          name: 'PhysicsSync',
          phase: Phase.PreUpdate,
          execute(w, _delta) {
            const state = physicsStateMap.get(w);
            if (!state) return;

            const rigidBodyEntities = query(w, [RigidBody]);
            for (const eid of rigidBodyEntities) {
              if (state.bodies.has(eid)) continue;

              const rbData = getComponent(w, eid, RigidBody)!;
              const transform = getTransformData(w, eid);

              let bodyDesc: RAPIER.RigidBodyDesc;
              switch (rbData.type) {
                case 'static':
                  bodyDesc = RAPIER.RigidBodyDesc.fixed();
                  break;
                case 'kinematic-position':
                  bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
                  break;
                case 'kinematic-velocity':
                  bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased();
                  break;
                default:
                  bodyDesc = RAPIER.RigidBodyDesc.dynamic();
              }

              if (transform) {
                bodyDesc.setTranslation(transform.px, transform.py, transform.pz);
              }

              bodyDesc.setLinearDamping(rbData.linearDamping);
              bodyDesc.setAngularDamping(rbData.angularDamping);
              bodyDesc.setGravityScale(rbData.gravityScale);

              // Apply per-axis rotation locks. lockRotations() is an all-or-nothing shorthand;
              // use enabledRotations() whenever any (but not necessarily all) axes are locked.
              if (rbData.lockRotationX || rbData.lockRotationY || rbData.lockRotationZ) {
                if (rbData.lockRotationX && rbData.lockRotationY && rbData.lockRotationZ) {
                  bodyDesc.lockRotations();
                } else {
                  bodyDesc.enabledRotations(
                    !rbData.lockRotationX,
                    !rbData.lockRotationY,
                    !rbData.lockRotationZ,
                  );
                }
              }

              const body = state.physicsWorld.createRigidBody(bodyDesc);
              state.bodies.set(eid, body);

              if (hasComponent(w, eid, Collider)) {
                const collData = getComponent(w, eid, Collider)!;
                let collDesc: RAPIER.ColliderDesc;

                switch (collData.shape) {
                  case 'sphere':
                    collDesc = RAPIER.ColliderDesc.ball(collData.sizeX);
                    break;
                  case 'capsule':
                    collDesc = RAPIER.ColliderDesc.capsule(collData.sizeY, collData.sizeX);
                    break;
                  case 'cylinder':
                    collDesc = RAPIER.ColliderDesc.cylinder(collData.sizeY, collData.sizeX);
                    break;
                  case 'cone':
                    collDesc = RAPIER.ColliderDesc.cone(collData.sizeY, collData.sizeX);
                    break;
                  default:
                    collDesc = RAPIER.ColliderDesc.cuboid(collData.sizeX, collData.sizeY, collData.sizeZ);
                }

                collDesc.setFriction(collData.friction);
                collDesc.setRestitution(collData.restitution);
                collDesc.setDensity(collData.density);
                if (collData.isSensor) collDesc.setSensor(true);

                const collider = state.physicsWorld.createCollider(collDesc, body);
                state.colliders.set(eid, collider);
              }
            }
          },
        }),

        defineSystem({
          name: 'PhysicsStep',
          phase: Phase.Update,
          after: ['PhysicsSync'],
          execute(w, delta) {
            const state = physicsStateMap.get(w);
            if (!state) return;

            accumulator += delta;
            while (accumulator >= timestep) {
              state.physicsWorld.step();
              accumulator -= timestep;
            }
          },
        }),

        defineSystem({
          name: 'PhysicsWriteback',
          phase: Phase.PostUpdate,
          after: ['PhysicsStep'],
          execute(w, _delta) {
            const state = physicsStateMap.get(w);
            if (!state) return;

            for (const [eid, body] of state.bodies) {
              if (!body.isDynamic()) continue;
              const pos = body.translation();
              const rot = body.rotation();

              const { x: qx, y: qy, z: qz, w: qw } = rot;

              const sinr_cosp = 2 * (qw * qx + qy * qz);
              const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
              const rxRad = Math.atan2(sinr_cosp, cosr_cosp);

              const sinp = 2 * (qw * qy - qz * qx);
              const ryRad = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

              const siny_cosp = 2 * (qw * qz + qx * qy);
              const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
              const rzRad = Math.atan2(siny_cosp, cosy_cosp);

              // Transform3D stores rotation in degrees (renderer converts deg→rad via degToRad)
              const RAD2DEG = 180 / Math.PI;
              setTransformData(w, eid, pos.x, pos.y, pos.z, rxRad * RAD2DEG, ryRad * RAD2DEG, rzRad * RAD2DEG);
            }
          },
        }),
      ];
    },
    teardown(world: World) {
      const state = physicsStateMap.get(world);
      if (state) {
        state.bodies.clear();
        state.colliders.clear();
      }
      physicsStateMap.delete(world);
    },
  };
}

export function applyImpulse(world: World, eid: EntityId, x: number, y: number, z: number): void {
  const state = physicsStateMap.get(world);
  const body = state?.bodies.get(eid);
  if (body?.isDynamic()) {
    body.applyImpulse({ x, y, z }, true);
  }
}

export function setLinearVelocity(world: World, eid: EntityId, x: number, y: number, z: number): void {
  const state = physicsStateMap.get(world);
  const body = state?.bodies.get(eid);
  if (body) {
    body.setLinvel({ x, y, z }, true);
  }
}

export function getLinearVelocity(world: World, eid: EntityId): { x: number; y: number; z: number } {
  const state = physicsStateMap.get(world);
  const body = state?.bodies.get(eid);
  if (!body) return { x: 0, y: 0, z: 0 };
  const vel = body.linvel();
  return { x: vel.x, y: vel.y, z: vel.z };
}
