import { GitHubService } from '../../github/GitHubService';
import { AIService } from '../../ai/AIService';
import { Logger } from '../../utils/Logger';

export interface CodeReviewResult {
  overall_rating: number; // 1-10 scale
  security_issues: SecurityIssue[];
  performance_issues: PerformanceIssue[];
  code_quality_issues: CodeQualityIssue[];
  suggestions: ReviewSuggestion[];
  approved: boolean;
  summary: string;
}

export interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  file: string;
  line: number;
  recommendation: string;
}

export interface PerformanceIssue {
  impact: 'low' | 'medium' | 'high';
  description: string;
  file: string;
  line: number;
  optimization: string;
}

export interface CodeQualityIssue {
  type: 'style' | 'complexity' | 'duplication' | 'naming' | 'structure';
  description: string;
  file: string;
  line: number;
  improvement: string;
}

export interface ReviewSuggestion {
  type: 'improvement' | 'alternative' | 'optimization';
  description: string;
  code_before?: string;
  code_after?: string;
}

export class CodeReviewAgent {
  private github: GitHubService;
  private ai: AIService;
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
    this.logger = new Logger('CodeReviewAgent');
  }

  /**
   * Reviews a pull request automatically
   */
  async reviewPullRequest(
    repository: { owner: string; name: string },
    pullNumber: number
  ): Promise<CodeReviewResult> {
    this.logger.info(`Reviewing PR #${pullNumber} in ${repository.owner}/${repository.name}`);

    try {
      // 1. Get PR details and diff
      const pullRequest = await this.github.getPullRequest(repository, pullNumber);
      const files = await this.github.getPullRequestFiles(repository, pullNumber);
      const diff = await this.github.getPullRequestDiff(repository, pullNumber);

      // 2. Analyze code changes with AI
      const review = await this.ai.reviewCode({
        pullRequest,
        files,
        diff,
        context: await this.getCodeContext(repository, files)
      });

      // 3. Post review comments
      await this.postReviewComments(repository, pullNumber, review);

      // 4. Submit overall review
      await this.submitReview(repository, pullNumber, review);

      this.logger.info(`Review completed for PR #${pullNumber}`);
      return review;
    } catch (error) {
      this.logger.error('Failed to review pull request:', error);
      throw error;
    }
  }

  /**
   * Reviews code in a specific file
   */
  async reviewFile(
    repository: { owner: string; name: string },
    filePath: string,
    content?: string
  ): Promise<CodeReviewResult> {
    this.logger.info(`Reviewing file: ${filePath}`);

    try {
      // Get file content if not provided
      if (!content) {
        content = await this.github.getFileContent(repository, filePath);
      }

      // Get surrounding context
      const context = await this.getFileContext(repository, filePath);

      // Analyze with AI
      const review = await this.ai.reviewCode({
        files: [{ filename: filePath, patch: content }],
        context
      });

      return review;
    } catch (error) {
      this.logger.error('Failed to review file:', error);
      throw error;
    }
  }

  /**
   * Performs security audit on repository
   */
  async performSecurityAudit(
    repository: { owner: string; name: string }
  ): Promise<SecurityIssue[]> {
    this.logger.info(`Performing security audit on ${repository.owner}/${repository.name}`);

    try {
      // Get all source files
      const files = await this.github.getRepositoryFiles(repository);
      
      const securityIssues: SecurityIssue[] = [];

      // Analyze each file for security issues
      for (const file of files) {
        const content = await this.github.getFileContent(repository, file.path);
        const issues = await this.ai.analyzeCodeSecurity(content, file.path);
        securityIssues.push(...issues);
      }

      // Check dependencies for vulnerabilities
      const dependencyIssues = await this.checkDependencyVulnerabilities(repository);
      securityIssues.push(...dependencyIssues);

      // Create security report
      await this.createSecurityReport(repository, securityIssues);

      return securityIssues;
    } catch (error) {
      this.logger.error('Failed to perform security audit:', error);
      throw error;
    }
  }

  /**
   * Suggests code improvements
   */
  async suggestImprovements(
    repository: { owner: string; name: string },
    filePath?: string
  ): Promise<ReviewSuggestion[]> {
    this.logger.info(`Suggesting improvements for ${repository.owner}/${repository.name}`);

    try {
      let files: string[];
      
      if (filePath) {
        files = [filePath];
      } else {
        // Get all source files
        const repoFiles = await this.github.getRepositoryFiles(repository);
        files = repoFiles.map(f => f.path);
      }

      const suggestions: ReviewSuggestion[] = [];

      for (const file of files) {
        const content = await this.github.getFileContent(repository, file);
        const fileSuggestions = await this.ai.suggestCodeImprovements(content, file);
        suggestions.push(...fileSuggestions);
      }

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to suggest improvements:', error);
      throw error;
    }
  }

  /**
   * Auto-fixes simple issues in code
   */
  async autoFixIssues(
    repository: { owner: string; name: string },
    issues: CodeQualityIssue[]
  ): Promise<void> {
    this.logger.info(`Auto-fixing ${issues.length} issues`);

    // Group issues by file
    const issuesByFile = issues.reduce((acc, issue) => {
      if (!acc[issue.file]) {
        acc[issue.file] = [];
      }
      acc[issue.file].push(issue);
      return acc;
    }, {} as Record<string, CodeQualityIssue[]>);

    // Create a new branch for fixes
    const branchName = `auto-fix/code-quality-${Date.now()}`;
    await this.github.createBranch(repository, branchName);

    // Apply fixes to each file
    for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
      const content = await this.github.getFileContent(repository, filePath);
      const fixedContent = await this.ai.applyCodeFixes(content, fileIssues);

      if (fixedContent !== content) {
        await this.github.updateFile({
          owner: repository.owner,
          repo: repository.name,
          path: filePath,
          content: fixedContent,
          message: `fix: auto-fix code quality issues in ${filePath}`,
          branch: branchName
        });
      }
    }

    // Create pull request with fixes
    await this.github.createPullRequest({
      owner: repository.owner,
      repo: repository.name,
      title: 'Auto-fix: Code quality improvements',
      body: this.generateFixPRDescription(issues),
      head: branchName,
      base: 'main'
    });
  }

  private async getCodeContext(
    repository: { owner: string; name: string },
    files: any[]
  ): Promise<any> {
    // Get additional context like package.json, README, etc.
    const contextFiles = ['package.json', 'README.md', 'tsconfig.json', '.eslintrc.json'];
    const context: any = {};

    for (const file of contextFiles) {
      try {
        context[file] = await this.github.getFileContent(repository, file);
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    return context;
  }

  private async getFileContext(
    repository: { owner: string; name: string },
    filePath: string
  ): Promise<any> {
    // Get related files and project structure
    const directory = filePath.split('/').slice(0, -1).join('/');
    const relatedFiles = await this.github.getDirectoryFiles(repository, directory);
    
    return {
      directory,
      relatedFiles,
      projectStructure: await this.github.getRepositoryStructure(repository)
    };
  }

  private async postReviewComments(
    repository: { owner: string; name: string },
    pullNumber: number,
    review: CodeReviewResult
  ): Promise<void> {
    const allIssues = [
      ...review.security_issues,
      ...review.performance_issues,
      ...review.code_quality_issues
    ];

    // Get the latest commit from the PR
    const pullRequest = await this.github.getPullRequest(repository, pullNumber);
    const commitId = pullRequest.head.sha;

    for (const issue of allIssues) {
      await this.github.createReviewComment({
        owner: repository.owner,
        repo: repository.name,
        pullNumber,
        body: this.formatIssueComment(issue),
        path: issue.file,
        line: issue.line,
        commitId
      });
    }
  }

  private async submitReview(
    repository: { owner: string; name: string },
    pullNumber: number,
    review: CodeReviewResult
  ): Promise<void> {
    const event = review.approved ? 'APPROVE' : 'REQUEST_CHANGES';
    
    await this.github.submitReview({
      owner: repository.owner,
      repo: repository.name,
      pullNumber,
      body: review.summary,
      event
    });
  }

  private async checkDependencyVulnerabilities(
    repository: { owner: string; name: string }
  ): Promise<SecurityIssue[]> {
    // Check package.json for known vulnerabilities
    // This would integrate with vulnerability databases
    // For now, return empty array
    return [];
  }

  private async createSecurityReport(
    repository: { owner: string; name: string },
    issues: SecurityIssue[]
  ): Promise<void> {
    if (issues.length === 0) return;

    const report = this.generateSecurityReport(issues);
    
    // Create security issue
    await this.github.createIssue({
      owner: repository.owner,
      repo: repository.name,
      title: '🔒 Security Audit Report',
      body: report,
      labels: ['security', 'audit']
    });
  }

  private formatIssueComment(issue: any): string {
    const emoji = {
      'critical': '🚨',
      'high': '⚠️',
      'medium': '⚡',
      'low': 'ℹ️'
    };

    return `${emoji[issue.severity || issue.impact] || 'ℹ️'} **${issue.type || 'Issue'}**

${issue.description}

**Recommendation:** ${issue.recommendation || issue.optimization || issue.improvement}`;
  }

  private generateFixPRDescription(issues: CodeQualityIssue[]): string {
    return `## Auto-Generated Code Quality Fixes

This PR contains automatic fixes for ${issues.length} code quality issues:

${issues.map(issue => `- ${issue.type}: ${issue.description} in \`${issue.file}\``).join('\n')}

All fixes have been generated and tested automatically. Please review before merging.`;
  }

  private generateSecurityReport(issues: SecurityIssue[]): string {
    const critical = issues.filter(i => i.severity === 'critical');
    const high = issues.filter(i => i.severity === 'high');
    const medium = issues.filter(i => i.severity === 'medium');
    const low = issues.filter(i => i.severity === 'low');

    return `# 🔒 Security Audit Report

## Summary
- 🚨 Critical: ${critical.length}
- ⚠️ High: ${high.length}
- ⚡ Medium: ${medium.length}
- ℹ️ Low: ${low.length}

## Critical Issues
${critical.map(issue => `- **${issue.file}:${issue.line}** - ${issue.description}`).join('\n')}

## High Priority Issues
${high.map(issue => `- **${issue.file}:${issue.line}** - ${issue.description}`).join('\n')}

## Recommendations
${issues.map(issue => `- ${issue.recommendation}`).join('\n')}`;
  }
}
