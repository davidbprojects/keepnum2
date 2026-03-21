/**
 * Tests for CloudWatch RUM configuration
 */

// Mock aws-rum-web before importing
const mockAwsRum = jest.fn();
jest.mock('aws-rum-web', () => ({
  AwsRum: mockAwsRum,
}));

describe('initRum', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockAwsRum.mockClear();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should skip initialization when env vars are missing', async () => {
    delete process.env.REACT_APP_RUM_APP_MONITOR_ID;
    delete process.env.REACT_APP_RUM_IDENTITY_POOL_ID;

    const { initRum } = require('../rum-config');
    await initRum();

    expect(mockAwsRum).not.toHaveBeenCalled();
  });

  it('should initialize RUM when all env vars are present', async () => {
    process.env.REACT_APP_RUM_APP_MONITOR_ID = 'test-monitor-id';
    process.env.REACT_APP_RUM_IDENTITY_POOL_ID = 'us-east-2:test-pool-id';
    process.env.REACT_APP_RUM_GUEST_ROLE_ARN = 'arn:aws:iam::123:role/test';
    process.env.REACT_APP_AWS_REGION = 'us-east-2';

    const { initRum } = require('../rum-config');
    await initRum();

    expect(mockAwsRum).toHaveBeenCalledWith(
      'test-monitor-id',
      '1.0.0',
      'us-east-2',
      expect.objectContaining({
        identityPoolId: 'us-east-2:test-pool-id',
        guestRoleArn: 'arn:aws:iam::123:role/test',
        telemetries: ['errors', 'performance', 'http'],
      }),
    );
  });

  it('should only initialize once (idempotent)', async () => {
    process.env.REACT_APP_RUM_APP_MONITOR_ID = 'test-monitor-id';
    process.env.REACT_APP_RUM_IDENTITY_POOL_ID = 'us-east-2:test-pool-id';
    process.env.REACT_APP_RUM_GUEST_ROLE_ARN = 'arn:aws:iam::123:role/test';
    process.env.REACT_APP_AWS_REGION = 'us-east-2';

    const { initRum } = require('../rum-config');
    await initRum();
    await initRum();

    expect(mockAwsRum).toHaveBeenCalledTimes(1);
  });

  it('should handle RUM SDK initialization failure gracefully', async () => {
    process.env.REACT_APP_RUM_APP_MONITOR_ID = 'test-monitor-id';
    process.env.REACT_APP_RUM_IDENTITY_POOL_ID = 'us-east-2:test-pool-id';
    process.env.REACT_APP_RUM_GUEST_ROLE_ARN = 'arn:aws:iam::123:role/test';

    mockAwsRum.mockImplementation(() => {
      throw new Error('SDK init failed');
    });

    const { initRum } = require('../rum-config');
    // Should not throw
    await expect(initRum()).resolves.toBeUndefined();
  });

  it('should skip when only monitor ID is set but identity pool is missing', async () => {
    process.env.REACT_APP_RUM_APP_MONITOR_ID = 'test-monitor-id';
    delete process.env.REACT_APP_RUM_IDENTITY_POOL_ID;

    const { initRum } = require('../rum-config');
    await initRum();

    expect(mockAwsRum).not.toHaveBeenCalled();
  });
});
