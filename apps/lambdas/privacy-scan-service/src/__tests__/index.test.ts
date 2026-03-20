import { handler } from '../index';

describe('privacy-scan-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
