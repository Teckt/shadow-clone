#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('🚀 Welcome to Shadow Clone AI Pipeline Setup!\n');
  
  // Check if .env already exists
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    console.log('✅ .env file already exists!');
    const overwrite = await question('Do you want to reconfigure? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled. Use npm run dev to start.');
      rl.close();
      return;
    }
  }

  console.log('Let\'s set up your API keys:\n');

  // GitHub Token
  console.log('1. GitHub Personal Access Token');
  console.log('   Go to: https://github.com/settings/tokens');
  console.log('   Create token with: repo, workflow, write:packages, read:org, admin:repo_hook\n');
  const githubToken = await question('Enter your GitHub token: ');

  // OpenAI API Key
  console.log('\n2. OpenAI API Key (recommended for best results)');
  console.log('   Go to: https://platform.openai.com/api-keys\n');
  const openaiKey = await question('Enter your OpenAI API key (or press Enter to skip): ');

  // Anthropic API Key
  console.log('\n3. Anthropic API Key (optional)');
  console.log('   Go to: https://console.anthropic.com/\n');
  const anthropicKey = await question('Enter your Anthropic API key (or press Enter to skip): ');

  // Port
  const port = await question('\n4. Port (default 3000): ') || '3000';

  // Create .env file
  const envContent = `# GitHub Configuration
GITHUB_TOKEN=${githubToken}
GITHUB_APP_ID=your_github_app_id_here
GITHUB_APP_PRIVATE_KEY=your_github_app_private_key_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# AI Service Configuration
OPENAI_API_KEY=${openaiKey}
ANTHROPIC_API_KEY=${anthropicKey}

# Database Configuration (optional for advanced features)
DATABASE_URL=postgresql://username:password@localhost:5432/ai_pipeline
REDIS_URL=redis://localhost:6379

# Application Configuration
NODE_ENV=development
PORT=${port}
LOG_LEVEL=info

# Security (generate these for production)
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# External Services (optional)
DOCKER_REGISTRY_URL=your_docker_registry_url_here
DEPLOYMENT_WEBHOOK_URL=your_deployment_webhook_url_here

# Monitoring (optional)
SENTRY_DSN=your_sentry_dsn_here
PROMETHEUS_ENDPOINT=your_prometheus_endpoint_here
`;

  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ Configuration saved to .env file!');

  // Validation
  if (!githubToken) {
    console.log('\n⚠️  Warning: GitHub token is required for full functionality');
  }
  
  if (!openaiKey && !anthropicKey) {
    console.log('\n⚠️  Warning: At least one AI API key (OpenAI or Anthropic) is required');
  }

  console.log('\n🎉 Setup complete! Next steps:');
  console.log('   1. Run: npm run dev');
  console.log('   2. Visit: http://localhost:' + port + '/dashboard');
  console.log('   3. Read: SETUP.md for detailed usage instructions');
  
  console.log('\n💡 Quick test:');
  console.log(`   curl -X POST http://localhost:${port}/instructions \\`);
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"instructions": "Create a simple Hello World React app"}\'');

  rl.close();
}

setup().catch(console.error);
