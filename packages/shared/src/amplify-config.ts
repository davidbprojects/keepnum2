import { Amplify } from 'aws-amplify';

/**
 * Configure Amplify Libraries for all clients (web, iOS, Android).
 * Each platform supplies its own environment variables at build time.
 */
export function configureAmplify(): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: process.env['COGNITO_USER_POOL_ID'] ?? '',
        userPoolClientId: process.env['COGNITO_CLIENT_ID'] ?? '',
      },
    },
    API: {
      REST: {
        keepnumApi: {
          endpoint: process.env['API_GATEWAY_URL'] ?? '',
          region: process.env['AWS_REGION'] ?? 'us-east-1',
        },
      },
    },
  });
}
