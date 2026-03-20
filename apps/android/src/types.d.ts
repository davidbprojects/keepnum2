declare module '@react-navigation/native' {
  export function NavigationContainer(props: any): any;
  export function useNavigation(): any;
  export function useRoute(): any;
}

declare module '@react-navigation/native-stack' {
  export function createNativeStackNavigator<T = any>(): any;
  export type NativeStackScreenProps<T, K extends string> = {
    navigation: any;
    route: { key: string; name: K; params?: any };
  };
}

declare module 'react-native-screens' {
  export function enableScreens(): void;
}

declare module 'react-native-safe-area-context' {
  export function SafeAreaProvider(props: any): any;
}

declare module '@aws-amplify/react-native' {
  const content: any;
  export default content;
}
