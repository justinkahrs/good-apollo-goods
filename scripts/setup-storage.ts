import 'dotenv/config';
import { CreateBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { storage } from '../src/server/photos';
if (process.env.S3_ENDPOINT !== 'http://localhost:19000')
  throw new Error(
    'This setup is limited to the isolated local storage service.',
  );
const { client, bucket } = storage();
const browserPort = Number(process.env.GAG_BROWSER_TEST_PORT ?? 4372);
const allowedOrigins = [
  process.env.APP_URL ?? 'http://localhost:4371',
  'http://localhost:4371',
  'http://localhost:4372',
  `http://127.0.0.1:${browserPort}`,
];
try {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
} catch (e) {
  if (
    !(e instanceof Error) ||
    !['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(e.name)
  )
    throw e;
}
await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [...new Set(allowedOrigins)],
          AllowedMethods: ['GET', 'POST', 'PUT'],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 600,
        },
      ],
    },
  }),
);
console.log('Local private bucket and browser-upload CORS configured.');
