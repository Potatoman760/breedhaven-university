import { z } from 'zod'

/** The most love interests who can share a scene, and so a plan. */
export const MAX_SCENE_CAST = 3

/** A plan to meet one or more love interests, as suggested by one of them and not yet agreed. */
export const ProposalSchema = z.object({
  /** Who suggested it. */
  loveInterestId: z.string(),
  /** Other love interests who are coming along. */
  companionIds: z.array(z.string()).max(MAX_SCENE_CAST - 1).default([]),
  /** What the two will do, in a few words: "study together", "dinner". */
  title: z.string(),
  /** Game time (hours since start) at which it begins. */
  time: z.number().int().min(0),
  hours: z.number().int().min(1),
  locationId: z.string()
})
export type Proposal = z.infer<typeof ProposalSchema>

/**
 * A plan the player has accepted. It sits on the calendar until it is kept or passes. One of the kind `birth` was
 * never proposed by anyone: the game sets it, for the hour a child of his is to be born, and missing it is no ordinary
 * standing-up.
 */
export const AppointmentSchema = ProposalSchema.extend({ id: z.string(), kind: z.enum(['birth', 'viewing', 'below']).optional() })
export type Appointment = z.infer<typeof AppointmentSchema>
