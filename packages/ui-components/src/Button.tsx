/**
 * Button — cross-platform primitive.
 * Renders a <button> on web and a <TouchableOpacity> on React Native.
 */

import React from 'react';
import { isReactNative } from './platform';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** HTML button type (web only) — defaults to "button" */
  type?: 'button' | 'submit' | 'reset';
  /** Additional CSS class names (web only) */
  className?: string;
  /** Test ID for automated testing */
  testID?: string;
}

const WEB_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.04) 100%)',
    boxShadow: '0 1px 2px rgba(37,99,235,0.3), 0 0 0 1px rgba(37,99,235,0.1)',
  },
  secondary: {
    backgroundColor: '#f3f4f6',
    color: '#111827',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  danger: {
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.04) 100%)',
    boxShadow: '0 1px 2px rgba(220,38,38,0.3)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#2563eb',
    border: '1px solid #dbeafe',
    boxShadow: 'none',
  },
};

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: '0.8125rem', borderRadius: '6px', letterSpacing: '0.01em' },
  md: { padding: '9px 18px', fontSize: '0.9375rem', borderRadius: '8px', letterSpacing: '0.01em' },
  lg: { padding: '13px 28px', fontSize: '1.0625rem', borderRadius: '10px', letterSpacing: '0.01em' },
};

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  type = 'button',
  className,
  testID,
}) => {
  const handleClick = onClick ?? onPress;

  if (isReactNative()) {
    // React Native rendering — import lazily to avoid bundling RN in web builds
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TouchableOpacity, Text, ActivityIndicator, View } = require('react-native') as typeof import('react-native');

    const rnVariantColors: Record<ButtonVariant, string> = {
      primary: '#2563eb',
      secondary: '#e5e7eb',
      danger: '#dc2626',
      ghost: 'transparent',
    };

    const rnTextColors: Record<ButtonVariant, string> = {
      primary: '#fff',
      secondary: '#111827',
      danger: '#fff',
      ghost: '#2563eb',
    };

    const rnPadding: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number }> = {
      sm: { paddingVertical: 4, paddingHorizontal: 12 },
      md: { paddingVertical: 8, paddingHorizontal: 16 },
      lg: { paddingVertical: 12, paddingHorizontal: 24 },
    };

    return (
      <TouchableOpacity
        onPress={handleClick}
        disabled={disabled || loading}
        testID={testID}
        style={{
          backgroundColor: rnVariantColors[variant],
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled || loading ? 0.5 : 1,
          ...rnPadding[size],
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || loading }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {loading && (
            <ActivityIndicator
              size="small"
              color={rnTextColors[variant]}
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={{ color: rnTextColors[variant], fontWeight: '600' }}>
            {loading ? 'Loading…' : label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Web rendering
  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      className={className}
      data-testid={testID}
      aria-label={label}
      aria-disabled={disabled || loading}
      style={{
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        fontWeight: 600,
        fontFamily: 'inherit',
        lineHeight: 1.5,
        transition: 'all 0.15s ease',
        ...WEB_STYLES[variant],
        ...SIZE_STYLES[size],
      }}
    >
      {loading ? 'Loading…' : label}
    </button>
  );
};

export default Button;
