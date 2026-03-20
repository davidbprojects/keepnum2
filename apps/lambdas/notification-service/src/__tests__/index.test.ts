import { handler } from '../index';

describe('notification-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
