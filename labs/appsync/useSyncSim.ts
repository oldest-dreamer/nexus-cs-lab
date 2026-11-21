import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { initialState, reducer, type Net, type UiMode } from './engine';

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export const LATENCY: Record<Net, [number, number]> = {
  online: [250, 550],
  slow3g: [1600, 2600],
  offline: [0, 0],
};

const latency = (net: Net) => {
  const [a, b] = LATENCY[net];
  return Math.round(a + Math.random() * (b - a));
};

export interface Inflight {
  key: string;
  ms: number;
  startedAt: number;
  method: string;
}

/** Wires the pure reducer to timers: a background "sync worker" that drains the outbox. */
export function useSyncSim() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [net, setNet] = useState<Net>('online');
  const [mode, setMode] = useState<UiMode>('optimistic');
  const [rate503, setRate503] = useState(0.15);
  const [inflight, setInflight] = useState<Inflight | null>(null);
  const [, setTick] = useState(0);

  const stateRef = useRef(state);
  const netRef = useRef(net);
  const rateRef = useRef(rate503);
  const busy = useRef(false);
  stateRef.current = state;
  netRef.current = net;
  rateRef.current = rate503;

  // --- background sync worker: strict FIFO, one request in flight at a time
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const iv = setInterval(() => {
      const s = stateRef.current;
      const n = netRef.current;
      if (busy.current || n === 'offline' || s.conflict) return;
      const head = s.outbox[0];
      if (!head || head.state === 'conflict' || head.state === 'inflight') return;
      if (head.state === 'backoff' && head.nextAttemptAt > Date.now()) return;
      busy.current = true;
      const ms = latency(n);
      dispatch({ type: 'sendStart', key: head.key, now: Date.now() });
      setInflight({ key: head.key, ms, startedAt: Date.now(), method: head.type });
      const t = setTimeout(() => {
        timers.delete(t);
        const lost = netRef.current === 'offline';
        dispatch({ type: 'response', key: head.key, now: Date.now(), ms, lost, serverGotIt: lost && Math.random() < 0.5, roll503: Math.random(), rate503: rateRef.current });
        setInflight(null);
        busy.current = false;
      }, ms);
      timers.add(t);
    }, 120);
    return () => {
      clearInterval(iv);
      timers.forEach(clearTimeout);
      busy.current = false;
    };
  }, []);

  // re-render while something is backing off, so countdowns update
  const backingOff = state.outbox.some((m) => m.state === 'backoff');
  useEffect(() => {
    if (!backingOff) return;
    const iv = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(iv);
  }, [backingOff]);

  const guard = useCallback(
    (what: string) => {
      if (mode === 'pessimistic' && net === 'offline') {
        dispatch({ type: 'reject', text: `✈ Offline: can't ${what}. Wait-for-server apps block writes without a connection.`, now: Date.now() });
        return false;
      }
      return true;
    },
    [mode, net],
  );

  const actions = {
    add: (title: string) => guard('add a task') && dispatch({ type: 'add', id: uid('t'), key: uid('idem'), title, mode, now: Date.now() }),
    edit: (id: string, title: string) => guard('edit') && dispatch({ type: 'edit', id, key: uid('idem'), title, mode, now: Date.now() }),
    toggle: (id: string) => guard('update') && dispatch({ type: 'toggle', id, key: uid('idem'), mode, now: Date.now() }),
    remove: (id: string) => guard('delete') && dispatch({ type: 'delete', id, key: uid('idem'), mode, now: Date.now() }),
    resolve: (choice: 'local' | 'server') => dispatch({ type: 'resolve', choice, now: Date.now() }),
    remoteEdit: (id: string) => dispatch({ type: 'remoteEdit', id, now: Date.now() }),
    pull: () => {
      if (netRef.current === 'offline') {
        dispatch({ type: 'reject', text: '✈ Offline: pull-to-refresh needs a connection.', now: Date.now() });
        return;
      }
      const ms = latency(netRef.current);
      setTimeout(() => dispatch({ type: 'pull', now: Date.now(), ms }), ms);
    },
    reset: () => dispatch({ type: 'reset' }),
  };

  return { state, net, setNet, mode, setMode, rate503, setRate503, inflight, actions };
}

export type SyncSim = ReturnType<typeof useSyncSim>;
