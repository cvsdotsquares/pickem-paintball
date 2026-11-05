// Second URL for the same Stripe webhook. This used to be a separate handler that looked
// for a userId in subscription metadata (checkout never sets one) and so changed nothing.
// Whichever URL the Stripe endpoint points at, the events now go through one handler.
export { POST } from '../../stripe/webhook/route';
