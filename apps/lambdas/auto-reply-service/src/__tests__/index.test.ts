import { handler } from '../index';

describe('auto-reply-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
