// Отключаем предупреждения о устаревших методах
process.noDeprecation = true;

const vscode = require('vscode');
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const yaml = require('yaml');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');
const os = require('os');

function getConfig() {
    const config = vscode.workspace.getConfiguration('semgrepS3Scanner');
    return {
        endpoint: config.get('endpoint'),
        accessKeyId: config.get('accessKeyId'),
        secretAccessKey: config.get('secretAccessKey'),
        bucket: config.get('bucket'),
        prefix: config.get('prefix')
    };
}

function createS3Client() {
    const config = getConfig();
    return new S3Client({
        region: 'us-east-1',
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
        }
    });
}

async function addRule() {
    try {
        const ruleId = await vscode.window.showInputBox({
            prompt: 'Enter rule ID (e.g., hardcoded-secret)',
            placeHolder: 'rule-id'
        });
        if (!ruleId) return;

        const pattern = await vscode.window.showInputBox({
            prompt: 'Enter rule pattern (e.g., $SECRET = "...")',
            placeHolder: 'pattern'
        });
        if (!pattern) return;

        const message = await vscode.window.showInputBox({
            prompt: 'Enter rule message (e.g., Found hardcoded secret)',
            placeHolder: 'message'
        });
        if (!message) return;

        const severity = await vscode.window.showQuickPick(['ERROR', 'WARNING'], {
            placeHolder: 'Select rule severity'
        });
        if (!severity) return;

        const languages = await vscode.window.showQuickPick(
            ['typescript', 'python', 'java', 'javascript', 'go', 'ruby', 'php', 'csharp'],
            {
                placeHolder: 'Select languages (use Ctrl/Cmd to select multiple)',
                canPickMany: true
            }
        );
        if (!languages || languages.length === 0) return;

        const ruleYaml = yaml.stringify({
            rules: [{
                id: ruleId,
                pattern: pattern,
                message: message,
                languages: languages,
                severity: severity
            }]
        });

        const preview = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Would you like to preview the rule before saving?'
        });

        if (preview === 'Yes') {
            const doc = await vscode.workspace.openTextDocument({ 
                language: 'yaml', 
                content: ruleYaml 
            });
            await vscode.window.showTextDocument(doc);

            const save = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Save this rule?'
            });

            if (save !== 'Yes') return;
        }

        const config = getConfig();
        const s3 = createS3Client();
        const key = `${config.prefix}${ruleId}.yaml`;

        const buffer = Buffer.from(ruleYaml, 'utf8');
        await s3.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: buffer,
            ContentType: 'text/yaml'
        }));

        vscode.window.showInformationMessage(`Rule ${ruleId} successfully uploaded!`);
    } catch (err) {
        vscode.window.showErrorMessage('Error adding rule: ' + err.message);
    }
}

async function saveReportToS3(s3, report, config) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportName = `scan-report-${timestamp}.json`;
        
        const putCommand = new PutObjectCommand({
            Bucket: 'semgrep-reports',
            Key: reportName,
            Body: JSON.stringify(report, null, 2),
            ContentType: 'application/json'
        });

        await s3.send(putCommand);
        return reportName;
    } catch (err) {
        console.error('Error saving report to S3:', err);
        throw err;
    }
}

async function scanCode() {
    try {
        const config = getConfig();
        console.log('Current config:', JSON.stringify(config, null, 2));
        const s3 = createS3Client();

        try {
            const testCommand = new ListObjectsV2Command({
                Bucket: config.bucket
            });
            console.log('Testing S3 connection...');
            const testResult = await s3.send(testCommand);
            console.log('S3 connection test result:', JSON.stringify(testResult, null, 2));
        } catch (s3Error) {
            console.error('S3 connection error:', s3Error);
            vscode.window.showErrorMessage('Failed to connect to S3: ' + s3Error.message);
            return;
        }

        const listCommand = new ListObjectsV2Command({
            Bucket: config.bucket
        });
        console.log('Listing objects with command:', JSON.stringify(listCommand, null, 2));

        const { Contents } = await s3.send(listCommand);
        console.log('Found contents:', JSON.stringify(Contents, null, 2));
        
        if (!Contents || Contents.length === 0) {
            vscode.window.showErrorMessage('No rules found in bucket');
            return;
        }

        const tempDir = path.join(os.tmpdir(), 'semgrep-rules');
        console.log('Using temp directory:', tempDir);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        const report = {
            timestamp: new Date().toISOString(),
            workspace: vscode.workspace.rootPath,
            rules: [],
            findings: []
        };

        for (const rule of Contents) {
            if (!rule.Key.endsWith('.yaml') && !rule.Key.endsWith('.yml')) {
                console.log('Skipping non-yaml file:', rule.Key);
                continue;
            }
            console.log('Processing rule:', rule.Key);

            const getCommand = new GetObjectCommand({
                Bucket: config.bucket,
                Key: rule.Key
            });

            const response = await s3.send(getCommand);
            const ruleContent = await response.Body.transformToString();
            
            try {
                const rules = yaml.parse(ruleContent);
                if (!rules || !rules.rules) {
                    console.error('Invalid rules format in file:', rule.Key);
                    continue;
                }

                for (const rule of rules.rules) {
                    const ruleId = rule.id || 'unnamed-rule';
                    const ruleYaml = yaml.stringify({
                        rules: [{
                            id: ruleId,
                            pattern: rule.pattern,
                            message: rule.message,
                            languages: rule.languages,
                            severity: rule.severity,
                            metadata: rule.metadata
                        }]
                    });

                    const rulePath = path.join(tempDir, `${ruleId}.yaml`);
                    fs.writeFileSync(rulePath, ruleYaml);
                    console.log('Saved rule to:', rulePath);

                    const semgrepCmd = `semgrep scan --json --config ${rulePath} ${vscode.workspace.rootPath}`;
                    console.log('Running semgrep command:', semgrepCmd);
                    const { stdout, stderr } = await execAsync(semgrepCmd);
                    
                    if (stderr && !stderr.includes('Scan completed successfully')) {
                        console.error('Semgrep error:', stderr);
                        vscode.window.showErrorMessage(`Error running rule ${ruleId}: ${stderr}`);
                        continue;
                    }

                    console.log('Semgrep output:', stdout);
                    try {
                        const results = JSON.parse(stdout);
                        
                        report.rules.push({
                            id: ruleId,
                            pattern: rule.pattern,
                            message: rule.message,
                            severity: rule.severity
                        });

                        if (results.results && results.results.length > 0) {
                            report.findings.push(...results.results.map(result => ({
                                rule: ruleId,
                                file: result.path,
                                line: result.start.line,
                                message: result.message,
                                severity: rule.severity
                            })));
                        }

                        for (const result of results.results) {
                            const range = new vscode.Range(
                                new vscode.Position(result.start.line - 1, result.start.col - 1),
                                new vscode.Position(result.end.line - 1, result.end.col - 1)
                            );

                            const diagnostic = new vscode.Diagnostic(
                                range,
                                result.message,
                                rule.severity === 'ERROR' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
                            );

                            diagnostic.source = 'Semgrep';
                            diagnostic.code = result.check_id;

                            const uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, result.path));
                            const diagnostics = vscode.languages.getDiagnostics(uri) || [];
                            diagnostics.push(diagnostic);
                            vscode.languages.setDiagnostics(uri, diagnostics);
                        }
                    } catch (parseError) {
                        console.error('Error parsing semgrep output:', parseError);
                        continue;
                    }
                }
            } catch (parseError) {
                console.error('Error parsing rules:', parseError);
                vscode.window.showErrorMessage(`Error parsing rules from ${rule.Key}: ${parseError.message}`);
                continue;
            }
        }

        try {
            const reportName = await saveReportToS3(s3, report, config);
            vscode.window.showInformationMessage(`Scan report saved to S3: ${reportName}`);
        } catch (err) {
            vscode.window.showErrorMessage('Failed to save scan report to S3: ' + err.message);
        }

        vscode.window.showInformationMessage('Scan completed! Found issues are highlighted in the editor.');
    } catch (err) {
        console.error('Error in scanCode:', err);
        vscode.window.showErrorMessage('Error scanning code: ' + err.message);
    }
}

async function scanCurrentFile() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const config = getConfig();
        const s3 = createS3Client();

        const listCommand = new ListObjectsV2Command({
            Bucket: config.bucket
        });

        const { Contents } = await s3.send(listCommand);
        if (!Contents || Contents.length === 0) {
            vscode.window.showErrorMessage('No rules found in bucket');
            return;
        }

        const tempDir = path.join(os.tmpdir(), 'semgrep-rules');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        const availableRules = [];
        for (const rule of Contents) {
            if (!rule.Key.endsWith('.yaml') && !rule.Key.endsWith('.yml')) continue;

            const getCommand = new GetObjectCommand({
                Bucket: config.bucket,
                Key: rule.Key
            });

            const response = await s3.send(getCommand);
            const ruleContent = await response.Body.transformToString();
            
            try {
                const rules = yaml.parse(ruleContent);
                if (rules && rules.rules) {
                    availableRules.push(...rules.rules);
                }
            } catch (parseError) {
                console.error('Error parsing rules:', parseError);
                continue;
            }
        }

        if (availableRules.length === 0) {
            vscode.window.showErrorMessage('No valid rules found');
            return;
        }

        const ruleItems = availableRules.map(rule => ({
            label: rule.id,
            description: rule.message,
            detail: `Severity: ${rule.severity}, Languages: ${rule.languages.join(', ')}`,
            rule: rule
        }));

        const selectedRule = await vscode.window.showQuickPick(ruleItems, {
            placeHolder: 'Select a rule to scan with'
        });

        if (!selectedRule) return;

        const ruleYaml = yaml.stringify({
            rules: [selectedRule.rule]
        });

        const rulePath = path.join(tempDir, `${selectedRule.rule.id}.yaml`);
        fs.writeFileSync(rulePath, ruleYaml);

        const filePath = editor.document.uri.fsPath;
        const semgrepCmd = `semgrep scan --json --config ${rulePath} ${filePath}`;
        console.log('Running semgrep command:', semgrepCmd);
        
        const { stdout, stderr } = await execAsync(semgrepCmd);
        
        if (stderr && !stderr.includes('Scan completed successfully')) {
            console.error('Semgrep error:', stderr);
            vscode.window.showErrorMessage(`Error running rule: ${stderr}`);
            return;
        }

        try {
            const results = JSON.parse(stdout);
            const diagnostics = [];
            
            if (results.results && results.results.length > 0) {
                const addComments = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Add comments for found issues?'
                });

                if (addComments === 'Yes') {
                    const edit = new vscode.WorkspaceEdit();
                    
                    for (const result of results.results) {
                        const message = result.message || selectedRule.rule.message || 'Semgrep issue found';
                        const range = new vscode.Range(
                            new vscode.Position(result.start.line - 1, 0),
                            new vscode.Position(result.start.line - 1, 0)
                        );
                        
                        edit.insert(editor.document.uri, range, `// TODO: ${message}\n`);
                    }
                    
                    await vscode.workspace.applyEdit(edit);
                }

                for (const result of results.results) {
                    const range = new vscode.Range(
                        new vscode.Position(result.start.line - 1, result.start.col - 1),
                        new vscode.Position(result.end.line - 1, result.end.col - 1)
                    );

                    const message = result.message || selectedRule.rule.message || 'Semgrep issue found';

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        message,
                        selectedRule.rule.severity === 'ERROR' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
                    );

                    diagnostic.source = 'Semgrep';
                    diagnostic.code = result.check_id;
                    diagnostics.push(diagnostic);
                }
            }

            const diagnosticCollection = vscode.languages.createDiagnosticCollection('semgrep');
            diagnosticCollection.set(editor.document.uri, diagnostics);
            
            if (diagnostics.length > 0) {
                vscode.window.showInformationMessage(`Found ${diagnostics.length} issues in the current file`);
            } else {
                vscode.window.showInformationMessage('No issues found in the current file');
            }
        } catch (parseError) {
            console.error('Error parsing semgrep output:', parseError);
            vscode.window.showErrorMessage('Error parsing scan results');
        }
    } catch (err) {
        console.error('Error in scanCurrentFile:', err);
        vscode.window.showErrorMessage('Error scanning file: ' + err.message);
    }
}

function activate(context) {
    console.log('Semgrep S3 Scanner extension is now active!');

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('semgrep');
    context.subscriptions.push(diagnosticCollection);

    let addRuleCommand = vscode.commands.registerCommand('semgrep-s3-scanner.addRule', addRule);
    let scanCodeCommand = vscode.commands.registerCommand('semgrep-s3-scanner.scanCode', scanCode);
    let scanCurrentFileCommand = vscode.commands.registerCommand('semgrep-s3-scanner.scanCurrentFile', scanCurrentFile);

    context.subscriptions.push(addRuleCommand, scanCodeCommand, scanCurrentFileCommand);
}

function deactivate() {
    console.log('Semgrep S3 Scanner extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
} 