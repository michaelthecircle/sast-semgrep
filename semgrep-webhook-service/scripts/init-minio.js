const { S3Client, CreateBucketCommand, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

async function initMinio() {
  try {
    // Create bucket
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: process.env.S3_BUCKET_NAME || 'semgrep-rules',
      }),
    );

    // Set bucket policy to allow public read
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${process.env.S3_BUCKET_NAME || 'semgrep-rules'}/*`],
        },
      ],
    };

    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: process.env.S3_BUCKET_NAME || 'semgrep-rules',
        Policy: JSON.stringify(policy),
      }),
    );

    console.log('MinIO bucket initialized successfully');
  } catch (error) {
    if (error.name === 'BucketAlreadyExists') {
      console.log('Bucket already exists');
    } else {
      console.error('Error initializing MinIO:', error);
      process.exit(1);
    }
  }
}

initMinio(); 