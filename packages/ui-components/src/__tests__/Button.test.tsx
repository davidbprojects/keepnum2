/**
 * Button component unit tests
 */

// Mock platform to always return web
jest.mock('../platform', () => ({ isReactNative: () => false }));

import { Button } from '../Button';

function renderButton(props: Record<string, any>): Record<string, any> {
  const result = (Button as any)(props);
  return result?.props || {};
}

describe('Button', () => {
  it('should default to type="button"', () => {
    const props = renderButton({ label: 'Click me' });
    expect(props.type).toBe('button');
  });

  it('should accept type="submit"', () => {
    const props = renderButton({ label: 'Submit', type: 'submit' });
    expect(props.type).toBe('submit');
  });

  it('should accept type="reset"', () => {
    const props = renderButton({ label: 'Reset', type: 'reset' });
    expect(props.type).toBe('reset');
  });

  it('should render the label text', () => {
    const props = renderButton({ label: 'Test Label' });
    expect(props.children).toBe('Test Label');
  });

  it('should show loading text when loading', () => {
    const props = renderButton({ label: 'Submit', loading: true });
    expect(props.children).toBe('Loading…');
  });

  it('should be disabled when disabled prop is true', () => {
    const props = renderButton({ label: 'Click', disabled: true });
    expect(props.disabled).toBe(true);
  });

  it('should be disabled when loading', () => {
    const props = renderButton({ label: 'Click', loading: true });
    expect(props.disabled).toBe(true);
  });

  it('should apply primary variant styles by default', () => {
    const props = renderButton({ label: 'Primary' });
    expect(props.style).toEqual(expect.objectContaining({
      backgroundColor: '#2563eb',
      color: '#fff',
    }));
  });

  it('should apply danger variant styles', () => {
    const props = renderButton({ label: 'Delete', variant: 'danger' });
    expect(props.style).toEqual(expect.objectContaining({
      backgroundColor: '#dc2626',
      color: '#fff',
    }));
  });

  it('should apply secondary variant styles', () => {
    const props = renderButton({ label: 'Cancel', variant: 'secondary' });
    expect(props.style).toEqual(expect.objectContaining({
      backgroundColor: '#f3f4f6',
      color: '#111827',
    }));
  });

  it('should apply ghost variant styles', () => {
    const props = renderButton({ label: 'Ghost', variant: 'ghost' });
    expect(props.style).toEqual(expect.objectContaining({
      backgroundColor: 'transparent',
      color: '#2563eb',
    }));
  });

  it('should set aria-label', () => {
    const props = renderButton({ label: 'Accessible' });
    expect(props['aria-label']).toBe('Accessible');
  });

  it('should set data-testid', () => {
    const props = renderButton({ label: 'Test', testID: 'my-button' });
    expect(props['data-testid']).toBe('my-button');
  });

  it('should apply small size styles', () => {
    const props = renderButton({ label: 'Small', size: 'sm' });
    expect(props.style).toEqual(expect.objectContaining({
      fontSize: '0.8125rem',
      borderRadius: '6px',
    }));
  });

  it('should apply large size styles', () => {
    const props = renderButton({ label: 'Large', size: 'lg' });
    expect(props.style).toEqual(expect.objectContaining({
      fontSize: '1.0625rem',
      borderRadius: '10px',
    }));
  });
});
