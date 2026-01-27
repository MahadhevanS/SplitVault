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
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();

  const { tripId, uri } = route.params || {};

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TransactionData | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(tripId ?? null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  /* ---------------- INITIAL LOAD ---------------- */

  useEffect(() => {
    if (!selectedTripId) loadTrips();
  }, []);

  useEffect(() => {
    if (uri) handleSharedImage(uri);
  }, [uri]);

  const handleSharedImage = async (contentUri: string) => {
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
    } catch {
      Alert.alert('Import Error', 'Could not access the shared file.');
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- OCR ---------------- */

  const processImage = async (uri: string) => {
    setLoading(true);
    try {
      const ocr = await TextRecognition.recognize(uri);
      const fullText =
        ocr.text || ocr.blocks?.map(b => b.text).join('\n') || '';

      if (!fullText.trim()) {
        Alert.alert('No text detected', 'Please ensure the screenshot is clear.');
        return;
      }

      const parsed = parseUPIText(fullText);
      setData(parsed);
      setAmount(parsed.amount || '');
    } catch {
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

  /* ---------------- TRIPS ---------------- */

  const loadTrips = async () => {
    setTripsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from('trips')
        .select(`trip_id, name, trip_members!inner(user_id)`)
        .eq('status', 'Active')
        .eq('trip_members.user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);
    } finally {
      setTripsLoading(false);
    }
  };

  /* ---------------- NAV ---------------- */

  const confirmAndContinue = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    if (!selectedTripId) {
      Alert.alert('Select Trip', 'Please select a trip.');
      return;
    }

    navigation.navigate('ExpenseInput', {
      id: selectedTripId,
      amount,
      payee: data?.payee ?? '',
      importImage: imageUri,
    });
  };

  /* ---------------- UI ---------------- */

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
      >
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

        {!tripId && (
          <View style={styles.card}>
            <Text style={styles.label}>Select Destination Trip</Text>

            {tripsLoading ? (
              <ActivityIndicator style={{ marginTop: 12 }} />
            ) : trips.length === 0 ? (
              <Text style={styles.emptyText}>No active trips found.</Text>
            ) : (
              trips.map(trip => (
                <TouchableOpacity
                  key={trip.trip_id}
                  style={[
                    styles.tripItem,
                    selectedTripId === trip.trip_id && styles.tripItemActive,
                  ]}
                  onPress={() => setSelectedTripId(trip.trip_id)}
                >
                  <Text style={styles.tripName}>{trip.name}</Text>
                  {selectedTripId === trip.trip_id && <Text style={{ color: Colors.primary }}>✓</Text>}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {imageUri && (
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (!amount || !selectedTripId) && { opacity: 0.5 },
            ]}
            onPress={confirmAndContinue}
            disabled={!amount || loading}
          >
            <Text style={styles.confirmText}>Confirm & Split</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f2f5' },

  header: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: 20,
  },

  btn: {
    backgroundColor: Colors.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },

  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  image: {
    width: '100%',
    height: 220,
    resizeMode: 'contain',
    marginVertical: 16,
    borderRadius: 12,
    backgroundColor: '#ddd',
  },

  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    elevation: 4,
    marginBottom: 15,
  },

  label: {
    fontSize: 11,
    color: '#70757a',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },

  name: { fontSize: 18, fontWeight: 'bold', marginTop: 4 },

  divider: { height: 1, backgroundColor: '#e8eaed', marginVertical: 15 },

  amountInputWrapper: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },

  currency: { fontSize: 30, fontWeight: '800', color: '#188038', marginRight: 6 },

  amountInput: {
    fontSize: 32,
    fontWeight: '900',
    color: '#188038',
    borderBottomWidth: 1,
    borderColor: '#ddd',
    flex: 1,
    padding: 0,
  },

  confirmBtn: {
    backgroundColor: '#188038',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },

  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  tripItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: '#f1f3f4',
  },

  tripItemActive: {
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  tripName: { fontSize: 15, fontWeight: '600' },

  emptyText: { textAlign: 'center', marginTop: 10, color: '#666' },
});
