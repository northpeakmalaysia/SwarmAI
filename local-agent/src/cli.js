/**
 * CLI command definitions for SwarmAI Local Agent
 */

const os = require('os');
const { Command } = require('commander');
const chalk = require('chalk');
const { loadConfig, saveConfig, isConfigured, DEFAULT_SERVER, CONFIG_FILE } = require('./config');
const { login } = require('./auth');
const { AgentConnection } = require('./connection');
const { enableStartup, disableStartup, isStartupEnabled } = require('./startup');

function createCli() {
  const program = new Command();

  program
    .name('swarmai-agent')
    .description('SwarmAI Local Agent — Connect your device to SwarmAI')
    .version('0.1.0');

  // ==================
  // LOGIN
  // ==================
  program
    .command('login')
    .description('Authenticate this device with SwarmAI server')
    .option('-a, --api <url>', 'SwarmAI server URL', DEFAULT_SERVER)
    .option('-s, --server <url>', 'SwarmAI server URL (alias for --api)')
    .option('-n, --name <name>', 'Device name', os.hostname())
    .action(async (opts) => {
      // --api takes priority, --server is alias for backwards compat
      const serverUrl = opts.api || opts.server || DEFAULT_SERVER;
      opts.server = serverUrl;

      console.log(chalk.cyan.bold('\n  SwarmAI Local Agent\n'));
      console.log(chalk.gray(`  Server: ${serverUrl}`));
      console.log(chalk.gray(`  Device: ${opts.name}\n`));

      try {
        console.log(chalk.yellow('  Initiating authorization...'));

        const result = await login(serverUrl, opts.name);

        if (result.opened) {
          console.log(chalk.gray('  Browser opened for authorization.'));
        } else {
          console.log(chalk.yellow('  Could not open browser. Please visit:'));
          console.log(chalk.cyan(`  ${result.authUrl}\n`));
        }

        console.log(chalk.green.bold('\n  Device authorized successfully!\n'));
        console.log(chalk.gray(`  Agent ID: ${result.agentId}`));
        console.log(chalk.gray(`  Config saved to: ${CONFIG_FILE}\n`));
        console.log(chalk.cyan('  Run `swarmai-agent start` to connect.\n'));
      } catch (error) {
        console.log(chalk.red(`\n  Error: ${error.message}\n`));
        process.exit(1);
      }
    });

  // ==================
  // START
  // ==================
  program
    .command('start')
    .description('Connect to SwarmAI server and listen for commands')
    .option('--runat-startup', 'Register to auto-start at system boot')
    .option('--remove-startup', 'Remove auto-start at system boot')
    .action(async (opts) => {
      // Handle startup registration
      if (opts.runatStartup) {
        try {
          const result = enableStartup();
          console.log(chalk.green(`\n  Auto-start enabled (${result.method})`));
          console.log(chalk.gray(`  Path: ${result.path}\n`));
          console.log(chalk.gray('  SwarmAI Agent will now start automatically on boot.'));
          console.log(chalk.gray('  Use --remove-startup to disable.\n'));
        } catch (err) {
          console.log(chalk.red(`\n  Failed to enable auto-start: ${err.message}\n`));
          process.exit(1);
        }
        // Continue to also start the agent
      }

      if (opts.removeStartup) {
        const removed = disableStartup();
        if (removed) {
          console.log(chalk.green('\n  Auto-start removed.\n'));
        } else {
          console.log(chalk.yellow('\n  Auto-start was not enabled.\n'));
        }
        return;
      }

      if (!isConfigured()) {
        console.log(chalk.red('\n  Not configured. Run `swarmai-agent login` first.\n'));
        process.exit(1);
      }

      const config = loadConfig();
      console.log(chalk.cyan.bold('\n  SwarmAI Local Agent\n'));
      console.log(chalk.gray(`  Server: ${config.server}`));
      console.log(chalk.gray(`  Device: ${config.deviceName || 'Unknown'}`));
      console.log(chalk.gray(`  Agent ID: ${config.agentId}\n`));

      const connection = new AgentConnection(config.server, config.apiKey, {
        onStatusChange: (status) => {
          if (status === 'connected') {
            console.log(chalk.green(`  [${timestamp()}] Connected`));
          } else if (status === 'disconnected') {
            console.log(chalk.yellow(`  [${timestamp()}] Disconnected — will reconnect`));
          } else if (status === 'error') {
            console.log(chalk.red(`  [${timestamp()}] Connection error`));
          }
        },
        onLog: (msg) => {
          console.log(chalk.gray(`  [${timestamp()}] ${msg}`));
        },
      });

      // Handle graceful shutdown
      const shutdown = () => {
        console.log(chalk.yellow('\n  Disconnecting...'));
        connection.disconnect();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      try {
        await connection.connect();
        console.log(chalk.green('\n  Listening for commands. Press Ctrl+C to stop.\n'));

        // Keep process alive
        await new Promise(() => {});
      } catch (error) {
        console.log(chalk.red(`\n  Failed to connect: ${error.message}`));
        console.log(chalk.gray('  Make sure the server is running and your API key is valid.\n'));
        process.exit(1);
      }
    });

  // ==================
  // STATUS
  // ==================
  program
    .command('status')
    .description('Show current configuration and connection status')
    .action(() => {
      const config = loadConfig();
      console.log(chalk.cyan.bold('\n  SwarmAI Local Agent Status\n'));

      if (!isConfigured()) {
        console.log(chalk.yellow('  Not configured. Run `swarmai-agent login` first.\n'));
        return;
      }

      console.log(chalk.white(`  Server:      ${config.server}`));
      console.log(chalk.white(`  Device:      ${config.deviceName || 'Unknown'}`));
      console.log(chalk.white(`  Agent ID:    ${config.agentId || 'N/A'}`));
      console.log(chalk.white(`  API Key:     ${config.apiKey ? config.apiKey.substring(0, 12) + '...' : 'N/A'}`));
      console.log(chalk.white(`  Auto-start:  ${isStartupEnabled() ? chalk.green('Enabled') : chalk.gray('Disabled')}`));
      console.log(chalk.white(`  Config file: ${CONFIG_FILE}`));
      console.log();
    });

  // ==================
  // LOGOUT
  // ==================
  program
    .command('logout')
    .description('Remove local configuration')
    .action(() => {
      const config = loadConfig();
      if (config.apiKey) {
        saveConfig({});
        console.log(chalk.green('\n  Logged out. Config cleared.\n'));
      } else {
        console.log(chalk.gray('\n  Not logged in.\n'));
      }
    });

  // ==================
  // MCP
  // ==================
  const mcpCommand = program
    .command('mcp')
    .description('Manage MCP (Model Context Protocol) servers');

  mcpCommand
    .command('add <nameOrRecipe>')
    .description('Add an MCP server. Use a recipe name (playwright, filesystem, sqlite, git, docker) or provide custom config with --command')
    .option('-c, --command <cmd>', 'Server command (e.g., "npx")')
    .option('-a, --args <args>', 'Server arguments (comma-separated)')
    .option('-e, --env <env>', 'Environment variables (KEY=VAL,KEY2=VAL2)')
    .action((nameOrRecipe, opts) => {
      const config = loadConfig();
      const mcpServers = config.mcpServers || {};

      const { MCPManager } = require('./mcpManager');
      const recipe = MCPManager.getRecipe(nameOrRecipe);

      if (recipe && !opts.command) {
        mcpServers[nameOrRecipe] = {
          command: recipe.command,
          args: recipe.args,
          env: {},
        };
        console.log(chalk.green(`\n  MCP server "${nameOrRecipe}" added (recipe: ${recipe.description}).\n`));
      } else if (opts.command) {
        mcpServers[nameOrRecipe] = {
          command: opts.command,
          args: opts.args ? opts.args.split(',').map(s => s.trim()) : [],
          env: opts.env ? parseEnvString(opts.env) : {},
        };
        console.log(chalk.green(`\n  MCP server "${nameOrRecipe}" added (custom).\n`));
      } else {
        console.log(chalk.red(`\n  Unknown recipe "${nameOrRecipe}". Provide --command for custom server.`));
        console.log(chalk.gray(`  Available recipes: ${MCPManager.getRecipeNames().join(', ')}\n`));
        return;
      }

      config.mcpServers = mcpServers;
      saveConfig(config);
      console.log(chalk.gray('  Restart the agent to activate: swarmai-agent start\n'));
    });

  mcpCommand
    .command('remove <name>')
    .description('Remove an MCP server')
    .action((name) => {
      const config = loadConfig();
      const mcpServers = config.mcpServers || {};

      if (!mcpServers[name]) {
        console.log(chalk.yellow(`\n  MCP server "${name}" not found.\n`));
        return;
      }

      delete mcpServers[name];
      config.mcpServers = mcpServers;
      saveConfig(config);
      console.log(chalk.green(`\n  MCP server "${name}" removed.\n`));
    });

  mcpCommand
    .command('list')
    .description('List configured MCP servers and available recipes')
    .action(() => {
      const config = loadConfig();
      const mcpServers = config.mcpServers || {};
      const names = Object.keys(mcpServers);

      console.log(chalk.cyan.bold('\n  Configured MCP Servers\n'));

      if (names.length === 0) {
        console.log(chalk.gray('  None configured.\n'));
      } else {
        for (const name of names) {
          const s = mcpServers[name];
          console.log(chalk.white(`  ${chalk.green('*')} ${name}`));
          console.log(chalk.gray(`    ${s.command} ${(s.args || []).join(' ')}`));
        }
        console.log();
      }

      console.log(chalk.cyan.bold('  Available Recipes\n'));
      const { MCPManager } = require('./mcpManager');
      for (const recipe of MCPManager.getRecipeList()) {
        const installed = mcpServers[recipe.name] ? chalk.green(' (installed)') : '';
        console.log(chalk.white(`  ${recipe.name}${installed}`));
        console.log(chalk.gray(`    ${recipe.description}`));
      }
      console.log(chalk.gray(`\n  Add with: swarmai-agent mcp add <recipe>\n`));
    });

  return program;
}

/**
 * Parse environment variable string (KEY=VAL,KEY2=VAL2)
 */
function parseEnvString(envStr) {
  const result = {};
  for (const part of envStr.split(',')) {
    const [key, ...valParts] = part.split('=');
    if (key) result[key.trim()] = valParts.join('=').trim();
  }
  return result;
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

module.exports = { createCli };
