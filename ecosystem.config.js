// ecosystem.config.js
module.exports = {
    apps: [
      {
        name: 'bet-app-client',
        script: 'npm',
        args: 'start',
        cwd: './client',
        env: {
          NODE_ENV: 'production'
        }
      },
      {
        name: 'bet-app-server',
        script: 'src/app.js',
        cwd: './server',
        env: {
          NODE_ENV: 'production'
        }
      }
    ]
  };