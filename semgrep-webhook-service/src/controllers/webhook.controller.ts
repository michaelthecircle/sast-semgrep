import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { S3Service } from '../services/s3.service';
import { GitHubWebhookPayload } from '../interfaces/github-webhook.interface';
import * as crypto from 'crypto';

@Controller('webhook')
export class WebhookController {
  constructor(private readonly s3Service: S3Service) {}

  @Post()
  async handleWebhook(
    @Body() payload: GitHubWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    // Verify webhook signature
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new HttpException('Webhook secret not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = `sha256=${hmac.update(JSON.stringify(payload)).digest('hex')}`;

    if (signature !== digest) {
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    // Process the webhook payload
    const key = `${payload.repository.full_name}/${payload.pull_request?.number || 'push'}/${Date.now()}.json`;
    await this.s3Service.uploadFile(key, Buffer.from(JSON.stringify(payload)));

    return { status: 'success' };
  }
} 