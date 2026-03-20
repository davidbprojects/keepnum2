import { handler } from '../index';

describe('ivr-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
