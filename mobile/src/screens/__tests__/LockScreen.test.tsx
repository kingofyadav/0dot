jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

import { render, fireEvent } from "@testing-library/react-native";
import { LockScreen } from "../LockScreen";
import { useAuth } from "../../auth/AuthContext";

const mockUseAuth = useAuth as jest.Mock;

// LockScreen is the escape hatch for a device whose biometrics stop working
// (broken sensor, no longer enrolled) — the comment inline in the component
// calls out that without "Sign out instead" a user would be permanently
// stuck on this screen with a session they can neither access nor discard.
// These tests exercise that both buttons actually reach their AuthContext
// action, and that a restore/unlock error surfaces on screen.
describe("LockScreen", () => {
  const unlock = jest.fn();
  const signOut = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ error: null, unlock, signOut });
  });

  it("calls unlock() when Unlock is pressed", async () => {
    const { getByLabelText } = await render(<LockScreen />);
    await fireEvent.press(getByLabelText("Unlock"));
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("calls signOut() when Sign out instead is pressed, not unlock", async () => {
    const { getByLabelText } = await render(<LockScreen />);
    await fireEvent.press(getByLabelText("Sign out instead"));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(unlock).not.toHaveBeenCalled();
  });

  it("renders the AuthContext error (e.g. a hardware-error unlock rejection)", async () => {
    mockUseAuth.mockReturnValue({ error: "Unlock failed.", unlock, signOut });
    const { getByText } = await render(<LockScreen />);
    expect(getByText("Unlock failed.")).toBeTruthy();
  });
});
