import { Module } from '@nestjs/common';
import { WebhookController } from './controllers/webhook.controller';
import { S3Service } from './services/s3.service';

@Module({
  imports: [],
  controllers: [WebhookController],
  providers: [S3Service],
})
export class AppModule {} 