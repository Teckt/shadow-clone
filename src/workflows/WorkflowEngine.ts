import { Logger } from '../utils/Logger';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'condition' | 'parallel' | 'sequential';
  dependencies?: string[];
  config?: Record<string, any>;
  timeout?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  variables?: Record<string, any>;
}

export interface WorkflowTrigger {
  type: 'github' | 'schedule' | 'manual' | 'webhook';
  config: Record<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  steps: WorkflowStepExecution[];
  variables: Record<string, any>;
}

export interface WorkflowStepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  output?: any;
  error?: string;
}

export class WorkflowEngine {
  private logger: Logger;
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();

  constructor() {
    this.logger = new Logger('WorkflowEngine');
  }

  /**
   * Registers a new workflow
   */
  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
    this.logger.info(`Workflow registered: ${workflow.name}`);
  }

  /**
   * Executes a workflow
   */
  async executeWorkflow(
    workflowId: string,
    variables: Record<string, any> = {}
  ): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = this.generateExecutionId();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'pending',
      startedAt: new Date(),
      steps: workflow.steps.map(step => ({
        stepId: step.id,
        status: 'pending'
      })),
      variables: { ...workflow.variables, ...variables }
    };

    this.executions.set(executionId, execution);
    this.logger.info(`Starting workflow execution: ${executionId}`);

    // Start execution asynchronously
    this.runWorkflowExecution(execution, workflow).catch(error => {
      this.logger.error('Workflow execution failed:', error);
      execution.status = 'failed';
      execution.completedAt = new Date();
    });

    return executionId;
  }

  /**
   * Gets workflow execution status
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Lists all workflow executions
   */
  listExecutions(workflowId?: string): WorkflowExecution[] {
    const executions = Array.from(this.executions.values());
    
    if (workflowId) {
      return executions.filter(exec => exec.workflowId === workflowId);
    }
    
    return executions;
  }

  /**
   * Cancels a workflow execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status === 'running') {
      execution.status = 'cancelled';
      execution.completedAt = new Date();
      this.logger.info(`Workflow execution cancelled: ${executionId}`);
    }
  }

  /**
   * Creates common workflow templates
   */
  createFeatureDevelopmentWorkflow(): Workflow {
    return {
      id: 'feature-development',
      name: 'Feature Development',
      description: 'Automated workflow for developing new features',
      triggers: [
        {
          type: 'github',
          config: {
            event: 'issues',
            action: 'labeled',
            label: 'feature'
          }
        }
      ],
      steps: [
        {
          id: 'analyze-requirements',
          name: 'Analyze Requirements',
          type: 'action',
          config: {
            agent: 'feature-agent',
            action: 'analyze-requirements'
          }
        },
        {
          id: 'create-branch',
          name: 'Create Feature Branch',
          type: 'action',
          dependencies: ['analyze-requirements'],
          config: {
            agent: 'github-agent',
            action: 'create-branch'
          }
        },
        {
          id: 'generate-code',
          name: 'Generate Initial Code',
          type: 'action',
          dependencies: ['create-branch'],
          config: {
            agent: 'code-agent',
            action: 'generate-feature-code'
          }
        },
        {
          id: 'create-tests',
          name: 'Create Tests',
          type: 'action',
          dependencies: ['generate-code'],
          config: {
            agent: 'qa-agent',
            action: 'create-tests'
          }
        },
        {
          id: 'create-pr',
          name: 'Create Pull Request',
          type: 'action',
          dependencies: ['create-tests'],
          config: {
            agent: 'github-agent',
            action: 'create-pull-request'
          }
        },
        {
          id: 'code-review',
          name: 'Automated Code Review',
          type: 'action',
          dependencies: ['create-pr'],
          config: {
            agent: 'code-review-agent',
            action: 'review-pull-request'
          }
        }
      ]
    };
  }

  createBugFixWorkflow(): Workflow {
    return {
      id: 'bug-fix',
      name: 'Bug Fix',
      description: 'Automated workflow for fixing bugs',
      triggers: [
        {
          type: 'github',
          config: {
            event: 'issues',
            action: 'labeled',
            label: 'bug'
          }
        }
      ],
      steps: [
        {
          id: 'analyze-bug',
          name: 'Analyze Bug Report',
          type: 'action',
          config: {
            agent: 'qa-agent',
            action: 'analyze-bug'
          }
        },
        {
          id: 'reproduce-bug',
          name: 'Reproduce Bug',
          type: 'action',
          dependencies: ['analyze-bug'],
          config: {
            agent: 'qa-agent',
            action: 'reproduce-bug'
          }
        },
        {
          id: 'create-fix-branch',
          name: 'Create Fix Branch',
          type: 'action',
          dependencies: ['reproduce-bug'],
          config: {
            agent: 'github-agent',
            action: 'create-branch'
          }
        },
        {
          id: 'implement-fix',
          name: 'Implement Fix',
          type: 'action',
          dependencies: ['create-fix-branch'],
          config: {
            agent: 'code-agent',
            action: 'implement-bug-fix'
          }
        },
        {
          id: 'test-fix',
          name: 'Test Fix',
          type: 'action',
          dependencies: ['implement-fix'],
          config: {
            agent: 'qa-agent',
            action: 'test-bug-fix'
          }
        },
        {
          id: 'create-fix-pr',
          name: 'Create Fix Pull Request',
          type: 'action',
          dependencies: ['test-fix'],
          config: {
            agent: 'github-agent',
            action: 'create-pull-request'
          }
        }
      ]
    };
  }

  createDeploymentWorkflow(): Workflow {
    return {
      id: 'deployment',
      name: 'Deployment',
      description: 'Automated deployment workflow',
      triggers: [
        {
          type: 'github',
          config: {
            event: 'push',
            branch: 'main'
          }
        }
      ],
      steps: [
        {
          id: 'run-tests',
          name: 'Run All Tests',
          type: 'action',
          config: {
            agent: 'qa-agent',
            action: 'run-all-tests'
          }
        },
        {
          id: 'security-scan',
          name: 'Security Scan',
          type: 'action',
          dependencies: ['run-tests'],
          config: {
            agent: 'security-agent',
            action: 'security-scan'
          }
        },
        {
          id: 'build-application',
          name: 'Build Application',
          type: 'action',
          dependencies: ['security-scan'],
          config: {
            agent: 'devops-agent',
            action: 'build'
          }
        },
        {
          id: 'deploy-staging',
          name: 'Deploy to Staging',
          type: 'action',
          dependencies: ['build-application'],
          config: {
            agent: 'devops-agent',
            action: 'deploy-staging'
          }
        },
        {
          id: 'integration-tests',
          name: 'Integration Tests',
          type: 'action',
          dependencies: ['deploy-staging'],
          config: {
            agent: 'qa-agent',
            action: 'integration-tests'
          }
        },
        {
          id: 'deploy-production',
          name: 'Deploy to Production',
          type: 'action',
          dependencies: ['integration-tests'],
          config: {
            agent: 'devops-agent',
            action: 'deploy-production'
          }
        }
      ]
    };
  }

  private async runWorkflowExecution(execution: WorkflowExecution, workflow: Workflow): Promise<void> {
    execution.status = 'running';
    
    try {
      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(workflow.steps);
      
      // Execute steps in order
      await this.executeSteps(execution, workflow.steps, dependencyGraph);
      
      execution.status = 'completed';
      execution.completedAt = new Date();
      
      this.logger.info(`Workflow execution completed: ${execution.id}`);
    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date();
      this.logger.error('Workflow execution failed:', error);
      throw error;
    }
  }

  private buildDependencyGraph(steps: WorkflowStep[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const step of steps) {
      graph.set(step.id, step.dependencies || []);
    }
    
    return graph;
  }

  private async executeSteps(
    execution: WorkflowExecution,
    steps: WorkflowStep[],
    dependencyGraph: Map<string, string[]>
  ): Promise<void> {
    const completed = new Set<string>();
    const running = new Set<string>();
    
    while (completed.size < steps.length) {
      if (execution.status === 'cancelled') {
        throw new Error('Workflow execution cancelled');
      }
      
      // Find steps that can be executed
      const readySteps = steps.filter(step => {
        if (completed.has(step.id) || running.has(step.id)) {
          return false;
        }
        
        const dependencies = dependencyGraph.get(step.id) || [];
        return dependencies.every(dep => completed.has(dep));
      });
      
      if (readySteps.length === 0) {
        // Check if we're waiting for running steps
        if (running.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          throw new Error('Workflow deadlock detected');
        }
      }
      
      // Execute ready steps
      const promises = readySteps.map(async (step) => {
        running.add(step.id);
        
        try {
          await this.executeStep(execution, step);
          completed.add(step.id);
        } catch (error) {
          this.logger.error(`Step failed: ${step.id}`, error);
          throw error;
        } finally {
          running.delete(step.id);
        }
      });
      
      await Promise.all(promises);
    }
  }

  private async executeStep(execution: WorkflowExecution, step: WorkflowStep): Promise<void> {
    const stepExecution = execution.steps.find(s => s.stepId === step.id);
    if (!stepExecution) {
      throw new Error(`Step execution not found: ${step.id}`);
    }
    
    stepExecution.status = 'running';
    stepExecution.startedAt = new Date();
    
    this.logger.info(`Executing step: ${step.name}`);
    
    try {
      // Simulate step execution
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
      
      stepExecution.status = 'completed';
      stepExecution.completedAt = new Date();
      stepExecution.output = { success: true, message: `Step ${step.name} completed` };
      
      this.logger.info(`Step completed: ${step.name}`);
    } catch (error) {
      stepExecution.status = 'failed';
      stepExecution.completedAt = new Date();
      stepExecution.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
