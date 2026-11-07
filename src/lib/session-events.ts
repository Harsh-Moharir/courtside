type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionExpired(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function notifySessionExpired(): void {
  listeners.forEach((l) => l());
}
