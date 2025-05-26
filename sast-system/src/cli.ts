#!/usr/bin/env node

import { Command } from 'commander';
import { S3Service } from '../services/s3.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

const program = new Command();

program
  .name('semgrep-s3-scanner')
  .description('Run semgrep scans using rules from S3')
  .version('1.0.0');

program
  .command('scan')
  .description('Run semgrep scan with rules from S3')
  .option('-b, --bucket <bucket>', 'S3 bucket name', 'semgrep-rules')
  .option('-p, --prefix <prefix>', 'Rules prefix in S3', 'rules/')
  .option('-t, --target <target>', 'Target directory or file to scan', '.')
  .option('-o, --output <output>', 'Output file for the report', 'semgrep-report.json')
  .option('-f, --format <format>', 'Output format (json, sarif)', 'json')
  .action(async (options) => {
    try {
      console.log('Initializing S3 scanner...');
      const s3 = new S3Service(options.bucket, options.prefix);
      
      console.log('Downloading rules from S3...');
      const rulesDir = path.join(process.cwd(), '.semgrep-rules');
      await s3.downloadAllRules(rulesDir);
      
      console.log('Running semgrep scan...');
      const formatFlag = options.format === 'sarif' ? '--sarif' : '--json';
      const cmd = `semgrep scan --config ${rulesDir} ${options.target} ${formatFlag} > ${options.output}`;
      
      await execAsync(cmd);
      console.log(`Scan completed! Report saved to ${options.output}`);

      console.log('Generating markdown report...');
      const reportScript = path.join(__dirname, '../../scripts/report.js');
      console.log('Report script path:', reportScript);
      await execAsync(`node ${reportScript} ${options.output}`);
      console.log('Markdown report generated!');
      
      // Cleanup
      if (fs.existsSync(rulesDir)) {
        fs.rmSync(rulesDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse(); 