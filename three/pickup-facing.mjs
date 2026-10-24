// Pickups have no fixed tilt: their front normal is (sin(yaw), 0, cos(yaw)).
// The orthographic camera looks down -Z. Ignore the narrow edge-on band so
// a tap on the rim never silently chooses an unreadable face.
export function pickupEffectFromYaw(yaw) {
  if (!Number.isFinite(yaw)) return null;
  const facing = Math.cos(yaw);
  if (Math.abs(facing) < .08) return null;
  return facing > 0 ? 'hourglass' : 'smoke';
}
