import express from 'express';
import dotenv from 'dotenv';
import { OrchestratorAgent } from './agents/orchestrator/OrchestratorAgent';
import { CodeReviewAgent } from './agents/code-review/CodeReviewAgent';
import { WorkflowEngine } from './workflows/WorkflowEngine';
import { Logger } from './utils/Logger';

// Load environment variables
dotenv.config();

class AIGitHubPipeline {
  private app: express.Application;
  private orchestrator: OrchestratorAgent;
  private codeReviewAgent: CodeReviewAgent;
  private workflowEngine: WorkflowEngine;
  private logger: Logger;

  constructor() {
    this.app = express();
    this.logger = new Logger('AIGitHubPipeline');
    
    // Initialize services
    this.orchestrator = new OrchestratorAgent({
      githubToken: process.env.GITHUB_TOKEN!,
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY
    });
    
    this.codeReviewAgent = new CodeReviewAgent({
      githubToken: process.env.GITHUB_TOKEN!,
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY
    });
    
    this.workflowEngine = new WorkflowEngine();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWorkflows();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Add CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Main instruction endpoint
    this.app.post('/instructions', async (req, res) => {
      try {
        const { instructions } = req.body;
        
        if (!instructions) {
          return res.status(400).json({ error: 'Instructions are required' });
        }

        this.logger.info('Received instructions:', instructions);
        
        const tasks = await this.orchestrator.processInstructions(instructions);
        
        res.json({
          success: true,
          message: `Created ${tasks.length} tasks`,
          tasks: tasks.map(task => ({
            id: task.id,
            type: task.type,
            description: task.description,
            status: task.status
          }))
        });
      } catch (error) {
        this.logger.error('Failed to process instructions:', error);
        res.status(500).json({ 
          error: 'Failed to process instructions',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Create project endpoint
    this.app.post('/projects', async (req, res) => {
      try {
        const projectConfig = req.body;
        
        await this.orchestrator.createProject(projectConfig);
        
        res.json({
          success: true,
          message: `Project ${projectConfig.name} created successfully`
        });
      } catch (error) {
        this.logger.error('Failed to create project:', error);
        res.status(500).json({ 
          error: 'Failed to create project',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Task management endpoints
    this.app.get('/tasks', async (req, res) => {
      try {
        const { status, type, assignee } = req.query;
        
        const tasks = await this.orchestrator.listTasks({
          status: status as any,
          type: type as any,
          assignee: assignee as string
        });
        
        res.json({ tasks });
      } catch (error) {
        this.logger.error('Failed to list tasks:', error);
        res.status(500).json({ error: 'Failed to list tasks' });
      }
    });

    this.app.get('/tasks/:taskId', async (req, res) => {
      try {
        const { taskId } = req.params;
        const task = await this.orchestrator.getTask(taskId);
        
        res.json({ task });
      } catch (error) {
        this.logger.error('Failed to get task:', error);
        res.status(500).json({ error: 'Failed to get task' });
      }
    });

    // Code review endpoints
    this.app.post('/review/pull-request', async (req, res) => {
      try {
        const { repository, pullNumber } = req.body;
        
        const review = await this.codeReviewAgent.reviewPullRequest(repository, pullNumber);
        
        res.json({
          success: true,
          review
        });
      } catch (error) {
        this.logger.error('Failed to review pull request:', error);
        res.status(500).json({ error: 'Failed to review pull request' });
      }
    });

    this.app.post('/review/security-audit', async (req, res) => {
      try {
        const { repository } = req.body;
        
        const issues = await this.codeReviewAgent.performSecurityAudit(repository);
        
        res.json({
          success: true,
          securityIssues: issues
        });
      } catch (error) {
        this.logger.error('Failed to perform security audit:', error);
        res.status(500).json({ error: 'Failed to perform security audit' });
      }
    });

    // Workflow endpoints
    this.app.post('/workflows/:workflowId/execute', async (req, res) => {
      try {
        const { workflowId } = req.params;
        const { variables = {} } = req.body;
        
        const executionId = await this.workflowEngine.executeWorkflow(workflowId, variables);
        
        res.json({
          success: true,
          executionId
        });
      } catch (error) {
        this.logger.error('Failed to execute workflow:', error);
        res.status(500).json({ error: 'Failed to execute workflow' });
      }
    });

    this.app.get('/workflows/executions/:executionId', async (req, res) => {
      try {
        const { executionId } = req.params;
        const execution = this.workflowEngine.getExecution(executionId);
        
        if (!execution) {
          return res.status(404).json({ error: 'Execution not found' });
        }
        
        res.json({ execution });
      } catch (error) {
        this.logger.error('Failed to get execution:', error);
        res.status(500).json({ error: 'Failed to get execution' });
      }
    });

    // GitHub webhook endpoint
    this.app.post('/webhooks/github', async (req, res) => {
      try {
        const event = req.get('x-github-event') as string;
        const payload = req.body;
        
        await this.handleGitHubWebhook(event, payload);
        
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Failed to handle GitHub webhook:', error);
        res.status(500).json({ error: 'Failed to handle webhook' });
      }
    });

    // Dashboard endpoint
    this.app.get('/dashboard', async (req, res) => {
      try {
        const tasks = await this.orchestrator.listTasks();
        const executions = this.workflowEngine.listExecutions();
        
        const dashboard = {
          summary: {
            totalTasks: tasks.length,
            pendingTasks: tasks.filter(t => t.status === 'pending').length,
            inProgressTasks: tasks.filter(t => t.status === 'in-progress').length,
            completedTasks: tasks.filter(t => t.status === 'completed').length,
            failedTasks: tasks.filter(t => t.status === 'failed').length,
            totalExecutions: executions.length,
            runningExecutions: executions.filter(e => e.status === 'running').length
          },
          recentTasks: tasks.slice(-10),
          recentExecutions: executions.slice(-10)
        };
        
        res.json(dashboard);
      } catch (error) {
        this.logger.error('Failed to get dashboard data:', error);
        res.status(500).json({ error: 'Failed to get dashboard data' });
      }
    });
  }

  private setupWorkflows(): void {
    // Register common workflows
    this.workflowEngine.registerWorkflow(this.workflowEngine.createFeatureDevelopmentWorkflow());
    this.workflowEngine.registerWorkflow(this.workflowEngine.createBugFixWorkflow());
    this.workflowEngine.registerWorkflow(this.workflowEngine.createDeploymentWorkflow());
    
    this.logger.info('Workflows registered successfully');
  }

  private async handleGitHubWebhook(event: string, payload: any): Promise<void> {
    this.logger.info(`Handling GitHub webhook: ${event}`);
    
    switch (event) {
      case 'issues':
        if (payload.action === 'labeled') {
          await this.handleIssueLabeled(payload);
        }
        break;
        
      case 'pull_request':
        if (payload.action === 'opened') {
          await this.handlePullRequestOpened(payload);
        }
        break;
        
      case 'push':
        if (payload.ref === 'refs/heads/main') {
          await this.handleMainBranchPush(payload);
        }
        break;
    }
  }

  private async handleIssueLabeled(payload: any): Promise<void> {
    const labels = payload.issue.labels.map((label: any) => label.name);
    
    if (labels.includes('feature')) {
      await this.workflowEngine.executeWorkflow('feature-development', {
        issueNumber: payload.issue.number,
        repository: payload.repository.full_name
      });
    } else if (labels.includes('bug')) {
      await this.workflowEngine.executeWorkflow('bug-fix', {
        issueNumber: payload.issue.number,
        repository: payload.repository.full_name
      });
    }
  }

  private async handlePullRequestOpened(payload: any): Promise<void> {
    // Automatically trigger code review
    await this.orchestrator.delegateTask({
      type: 'review',
      description: `Review PR #${payload.pull_request.number}: ${payload.pull_request.title}`,
      priority: 'medium',
      metadata: {
        repository: payload.repository.full_name,
        pullNumber: payload.pull_request.number
      }
    });
  }

  private async handleMainBranchPush(payload: any): Promise<void> {
    // Trigger deployment workflow
    await this.workflowEngine.executeWorkflow('deployment', {
      repository: payload.repository.full_name,
      commitSha: payload.head_commit.id
    });
  }

  public start(port: number = 3000): void {
    this.app.listen(port, () => {
      this.logger.info(`AI GitHub Pipeline server started on port ${port}`);
      console.log(`
🚀 AI GitHub Pipeline is running!

📊 Dashboard: http://localhost:${port}/dashboard
🔧 API Endpoints:
   - POST /instructions - Send instructions to the AI
   - POST /projects - Create new projects
   - GET /tasks - List all tasks
   - POST /review/pull-request - Review pull requests
   - POST /workflows/{id}/execute - Execute workflows

📖 Documentation: Check the README.md for detailed usage instructions
      `);
    });
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const pipeline = new AIGitHubPipeline();
  const port = parseInt(process.env.PORT || '3000', 10);
  pipeline.start(port);
}

export default AIGitHubPipeline;
