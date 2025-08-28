"""
Database configuration for the GitHub Copilot Manager
"""
from flask_sqlalchemy import SQLAlchemy

# Single SQLAlchemy instance to be shared across the application
db = SQLAlchemy()
