
import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  PutKeyCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';

import '@aws-sdk/signature-v4-crt';

const kvsClient = new CloudFrontKeyValueStoreClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

export async function generateApiKey(_req: Request, res: Response) {
  const kvsArn = process.env.KVS_ARN;

  if (!kvsArn) {
    return res.status(500).json({ error: 'Key store is not configured' });
  }

  const apiKey = `mdc_live_${randomBytes(32).toString('base64url')}`;
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  try {
    let registered = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      const store = await kvsClient.send(
        new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
      );

      if (!store.ETag) {
        throw new Error('Unable to retrieve KVS ETag');
      }

      try {
        await kvsClient.send(
          new PutKeyCommand({
            KvsARN: kvsArn,
            IfMatch: store.ETag,
            Key: keyHash,
            Value: JSON.stringify({
              created: new Date().toISOString(),
            }),
          }),
        );

        registered = true;
        break;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;

        if (status !== 412 || attempt === 2) {
          throw error;
        }
      }
    }

    if (!registered) {
      throw new Error('Unable to register API key');
    }

    return res.status(201).json({ apiKey });
  } catch (error) {
    console.error('API key registration failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });

    return res.status(500).json({ error: 'Unable to generate API key' });
  }
}
