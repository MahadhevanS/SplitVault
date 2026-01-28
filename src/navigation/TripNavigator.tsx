import { createNativeStackNavigator } from '@react-navigation/native-stack';

import TripHome from '../screens/trip/TripHome';
import ExpenseInput from '../screens/trip/ExpenseInput';
import Consents from '../screens/trip/Consents';
import CreateTrip from '../screens/trip/CreateTrip'; 
import Disputes from '../screens/trip/Disputes';
import ExpenseDetails from '../screens/trip/expense/ExpenseDetails';

const Stack = createNativeStackNavigator();

export default function TripNavigator() {
  return (
    <Stack.Navigator>
      {/* Adding CreateTrip here allows navigation.navigate('Trip', { screen: 'CreateTrip' }) to work.
         We keep it inside this stack so it feels like part of the trip flow.
      */}
      <Stack.Screen 
        name="CreateTrip" 
        component={CreateTrip} 
        options={{ title: 'Start a New Trip' }} 
      />
      <Stack.Screen
        name="TripHome"
        component={TripHome}
        options={{ title: 'Trip Summary' }}
      />
      <Stack.Screen
        name="ExpenseInput"
        component={ExpenseInput}
        options={{ title: 'Add New Expense' }}
      />

      <Stack.Screen
        name="ExpenseDetails"
        component={ExpenseDetails}
        options={{ title: 'Expense Details' }}
      />

      <Stack.Screen
        name="Consents"
        component={Consents}
        options={{ title: 'Approve Expenses' }}
      />
      <Stack.Screen
        name="Disputes"
        component={Disputes}
        options={{ title: 'Handle Disputes' }}
      />
    </Stack.Navigator>
  );
}