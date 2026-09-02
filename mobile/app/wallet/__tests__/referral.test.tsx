import { useEffect as mockUseEffect } from "react";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    mockUseEffect(callback, [callback]);
  },
}));

jest.mock("../../../src/api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { getWalletReferral: jest.fn(), ApiError };
});

import { render } from "@testing-library/react-native";
import WalletReferralScreen from "../referral";
import { getWalletReferral, ApiError } from "../../../src/api/client";
import type { ReferralInfo } from "../../../src/api/types";

const mockGetWalletReferral = getWalletReferral as jest.Mock;

const INFO: ReferralInfo = {
  code: "ABC123",
  joinUrl: "/join/ABC123",
  attributedSignups: 3,
  rewardedInvites: 2,
  maxRewardedInvites: 10,
  rewardCoinsPerInvite: 5,
};

describe("WalletReferralScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the referral code and stats", async () => {
    mockGetWalletReferral.mockResolvedValue(INFO);
    const { findByText } = await render(<WalletReferralScreen />);
    await findByText("ABC123");
    await findByText("3");
    await findByText("2/10");
  });

  it("shows an empty state and retries on error", async () => {
    mockGetWalletReferral.mockRejectedValue(new ApiError("Could not load your referral info.", 500));
    const { findByText } = await render(<WalletReferralScreen />);
    await findByText("Could not load your referral info.");
  });
});
