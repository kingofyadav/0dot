import { AppState } from "react-native";
import { act, renderHook } from "@testing-library/react-native";
import { useAppForeground } from "../useAppForeground";

// Drive AppState by capturing the listener the hook registers.
function mockAppState(initial: "active" | "background" | "inactive" = "active") {
  let listener: (s: string) => void = () => {};
  (AppState as unknown as { currentState: string }).currentState = initial;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, cb) => {
    listener = cb as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  return { emit: (s: string) => act(() => listener(s)) };
}

async function render(onForeground: () => void) {
  await act(async () => {
    await renderHook(() => useAppForeground(onForeground));
  });
}

afterEach(() => jest.restoreAllMocks());

describe("useAppForeground", () => {
  it("fires on background → active", async () => {
    const app = mockAppState("active");
    const onForeground = jest.fn();
    await render(onForeground);

    app.emit("background");
    app.emit("active");

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it("does not fire on inactive → active (shade / control centre dismiss)", async () => {
    const app = mockAppState("active");
    const onForeground = jest.fn();
    await render(onForeground);

    app.emit("inactive");
    app.emit("active");

    expect(onForeground).not.toHaveBeenCalled();
  });
});
