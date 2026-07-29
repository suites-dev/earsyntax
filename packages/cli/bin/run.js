#!/usr/bin/env node
import { run } from '../dist/cli.js';
import process from 'node:process';

process.exit(run(process.argv.slice(2)));