# Usage Examples

This document provides practical examples of how to use the AI GitHub Pipeline.

## Basic Usage

### 1. Starting the Pipeline

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start the server
npm run dev
```

### 2. Sending Instructions

```bash
# Send natural language instructions
curl -X POST http://localhost:3000/instructions \
  -H "Content-Type: application/json" \
  -d '{"instructions": "Create a new React component for user authentication with TypeScript"}'
```

### 3. Creating a Project

```bash
curl -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-awesome-app",
    "description": "A modern web application",
    "features": ["authentication", "dashboard", "api"],
    "technology": "TypeScript",
    "framework": "React"
  }'
```

## Advanced Examples

### 1. Feature Development Workflow

```typescript
import { OrchestratorAgent } from './src/agents/orchestrator/OrchestratorAgent';

const orchestrator = new OrchestratorAgent({
  githubToken: process.env.GITHUB_TOKEN!,
  openaiApiKey: process.env.OPENAI_API_KEY
});

// Create a comprehensive feature
await orchestrator.processInstructions(`
  Create a user management system with the following requirements:
  - User registration and login
  - Password reset functionality
  - User profile management
  - Admin dashboard for user management
  - JWT authentication
  - Input validation and security measures
  - Comprehensive test coverage
  - API documentation
`);
```

### 2. Automated Code Review

```typescript
import { CodeReviewAgent } from './src/agents/code-review/CodeReviewAgent';

const reviewer = new CodeReviewAgent({
  githubToken: process.env.GITHUB_TOKEN!,
  openaiApiKey: process.env.OPENAI_API_KEY
});

// Review a pull request
const review = await reviewer.reviewPullRequest(
  { owner: 'your-org', name: 'your-repo' },
  123 // PR number
);

console.log('Review Summary:', review.summary);
console.log('Security Issues:', review.security_issues.length);
console.log('Approved:', review.approved);
```

### 3. Security Audit

```typescript
// Perform comprehensive security audit
const securityIssues = await reviewer.performSecurityAudit({
  owner: 'your-org',
  name: 'your-repo'
});

// Auto-fix simple issues
const qualityIssues = securityIssues.filter(issue => 
  issue.severity === 'low' && issue.autoFixable
);

await reviewer.autoFixIssues(
  { owner: 'your-org', name: 'your-repo' },
  qualityIssues
);
```

### 4. Workflow Execution

```typescript
import { WorkflowEngine } from './src/workflows/WorkflowEngine';

const workflow = new WorkflowEngine();

// Execute feature development workflow
const executionId = await workflow.executeWorkflow('feature-development', {
  issueNumber: 456,
  repository: 'your-org/your-repo',
  assignee: 'developer@example.com'
});

// Monitor execution
const execution = workflow.getExecution(executionId);
console.log('Status:', execution?.status);
console.log('Steps:', execution?.steps.map(s => `${s.stepId}: ${s.status}`));
```

## GitHub Integration Examples

### 1. Webhook Configuration

```javascript
// Set up webhook endpoint
app.post('/webhooks/github', async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;
  
  switch (event) {
    case 'issues':
      if (payload.action === 'labeled' && 
          payload.issue.labels.some(l => l.name === 'feature')) {
        await orchestrator.delegateTask({
          type: 'feature',
          description: `Implement: ${payload.issue.title}`,
          priority: 'medium',
          metadata: {
            issueNumber: payload.issue.number,
            repository: payload.repository.full_name
          }
        });
      }
      break;
      
    case 'pull_request':
      if (payload.action === 'opened') {
        await orchestrator.delegateTask({
          type: 'review',
          description: `Review PR: ${payload.pull_request.title}`,
          priority: 'high',
          metadata: {
            pullNumber: payload.pull_request.number,
            repository: payload.repository.full_name
          }
        });
      }
      break;
  }
  
  res.json({ success: true });
});
```

### 2. Automated Branch Management

```typescript
// Create feature branch with AI-generated name
const featureBranch = await orchestrator.createFeatureBranch({
  repository: { owner: 'your-org', name: 'your-repo' },
  feature: 'user authentication system',
  baseBranch: 'develop'
});

// Generate initial code structure
const codeStructure = await orchestrator.generateCodeStructure({
  feature: 'user authentication system',
  technology: 'TypeScript',
  framework: 'Express'
});

// Commit initial files
for (const file of codeStructure.files) {
  await github.createFile({
    owner: 'your-org',
    repo: 'your-repo',
    path: file.path,
    content: file.content,
    message: `feat: add ${file.path}`,
    branch: featureBranch.name
  });
}
```

## API Examples

### 1. Task Management

```bash
# List all tasks
curl http://localhost:3000/tasks

# Get specific task
curl http://localhost:3000/tasks/task_123

# Filter tasks
curl "http://localhost:3000/tasks?status=in-progress&type=feature"
```

### 2. Dashboard Data

```bash
# Get dashboard overview
curl http://localhost:3000/dashboard
```

Response:
```json
{
  "summary": {
    "totalTasks": 15,
    "pendingTasks": 3,
    "inProgressTasks": 5,
    "completedTasks": 7,
    "failedTasks": 0,
    "totalExecutions": 8,
    "runningExecutions": 2
  },
  "recentTasks": [...],
  "recentExecutions": [...]
}
```

### 3. Manual Code Review

```bash
curl -X POST http://localhost:3000/review/pull-request \
  -H "Content-Type: application/json" \
  -d '{
    "repository": {"owner": "your-org", "name": "your-repo"},
    "pullNumber": 123
  }'
```

## CLI Integration

Create a CLI tool for easier interaction:

```typescript
#!/usr/bin/env node
import { program } from 'commander';
import { OrchestratorAgent } from './src/agents/orchestrator/OrchestratorAgent';

program
  .name('ai-pipeline')
  .description('AI GitHub Pipeline CLI')
  .version('1.0.0');

program
  .command('create-project')
  .description('Create a new project')
  .option('-n, --name <name>', 'Project name')
  .option('-d, --description <desc>', 'Project description')
  .option('-f, --features <features>', 'Features (comma-separated)')
  .action(async (options) => {
    const orchestrator = new OrchestratorAgent({
      githubToken: process.env.GITHUB_TOKEN!,
      openaiApiKey: process.env.OPENAI_API_KEY
    });

    await orchestrator.createProject({
      name: options.name,
      description: options.description,
      features: options.features.split(',')
    });

    console.log(`Project ${options.name} created successfully!`);
  });

program
  .command('instruct')
  .description('Send instructions to AI')
  .argument('<instructions>', 'Natural language instructions')
  .action(async (instructions) => {
    const orchestrator = new OrchestratorAgent({
      githubToken: process.env.GITHUB_TOKEN!,
      openaiApiKey: process.env.OPENAI_API_KEY
    });

    const tasks = await orchestrator.processInstructions(instructions);
    console.log(`Created ${tasks.length} tasks:`);
    tasks.forEach(task => {
      console.log(`- ${task.type}: ${task.description}`);
    });
  });

program.parse();
```

Usage:
```bash
# Create project
./cli.js create-project -n "my-app" -d "A cool app" -f "auth,api,web"

# Send instructions
./cli.js instruct "Add user authentication to the project with OAuth2 support"
```

## Environment-Specific Examples

### Development Environment

```bash
# Start with hot reload
npm run dev

# Run with debug logging
DEBUG=* npm run dev

# Test specific agent
npm test -- --grep "OrchestratorAgent"
```

### Production Environment

```bash
# Build and start
npm run build
npm start

# With PM2
pm2 start ecosystem.config.js

# Docker deployment
docker build -t ai-pipeline .
docker run -p 3000:3000 --env-file .env ai-pipeline
```

### Testing Environment

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Integration tests
npm run test:integration

# Load testing
npm run test:load
```

These examples demonstrate the full capabilities of the AI GitHub Pipeline and show how to integrate it into various development workflows.
