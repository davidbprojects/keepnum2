/**
 * Tests for Amplify configuration
 */

const mockConfigure = jest.fn();
jest.mock('aws-amplify', () => ({
  Amplify: { configure: mockConfigure },
}));

describe('configureAmplify', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockConfigure.mockClear();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should configure Amplify with REACT_APP_ prefixed env vars', () => {
    process.env.REACT_APP_COGNITO_USER_POOL_ID = 'us-east-2_TestPool';
    process.env.REACT_APP_COGNITO_CLIENT_ID = 'test-client-id';
    process.env.REACT_APP_API_URL = 'https://api.test.com';
    process.env.REACT_APP_AWS_REGION = 'us-east-2';

    const { configureAmplify } = require('../amplify-config');
    configureAmplify();

    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        Auth: {
          Cognito: {
            userPoolId: 'us-east-2_TestPool',
            userPoolClientId: 'test-client-id',
          },
        },
      }),
    );
  });

  it('should include API config when API_URL is set', () => {
    process.env.REACT_APP_COGNITO_USER_POOL_ID = 'us-east-2_TestPool';
    process.env.REACT_APP_COGNITO_CLIENT_ID = 'test-client-id';
    process.env.REACT_APP_API_URL = 'https://api.test.com';
    process.env.REACT_APP_AWS_REGION = 'us-east-2';

    const { configureAmplify } = require('../amplify-config');
    configureAmplify();

    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        API: {
          REST: {
            keepnumApi: {
              endpoint: 'https://api.test.com',
              region: 'us-east-2',
            },
          },
        },
      }),
    );
  });

  it('should warn when Cognito config is missing', () => {
    delete process.env.REACT_APP_COGNITO_USER_POOL_ID;
    delete process.env.REACT_APP_COGNITO_CLIENT_ID;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const { configureAmplify } = require('../amplify-config');
    configureAmplify();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[configureAmplify] Missing Cognito config'),
    );
    warnSpy.mockRestore();
  });

  it('should default region to us-east-1 when not set', () => {
    process.env.REACT_APP_COGNITO_USER_POOL_ID = 'pool';
    process.env.REACT_APP_COGNITO_CLIENT_ID = 'client';
    process.env.REACT_APP_API_URL = 'https://api.test.com';
    delete process.env.REACT_APP_AWS_REGION;

    const { configureAmplify } = require('../amplify-config');
    configureAmplify();

    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        API: {
          REST: {
            keepnumApi: expect.objectContaining({
              region: 'us-east-1',
            }),
          },
        },
      }),
    );
  });
});
