import type { Archetype } from "./types";

const registry: Array<Archetype<any>> = [];

export function registerArchetype<P>(a: Archetype<P>): Archetype<P> {
  if (registry.find(x => x.id === a.id)) throw new Error(`Duplicate archetype id: ${a.id}`);
  registry.push(a);
  return a;
}

export function listArchetypes(): Array<Archetype<any>> {
  return [...registry];
}

export function getArchetype(id: string): Archetype<any> | undefined {
  return registry.find(a => a.id === id);
}
