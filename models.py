from datetime import datetime
from database import db

class Repository(db.Model):
    """Model for GitHub repositories being managed"""
    id = db.Column(db.Integer, primary_key=True)
    owner = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    private = db.Column(db.Boolean, default=False)
    copilot_enabled = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    tasks = db.relationship('Task', backref='repository', lazy=True, cascade='all, delete-orphan')
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('owner', 'name', name='unique_repo'),)
    
    def __repr__(self):
        return f'<Repository {self.owner}/{self.name}>'
    
    @property
    def full_name(self):
        return f'{self.owner}/{self.name}'
    
    @property
    def github_url(self):
        return f'https://github.com/{self.owner}/{self.name}'

class Task(db.Model):
    """Model for tasks assigned to Copilot"""
    id = db.Column(db.Integer, primary_key=True)
    repository_id = db.Column(db.Integer, db.ForeignKey('repository.id'), nullable=False)
    issue_number = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(50), default='created')  # created, assigned, in_progress, completed, failed, approved, changes_requested
    pr_number = db.Column(db.Integer)
    assigned_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    sessions = db.relationship('CopilotSession', backref='task', lazy=True, cascade='all, delete-orphan')
    reviews = db.relationship('PRReview', backref='task', lazy=True, cascade='all, delete-orphan')
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('repository_id', 'issue_number', name='unique_task'),)
    
    def __repr__(self):
        return f'<Task {self.repository.full_name}#{self.issue_number}>'
    
    @property
    def issue_url(self):
        return f'{self.repository.github_url}/issues/{self.issue_number}'
    
    @property
    def pr_url(self):
        if self.pr_number:
            return f'{self.repository.github_url}/pull/{self.pr_number}'
        return None
    
    @property
    def status_color(self):
        colors = {
            'created': 'secondary',
            'assigned': 'info',
            'in_progress': 'warning',
            'completed': 'success',
            'failed': 'danger',
            'approved': 'success',
            'changes_requested': 'warning'
        }
        return colors.get(self.status, 'secondary')

class CopilotSession(db.Model):
    """Model for tracking Copilot coding sessions"""
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    session_id = db.Column(db.String(100))  # GitHub session ID
    status = db.Column(db.String(50), default='started')  # started, running, completed, failed
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    logs = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<CopilotSession {self.session_id}>'

class PRReview(db.Model):
    """Model for pull request reviews"""
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    pr_number = db.Column(db.Integer, nullable=False)
    action = db.Column(db.String(50), nullable=False)  # APPROVE, REQUEST_CHANGES, COMMENT
    comment = db.Column(db.Text)
    ai_analysis = db.Column(db.Text)
    recommendation = db.Column(db.String(50))  # approve, reject, modify
    confidence_score = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<PRReview PR#{self.pr_number} - {self.action}>'
    
    @property
    def action_color(self):
        colors = {
            'APPROVE': 'success',
            'REQUEST_CHANGES': 'warning',
            'COMMENT': 'info'
        }
        return colors.get(self.action, 'secondary')
