import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { supabase } from '../../api/supabase';
import { useNavigation } from '@react-navigation/native';

interface CompleteProfileProps {
  onSaveSuccess: () => void;
}

export default function CompleteProfile({ onSaveSuccess }: CompleteProfileProps) {
  const navigation = useNavigation<any>();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const saveProfile = async () => {
    if (!name || !phone) {
      Alert.alert('Please fill all fields');
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Session expired');
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from('users')
      .upsert({ 
        id: user.id, // ID is required for upsert
        name, 
        phone,
        email: user.email
      });

    setLoading(false);
    
    if (!error) {
      // 2. DO NOT Navigate manually. 
      // Call the parent function to trigger a state change in RootNavigator.
      onSaveSuccess();
    } else {
      Alert.alert('Error', error.message);
    }
    // ✅ NO navigation here
    // RootNavigator will re-check profile and route automatically
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complete your profile</Text>

      <TextInput
        placeholder="Full Name"
        placeholderTextColor="#999"
        style={styles.input}
        value={name}
        onChangeText={setName}
      />

      <TextInput
        placeholder="Phone Number"
        placeholderTextColor="#999"
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <TouchableOpacity style={styles.button} onPress={saveProfile} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? 'Saving...' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
