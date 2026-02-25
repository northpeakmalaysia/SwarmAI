#!/usr/bin/env node

/**
 * SwarmAI Local Agent CLI
 * Entry point
 */

const { createCli } = require('./src/cli');

const program = createCli();
program.parse(process.argv);
