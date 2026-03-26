import type { World } from "../ecs/world.js";
import { getComponentSchemas } from "../ecs/component.js";

export function buildSchemaRegistry(world: World): {
  components: Record<string, object>;
  version: string;
} {
  return {
    components: getComponentSchemas(world),
    version: "0.1.0",
  };
}
