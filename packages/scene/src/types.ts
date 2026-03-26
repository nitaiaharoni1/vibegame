export interface VGXWorld {
  renderer: 'three' | 'phaser';
  config: VGXConfig;
  entities: VGXEntity[];
  prefabs: VGXPrefab[];
  instances: VGXInstance[];
}

export interface VGXConfig {
  gravity?: [number, number, number];
  clearColor?: string;
  width?: number;
  height?: number;
  physics?: string;
  [key: string]: unknown;
}

export interface VGXEntity {
  name: string | undefined;
  tags: string[];
  components: VGXComponent[];
}

export interface VGXComponent {
  type: string;
  props: Record<string, string | number | boolean>;
}

export interface VGXPrefab {
  name: string;
  components: VGXComponent[];
  tags: string[];
}

export interface VGXInstance {
  prefab: string;
  overrides: Record<string, string | number | boolean>;
}
