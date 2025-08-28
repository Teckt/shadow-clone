import os
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_migrate import Migrate
from datetime import datetime, timedelta
import json
import logging
from dotenv import load_dotenv
from database import db

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('JWT_SECRET', 'dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///copilot_manager.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db.init_app(app)
migrate = Migrate(app, db)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import models and GitHub API wrapper
from models import Repository, Task, PRReview, CopilotSession
from github_api import GitHubAPI
from mcp_integration import mcp_routes

# Initialize GitHub API
github_api = GitHubAPI(os.getenv('GITHUB_TOKEN'))

# Register MCP integration blueprint
app.register_blueprint(mcp_routes)

@app.route('/')
def dashboard():
    """Main dashboard showing active tasks and recent activity"""
    try:
        # Get active tasks
        active_tasks = Task.query.filter(Task.status.in_(['assigned', 'in_progress'])).all()
        
        # Get recent PR reviews
        recent_reviews = PRReview.query.order_by(PRReview.created_at.desc()).limit(5).all()
        
        # Get repository stats
        total_repos = Repository.query.count()
        total_tasks = Task.query.count()
        
        return render_template('dashboard.html', 
                             active_tasks=active_tasks,
                             recent_reviews=recent_reviews,
                             total_repos=total_repos,
                             total_tasks=total_tasks)
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        flash(f"Error loading dashboard: {e}", 'error')
        return render_template('dashboard.html', active_tasks=[], recent_reviews=[], total_repos=0, total_tasks=0)

@app.route('/repositories')
def repositories():
    """Repository selection and management interface"""
    try:
        # Get repositories from database
        saved_repos = Repository.query.all()
        
        return render_template('repositories.html', repositories=saved_repos)
    except Exception as e:
        logger.error(f"Repositories error: {e}")
        flash(f"Error loading repositories: {e}", 'error')
        return render_template('repositories.html', repositories=[])

@app.route('/repositories/add', methods=['GET', 'POST'])
def add_repository():
    """Add a new repository to manage"""
    if request.method == 'POST':
        try:
            owner = request.form.get('owner')
            name = request.form.get('name')
            
            if not owner or not name:
                flash('Owner and repository name are required', 'error')
                return render_template('add_repository.html')
            
            # Check if repository already exists
            existing = Repository.query.filter_by(owner=owner, name=name).first()
            if existing:
                flash('Repository already exists', 'warning')
                return redirect(url_for('repositories'))
            
            # Verify repository exists and check Copilot availability
            repo_info = github_api.check_repository_and_copilot(owner, name)
            
            if not repo_info['exists']:
                flash('Repository not found or not accessible', 'error')
                return render_template('add_repository.html')
            
            # Create new repository record
            repo = Repository(
                owner=owner,
                name=name,
                copilot_enabled=repo_info['copilot_enabled'],
                description=repo_info.get('description', ''),
                private=repo_info.get('private', False)
            )
            
            db.session.add(repo)
            db.session.commit()
            
            flash(f'Repository {owner}/{name} added successfully', 'success')
            return redirect(url_for('repositories'))
            
        except Exception as e:
            logger.error(f"Add repository error: {e}")
            flash(f"Error adding repository: {e}", 'error')
    
    return render_template('add_repository.html')

@app.route('/repositories/<int:repo_id>/issues')
def repository_issues(repo_id):
    """Show issues for a specific repository"""
    try:
        repo = Repository.query.get_or_404(repo_id)
        
        # Get issues from GitHub
        issues = github_api.get_repository_issues(repo.owner, repo.name)
        
        # Get tasks associated with this repository
        tasks = Task.query.filter_by(repository_id=repo_id).all()
        task_by_issue = {task.issue_number: task for task in tasks}
        
        return render_template('repository_issues.html', 
                             repository=repo, 
                             issues=issues,
                             task_by_issue=task_by_issue)
    except Exception as e:
        logger.error(f"Repository issues error: {e}")
        flash(f"Error loading issues: {e}", 'error')
        return redirect(url_for('repositories'))

@app.route('/issues/create', methods=['GET', 'POST'])
def create_issue():
    """Create a new issue"""
    if request.method == 'POST':
        try:
            repo_id = request.form.get('repository_id')
            title = request.form.get('title')
            body = request.form.get('body')
            assign_to_copilot = request.form.get('assign_to_copilot') == 'on'
            
            if not all([repo_id, title]):
                flash('Repository and title are required', 'error')
                return render_template('create_issue.html', repositories=Repository.query.all())
            
            repo = Repository.query.get_or_404(repo_id)
            
            # Create issue via GitHub API
            issue = github_api.create_issue(repo.owner, repo.name, title, body)
            
            if assign_to_copilot:
                # Assign to Copilot immediately
                result = github_api.assign_issue_to_copilot(repo.owner, repo.name, issue['number'])
                
                if result['success']:
                    # Create task record
                    task = Task(
                        repository_id=repo_id,
                        issue_number=issue['number'],
                        title=title,
                        status='assigned',
                        assigned_at=datetime.utcnow()
                    )
                    db.session.add(task)
                    db.session.commit()
                    
                    flash(f'Issue created and assigned to Copilot successfully', 'success')
                else:
                    flash(f'Issue created but failed to assign to Copilot: {result["error"]}', 'warning')
            else:
                flash('Issue created successfully', 'success')
            
            return redirect(url_for('repository_issues', repo_id=repo_id))
            
        except Exception as e:
            logger.error(f"Create issue error: {e}")
            flash(f"Error creating issue: {e}", 'error')
    
    repositories = Repository.query.all()
    return render_template('create_issue.html', repositories=repositories)

@app.route('/issues/<int:repo_id>/<int:issue_number>/assign')
def assign_issue_to_copilot_route(repo_id, issue_number):
    """Assign an existing issue to Copilot"""
    try:
        repo = Repository.query.get_or_404(repo_id)
        
        # Check if already assigned
        existing_task = Task.query.filter_by(repository_id=repo_id, issue_number=issue_number).first()
        if existing_task:
            flash('Issue is already assigned to Copilot', 'warning')
            return redirect(url_for('repository_issues', repo_id=repo_id))
        
        # Get issue details first
        try:
            issue = github_api._make_request("GET", f"repos/{repo.owner}/{repo.name}/issues/{issue_number}")
        except Exception as e:
            flash(f'Issue not found: {e}', 'error')
            return redirect(url_for('repository_issues', repo_id=repo_id))
        
        # For now, create a task and mark it as assigned
        # In production, this would use the MCP GitHub tool
        task = Task(
            repository_id=repo_id,
            issue_number=issue_number,
            title=issue.get('title', f'Issue #{issue_number}'),
            description=issue.get('body', ''),
            status='assigned',
            assigned_at=datetime.utcnow()
        )
        db.session.add(task)
        db.session.commit()
        
        flash('Issue assigned to Copilot successfully (simulated)', 'success')
        return redirect(url_for('repository_issues', repo_id=repo_id))
        
    except Exception as e:
        logger.error(f"Assign issue error: {e}")
        flash(f"Error assigning issue: {e}", 'error')
        return redirect(url_for('repositories'))

@app.route('/tasks')
def tasks():
    """View all tasks and their status"""
    try:
        all_tasks = Task.query.order_by(Task.assigned_at.desc()).all()
        return render_template('tasks.html', tasks=all_tasks)
    except Exception as e:
        logger.error(f"Tasks error: {e}")
        flash(f"Error loading tasks: {e}", 'error')
        return render_template('tasks.html', tasks=[])

@app.route('/tasks/<int:task_id>')
def task_detail(task_id):
    """View detailed information about a specific task"""
    try:
        task = Task.query.get_or_404(task_id)
        
        # Get latest information from GitHub
        task_info = github_api.get_task_status(task.repository.owner, task.repository.name, task.issue_number)
        
        # Update task status if needed
        if task_info.get('pr_number') and not task.pr_number:
            task.pr_number = task_info['pr_number']
            task.status = 'in_progress'
            db.session.commit()
        
        return render_template('task_detail.html', task=task, task_info=task_info)
    except Exception as e:
        logger.error(f"Task detail error: {e}")
        flash(f"Error loading task details: {e}", 'error')
        return redirect(url_for('tasks'))

@app.route('/prs/review')
def pr_reviews():
    """View and manage PR reviews"""
    try:
        reviews = PRReview.query.order_by(PRReview.created_at.desc()).all()
        return render_template('pr_reviews.html', reviews=reviews)
    except Exception as e:
        logger.error(f"PR reviews error: {e}")
        flash(f"Error loading PR reviews: {e}", 'error')
        return render_template('pr_reviews.html', reviews=[])

@app.route('/prs/<int:task_id>/review', methods=['GET', 'POST'])
def review_pr(task_id):
    """Review a pull request created by Copilot"""
    try:
        task = Task.query.get_or_404(task_id)
        
        if not task.pr_number:
            flash('No pull request found for this task', 'error')
            return redirect(url_for('task_detail', task_id=task_id))
        
        if request.method == 'POST':
            action = request.form.get('action')
            comment = request.form.get('comment', '')
            
            # Submit review via GitHub API
            result = github_api.submit_pr_review(
                task.repository.owner, 
                task.repository.name, 
                task.pr_number, 
                action, 
                comment
            )
            
            if result['success']:
                # Create review record
                review = PRReview(
                    task_id=task_id,
                    pr_number=task.pr_number,
                    action=action,
                    comment=comment,
                    created_at=datetime.utcnow()
                )
                db.session.add(review)
                
                # Update task status
                if action == 'APPROVE':
                    task.status = 'approved'
                elif action == 'REQUEST_CHANGES':
                    task.status = 'changes_requested'
                
                db.session.commit()
                flash('Review submitted successfully', 'success')
            else:
                flash(f'Failed to submit review: {result["error"]}', 'error')
            
            return redirect(url_for('task_detail', task_id=task_id))
        
        # Get PR information for review
        pr_info = github_api.get_pull_request_info(
            task.repository.owner, 
            task.repository.name, 
            task.pr_number
        )
        
        # Get AI analysis of the PR
        ai_analysis = github_api.analyze_pr_with_ai(pr_info)
        
        return render_template('review_pr.html', 
                             task=task, 
                             pr_info=pr_info,
                             ai_analysis=ai_analysis)
        
    except Exception as e:
        logger.error(f"Review PR error: {e}")
        flash(f"Error reviewing PR: {e}", 'error')
        return redirect(url_for('tasks'))

@app.route('/api/copilot/assign', methods=['POST'])
def api_assign_copilot():
    """API endpoint to assign issue to Copilot using MCP tools"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        owner = data.get('owner')
        repo_name = data.get('repo')
        issue_number = data.get('issue_number')
        
        if not all([owner, repo_name, issue_number]):
            return jsonify({'success': False, 'error': 'Missing required parameters'}), 400
        
        # This is where we'll call the MCP GitHub tool
        # For now, we'll return a success response
        # In production, you would use the MCP tool here
        
        return jsonify({
            'success': True,
            'message': f'Issue #{issue_number} assigned to Copilot in {owner}/{repo_name}',
            'issue_number': issue_number
        })
        
    except Exception as e:
        logger.error(f"API assign copilot error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/tasks/<int:task_id>/status')
def api_task_status(task_id):
    """API endpoint to get real-time task status"""
    try:
        task = Task.query.get_or_404(task_id)
        
        # Get latest status from GitHub
        status = github_api.get_task_status(
            task.repository.owner, 
            task.repository.name, 
            task.issue_number
        )
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'status': status
        })
    except Exception as e:
        logger.error(f"API task status error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/mcp-demo')
def mcp_demo():
    """MCP GitHub Integration demonstration page"""
    try:
        repositories = Repository.query.all()
        return render_template('mcp_demo.html', repositories=repositories)
    except Exception as e:
        logger.error(f"MCP demo error: {e}")
        return render_template('mcp_demo.html', repositories=[])

@app.route('/api/repositories/search')
def api_search_repositories():
    """API endpoint to search GitHub repositories"""
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({'repositories': []})
        
        repositories = github_api.search_repositories(query)
        return jsonify({'repositories': repositories})
    except Exception as e:
        logger.error(f"API search repositories error: {e}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    app.run(debug=True, host='0.0.0.0', port=5000)
