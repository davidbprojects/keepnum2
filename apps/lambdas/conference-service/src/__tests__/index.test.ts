import { handler } from '../index';

describe('conference-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
