import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent, type StationPick } from '../src/data/eqpData';
import {
  DEFAULT_UNDO_COALESCE_MS,
  MAX_EVENT_UNDO_STEPS,
  popEventUndoEntry,
  pushEventUndoEntry,
  type EventUndoEntry,
} from '../src/utils/eventUndoHistory';

function cloneBaseEvent(): EQPEvent {
  return structuredClone(INITIAL_EVENTS[0]);
}

function makeTestPick(id: string, sta: string): StationPick {
  return {
    id,
    sta,
    pTime: '12:00:10.50',
    pExcluded: false,
    sTime: '12:00:20.25',
    sExcluded: false,
    duration: 45.0,
    amplitude: 1.2,
    polarity: 'c',
    quality: 'A',
    lat: 14.5,
    lon: 121.0,
    toa: 88,
    azim: 110,
    delta: 0.45,
    resP: 0.12,
    resS: -0.08,
    obsP: 10.5,
    obsS: 20.25,
    calcP: 10.38,
    calcS: 20.33,
    ms: 0,
    mb: 0,
    md: 3.8,
  };
}

test('pushEventUndoEntry ignores no-ops, mismatched events, and non-pick/origin metadata edits', () => {
  const base = cloneBaseEvent();
  let stack: EventUndoEntry[] = [];

  // Identical state does not push
  stack = pushEventUndoEntry(stack, base, cloneBaseEvent(), { nowMs: 1000 });
  assert.equal(stack.length, 0);

  // Unrelated bulletin note / felt intensity edits do not push onto pick/origin undo stack
  const unrelatedEdit: EQPEvent = {
    ...cloneBaseEvent(),
    bulletinNote1: 'Updated bulletin advisory text',
    expectingDamage: true,
  };
  stack = pushEventUndoEntry(stack, base, unrelatedEdit, { nowMs: 2000 });
  assert.equal(stack.length, 0);

  // Mismatched event IDs do not push
  const otherEvent: EQPEvent = {
    ...cloneBaseEvent(),
    id: 'different-event-id',
    depthKm: base.depthKm + 5,
  };
  stack = pushEventUndoEntry(stack, base, otherEvent, { nowMs: 3000 });
  assert.equal(stack.length, 0);
});

test('pushEventUndoEntry caps history strictly at 10 steps and preserves the most recent 10 changes', () => {
  assert.equal(MAX_EVENT_UNDO_STEPS, 10);

  let current = cloneBaseEvent();
  let stack: EventUndoEntry[] = [];

  // Perform 14 distinct pick/origin changes
  for (let i = 1; i <= 14; i += 1) {
    const next: EQPEvent = {
      ...cloneBaseEvent(),
      depthKm: 10 + i,
      trialDepthKm: 10 + i,
      picks: current.picks.map((p, idx) =>
        idx === 0 ? { ...p, pTime: `12:00:${String(i).padStart(2, '0')}.00` } : { ...p }
      ),
    };
    stack = pushEventUndoEntry(stack, current, next, {
      nowMs: i * 5000,
      label: `Edit step ${i}`,
    });
    current = next;
  }

  // Must keep only the latest 10 steps (edits 5 through 14)
  assert.equal(stack.length, 10);
  assert.equal(stack[0].label, 'Edit step 5');
  assert.equal(stack[9].label, 'Edit step 14');

  // Popping step-by-step reverts from step 14 back down to step 4 state
  for (let expectedDepth = 23; expectedDepth >= 14; expectedDepth -= 1) {
    const popped = popEventUndoEntry(stack, current);
    assert.ok(popped);
    assert.equal(popped.restoredEvent.depthKm, expectedDepth);
    current = popped.restoredEvent;
    stack = popped.remainingStack;
  }

  assert.equal(stack.length, 0);
  assert.equal(popEventUndoEntry(stack, current), null);
});

test('pushEventUndoEntry coalesces rapid typing bursts under the same coalesceKey and splits across keys or timeout', () => {
  let current = cloneBaseEvent();
  let stack: EventUndoEntry[] = [];
  const firstPickId = current.picks[0].id;
  const origPTime = current.picks[0].pTime;

  // Rapid typing into the same P arrival field within 1200ms
  const edit1: EQPEvent = {
    ...current,
    picks: current.picks.map((p) => (p.id === firstPickId ? { ...p, pTime: '12:01:0' } : p)),
  };
  stack = pushEventUndoEntry(stack, current, edit1, {
    coalesceKey: `pick:${firstPickId}:pTime`,
    nowMs: 10_000,
  });
  current = edit1;

  const edit2: EQPEvent = {
    ...current,
    picks: current.picks.map((p) => (p.id === firstPickId ? { ...p, pTime: '12:01:05.40' } : p)),
  };
  stack = pushEventUndoEntry(stack, current, edit2, {
    coalesceKey: `pick:${firstPickId}:pTime`,
    nowMs: 10_000 + DEFAULT_UNDO_COALESCE_MS - 200,
  });
  current = edit2;

  assert.equal(stack.length, 1);
  assert.equal(stack[0].before.picks[0].pTime, origPTime);

  // Typing after the coalesce window expires starts a new undo step
  const edit2Time = 10_000 + DEFAULT_UNDO_COALESCE_MS - 200;
  const edit3: EQPEvent = {
    ...current,
    picks: current.picks.map((p) => (p.id === firstPickId ? { ...p, pTime: '12:01:09.00' } : p)),
  };
  stack = pushEventUndoEntry(stack, current, edit3, {
    coalesceKey: `pick:${firstPickId}:pTime`,
    nowMs: edit2Time + DEFAULT_UNDO_COALESCE_MS + 100,
  });
  current = edit3;

  assert.equal(stack.length, 2);

  // Different coalesceKey also creates a new undo step immediately
  const edit4: EQPEvent = {
    ...current,
    picks: current.picks.map((p) => (p.id === firstPickId ? { ...p, duration: 77.5 } : p)),
  };
  stack = pushEventUndoEntry(stack, current, edit4, {
    coalesceKey: `pick:${firstPickId}:duration`,
    nowMs: edit2Time + DEFAULT_UNDO_COALESCE_MS + 200,
  });
  current = edit4;

  assert.equal(stack.length, 3);

  const undoDur = popEventUndoEntry(stack, current)!;
  assert.equal(undoDur.restoredEvent.picks[0].pTime, '12:01:09.00');
  const undoLateP = popEventUndoEntry(undoDur.remainingStack, undoDur.restoredEvent)!;
  assert.equal(undoLateP.restoredEvent.picks[0].pTime, '12:01:05.40');
  const undoBurstP = popEventUndoEntry(undoLateP.remainingStack, undoLateP.restoredEvent)!;
  assert.equal(undoBurstP.restoredEvent.picks[0].pTime, origPTime);
});

test('popEventUndoEntry accurately reverts added picks, origin relocation, magnitude scale, and keeps snapshots isolated', () => {
  const initial = cloneBaseEvent();
  const initialPickCount = initial.picks.length;
  let current = cloneBaseEvent();
  let stack: EventUndoEntry[] = [];

  // 1. Add a pick
  const addedPick = makeTestPick('pick-undo-test', 'TEST1');
  const withAddedPick: EQPEvent = {
    ...current,
    picks: [...current.picks, addedPick],
  };
  stack = pushEventUndoEntry(stack, current, withAddedPick, { nowMs: 1000 });
  current = withAddedPick;
  assert.match(stack[0].label, /Add station TEST1/);

  // 2. Relocate origin parameters & magnitude
  const relocated: EQPEvent = {
    ...current,
    lat: 16.25,
    lon: 120.75,
    depthKm: 32.4,
    originTimeGmt: '04:15:22.1',
    preferredScale: 'Ms',
    ms: 5.4,
    iterations: 6,
    rmsSec: 0.31,
  };
  stack = pushEventUndoEntry(stack, current, relocated, { nowMs: 2500 });
  current = relocated;
  assert.equal(stack[1].label, 'Update hypocenter origin parameters');

  // Mutate a pick on `current` after pushing to verify deep clone isolation
  current.picks[0].sta = 'MUTATED';

  // Undo relocation -> restores pre-relocation coordinates/scale while keeping added pick
  const afterUndoRelocate = popEventUndoEntry(stack, current)!;
  assert.equal(afterUndoRelocate.restoredEvent.lat, initial.lat);
  assert.equal(afterUndoRelocate.restoredEvent.lon, initial.lon);
  assert.equal(afterUndoRelocate.restoredEvent.depthKm, initial.depthKm);
  assert.equal(afterUndoRelocate.restoredEvent.preferredScale, initial.preferredScale);
  assert.equal(afterUndoRelocate.restoredEvent.picks.length, initialPickCount + 1);
  assert.equal(afterUndoRelocate.restoredEvent.picks[0].sta, initial.picks[0].sta);

  // Undo add pick -> restores original pick list
  const afterUndoAdd = popEventUndoEntry(
    afterUndoRelocate.remainingStack,
    afterUndoRelocate.restoredEvent
  )!;
  assert.equal(afterUndoAdd.restoredEvent.picks.length, initialPickCount);
  assert.equal(
    afterUndoAdd.restoredEvent.picks.some((p) => p.id === 'pick-undo-test'),
    false
  );
});
