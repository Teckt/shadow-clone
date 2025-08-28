import requests
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
import os

logger = logging.getLogger(__name__)

class GitHubAPI:
    """GitHub API wrapper with Copilot coding agent integration"""
    
    def __init__(self, token: str):
        self.token = token
        self.base_url = "https://api.github.com"
        self.graphql_url = "https://api.github.com/graphql"
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Copilot-Manager/1.0"
        }
        self.graphql_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Initialize AI clients safely
        try:
            if os.getenv('OPENAI_API_KEY'):
                import openai
                self.openai_client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            else:
                self.openai_client = None
        except Exception as e:
            logger.warning(f"Could not initialize OpenAI client: {e}")
            self.openai_client = None
            
        try:
            if os.getenv('ANTHROPIC_API_KEY'):
                import anthropic
                self.anthropic_client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
            else:
                self.anthropic_client = None
        except Exception as e:
            logger.warning(f"Could not initialize Anthropic client: {e}")
            self.anthropic_client = None
    
    def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict:
        """Make a request to GitHub REST API"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data if method in ['POST', 'PUT', 'PATCH'] else None,
                params=data if method == 'GET' else None
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"GitHub API request failed: {e}")
            raise
    
    def _make_graphql_request(self, query: str, variables: Optional[Dict] = None) -> Dict:
        """Make a GraphQL request to GitHub API"""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        
        try:
            response = requests.post(
                self.graphql_url,
                headers=self.graphql_headers,
                json=payload
            )
            response.raise_for_status()
            result = response.json()
            
            if "errors" in result:
                raise Exception(f"GraphQL errors: {result['errors']}")
            
            return result["data"]
        except requests.exceptions.RequestException as e:
            logger.error(f"GitHub GraphQL request failed: {e}")
            raise
    
    def check_repository_and_copilot(self, owner: str, name: str) -> Dict:
        """Check if repository exists and if Copilot is available"""
        try:
            # Check repository existence
            repo_data = self._make_request("GET", f"repos/{owner}/{name}")
            
            # Check Copilot availability using GraphQL
            query = """
            query($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                    suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 100) {
                        nodes {
                            login
                            __typename
                            ... on Bot {
                                id
                            }
                        }
                    }
                }
            }
            """
            
            graphql_result = self._make_graphql_request(query, {"owner": owner, "name": name})
            
            # Check if copilot-swe-agent is in suggested actors
            copilot_enabled = False
            copilot_id = None
            
            if graphql_result and "repository" in graphql_result:
                actors = graphql_result["repository"]["suggestedActors"]["nodes"]
                for actor in actors:
                    if actor.get("login") == "copilot-swe-agent":
                        copilot_enabled = True
                        copilot_id = actor.get("id")
                        break
            
            return {
                "exists": True,
                "copilot_enabled": copilot_enabled,
                "copilot_id": copilot_id,
                "description": repo_data.get("description", ""),
                "private": repo_data.get("private", False),
                "full_name": repo_data.get("full_name"),
                "default_branch": repo_data.get("default_branch", "main")
            }
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return {"exists": False, "copilot_enabled": False}
            raise
        except Exception as e:
            logger.error(f"Error checking repository {owner}/{name}: {e}")
            return {"exists": False, "copilot_enabled": False, "error": str(e)}
    
    def get_repository_issues(self, owner: str, name: str, state: str = "open") -> List[Dict]:
        """Get issues for a repository"""
        try:
            issues = self._make_request("GET", f"repos/{owner}/{name}/issues", {
                "state": state,
                "per_page": 50,
                "sort": "updated",
                "direction": "desc"
            })
            
            # Filter out pull requests (they appear in issues API)
            return [issue for issue in issues if "pull_request" not in issue]
        except Exception as e:
            logger.error(f"Error getting issues for {owner}/{name}: {e}")
            return []
    
    def create_issue(self, owner: str, name: str, title: str, body: str = "", labels: Optional[List[str]] = None) -> Dict:
        """Create a new issue"""
        data = {
            "title": title,
            "body": body
        }
        if labels:
            data["labels"] = labels
        
        try:
            issue = self._make_request("POST", f"repos/{owner}/{name}/issues", data)
            logger.info(f"Created issue #{issue['number']} in {owner}/{name}")
            return issue
        except Exception as e:
            logger.error(f"Error creating issue in {owner}/{name}: {e}")
            raise
    
    def assign_issue_to_copilot(self, owner: str, name: str, issue_number: int) -> Dict:
        """Assign an issue to Copilot using MCP GitHub tools"""
        try:
            # First verify the repository and Copilot availability
            repo_check = self.check_repository_and_copilot(owner, name)
            
            if not repo_check["copilot_enabled"]:
                return {
                    "success": False,
                    "error": "Copilot coding agent is not enabled for this repository"
                }
            
            # Get issue details first
            issue = self._make_request("GET", f"repos/{owner}/{name}/issues/{issue_number}")
            
            # Note: This is a placeholder implementation
            # In the actual Flask app, we would need to call the MCP GitHub tool function
            # Since we can't call MCP tools from this Python module directly,
            # we'll need to restructure this to be called from the Flask routes
            
            # For now, return a simulation result
            logger.info(f"Would assign issue #{issue_number} to Copilot in {owner}/{name}")
            return {
                "success": True,
                "title": issue.get("title", ""),
                "message": "Issue assignment to Copilot would be processed via MCP tool"
            }
                
        except Exception as e:
            logger.error(f"Error assigning issue #{issue_number} to Copilot in {owner}/{name}: {e}")
            return {"success": False, "error": str(e)}
    
    def get_task_status(self, owner: str, name: str, issue_number: int) -> Dict:
        """Get the current status of a task assigned to Copilot"""
        try:
            # Get issue details
            issue = self._make_request("GET", f"repos/{owner}/{name}/issues/{issue_number}")
            
            # Check for linked pull requests
            # Look for pull requests that reference this issue
            prs = self._make_request("GET", f"repos/{owner}/{name}/pulls", {
                "state": "all",
                "sort": "updated",
                "direction": "desc"
            })
            
            linked_pr = None
            for pr in prs:
                # Check if PR body or title mentions the issue
                pr_body = pr.get("body", "").lower()
                pr_title = pr.get("title", "").lower()
                issue_refs = [f"#{issue_number}", f"fixes #{issue_number}", f"closes #{issue_number}"]
                
                if any(ref in pr_body or ref in pr_title for ref in issue_refs):
                    linked_pr = pr
                    break
            
            # Get issue comments to check for Copilot activity
            comments = self._make_request("GET", f"repos/{owner}/{name}/issues/{issue_number}/comments")
            
            copilot_activity = []
            for comment in comments:
                if comment["user"]["login"] == "copilot-swe-agent":
                    copilot_activity.append({
                        "created_at": comment["created_at"],
                        "body": comment["body"]
                    })
            
            return {
                "issue": issue,
                "linked_pr": linked_pr,
                "pr_number": linked_pr["number"] if linked_pr else None,
                "copilot_activity": copilot_activity,
                "status": self._determine_task_status(issue, linked_pr, copilot_activity)
            }
            
        except Exception as e:
            logger.error(f"Error getting task status for {owner}/{name}#{issue_number}: {e}")
            return {"error": str(e)}
    
    def _determine_task_status(self, issue: Dict, linked_pr: Optional[Dict], copilot_activity: List[Dict]) -> str:
        """Determine the current status of a Copilot task"""
        if not copilot_activity:
            return "assigned"
        
        if linked_pr:
            if linked_pr["state"] == "closed":
                if linked_pr["merged"]:
                    return "completed"
                else:
                    return "failed"
            elif linked_pr["draft"]:
                return "in_progress"
            else:
                return "ready_for_review"
        
        return "in_progress"
    
    def get_pull_request_info(self, owner: str, name: str, pr_number: int) -> Dict:
        """Get detailed information about a pull request"""
        try:
            pr = self._make_request("GET", f"repos/{owner}/{name}/pulls/{pr_number}")
            
            # Get PR files
            files = self._make_request("GET", f"repos/{owner}/{name}/pulls/{pr_number}/files")
            
            # Get PR commits
            commits = self._make_request("GET", f"repos/{owner}/{name}/pulls/{pr_number}/commits")
            
            # Get PR reviews
            reviews = self._make_request("GET", f"repos/{owner}/{name}/pulls/{pr_number}/reviews")
            
            return {
                "pr": pr,
                "files": files,
                "commits": commits,
                "reviews": reviews
            }
            
        except Exception as e:
            logger.error(f"Error getting PR info for {owner}/{name}#{pr_number}: {e}")
            return {"error": str(e)}
    
    def submit_pr_review(self, owner: str, name: str, pr_number: int, action: str, body: str = "") -> Dict:
        """Submit a review for a pull request"""
        try:
            data = {
                "event": action,
                "body": body
            }
            
            review = self._make_request("POST", f"repos/{owner}/{name}/pulls/{pr_number}/reviews", data)
            logger.info(f"Submitted {action} review for PR #{pr_number} in {owner}/{name}")
            
            return {"success": True, "review": review}
            
        except Exception as e:
            logger.error(f"Error submitting review for PR #{pr_number} in {owner}/{name}: {e}")
            return {"success": False, "error": str(e)}
    
    def analyze_pr_with_ai(self, pr_info: Dict) -> Dict:
        """Analyze a pull request using AI and provide recommendations"""
        try:
            if not pr_info or "pr" not in pr_info:
                return {"error": "Invalid PR information"}
            
            pr = pr_info["pr"]
            files = pr_info.get("files", [])
            
            # Prepare context for AI analysis
            context = {
                "title": pr["title"],
                "description": pr["body"] or "",
                "files_changed": len(files),
                "additions": pr["additions"],
                "deletions": pr["deletions"],
                "changes": []
            }
            
            # Add file changes to context (limit to first 10 files for token efficiency)
            for file in files[:10]:
                context["changes"].append({
                    "filename": file["filename"],
                    "status": file["status"],
                    "additions": file["additions"],
                    "deletions": file["deletions"],
                    "patch": file.get("patch", "")[:2000]  # Limit patch size
                })
            
            # Use OpenAI or Anthropic for analysis
            if self.openai_client:
                return self._analyze_with_openai(context)
            elif self.anthropic_client:
                return self._analyze_with_anthropic(context)
            else:
                return {"error": "No AI client configured"}
                
        except Exception as e:
            logger.error(f"Error analyzing PR with AI: {e}")
            return {"error": str(e)}
    
    def _analyze_with_openai(self, context: Dict) -> Dict:
        """Analyze PR using OpenAI"""
        prompt = f"""
        Analyze this pull request created by GitHub Copilot and provide a code review:

        Title: {context['title']}
        Description: {context['description']}
        Files changed: {context['files_changed']}
        Lines added: {context['additions']}
        Lines deleted: {context['deletions']}

        Changes:
        {json.dumps(context['changes'], indent=2)}

        Please provide:
        1. Overall assessment (approve/request_changes/comment)
        2. Code quality score (1-10)
        3. Key findings (positive and negative)
        4. Specific recommendations
        5. Security considerations
        6. Confidence level (1-10)

        Format your response as JSON.
        """
        
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are an expert code reviewer analyzing a pull request created by GitHub Copilot. Provide thorough, constructive feedback."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            
            analysis = response.choices[0].message.content
            
            # Try to parse as JSON, fallback to text if it fails
            try:
                return json.loads(analysis)
            except json.JSONDecodeError:
                return {"analysis": analysis, "recommendation": "COMMENT"}
                
        except Exception as e:
            logger.error(f"OpenAI analysis error: {e}")
            return {"error": str(e)}
    
    def _analyze_with_anthropic(self, context: Dict) -> Dict:
        """Analyze PR using Anthropic Claude"""
        prompt = f"""
        Analyze this pull request created by GitHub Copilot and provide a code review:

        Title: {context['title']}
        Description: {context['description']}
        Files changed: {context['files_changed']}
        Lines added: {context['additions']}
        Lines deleted: {context['deletions']}

        Changes:
        {json.dumps(context['changes'], indent=2)}

        Please provide:
        1. Overall assessment (approve/request_changes/comment)
        2. Code quality score (1-10)
        3. Key findings (positive and negative)
        4. Specific recommendations
        5. Security considerations
        6. Confidence level (1-10)

        Format your response as JSON.
        """
        
        try:
            response = self.anthropic_client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=1000,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            
            analysis = response.content[0].text
            
            # Try to parse as JSON, fallback to text if it fails
            try:
                return json.loads(analysis)
            except json.JSONDecodeError:
                return {"analysis": analysis, "recommendation": "COMMENT"}
                
        except Exception as e:
            logger.error(f"Anthropic analysis error: {e}")
            return {"error": str(e)}
    
    def search_repositories(self, query: str, per_page: int = 10) -> List[Dict]:
        """Search for repositories on GitHub"""
        try:
            result = self._make_request("GET", "search/repositories", {
                "q": query,
                "per_page": per_page,
                "sort": "stars",
                "order": "desc"
            })
            
            return result.get("items", [])
            
        except Exception as e:
            logger.error(f"Error searching repositories: {e}")
            return []
