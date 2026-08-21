// babel-plugin-jest-hoist exempts identifiers prefixed with "mock" from its
// usual "no outer-scope references" restriction inside a jest.mock()
// factory (the factory is hoisted above imports, so anything else would be
// a use-before-initialization error) — imported and aliased here instead
// of a require() call for the same purpose.
import { useEffect as mockUseEffect } from "react";

jest.mock("expo-router", () => ({
  // WalletScreen only ever passes a no-cleanup callback, so this stands in
  // as a run-on-mount-and-on-dependency-change effect — the same shape
  // useFocusEffect gives it inside a real navigator.
  useFocusEffect: (callback: () => void) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    mockUseEffect(callback, [callback]);
  },
}));

// Defined entirely inside the factory (no outside reference) so it isn't
// subject to jest.mock's hoist-above-everything-else ordering.
jest.mock("../../src/api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { getWallet: jest.fn(), getProfile: jest.fn(), transferCoins: jest.fn(), ApiError };
});

import { render, fireEvent, waitFor } from "@testing-library/react-native";
import WalletScreen from "../wallet";
import { getWallet, getProfile, transferCoins, ApiError } from "../../src/api/client";
import type { WalletResponse, Profile } from "../../src/api/types";

const mockGetWallet = getWallet as jest.Mock;
const mockGetProfile = getProfile as jest.Mock;
const mockTransferCoins = transferCoins as jest.Mock;

const WALLET: WalletResponse = { coinBalance: 50, history: [] };
const RECIPIENT = {
  isOwnProfile: false,
  username: "amit",
  displayName: "Amit",
  avatarUrl: null,
  isVerified: false,
} as unknown as Profile;

// Regression coverage for two money-moving behaviors introduced this cycle
// (see the addendum's "coin-send confirmation step" commit and
// MAX_TRANSFER_COINS): the 20-coin cap must reject before any network call,
// and a send is only irreversible from the confirm sheet — "Review
// transfer" alone must never move coins.
describe("WalletScreen send-coins flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWallet.mockResolvedValue(WALLET);
  });

  it("rejects an amount over the cap without calling the API at all", async () => {
    const { getByPlaceholderText, getByLabelText, findByText } = await render(<WalletScreen />);
    await findByText("Send coins");

    await fireEvent.changeText(getByPlaceholderText("Recipient username"), "amit");
    await fireEvent.changeText(getByPlaceholderText(/Amount \(max 20\)/), "25");
    await fireEvent.press(getByLabelText("Review transfer"));

    expect(await findByText("You can send at most 20 coins at a time.")).toBeTruthy();
    expect(mockGetProfile).not.toHaveBeenCalled();
    expect(mockTransferCoins).not.toHaveBeenCalled();
  });

  it("opens the confirm sheet on Review transfer without moving coins, and only sends on Confirm", async () => {
    mockGetProfile.mockResolvedValue(RECIPIENT);
    mockTransferCoins.mockResolvedValue({ ok: true });

    const { getByPlaceholderText, getByLabelText, findByText, queryByText } = await render(<WalletScreen />);
    await findByText("Send coins");

    await fireEvent.changeText(getByPlaceholderText("Recipient username"), "amit");
    await fireEvent.changeText(getByPlaceholderText(/Amount \(max 20\)/), "5");
    await fireEvent.press(getByLabelText("Review transfer"));

    await findByText("Confirm transfer");
    expect(mockTransferCoins).not.toHaveBeenCalled();

    await fireEvent.press(getByLabelText("Confirm & send"));

    await waitFor(() => expect(mockTransferCoins).toHaveBeenCalledWith({ username: "amit", coinAmount: 5 }));
    await waitFor(() => expect(queryByText("Confirm transfer")).toBeNull());
  });

  it("blocks sending coins to yourself before any transfer is possible", async () => {
    mockGetProfile.mockResolvedValue({ ...RECIPIENT, isOwnProfile: true });

    const { getByPlaceholderText, getByLabelText, findByText } = await render(<WalletScreen />);
    await findByText("Send coins");

    await fireEvent.changeText(getByPlaceholderText("Recipient username"), "amit");
    await fireEvent.changeText(getByPlaceholderText(/Amount \(max 20\)/), "5");
    await fireEvent.press(getByLabelText("Review transfer"));

    expect(await findByText("You can't send coins to yourself.")).toBeTruthy();
    expect(mockTransferCoins).not.toHaveBeenCalled();
  });

  it("surfaces a not-found lookup error distinctly from a generic ApiError message", async () => {
    mockGetProfile.mockRejectedValue(new ApiError("Not found.", 404));

    const { getByPlaceholderText, getByLabelText, findByText } = await render(<WalletScreen />);
    await findByText("Send coins");

    await fireEvent.changeText(getByPlaceholderText("Recipient username"), "nobody");
    await fireEvent.changeText(getByPlaceholderText(/Amount \(max 20\)/), "5");
    await fireEvent.press(getByLabelText("Review transfer"));

    expect(await findByText("Couldn't find @nobody.")).toBeTruthy();
  });
});
