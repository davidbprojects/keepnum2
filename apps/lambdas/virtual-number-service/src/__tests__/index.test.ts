import { handler } from '../index';

describe('virtual-number-service', () => {
  it('should export a handler function', () => {
    expect(typeof handler).toBe('function');
  });
});
