# Semgrep S3 Integration

CLI tool for running Semgrep scans using rules stored in S3-compatible storage.

## Features

- Run Semgrep scans using rules from S3
- Support for YAML rule files
- Configurable S3 endpoint and credentials
- Easy integration with CI/CD pipelines

## Installation

```bash
npm install -g diploma-project
```

## Usage

```bash
semgrep-s3 scan -d /path/to/scan
```

### Options

- `-d, --dir <directory>`: Directory to scan (required)
- `-e, --endpoint <url>`: S3 endpoint URL (default: http://localhost:9000)
- `-k, --key <key>`: S3 access key ID (default: minioadmin)
- `-s, --secret <secret>`: S3 secret access key (default: minioadmin)
- `-b, --bucket <name>`: S3 bucket name (default: semgrep-rules)

## Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Run in development mode:
   ```bash
   npm run dev
   ```

## Testing

```bash
npm test
```

## License

MIT 