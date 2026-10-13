export function phoneAuthAddressError(hostname) {
  if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) {
    return 'Real SMS sign-in is not supported on this localhost preview. Use a configured test number here. Real-number sign-in needs an authorised hosted preview.';
  }
  return 'This app address could not be verified. Refresh and try again. If this continues, contact support with error auth/invalid-app-credential.';
}
