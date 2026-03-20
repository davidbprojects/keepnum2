/**
 * Card — cross-platform container primitive.
 * Renders a styled <div> on web and a <View> on React Native.
 */

import React from 'react';
import { isReactNative } from './platform';

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** Additional CSS class names (web only) */
  className?: string;
  /** Inline styles (web only) */
  style?: React.CSSProperties;
  testID?: string;
  /** Padding variant */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const WEB_CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.05)',
  overflow: 'hidden',
  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
};

const WEB_PADDING: Record<NonNullable<CardProps['padding']>, React.CSSProperties> = {
  none: { padding: 0 },
  sm: { padding: '14px' },
  md: { padding: '20px' },
  lg: { padding: '28px' },
};

const WEB_TITLE_STYLE: React.CSSProperties = {
  margin: '0 0 4px 0',
  fontSize: '1.125rem',
  fontWeight: 600,
  color: '#111827',
};

const WEB_SUBTITLE_STYLE: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: '0.875rem',
  color: '#6b7280',
};

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  className,
  style,
  testID,
  padding = 'md',
}) => {
  if (isReactNative()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { View, Text } = require('react-native') as typeof import('react-native');

    const rnPadding: Record<NonNullable<CardProps['padding']>, number> = {
      none: 0,
      sm: 12,
      md: 16,
      lg: 24,
    };

    return (
      <View
        testID={testID}
        accessibilityRole="none"
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          padding: rnPadding[padding],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
          elevation: 2,
        }}
      >
        {title && (
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: subtitle ? 4 : 12 }}>
            {title}
          </Text>
        )}
        {subtitle && (
          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>
            {subtitle}
          </Text>
        )}
        {children}
      </View>
    );
  }

  // Web rendering
  return (
    <div
      className={className}
      data-testid={testID}
      style={{ ...WEB_CARD_STYLE, ...WEB_PADDING[padding], ...style }}
    >
      {title && <h3 style={WEB_TITLE_STYLE}>{title}</h3>}
      {subtitle && <p style={WEB_SUBTITLE_STYLE}>{subtitle}</p>}
      {children}
    </div>
  );
};

export default Card;
