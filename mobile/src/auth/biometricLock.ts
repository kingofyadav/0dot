import * as LocalAuthentication from "expo-local-authentication";

// spec §7: a local convenience gating an already-authenticated session
// token — explicitly not a new account-authentication method, so nothing
// here ever touches tokenStorage. A device with no biometric hardware/
// enrollment isn't locked out; the gate is simply skipped for it (see
// App.tsx's use of isBiometricLockAvailable).
export async function isBiometricLockAvailable(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock 0dot" });
  return result.success;
}
