const mockPush = jest.fn();
const mockOpenBrowserAsync = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args) }));

import { resolvePath } from "../resolvePath";

// Regression coverage for the mobile-review finding: resolvePath is the one
// place that maps a server-computed href (getNotificationHref), a
// universal link, and a future push-notification tap all onto native
// screens — a routing bug here silently degrades to "opens the browser
// instead" rather than throwing, so it needs its own test rather than
// relying on someone noticing a wrong screen while manually tapping around.
describe("resolvePath", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockOpenBrowserAsync.mockClear();
  });

  it("routes a post path to the post screen", () => {
    resolvePath("/p/abc123");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/post/[id]", params: { id: "abc123" } });
  });

  it("strips a query string from the captured id", () => {
    resolvePath("/p/abc123?ref=notif");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/post/[id]", params: { id: "abc123" } });
  });

  it("routes a message thread path", () => {
    resolvePath("/messages/conv-1");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/messages/[id]", params: { id: "conv-1" } });
  });

  it.each(["/messages/new", "/messages/requests"])("falls back to the browser for %s (not a real conversation id)", (path) => {
    resolvePath(path);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(expect.stringContaining(path));
  });

  it("routes a community path", () => {
    resolvePath("/c/general");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/community/[slug]", params: { slug: "general" } });
  });

  it("falls back to the browser for the community create flow", () => {
    resolvePath("/c/new");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).toHaveBeenCalled();
  });

  it("routes a business path", () => {
    resolvePath("/b/acme-co");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/business/[slug]", params: { slug: "acme-co" } });
  });

  it("routes an event path", () => {
    resolvePath("/e/summer-meetup");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[slug]", params: { slug: "summer-meetup" } });
  });

  it("routes a bare username to the profile screen", () => {
    resolvePath("/johndoe");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/[username]", params: { username: "johndoe" } });
  });

  it.each(["/feed", "/notifications", "/login", "/signup"])("never mistakes the reserved path %s for a username", (path) => {
    resolvePath(path);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).toHaveBeenCalled();
  });

  it("falls back to the browser for a namespace with no native screen yet (marketplace)", () => {
    resolvePath("/m/some-listing");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(expect.stringContaining("/m/some-listing"));
  });
});
