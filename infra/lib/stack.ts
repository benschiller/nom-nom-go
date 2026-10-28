import * as path from 'node:path';
import {
  App, CfnOutput, Duration, Expiration, RemovalPolicy, Stack, type StackProps,
} from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import type { Construct } from 'constructs';

const ON_PUBLISH = `
const PLAY_TYPES = ['snapshot', 'event', 'beat'];
const DAD_TYPES = ['hello', 'glove', 'cheer', 'beat'];
export function onPublish(ctx) {
  const channel = ctx.info.channel;
  const allowed = channel.endsWith('/play') ? PLAY_TYPES : DAD_TYPES;
  return ctx.events.filter((event) => {
    const payload = event.payload || {};
    if (payload.v !== 1) return false;
    if (!allowed.includes(payload.type)) return false;
    if (JSON.stringify(payload).length > 4096) return false;
    return true;
  });
}
`;

export class NomNomGoStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      defaultRootObject: 'index.html',
      enableLogging: false,
    });

    const gameDist = path.join(__dirname, '../../game');

    new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset(path.join(gameDist, 'dist-assets'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
    });

    const eventApi = new appsync.EventApi(this, 'EventsApi', {
      apiName: 'nom-nom-go',
      authorizationConfig: {
        authProviders: [
          {
            authorizationType: appsync.AppSyncAuthorizationType.API_KEY,
            apiKeyConfig: {
              name: 'NomNomGoKey',
              description: 'Dad Window API key (365 days)',
              expires: Expiration.after(Duration.days(365)),
            },
          },
        ],
        connectionAuthModeTypes: [appsync.AppSyncAuthorizationType.API_KEY],
        defaultPublishAuthModeTypes: [appsync.AppSyncAuthorizationType.API_KEY],
        defaultSubscribeAuthModeTypes: [appsync.AppSyncAuthorizationType.API_KEY],
      },
    });

    eventApi.addChannelNamespace('kitchen', {
      code: appsync.Code.fromInline(ON_PUBLISH),
      publishHandlerConfig: {},
    });

    const apiKey = eventApi.apiKeys['NomNomGoKey'] ?? Object.values(eventApi.apiKeys)[0];

    new s3deploy.BucketDeployment(this, 'DeployRoot', {
      sources: [
        s3deploy.Source.asset(path.join(gameDist, 'dist-root')),
        s3deploy.Source.jsonData('config.json', {
          endpoint: `https://${eventApi.httpDns}/event`,
          region: this.region,
          apiKey: apiKey.attrApiKey,
        }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
      cacheControl: [s3deploy.CacheControl.noCache()],
    });

    const budgetEmail = process.env.BUDGET_EMAIL;
    if (budgetEmail) {
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: 'nom-nom-go-monthly',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: 5, unit: 'USD' },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: 'ACTUAL',
              comparisonOperator: 'GREATER_THAN',
              threshold: 80,
              thresholdType: 'PERCENTAGE',
            },
            subscribers: [{ subscriptionType: 'EMAIL', address: budgetEmail }],
          },
        ],
      });
    }

    new CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.domainName}` });
    new CfnOutput(this, 'EventsEndpoint', { value: `https://${eventApi.httpDns}/event` });
    new CfnOutput(this, 'EventsRealtimeEndpoint', { value: `https://${eventApi.realtimeDns}/event/realtime` });
  }
}

export function createApp(): App {
  const app = new App();
  new NomNomGoStack(app, 'NomNomGoStack', {
    env: { region: 'eu-central-1' },
  });
  return app;
}
