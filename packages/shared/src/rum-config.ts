/**
 * CloudWatch RUM initialization for frontend apps.
 * Reads config from REACT_APP_ environment variables.
 */

let rumInitialized = false;

export interface RumConfig {
  appMonitorId: string;
  identityPoolId: string;
  guestRoleArn: string;
  region: string;
}

function getRumConfig(): RumConfig | null {
  const appMonitorId = process.env.REACT_APP_RUM_APP_MONITOR_ID || '';
  const identityPoolId = process.env.REACT_APP_RUM_IDENTITY_POOL_ID || '';
  const guestRoleArn = process.env.REACT_APP_RUM_GUEST_ROLE_ARN || '';
  const region = process.env.REACT_APP_AWS_REGION || 'us-east-2';

  if (!appMonitorId || !identityPoolId) {
    return null;
  }

  return { appMonitorId, identityPoolId, guestRoleArn, region };
}

/**
 * Initialize CloudWatch RUM. Safe to call multiple times — only initializes once.
 * Fails silently if config is missing or RUM SDK is not available.
 */
export async function initRum(): Promise<void> {
  if (rumInitialized) return;

  const config = getRumConfig();
  if (!config) {
    console.debug('[RUM] Skipping — missing config env vars');
    return;
  }

  try {
    const { AwsRum } = await import('aws-rum-web');

    new AwsRum(
      config.appMonitorId,
      '1.0.0',
      config.region,
      {
        sessionSampleRate: 1,
        identityPoolId: config.identityPoolId,
        guestRoleArn: config.guestRoleArn,
        endpoint: `https://dataplane.rum.${config.region}.amazonaws.com`,
        telemetries: ['errors', 'performance', 'http'],
        allowCookies: true,
        enableXRay: false,
      },
    );

    rumInitialized = true;
    console.debug('[RUM] Initialized successfully');
  } catch (err) {
    console.warn('[RUM] Failed to initialize:', err);
  }
}
