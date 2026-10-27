// The single Electron host shares these across connection startup, tools and reset.
const leases = new Map();
export function acquireProjectLease(project) {
  if (leases.has(project)) throw Error('This project already has an open Codex session.');
  const lease = { project, release() { if (leases.get(project) === lease) leases.delete(project); } };
  leases.set(project, lease);
  return lease;
}
export function assertProjectLease(project, lease) {
  if (leases.get(project) !== lease) throw Error('Project session ownership changed.');
}
