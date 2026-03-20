/**
 * Platform detection helper.
 * Determines whether the component is running in a React Native context.
 */

export function isReactNative(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}
