import type { RelationshipConfig, RelationshipStage } from '../model'

function ascending(config: RelationshipConfig): RelationshipStage[] {
  return [...config.stages].sort((a, b) => a.minAffection - b.minAffection)
}

/** The highest stage whose threshold the affection value has reached. */
export function stageFor(config: RelationshipConfig, affection: number): RelationshipStage {
  const stages = ascending(config)
  let current = stages[0]
  for (const s of stages) {
    if (s.minAffection <= affection) current = s
  }
  return current
}

/** Position of a stage in the progression, 0 being the earliest. -1 if unknown. */
export function stageRank(config: RelationshipConfig, stageId: string): number {
  return ascending(config).findIndex((s) => s.id === stageId)
}
