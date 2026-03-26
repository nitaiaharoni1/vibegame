export { Health, Inventory, Score, Collectible } from './components.js';
export { HealthRegenSystem } from './systems.js';
export {
  DamageEvent,
  HealEvent,
  DeathEvent,
  CollectEvent,
  damage,
  heal,
  addScore,
  collect,
  isAlive,
} from './api.js';
export { GameplayPlugin } from './gameplay-plugin.js';
