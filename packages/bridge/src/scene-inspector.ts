export interface SceneNode {
  name: string;
  type: string;
  visible: boolean;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  children?: SceneNode[];
}

// Duck-typed Three.js object interface
interface ThreeLikeObject {
  name?: string;
  type?: string;
  visible?: boolean;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  children?: ThreeLikeObject[];
}

// Duck-typed Phaser game object
interface PhaserLikeObject {
  name?: string;
  type?: string;
  visible?: boolean;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  list?: PhaserLikeObject[];
  children?: { list?: PhaserLikeObject[] };
}

interface PhaserLikeGame {
  scene?: {
    scenes?: Array<{
      sys?: { displayList?: { list?: PhaserLikeObject[] } };
    }>;
  };
}

function isThreeLikeObject(obj: unknown): obj is ThreeLikeObject {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('children' in obj || 'type' in obj || 'position' in obj)
  );
}

function isPhaserLikeGame(obj: unknown): obj is PhaserLikeGame {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'scene' in obj &&
    typeof (obj as Record<string, unknown>).scene === 'object'
  );
}

function traverseThree(obj: ThreeLikeObject, depth: number): SceneNode {
  const node: SceneNode = {
    name: obj.name ?? '(unnamed)',
    type: obj.type ?? 'Object3D',
    visible: obj.visible ?? true,
  };

  if (obj.position !== undefined) {
    node.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
  }
  if (obj.rotation !== undefined) {
    node.rotation = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z };
  }
  if (obj.scale !== undefined) {
    node.scale = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
  }

  if (depth > 0 && Array.isArray(obj.children) && obj.children.length > 0) {
    node.children = obj.children
      .filter(isThreeLikeObject)
      .map((child) => traverseThree(child, depth - 1));
  }

  return node;
}

function traversePhaser(obj: PhaserLikeObject, depth: number): SceneNode {
  const node: SceneNode = {
    name: obj.name ?? '(unnamed)',
    type: obj.type ?? 'GameObject',
    visible: obj.visible ?? true,
  };

  if (obj.x !== undefined || obj.y !== undefined) {
    node.position = { x: obj.x ?? 0, y: obj.y ?? 0, z: 0 };
  }
  if (obj.scaleX !== undefined || obj.scaleY !== undefined) {
    node.scale = { x: obj.scaleX ?? 1, y: obj.scaleY ?? 1, z: 1 };
  }

  const list = obj.list ?? obj.children?.list;
  if (depth > 0 && Array.isArray(list) && list.length > 0) {
    node.children = list.map((child) => traversePhaser(child, depth - 1));
  }

  return node;
}

export function inspectSceneGraph(
  depth = 5,
  registeredRoots?: Map<string, unknown>,
): SceneNode | null {
  // Try registered roots first
  if (registeredRoots !== undefined) {
    const threeScene = registeredRoots.get('scene') ?? registeredRoots.get('threeScene');
    if (threeScene !== undefined && isThreeLikeObject(threeScene)) {
      return traverseThree(threeScene, depth);
    }
  }

  if (typeof window === 'undefined') return null;

  // Try well-known Three.js globals
  const win = window as unknown as Record<string, unknown>;
  const threeScene = win.__THREE_SCENE__;
  if (threeScene !== undefined && isThreeLikeObject(threeScene)) {
    return traverseThree(threeScene, depth);
  }

  // Try well-known Phaser globals
  const phaserGame = win.__PHASER_GAME__;
  if (phaserGame !== undefined && isPhaserLikeGame(phaserGame)) {
    const scenes = phaserGame.scene?.scenes;
    if (Array.isArray(scenes) && scenes.length > 0) {
      const firstScene = scenes[0];
      const displayList = firstScene?.sys?.displayList?.list ?? [];
      const root: SceneNode = {
        name: 'PhaserScene',
        type: 'Scene',
        visible: true,
        children: displayList.map((obj) => traversePhaser(obj, depth - 1)),
      };
      return root;
    }
  }

  return null;
}
