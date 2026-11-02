let revision = 0;
const pending = new Set();

export function getInstanceRevision() {
  return revision;
}
export function deferForInstance(callback, delay = 0) {
  const owner = revision;
  const handle = setTimeout(() => {
    pending.delete(handle);
    if (owner === revision) callback();
  }, delay);
  pending.add(handle);
  return handle;
}
export function cancelForInstance(handle) {
  pending.delete(handle);
  clearTimeout(handle);
}
export function releaseInstance() {
  revision++;
  pending.forEach(handle => clearTimeout(handle));
  pending.clear();
}
