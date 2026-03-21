import { Amplify } from 'aws-amplify';

/**
 * Resolve an env var by trying REACT_APP_ prefix first (CRA), then bare name.
 */
function env(name: string, fallback = ''): string {
  return (
    process.env[`REACT_APP_${name}`] ??
    process.env[name] ??
    fallback
  );
}

/**
 * Configure Amplify Libraries for all clients (web, iOS, Android).
 * Each platform supplies its own environment variables at build time.
 * CRA apps use REACT_APP_ prefix; native apps use bare names.
 */
export function configureAmplify(): void {
  const userPoolId = env('COGNITO_USER_POOL_ID');
  const userPoolClientId = env('COGNITO_CLIENT_ID');
  const apiUrl = env('API_URL') || env('API_GATEWAY_URL');
  const region = env('AWS_REGION', 'us-east-1');

  if (!userPoolId || !userPoolClientId) {
    console.warn(
      '[configureAmplify] Missing Cognito config. ' +
      `userPoolId=${userPoolId || '(empty)'}, clientId=${userPoolClientId || '(empty)'}. ` +
      'Ensure REACT_APP_COGNITO_USER_POOL_ID and REACT_APP_COGNITO_CLIENT_ID are set.',
    );
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
    ...(apiUrl
      ? {
          API: {
            REST: {
              keepnumApi: {
                endpoint: apiUrl,
                region,
              },
            },
          },
        }
      : {}),
  });
}
