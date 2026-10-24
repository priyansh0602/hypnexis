import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MapScreen } from '../screens/MapScreen';
import { RouteComparisonScreen } from '../screens/RouteComparisonScreen';
import { CameraCopilotScreen } from '../screens/CameraCopilotScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AttributionScreen } from '../screens/AttributionScreen';

export type RootStackParamList = {
  Map: undefined;
  RouteComparison: undefined;
  CameraCopilot: undefined;
  Profile: undefined;
  Attribution: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="Map"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Map" component={MapScreen} />
      <Stack.Screen name="RouteComparison" component={RouteComparisonScreen} />
      <Stack.Screen name="CameraCopilot" component={CameraCopilotScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Attribution" component={AttributionScreen} />
    </Stack.Navigator>
  );
};
