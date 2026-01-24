import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation, useRoute } from '@react-navigation/native';

import { supabase } from '@/src/api/supabase';
import { parseUPIText, TransactionData } from '@/src/utils/parser';
import { Colors } from '@/src/constants';
import { Trip } from '@/src/types/database';

export default function ScreenshotImport() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  
  const { tripId, uri } = route.params || {};

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TransactionData | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(tripId ?? null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  /* -------------------- 1. INITIAL LOAD & SHARE -------------------- */
  useEffect(() => {
    // If we don't have a tripId, load the user's active trips immediately
    if (!selectedTripId) {
      loadTrips();
    }
  }, []);

  useEffect(() => {
    if (uri) {
      handleSharedImage(uri);
    }
  }, [uri]);

  const handleSharedImage = async (contentUri: string) => {
    if (!contentUri) return;
    try {
      setLoading(true);
      setData(null);
      
      let decodedUri = decodeURIComponent(contentUri);
      if (decodedUri.includes('%')) decodedUri = decodeURIComponent(decodedUri);

      const fileName = `import_${Date.now()}.jpg`;
      const destinationPath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.copyAsync({ from: decodedUri, to: destinationPath });

      setImageUri(destinationPath);
      await processImage(destinationPath);
    } catch (e) {
      Alert.alert('Import Error', 'Could not access the shared file.');
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- 2. OCR -------------------- */
  const processImage = async (uri: string) => {
    setLoading(true);
    try {
      const ocr = await TextRecognition.recognize(uri);
      console.log(ocr)
      const fullText = ocr.text || ocr.blocks?.map(b => b.text).join('\n') || '';
      console.log('OCR Result:', fullText);
      if (!fullText.trim()) {
        Alert.alert('No text detected', 'Please ensure the screenshot is clear.');
        return;
      }

      const parsed = parseUPIText(fullText);
      setData(parsed);
      setAmount(parsed.amount || '');
    } catch (e) {
      Alert.alert('OCR Failed', 'Could not read the screenshot.');
    } finally {
      setLoading(false);
    }
  };

  const pickScreenshot = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (result.didCancel || !result.assets?.[0]?.uri) return;
    setImageUri(result.assets[0].uri);
    processImage(result.assets[0].uri);
  };

  /* -------------------- 3. TRIP PICKER LOGIC -------------------- */
  const loadTrips = async () => {
    setTripsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Removed 'is_deleted' since it doesn't exist in your schema
      const { data, error } = await supabase
        .from('trips')
        .select(`
          trip_id, 
          name,
          trip_members!inner(user_id)
        `)
        .eq('status', 'Active')
        .eq('trip_members.user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } catch (e) {
      console.error("Trip Loading Error:", e);
    } finally {
      setTripsLoading(false);
    }
  };

  /* -------------------- 4. NAVIGATION -------------------- */
  const confirmAndContinue = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    if (!selectedTripId) {
      Alert.alert('Select Trip', 'Please select a trip to assign this expense to.');
      return;
    }

    // Use replace to avoid keeping the import screen in the stack
    navigation.navigate('ExpenseInput', {
      id: selectedTripId,
      amount: amount,
      payee: data?.payee ?? '',
      importImage: imageUri,
      // If your ExpenseInput expects specific params, ensure they match here
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>Import UPI Screenshot</Text>

        <TouchableOpacity style={styles.btn} onPress={pickScreenshot} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Select Screenshot</Text>}
        </TouchableOpacity>

        {imageUri && <Image source={{ uri: imageUri }} style={styles.image} />}

        {data && (
          <View style={styles.card}>
            <Text style={styles.label}>Detected Payee</Text>
            <Text style={styles.name}>{data.payee || 'Unknown'}</Text>
            <View style={styles.divider} />
            <Text style={styles.label}>Confirm Amount</Text>
            <View style={styles.amountInputWrapper}>
              <Text style={styles.currency}>₹</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
            </View>
          </View>
        )}

        {/* TRIP PICKER UI - Always show if we don't have a tripId from params */}
        {!tripId && (
          <View style={styles.card}>
            <Text style={styles.label}>Select Destination Trip</Text>
            {tripsLoading ? (
              <ActivityIndicator style={{ marginTop: 12 }} />
            ) : trips.length === 0 ? (
              <Text style={styles.emptyText}>No active trips found.</Text>
            ) : (
              trips.map((trip) => (
                <TouchableOpacity
                  key={trip.trip_id}
                  style={[
                    styles.tripItem,
                    selectedTripId === trip.trip_id && styles.tripItemActive,
                  ]}
                  onPress={() => setSelectedTripId(trip.trip_id)}
                >
                  <Text style={styles.tripName}>{trip.name}</Text>
                  {selectedTripId === trip.trip_id && <Text style={{color: Colors.primary}}>✓</Text>}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {imageUri && (
          <TouchableOpacity
            style={[styles.confirmBtn, (!amount || amount === '0' || !selectedTripId) && { opacity: 0.5 }]}
            onPress={confirmAndContinue}
            disabled={!amount || amount === '0' || loading}
          >
            <Text style={styles.confirmText}>Confirm & Split</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingHorizontal: 20 },
  header: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 20, marginBottom: 20 },
  btn: { backgroundColor: Colors.primary, padding: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  image: { width: '100%', height: 220, resizeMode: 'contain', marginVertical: 16, borderRadius: 12, backgroundColor: '#ddd' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 20, elevation: 4, marginBottom: 15 },
  label: { fontSize: 11, color: '#70757a', fontWeight: 'bold', textTransform: 'uppercase' },
  name: { fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#e8eaed', marginVertical: 15 },
  amountInputWrapper: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  currency: { fontSize: 30, fontWeight: '800', color: '#188038', marginRight: 6 },
  amountInput: { fontSize: 32, fontWeight: '900', color: '#188038', borderBottomWidth: 1, borderColor: '#ddd', flex: 1, padding: 0 },
  confirmBtn: { backgroundColor: '#188038', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  tripItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginTop: 10, backgroundColor: '#f1f3f4' },
  tripItemActive: { backgroundColor: '#e8f0fe', borderWidth: 1, borderColor: Colors.primary },
  tripName: { fontSize: 15, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 10, color: '#666' }
});