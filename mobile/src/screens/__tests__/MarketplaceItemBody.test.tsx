jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()), maybeCompleteAuthSession: jest.fn() }));

jest.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    getMarketplaceItem: jest.fn(),
    getMarketplaceDownloadUrl: jest.fn(),
    getWallet: jest.fn(),
    purchaseWithCoins: jest.fn(),
    ApiError,
  };
});

jest.mock("../../auth/biometricLock", () => ({
  isBiometricLockAvailable: jest.fn(() => Promise.resolve(false)),
  unlockWithBiometrics: jest.fn(),
}));

import { Linking } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { MarketplaceItemBody } from "../MarketplaceItemBody";
import { getMarketplaceItem, getMarketplaceDownloadUrl, getWallet, purchaseWithCoins, ApiError } from "../../api/client";
import type { MarketplaceItemDetail } from "../../api/types";

const mockGetItem = getMarketplaceItem as jest.Mock;
const mockGetDownload = getMarketplaceDownloadUrl as jest.Mock;
const mockGetWallet = getWallet as jest.Mock;
const mockPurchase = purchaseWithCoins as jest.Mock;

const PRODUCT: MarketplaceItemDetail = {
  category: "digital_product",
  categoryLabel: "Digital product",
  id: "p1",
  title: "Icon pack",
  description: "200 icons.",
  descriptionFormat: "plain",
  coverImageUrl: null,
  price: 5,
  seller: { name: "Amit", username: "amit", businessSlug: null },
  averageRating: null,
  reviewCount: 0,
  purchaseCount: null,
  available: true,
  owned: false,
  isOwnItem: false,
  downloadable: false,
  webPath: "/amit",
};

describe("MarketplaceItemBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps queued mockResolvedValueOnce values; drop them so
    // one test's unconsumed detail response can't leak into the next.
    mockGetItem.mockReset();
    mockGetWallet.mockResolvedValue({ coinBalance: 20, balance: { spendable: 20, restricted: 0, total: 20 }, history: [] });
  });

  it("buys a digital product through the confirm sheet, then offers the download", async () => {
    mockGetItem.mockResolvedValueOnce(PRODUCT).mockResolvedValueOnce({ ...PRODUCT, owned: true, downloadable: true });
    mockPurchase.mockResolvedValue({ ok: true, target: "digital_product", free: false });
    mockGetDownload.mockResolvedValue({ url: "/api/downloads/tok" });
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

    const { findByText, getByText, getByLabelText } = await render(<MarketplaceItemBody category="digital_product" id="p1" />);

    await fireEvent.press(await findByText("Buy for 5 coins"));
    await findByText("Confirm purchase");
    await findByText("15 coins");
    await fireEvent.press(getByLabelText("Buy Icon pack for 5 coins"));

    await waitFor(() => expect(mockPurchase).toHaveBeenCalledWith({ target: "digital_product", id: "p1" }));
    expect(await findByText("You own this.")).toBeTruthy();

    await fireEvent.press(getByText("Download"));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/api\/downloads\/tok$/)));
  });

  it("routes a theme purchase to the marketplace_listing target", async () => {
    mockGetItem.mockResolvedValue({ ...PRODUCT, category: "theme", categoryLabel: "Theme", id: "l1", title: "Dark theme", price: 10 });
    mockPurchase.mockResolvedValue({ ok: true, target: "marketplace_listing", free: false });

    const { findByText, getByLabelText } = await render(<MarketplaceItemBody category="theme" id="l1" />);
    await fireEvent.press(await findByText("Buy for 10 coins"));
    await findByText("Confirm purchase");
    await findByText("20 coins");
    await fireEvent.press(getByLabelText("Buy Dark theme for 10 coins"));

    await waitFor(() => expect(mockPurchase).toHaveBeenCalledWith({ target: "marketplace_listing", id: "l1" }));
  });

  it("never offers Buy on the seller's own item", async () => {
    mockGetItem.mockResolvedValue({ ...PRODUCT, isOwnItem: true });
    const { findByText, queryByText } = await render(<MarketplaceItemBody category="digital_product" id="p1" />);
    expect(await findByText("This is your item.")).toBeTruthy();
    expect(queryByText("Buy for 5 coins")).toBeNull();
  });

  it("never offers Buy on an item that's no longer available", async () => {
    mockGetItem.mockResolvedValue({ ...PRODUCT, available: false });
    const { findByText, queryByText } = await render(<MarketplaceItemBody category="digital_product" id="p1" />);
    expect(await findByText("This item is no longer available.")).toBeTruthy();
    expect(queryByText("Buy for 5 coins")).toBeNull();
  });

  it("shows a retryable error when the item can't load", async () => {
    mockGetItem.mockRejectedValue(new ApiError("Not found.", 404));
    const { findByText } = await render(<MarketplaceItemBody category="theme" id="missing" />);
    expect(await findByText("Not found.")).toBeTruthy();
  });
});
