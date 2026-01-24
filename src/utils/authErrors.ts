export function getAuthErrorMessage(error: any): string {
  const msg = error?.message?.toLowerCase() || '';

  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }

  if (msg.includes('user already registered')) {
    return 'An account with this email already exists.';
  }

  if (msg.includes('password')) {
    return 'Password does not meet requirements.';
  }

  if (msg.includes('email')) {
    return 'Please enter a valid email address.';
  }

  if (msg.includes('network')) {
    return 'Network error. Please check your connection.';
  }

  return 'Something went wrong. Please try again.';
}
