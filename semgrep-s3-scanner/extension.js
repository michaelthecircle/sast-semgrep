// Отключаем предупреждения о устаревших методах
process.noDeprecation = true;

const vscode = require('vscode');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const yaml = require('yaml');

function activate(context) {
    console.log('Semgrep S3 Scanner extension is now active!');

    let disposable = vscode.commands.registerCommand('semgrep-s3-scanner.addRule', async () => {
        console.log('Command semgrep-s3-scanner.addRule was called');
        try {
            // Открываем новый YAML-документ
            const doc = await vscode.workspace.openTextDocument({ language: 'yaml', content: '' });
            await vscode.window.showTextDocument(doc);

            // Слушаем сохранение этого документа
            const saveListener = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
                if (savedDoc === doc) {
                    try {
                        const ruleYaml = savedDoc.getText();
                        const ruleId = await vscode.window.showInputBox({ prompt: 'Введите ID правила (например, my-rule)' });
                        if (!ruleId) {
                            vscode.window.showErrorMessage('ID правила не введён!');
                            return;
                        }

                        // Получаем параметры из env
                        const bucket = process.env.AWS_BUCKET || 'semgrep-rules';
                        const prefix = process.env.AWS_PREFIX || 'rules/';
                        const accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'minioadmin';
                        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin';
                        const endpoint = process.env.AWS_ENDPOINT || 'http://localhost:9000';

                        const s3 = new S3Client({
                            region: 'us-east-1',
                            endpoint,
                            forcePathStyle: true,
                            credentials: { accessKeyId, secretAccessKey },
                            tls: false,
                            customUserAgent: 'minio-client',
                            maxAttempts: 1
                        });

                        const key = `${prefix}${ruleId}.yaml`;

                        // Валидация YAML
                        try {
                            yaml.parse(ruleYaml);
                        } catch (err) {
                            vscode.window.showErrorMessage('Ошибка в YAML: ' + err.message);
                            return;
                        }

                        // Используем Buffer.from() для создания буфера
                        const buffer = Buffer.from(ruleYaml, 'utf8');

                        await s3.send(new PutObjectCommand({
                            Bucket: bucket,
                            Key: key,
                            Body: buffer,
                            ContentType: 'text/yaml'
                        }));

                        vscode.window.showInformationMessage('Правило успешно загружено!');
                    } catch (err) {
                        vscode.window.showErrorMessage('Ошибка загрузки правила: ' + err.message);
                    }
                }
            });

            // Очищаем listener, когда документ закрывается
            const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
                if (closedDoc === doc) {
                    saveListener.dispose();
                    closeListener.dispose();
                }
            });
        } catch (err) {
            vscode.window.showErrorMessage('Ошибка: ' + err.message);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {
    console.log('Semgrep S3 Scanner extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
} 