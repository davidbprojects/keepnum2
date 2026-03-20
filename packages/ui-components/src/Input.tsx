/**
 * Input — cross-platform text input primitive.
 * Renders an <input> on web and a <TextInput> on React Native.
 */

import React from 'react';
import { isReactNative } from './platform';

export type InputType = 'text' | 'email' | 'password' | 'tel' | 'number' | 'date';

export interface InputProps {
  value: string;
  onChangeText?: (value: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  type?: InputType;
  disabled?: boolean;
  error?: string;
  /** Additional CSS class names (web only) */
  className?: string;
  testID?: string;
  autoComplete?: string;
  secureTextEntry?: boolean; // React Native alias for password
}

const webInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: '0.9375rem',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  backgroundColor: '#fff',
  color: '#111827',
  fontFamily: 'inherit',
};

const webErrorStyle: React.CSSProperties = {
  ...webInputStyle,
  border: '1px solid #dc2626',
};

const webLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '0.875rem',
  fontWeight: 500,
  color: '#374151',
};

const webErrorTextStyle: React.CSSProperties = {
  marginTop: '4px',
  fontSize: '0.75rem',
  color: '#dc2626',
};

export const Input: React.FC<InputProps> = ({
  value,
  onChangeText,
  onChange,
  placeholder,
  label,
  type = 'text',
  disabled = false,
  error,
  className,
  testID,
  autoComplete,
  secureTextEntry,
}) => {
  if (isReactNative()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TextInput, Text, View } = require('react-native') as typeof import('react-native');

    return (
      <View>
        {label && (
          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: '500', color: '#374151' }}>
            {label}
          </Text>
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          editable={!disabled}
          secureTextEntry={secureTextEntry ?? type === 'password'}
          keyboardType={type === 'tel' ? 'phone-pad' : type === 'number' ? 'numeric' : type === 'email' ? 'email-address' : 'default'}
          testID={testID}
          accessibilityLabel={label ?? placeholder}
          style={{
            borderWidth: 1,
            borderColor: error ? '#dc2626' : '#d1d5db',
            borderRadius: 6,
            padding: 10,
            fontSize: 16,
            color: '#111827',
            backgroundColor: disabled ? '#f3f4f6' : '#fff',
          }}
        />
        {error && (
          <Text style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>{error}</Text>
        )}
      </View>
    );
  }

  // Web rendering
  const handleChange = onChange ?? (onChangeText ? (e: React.ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value) : undefined);

  return (
    <div>
      {label && (
        <label htmlFor={testID} style={webLabelStyle}>
          {label}
        </label>
      )}
      <input
        id={testID}
        type={type}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        data-testid={testID}
        autoComplete={autoComplete}
        aria-label={label ?? placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${testID}-error` : undefined}
        style={error ? webErrorStyle : webInputStyle}
      />
      {error && (
        <span id={`${testID}-error`} role="alert" style={webErrorTextStyle}>
          {error}
        </span>
      )}
    </div>
  );
};

export default Input;
