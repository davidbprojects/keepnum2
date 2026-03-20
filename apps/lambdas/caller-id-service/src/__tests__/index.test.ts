import { handler } from '../index';

describe('caller-id-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
