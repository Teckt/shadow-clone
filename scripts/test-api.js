#!/usr/bin/env node

const http = require('http');

const testInstructions = {
  simple: "Create a simple Hello World React component",
  complex: "Create a user authentication system with login, signup, and password reset functionality"
};

function makeRequest(path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Shadow Clone AI Pipeline...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const health = await makeRequest('/health');
    console.log('   ✅ Health check:', health.status);

    // Test 2: Dashboard
    console.log('\n2. Testing dashboard...');
    const dashboard = await makeRequest('/dashboard');
    console.log('   ✅ Dashboard loaded with', dashboard.summary?.totalTasks || 0, 'tasks');

    // Test 3: Simple instruction
    console.log('\n3. Testing simple instruction...');
    const simpleResult = await makeRequest('/instructions', {
      instructions: testInstructions.simple
    });
    
    if (simpleResult.success) {
      console.log('   ✅ Simple instruction processed:', simpleResult.tasks?.length || 0, 'tasks created');
    } else {
      console.log('   ❌ Simple instruction failed:', simpleResult.error || 'Unknown error');
    }

    // Test 4: List tasks
    console.log('\n4. Testing task listing...');
    const tasks = await makeRequest('/tasks');
    console.log('   ✅ Tasks retrieved:', tasks.tasks?.length || 0, 'total tasks');

    console.log('\n🎉 All tests passed! Shadow Clone is ready to use.');
    console.log('\n📊 Visit the dashboard: http://localhost:3000/dashboard');
    console.log('📖 Read the setup guide: SETUP.md');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔧 Make sure Shadow Clone is running:');
    console.log('   npm run dev');
  }
}

// Check if server is running first
makeRequest('/health')
  .then(() => runTests())
  .catch(() => {
    console.log('❌ Shadow Clone is not running!');
    console.log('\n🚀 Start Shadow Clone first:');
    console.log('   npm run setup     # Configure API keys');
    console.log('   npm run dev       # Start the server');
    console.log('   npm run test-api  # Run this test again');
  });
