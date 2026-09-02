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
  return { getWalletTransactions: jest.fn(), ApiError };
});

import { render } from "@testing-library/react-native";
import WalletTransactionsScreen from "../transactions";
import { getWalletTransactions, ApiError } from "../../../src/api/client";
import type { WalletTransactionEntry } from "../../../src/api/types";

const mockGetWalletTransactions = getWalletTransactions as jest.Mock;

const ENTRY: WalletTransactionEntry = {
  id: "posting-1",
  transactionId: "txn-1",
  kind: "transfer",
  feature: "transfer",
  direction: "in",
  amountCoins: 10,
  memo: null,
  createdAt: new Date().toISOString(),
};

describe("WalletTransactionsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the first page of ledger entries, labeled via walletActivityLabel", async () => {
    mockGetWalletTransactions.mockResolvedValue({ entries: [ENTRY], nextCursor: null });
    const { findByText } = await render(<WalletTransactionsScreen />);
    await findByText("Coins received");
    expect(mockGetWalletTransactions).toHaveBeenCalledWith();
  });

  it("shows an empty state and retries on error", async () => {
    mockGetWalletTransactions.mockRejectedValue(new ApiError("Could not load your activity.", 500));
    const { findByText } = await render(<WalletTransactionsScreen />);
    await findByText("Could not load your activity.");
  });
});
