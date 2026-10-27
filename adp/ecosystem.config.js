// PM2 ecosystem config for ADP
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'adp',
      script: path.join(__dirname, 'backend/dist/index.js'),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: path.join(__dirname, '.env'),
      error_file: path.join(__dirname, 'logs/error.log'),
      out_file: path.join(__dirname, 'logs/out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
