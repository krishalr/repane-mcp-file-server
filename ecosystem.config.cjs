module.exports = {
  apps: [
    {
      name: "workspace-mcp",
      script: "dist/index.js",
      cwd: __dirname,
      autorestart: true,
      env: { PORT: 3000 },
    },
  ],
};