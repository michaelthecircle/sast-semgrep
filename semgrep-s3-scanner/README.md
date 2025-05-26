# Semgrep S3 Scanner

VSCode extension for scanning S3 buckets with Semgrep.

## Features

- Scan S3 buckets for security issues using Semgrep
- Support for YAML rule files
- Real-time scanning results in VSCode
- Configurable S3 endpoint and credentials

## Requirements

- VSCode 1.60.0 or higher
- Semgrep CLI installed
- S3-compatible storage (MinIO, AWS S3, etc.)

## Extension Settings

This extension contributes the following settings:

* `semgrep-s3-scanner.s3Endpoint`: S3 endpoint URL
* `semgrep-s3-scanner.s3AccessKeyId`: S3 access key ID
* `semgrep-s3-scanner.s3SecretAccessKey`: S3 secret access key
* `semgrep-s3-scanner.s3BucketName`: S3 bucket name

## Known Issues

- Large files may take longer to scan
- Some Semgrep rules may not be compatible with all file types

## Release Notes

### 0.0.1

Initial release of Semgrep S3 Scanner 