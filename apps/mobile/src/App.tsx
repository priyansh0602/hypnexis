import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useAppTheme } from './context/ThemeContext';
import { WheelchairProfileProvider } from './context/WheelchairProfileContext';
import { RootNavigator } from './navigation/RootNavigator';

const AppContent: React.FC = () => {
  const { isDark } = useAppTheme();

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <WheelchairProfileProvider>
          <AppContent />
        </WheelchairProfileProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
