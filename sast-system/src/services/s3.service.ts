import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    private readonly endpoint: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    bucketName: string,
  ) {
    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      forcePathStyle: true,
    });
    this.bucketName = bucketName;
  }

  async listRules(): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
    });

    const response = await this.s3Client.send(command);
    if (!response.Contents) {
      return [];
    }

    return response.Contents
      .map((object) => object.Key)
      .filter((key): key is string => 
        key !== undefined && (key.endsWith('.yaml') || key.endsWith('.yml'))
      );
  }

  async getRule(ruleId: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: ruleId,
    });

    const response = await this.s3Client.send(command);
    const stream = response.Body as any;
    
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  }
} 