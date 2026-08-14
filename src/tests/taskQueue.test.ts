import { describe, it, expect } from 'vitest';
import { taskQueue } from '../services/taskQueue.js';

describe('Background Task Queue Service Tests', () => {

  it('should register a handler, enqueue a task, and process it to completion', async () => {
    taskQueue.registerHandler('TEST_CALC', async (payload: { a: number; b: number }, updateProgress) => {
      updateProgress(50, 'Menghitung penjumlahan...');
      const sum = payload.a + payload.b;
      updateProgress(100, 'Selesai');
      return { sum };
    });

    const taskId = taskQueue.enqueue('TEST_CALC', { a: 15, b: 25 });
    expect(taskId).toBeDefined();
    expect(taskId.startsWith('task_')).toBe(true);

    // Poll until completed
    let attempts = 0;
    while (attempts < 20) {
      const task = taskQueue.getTask(taskId);
      if (task?.status === 'completed') {
        expect(task.result).toEqual({ sum: 40 });
        expect(task.progress).toBe(100);
        return;
      }
      await new Promise(r => setTimeout(r, 50));
      attempts++;
    }

    const finalTask = taskQueue.getTask(taskId);
    expect(finalTask?.status).toBe('completed');
  });

  it('should capture errors and mark task status as failed when handler throws', async () => {
    taskQueue.registerHandler('TEST_FAIL', async () => {
      throw new Error('Simulated processing failure');
    });

    const taskId = taskQueue.enqueue('TEST_FAIL', {});
    
    let attempts = 0;
    while (attempts < 20) {
      const task = taskQueue.getTask(taskId);
      if (task?.status === 'failed') {
        expect(task.error).toBe('Simulated processing failure');
        return;
      }
      await new Promise(r => setTimeout(r, 50));
      attempts++;
    }

    const finalTask = taskQueue.getTask(taskId);
    expect(finalTask?.status).toBe('failed');
  });
});
