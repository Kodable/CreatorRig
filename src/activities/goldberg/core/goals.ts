// Goal evaluation is fully generic now; this module just re-exports the kit's implementation
// retargeted (via core/types.ts) at Goldberg's own Metrics/Goal types.
export { evaluateGoals, allPass } from '../../../kit/goals';
