import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { taskQueue } from '../services/taskQueue.js';

export const tasksRouter = new Hono();

// Enforce auth
tasksRouter.use('*', authMiddleware);

// GET /api/tasks/:id - Check status and progress of a background job
tasksRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const task = taskQueue.getTask(id);

  if (!task) {
    return c.json({ error: 'Tugas latar belakang tidak ditemukan' }, 404);
  }

  return c.json({
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    progressMessage: task.progressMessage,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt
  });
});

// GET /api/tasks - List recent background tasks
tasksRouter.get('/', async (c) => {
  const tasks = taskQueue.listTasks().map(t => ({
    id: t.id,
    type: t.type,
    status: t.status,
    progress: t.progress,
    progressMessage: t.progressMessage,
    error: t.error,
    createdAt: t.createdAt,
    startedAt: t.startedAt,
    completedAt: t.completedAt
  }));

  return c.json(tasks);
});
