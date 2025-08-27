import { GitHubService } from '../../github/GitHubService';
import { AIService } from '../../ai/AIService';
import { WorkflowEngine } from '../../workflows/WorkflowEngine';
import { TaskQueue } from '../../utils/TaskQueue';
import { Logger } from '../../utils/Logger';

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

export interface ProjectConfig {
  name: string;
  description: string;
  features: string[];
  technology?: string;
  framework?: string;
  repository?: {
    owner: string;
    name: string;
  };
}

export class OrchestratorAgent {
  private github: GitHubService;
  private ai: AIService;
  private workflow: WorkflowEngine;
  private taskQueue: TaskQueue;
  private logger: Logger;

  constructor(config: {
    githubToken: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
  }) {
    this.github = new GitHubService(config.githubToken);
    this.ai = new AIService({
      openaiApiKey: config.openaiApiKey,
      anthropicApiKey: config.anthropicApiKey
    });
    this.workflow = new WorkflowEngine();
    this.taskQueue = new TaskQueue();
    this.logger = new Logger('OrchestratorAgent');
  }

  /**
   * Creates a new project with AI assistance
   */
  async createProject(config: ProjectConfig): Promise<void> {
    this.logger.info(`Creating project: ${config.name}`);

    try {
      // 1. Analyze requirements with AI
      const analysis = await this.ai.analyzeProjectRequirements(config);
      
      // 2. Create GitHub repository
      const repo = await this.github.createRepository({
        name: config.name,
        description: config.description,
        private: false,
        autoInit: true
      });

      // 3. Generate project structure
      const projectStructure = await this.ai.generateProjectStructure(config);
      
      // 4. Create initial files
      await this.createInitialFiles(repo, projectStructure);
      
      // 5. Set up CI/CD pipeline
      await this.setupCICD(repo, analysis);
      
      // 6. Create initial tasks
      await this.createInitialTasks(config, analysis);

      this.logger.info(`Project ${config.name} created successfully`);
    } catch (error) {
      this.logger.error('Failed to create project:', error);
      throw error;
    }
  }

  /**
   * Delegates a task to appropriate agent
   */
  async delegateTask(task: Omit<Task, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const taskId = this.generateTaskId();
    const fullTask: Task = {
      ...task,
      id: taskId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.logger.info(`Delegating task: ${task.type} - ${task.description}`);

    // Add to task queue
    await this.taskQueue.add(fullTask);

    // Determine appropriate agent and delegate
    const agent = this.determineAgent(task.type);
    await this.assignTaskToAgent(fullTask, agent);

    return taskId;
  }

  /**
   * Processes incoming instructions and creates appropriate tasks
   */
  async processInstructions(instructions: string): Promise<Task[]> {
    this.logger.info('Processing instructions:', instructions);

    // Use AI to parse and understand instructions
    const analysis = await this.ai.analyzeInstructions(instructions);
    
    const tasks: Task[] = [];
    
    for (const taskSpec of analysis.tasks) {
      const task = await this.delegateTask({
        type: taskSpec.type,
        description: taskSpec.description,
        priority: taskSpec.priority,
        assignee: taskSpec.assignee,
        metadata: taskSpec.metadata
      });
      
      tasks.push(await this.getTask(task));
    }

    return tasks;
  }

  /**
   * Gets task status
   */
  async getTask(taskId: string): Promise<Task> {
    return await this.taskQueue.get(taskId);
  }

  /**
   * Lists all tasks with optional filtering
   */
  async listTasks(filters?: {
    status?: Task['status'];
    type?: Task['type'];
    assignee?: string;
  }): Promise<Task[]> {
    return await this.taskQueue.list(filters);
  }

  /**
   * Monitors overall project health and suggests improvements
   */
  async monitorProject(repository: { owner: string; name: string }): Promise<void> {
    this.logger.info(`Monitoring project: ${repository.owner}/${repository.name}`);

    // Get repository metrics
    const metrics = await this.github.getRepositoryMetrics(repository);
    
    // Analyze with AI
    const analysis = await this.ai.analyzeProjectHealth(metrics);
    
    // Create improvement tasks if needed
    if (analysis.suggestions.length > 0) {
      for (const suggestion of analysis.suggestions) {
        await this.delegateTask({
          type: suggestion.type,
          description: suggestion.description,
          priority: suggestion.priority
        });
      }
    }
  }

  private async createInitialFiles(repo: any, structure: any): Promise<void> {
    // Create project files based on AI-generated structure
    for (const file of structure.files) {
      await this.github.createFile({
        owner: repo.owner.login,
        repo: repo.name,
        path: file.path,
        content: file.content,
        message: `feat: add ${file.path}`
      });
    }
  }

  private async setupCICD(repo: any, analysis: any): Promise<void> {
    // Create GitHub Actions workflow
    const workflow = await this.ai.generateCICDWorkflow(analysis);
    
    await this.github.createFile({
      owner: repo.owner.login,
      repo: repo.name,
      path: '.github/workflows/ci.yml',
      content: workflow,
      message: 'feat: add CI/CD pipeline'
    });
  }

  private async createInitialTasks(config: ProjectConfig, analysis: any): Promise<void> {
    // Create tasks for each feature
    for (const feature of config.features) {
      await this.delegateTask({
        type: 'feature',
        description: `Implement ${feature}`,
        priority: 'medium'
      });
    }
  }

  private determineAgent(taskType: Task['type']): string {
    const agentMap = {
      'feature': 'feature-agent',
      'bug': 'qa-agent',
      'review': 'code-review-agent',
      'deploy': 'devops-agent',
      'test': 'qa-agent',
      'brainstorm': 'feature-agent'
    };

    return agentMap[taskType] || 'general-agent';
  }

  private async assignTaskToAgent(task: Task, agentName: string): Promise<void> {
    // In a real implementation, this would route to the appropriate agent
    this.logger.info(`Assigning task ${task.id} to ${agentName}`);
    
    // Update task status
    task.assignee = agentName;
    task.status = 'in-progress';
    task.updatedAt = new Date();
    
    await this.taskQueue.update(task);
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
