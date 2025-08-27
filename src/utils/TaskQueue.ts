export interface Task {
  id: string;
  type: 'feature' | 'bug' | 'review' | 'deploy' | 'test' | 'brainstorm';
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  metadata?: Record<string, any>;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();

  async add(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async get(taskId: string): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  async update(task: Task): Promise<void> {
    if (!this.tasks.has(task.id)) {
      throw new Error(`Task not found: ${task.id}`);
    }
    this.tasks.set(task.id, task);
  }

  async list(filters?: {
    status?: Task['status'];
    type?: Task['type'];
    assignee?: string;
  }): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values());

    if (filters) {
      if (filters.status) {
        tasks = tasks.filter(task => task.status === filters.status);
      }
      if (filters.type) {
        tasks = tasks.filter(task => task.type === filters.type);
      }
      if (filters.assignee) {
        tasks = tasks.filter(task => task.assignee === filters.assignee);
      }
    }

    return tasks;
  }

  async remove(taskId: string): Promise<void> {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task not found: ${taskId}`);
    }
    this.tasks.delete(taskId);
  }

  async clear(): Promise<void> {
    this.tasks.clear();
  }

  async count(): Promise<number> {
    return this.tasks.size;
  }
}
