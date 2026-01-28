import { supabase } from '@/src/api/supabase';

export async function addMemberToTrip({
  tripId,
  email,
}: {
  tripId: string;
  email: string;
}) {
  // 1️⃣ Find user by email
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (userError || !user) {
    throw new Error('User with this email does not exist.');
  }

  // 2️⃣ Insert into trip_members
  const { error: insertError } = await supabase
    .from('trip_members')
    .insert({
      trip_id: tripId,
      user_id: user.id,
    });

  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error('User is already a member of this trip.');
    }
    throw insertError;
  }
}
