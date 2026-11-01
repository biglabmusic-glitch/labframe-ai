export interface MainAction {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  progress?: boolean;
  visible?: boolean;
}

/** Screen-owned action. A previous screen's cleanup must not clear the next one. */
export function createMainActionStore() {
  let owner: symbol | null = null;
  let current: MainAction | null = null;
  const listeners = new Set<() => void>();
  const update = (next: MainAction | null) => {
    if (current === next) return;
    current = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish(action: MainAction | null) {
      const token = Symbol('screen-action'); owner = token;
      update(action?.visible === false ? null : action);
      return () => { if (owner === token) { owner = null; update(null); } };
    },
  };
}
export const mainActionStore = createMainActionStore();
