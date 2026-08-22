jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

// @expo/vector-icons/Ionicons isn't covered by this project's existing Jest
// setup (no prior test rendered a screen that uses it) — stub it with a
// bare View rather than widening jest.setup.js's shared config for one test.
jest.mock("@expo/vector-icons/Ionicons", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return View;
});

jest.mock("../../src/api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { getMe: jest.fn(), updateProfile: jest.fn(), ApiError };
});

import { render } from "@testing-library/react-native";
import EditProfileScreen from "../edit-profile";
import { getMe } from "../../src/api/client";
import { DEFAULT_COVER_SOURCE } from "../../src/components/defaultCover";
import type { Me } from "../../src/api/types";

const mockGetMe = getMe as jest.Mock;

const ME: Me = {
  id: "u1",
  username: "kingofyadav",
  displayName: "Amit Ku Yadav",
  bio: "Passionate about Boss. Always open to connecting.",
  avatarUrl: null,
  coverUrl: null,
  themePreset: "default",
  isPrivate: false,
  isPremium: false,
};

// Regression coverage for two blank-placeholder bugs: edit-profile used to
// render a bare, unlabeled View for a null avatarUrl/coverUrl instead of the
// same brand-mark avatar fallback and default cover photo the web app shows
// (see Avatar.tsx, defaultCover.ts, and web's src/components/Avatar.tsx +
// src/app/[username]/page.tsx's DEFAULT_COVER_URL) — so a user with neither
// set saw what looked like broken/missing images instead of the same
// on-brand defaults shown everywhere else.
describe("EditProfileScreen avatar/cover fallbacks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the shared brand-mark avatar fallback (not a blank placeholder) when avatarUrl is null", async () => {
    mockGetMe.mockResolvedValue(ME);

    const { findByDisplayValue, getByLabelText } = await render(<EditProfileScreen />);

    await findByDisplayValue("Amit Ku Yadav");

    // Avatar.tsx sets this exact accessibilityLabel on its fallback View —
    // its presence proves the real fallback rendered, not an empty box.
    expect(getByLabelText("Amit Ku Yadav's avatar")).toBeTruthy();
  });

  it("shows the default cover photo (not a blank placeholder) when coverUrl is null", async () => {
    mockGetMe.mockResolvedValue(ME);

    const { findByDisplayValue, getByLabelText } = await render(<EditProfileScreen />);

    await findByDisplayValue("Amit Ku Yadav");

    // expo-image's host component normalizes a single source into a
    // one-element array internally.
    expect(getByLabelText("Cover photo").props.source).toEqual([DEFAULT_COVER_SOURCE]);
  });
});
