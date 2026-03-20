import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface MockEventOptions {
  method?: string;
  path?: string;
  resource?: string;
  body?: unknown;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  authorizer?: {
    claims?: Record<string, unknown>;
  };
}

export function buildMockEvent(options: MockEventOptions = {}): APIGatewayProxyEvent {
  const {
    method = 'GET',
    path = '/',
    resource = '/',
    body = null,
    pathParameters = null,
    queryStringParameters = null,
    headers = {},
    authorizer,
  } = options;

  return {
    httpMethod: method,
    path,
    resource,
    body: body !== null ? JSON.stringify(body) : null,
    pathParameters,
    queryStringParameters,
    headers,
    multiValueHeaders: {},
    isBase64Encoded: false,
    stageVariables: null,
    multiValueQueryStringParameters: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api-id',
      authorizer: authorizer ?? null,
      httpMethod: method,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'jest-test',
        userArn: null,
      },
      path,
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource-id',
      resourcePath: resource,
      stage: 'test',
    },
  };
}
