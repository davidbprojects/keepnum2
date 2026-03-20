/// <reference types="react-scripts" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly REACT_APP_ADYEN_CLIENT_KEY?: string;
    readonly COGNITO_USER_POOL_ID?: string;
    readonly COGNITO_CLIENT_ID?: string;
    readonly API_GATEWAY_URL?: string;
    readonly AWS_REGION?: string;
  }
}
