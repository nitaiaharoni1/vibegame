export interface Vec3 { x: number; y: number; z: number; }

function length(v: Vec3): number { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
function normalize(v: Vec3): Vec3 { const l = length(v); if (l === 0) return { x: 0, y: 0, z: 0 }; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
function scale(v: Vec3, s: number): Vec3 { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function subtract(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

export const Steering = {
  seek(position: Vec3, target: Vec3, maxSpeed: number): Vec3 {
    const desired = scale(normalize(subtract(target, position)), maxSpeed);
    return desired;
  },

  flee(position: Vec3, threat: Vec3, maxSpeed: number): Vec3 {
    const desired = scale(normalize(subtract(position, threat)), maxSpeed);
    return desired;
  },

  arrive(position: Vec3, target: Vec3, maxSpeed: number, slowRadius = 3): Vec3 {
    const toTarget = subtract(target, position);
    const dist = length(toTarget);
    if (dist < 0.01) return { x: 0, y: 0, z: 0 };
    const speed = dist < slowRadius ? maxSpeed * (dist / slowRadius) : maxSpeed;
    return scale(normalize(toTarget), speed);
  },

  wander(velocity: Vec3, wanderAngle: number, wanderRate: number, maxSpeed: number): { force: Vec3; newAngle: number } {
    const newAngle = wanderAngle + (Math.random() - 0.5) * wanderRate;
    const circleCenter = normalize(velocity);
    const displacement = { x: Math.cos(newAngle), y: 0, z: Math.sin(newAngle) };
    const force = add(circleCenter, displacement);
    return { force: scale(normalize(force), maxSpeed), newAngle };
  },
};
