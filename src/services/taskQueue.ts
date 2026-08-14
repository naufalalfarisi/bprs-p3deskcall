import { EventEmitter } from 'events';

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface TaskJob<TResult = any, TPayload = any> {
  id: string;
  type: string;
  payload: TPayload;
  status: TaskStatus;
  progress: number; // 0 - 100
  progressMessage?: string;
  result?: TResult;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export type TaskHandler<TResult = any, TPayload = any> = (
  payload: TPayload,
  updateProgress: (percentage: number, message?: string) => void
) => Promise<TResult>;

class TaskQueueService extends EventEmitter {
  private tasks: Map<string, TaskJob> = new Map();
  private handlers: Map<string, TaskHandler> = new Map();
  private queue: string[] = [];
  private isProcessing = false;
  private concurrency = 2;
  private activeWorkers = 0;

  constructor() {
    super();
    // Auto cleanup old completed/failed tasks every 30 minutes (older than 2 hours)
    setInterval(() => this.cleanupOldTasks(), 30 * 60 * 1000).unref();
  }

  /**
   * Register a handler for a task type.
   */
  public registerHandler<TResult, TPayload>(
    type: string,
    handler: TaskHandler<TResult, TPayload>
  ) {
    this.handlers.set(type, handler as TaskHandler);
  }

  /**
   * Enqueue a new background task.
   */
  public enqueue<TResult = any, TPayload = any>(
    type: string,
    payload: TPayload
  ): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const job: TaskJob<TResult, TPayload> = {
      id,
      type,
      payload,
      status: 'queued',
      progress: 0,
      createdAt: new Date()
    };

    this.tasks.set(id, job);
    this.queue.push(id);
    this.emit('task:queued', job);

    this.processNext();
    return id;
  }

  /**
   * Retrieve task job status and progress.
   */
  public getTask(id: string): TaskJob | null {
    return this.tasks.get(id) || null;
  }

  /**
   * List all recent tasks.
   */
  public listTasks(): TaskJob[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  private async processNext(): Promise<void> {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const taskId = this.queue.shift();
    if (!taskId) return;

    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'queued') {
      return this.processNext();
    }

    const handler = this.handlers.get(task.type);
    if (!handler) {
      task.status = 'failed';
      task.error = `No handler registered for task type: ${task.type}`;
      task.completedAt = new Date();
      return this.processNext();
    }

    this.activeWorkers++;
    task.status = 'processing';
    task.startedAt = new Date();
    this.emit('task:started', task);

    const updateProgress = (percentage: number, message?: string) => {
      task.progress = Math.min(Math.max(0, percentage), 100);
      if (message) task.progressMessage = message;
      this.emit('task:progress', task);
    };

    try {
      const result = await handler(task.payload, updateProgress);
      task.status = 'completed';
      task.progress = 100;
      task.result = result;
      task.completedAt = new Date();
      this.emit('task:completed', task);
    } catch (err: any) {
      task.status = 'failed';
      task.error = err?.message || String(err);
      task.completedAt = new Date();
      this.emit('task:failed', task);
    } finally {
      this.activeWorkers--;
      this.processNext();
    }
  }

  private cleanupOldTasks() {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, task] of this.tasks.entries()) {
      if (
        (task.status === 'completed' || task.status === 'failed') &&
        task.completedAt &&
        task.completedAt.getTime() < twoHoursAgo
      ) {
        this.tasks.delete(id);
      }
    }
  }
}

export const taskQueue = new TaskQueueService();
