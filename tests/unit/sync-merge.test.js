import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SyncMerge = require('../../js/sync-merge.js');

describe('Conflict-Tolerant Per-Record Sync Merge', () => {
  it('merges LWW records using updated_at without silent downgrade', () => {
    const local = { name: 'Alice', weight: 65, updated_at: 2000 };
    const staleRemote = { name: 'Alice Old', weight: 70, updated_at: 1000 };
    const newerRemote = { name: 'Alice New', weight: 64, updated_at: 3000 };

    expect(SyncMerge.mergeLwwRecord(local, staleRemote).weight).toBe(65);
    expect(SyncMerge.mergeLwwRecord(local, newerRemote).weight).toBe(64);
  });

  it('merges concurrent multi-device diary items on the same day without overwriting', () => {
    const phoneItems = [
      { id: 'item-a', date_str: '2026-11-25', meal_type: 'breakfast', data: { name: 'Eggs' }, updated_at: 1000, deleted: false }
    ];
    const laptopItems = [
      { id: 'item-b', date_str: '2026-11-25', meal_type: 'lunch', data: { name: 'Chicken Salad' }, updated_at: 1005, deleted: false }
    ];

    const merged = SyncMerge.mergeRecordListById(phoneItems, laptopItems, 'id');
    expect(merged.map(m => m.id).sort()).toEqual(['item-a', 'item-b']);
  });

  it('preserves tombstone deletions unless edited later', () => {
    const local = [
      { id: 'item-1', updated_at: 2000, deleted: true },
      { id: 'item-2', updated_at: 3000, deleted: false, data: { name: 'Edited After Delete' } }
    ];
    const remote = [
      { id: 'item-1', updated_at: 1500, deleted: false, data: { name: 'Old Breakfast' } },
      { id: 'item-2', updated_at: 2500, deleted: true }
    ];

    const merged = SyncMerge.mergeRecordListById(local, remote, 'id');
    expect(merged.find(m => m.id === 'item-1').deleted).toBe(true);
    expect(merged.find(m => m.id === 'item-2').deleted).toBe(false);
  });

  it('merges achievements monotonically without losing unlocked badges', () => {
    const deviceA = { first_log: { unlocked: true, unlockedDate: '2026-11-20', updated_at: 100 } };
    const deviceB = { bullseye: { unlocked: true, unlockedDate: '2026-11-21', updated_at: 200 }, first_log: { unlocked: true, unlockedDate: '2026-11-22', updated_at: 200 } };

    const merged = SyncMerge.mergeAchievements(deviceA, deviceB);
    expect(merged.first_log.unlocked).toBe(true);
    expect(merged.first_log.unlockedDate).toBe('2026-11-20');
    expect(merged.bullseye.unlocked).toBe(true);
  });

  it('merges concurrent coach conversation messages across devices chronologically', () => {
    const threadPhone = [
      {
        id: 'conv_1',
        title: 'Protein Plan',
        updated_at: 2000,
        messages: [
          { id: 'm1', role: 'user', text: 'Hi', createdAt: 100 },
          { id: 'm2', role: 'ai', text: 'Hello!', createdAt: 200 }
        ]
      }
    ];
    const threadLaptop = [
      {
        id: 'conv_1',
        title: 'Protein Plan',
        updated_at: 2500,
        messages: [
          { id: 'm1', role: 'user', text: 'Hi', createdAt: 100 },
          { id: 'm3', role: 'user', text: 'How much protein left?', createdAt: 300 }
        ]
      }
    ];

    const merged = SyncMerge.mergeCoachThreads(threadPhone, threadLaptop);
    expect(merged).toHaveLength(1);
    expect(merged[0].messages.map(m => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});
