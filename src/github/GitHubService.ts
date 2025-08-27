import { Octokit } from '@octokit/rest';
import { Logger } from '../utils/Logger';

export interface Repository {
  owner: string;
  name: string;
}

export interface CreateRepositoryOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
}

export interface CreateFileOptions {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
}

export interface UpdateFileOptions extends CreateFileOptions {
  sha?: string;
}

export interface CreatePullRequestOptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface CreateIssueOptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface CreateReviewCommentOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  path: string;
  line: number;
  commitId: string;
}

export interface SubmitReviewOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

export class GitHubService {
  private octokit: Octokit;
  private logger: Logger;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
    this.logger = new Logger('GitHubService');
  }

  async createRepository(options: CreateRepositoryOptions): Promise<any> {
    try {
      const response = await this.octokit.repos.createForAuthenticatedUser({
        name: options.name,
        description: options.description,
        private: options.private || false,
        auto_init: options.autoInit || true,
        gitignore_template: options.gitignoreTemplate,
        license_template: options.licenseTemplate,
      });

      this.logger.info(`Repository created: ${response.data.full_name}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create repository:', error);
      throw error;
    }
  }

  async createFile(options: CreateFileOptions): Promise<any> {
    try {
      const content = Buffer.from(options.content).toString('base64');
      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: options.owner,
        repo: options.repo,
        path: options.path,
        message: options.message,
        content,
        branch: options.branch,
      });

      this.logger.info(`File created: ${options.path}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create file: ${options.path}`, error);
      throw error;
    }
  }

  async updateFile(options: UpdateFileOptions): Promise<any> {
    try {
      const content = Buffer.from(options.content).toString('base64');
      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: options.owner,
        repo: options.repo,
        path: options.path,
        message: options.message,
        content,
        sha: options.sha,
        branch: options.branch,
      });

      this.logger.info(`File updated: ${options.path}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update file: ${options.path}`, error);
      throw error;
    }
  }

  async getFileContent(repository: Repository, filePath: string): Promise<string> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: repository.owner,
        repo: repository.name,
        path: filePath,
      });

      if ('content' in response.data) {
        return Buffer.from(response.data.content, 'base64').toString();
      }
      throw new Error('File content not found');
    } catch (error) {
      this.logger.error(`Failed to get file content: ${filePath}`, error);
      throw error;
    }
  }

  async getPullRequest(repository: Repository, pullNumber: number): Promise<any> {
    try {
      const response = await this.octokit.pulls.get({
        owner: repository.owner,
        repo: repository.name,
        pull_number: pullNumber,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get pull request: ${pullNumber}`, error);
      throw error;
    }
  }

  async getPullRequestFiles(repository: Repository, pullNumber: number): Promise<any[]> {
    try {
      const response = await this.octokit.pulls.listFiles({
        owner: repository.owner,
        repo: repository.name,
        pull_number: pullNumber,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get pull request files: ${pullNumber}`, error);
      throw error;
    }
  }

  async getPullRequestDiff(repository: Repository, pullNumber: number): Promise<string> {
    try {
      const response = await this.octokit.pulls.get({
        owner: repository.owner,
        repo: repository.name,
        pull_number: pullNumber,
        mediaType: {
          format: 'diff',
        },
      });

      return response.data as any;
    } catch (error) {
      this.logger.error(`Failed to get pull request diff: ${pullNumber}`, error);
      throw error;
    }
  }

  async createPullRequest(options: CreatePullRequestOptions): Promise<any> {
    try {
      const response = await this.octokit.pulls.create({
        owner: options.owner,
        repo: options.repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
      });

      this.logger.info(`Pull request created: #${response.data.number}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create pull request:', error);
      throw error;
    }
  }

  async createIssue(options: CreateIssueOptions): Promise<any> {
    try {
      const response = await this.octokit.issues.create({
        owner: options.owner,
        repo: options.repo,
        title: options.title,
        body: options.body,
        labels: options.labels,
      });

      this.logger.info(`Issue created: #${response.data.number}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create issue:', error);
      throw error;
    }
  }

  async createBranch(repository: Repository, branchName: string, fromBranch = 'main'): Promise<any> {
    try {
      // Get the SHA of the base branch
      const baseRef = await this.octokit.git.getRef({
        owner: repository.owner,
        repo: repository.name,
        ref: `heads/${fromBranch}`,
      });

      // Create new branch
      const response = await this.octokit.git.createRef({
        owner: repository.owner,
        repo: repository.name,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.data.object.sha,
      });

      this.logger.info(`Branch created: ${branchName}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create branch: ${branchName}`, error);
      throw error;
    }
  }

  async createReviewComment(options: CreateReviewCommentOptions): Promise<any> {
    try {
      const response = await this.octokit.pulls.createReviewComment({
        owner: options.owner,
        repo: options.repo,
        pull_number: options.pullNumber,
        body: options.body,
        commit_id: options.commitId,
        path: options.path,
        line: options.line,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create review comment:', error);
      throw error;
    }
  }

  async submitReview(options: SubmitReviewOptions): Promise<any> {
    try {
      const response = await this.octokit.pulls.createReview({
        owner: options.owner,
        repo: options.repo,
        pull_number: options.pullNumber,
        body: options.body,
        event: options.event,
      });

      this.logger.info(`Review submitted: ${options.event}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to submit review:', error);
      throw error;
    }
  }

  async getRepositoryFiles(repository: Repository, path = ''): Promise<any[]> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: repository.owner,
        repo: repository.name,
        path,
      });

      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [response.data];
    } catch (error) {
      this.logger.error(`Failed to get repository files: ${path}`, error);
      throw error;
    }
  }

  async getDirectoryFiles(repository: Repository, directory: string): Promise<any[]> {
    return this.getRepositoryFiles(repository, directory);
  }

  async getRepositoryStructure(repository: Repository): Promise<any> {
    try {
      const tree = await this.octokit.git.getTree({
        owner: repository.owner,
        repo: repository.name,
        tree_sha: 'main',
        recursive: 'true',
      });

      return tree.data;
    } catch (error) {
      this.logger.error('Failed to get repository structure:', error);
      throw error;
    }
  }

  async getRepositoryMetrics(repository: Repository): Promise<any> {
    try {
      const [repo, issues, pullRequests, commits] = await Promise.all([
        this.octokit.repos.get({
          owner: repository.owner,
          repo: repository.name,
        }),
        this.octokit.issues.listForRepo({
          owner: repository.owner,
          repo: repository.name,
          state: 'all',
        }),
        this.octokit.pulls.list({
          owner: repository.owner,
          repo: repository.name,
          state: 'all',
        }),
        this.octokit.repos.listCommits({
          owner: repository.owner,
          repo: repository.name,
        }),
      ]);

      return {
        repository: repo.data,
        issues: issues.data,
        pullRequests: pullRequests.data,
        commits: commits.data,
      };
    } catch (error) {
      this.logger.error('Failed to get repository metrics:', error);
      throw error;
    }
  }
}
