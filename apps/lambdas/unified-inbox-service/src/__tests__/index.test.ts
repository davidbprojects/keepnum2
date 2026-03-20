import { handler } from '../index';

describe('unified-inbox-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
