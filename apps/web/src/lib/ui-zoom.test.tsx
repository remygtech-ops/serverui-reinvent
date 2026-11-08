import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const setZoom = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ setZoom }) }));

let desktop = true;
vi.mock("@/src/lib/app-updater", () => ({ inDesktopShell: () => Promise.resolve(desktop) }));

import { UiZoomController, clampUiZoom, writeUiZoom } from "./ui-zoom";

function wheel(init: WheelEventInit, target: EventTarget = window) {
  const event = new WheelEvent("wheel", { cancelable: true, bubbles: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("clampUiZoom", () => {
  it("keeps the zoom between 50% and 200%", () => {
    expect(clampUiZoom(0.1)).toBe(0.5);
    expect(clampUiZoom(5)).toBe(2);
    expect(clampUiZoom(1.1 + 0.2)).toBe(1.3);
    expect(clampUiZoom(Number.NaN)).toBe(1);
  });
});

describe("UiZoomController", () => {
  beforeEach(() => {
    desktop = true;
    setZoom.mockClear();
    act(() => writeUiZoom(1));
  });
  afterEach(() => {
    localStorage.removeItem("serverui-ui-zoom");
  });

  it("zooms the whole UI with Ctrl + wheel and shows the percentage", async () => {
    render(<UiZoomController />);
    await waitFor(() => expect(setZoom).toHaveBeenCalledWith(1));

    const up = wheel({ ctrlKey: true, deltaY: -100 });
    expect(up.defaultPrevented).toBe(true);
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(1.1));
    expect(await screen.findByRole("status")).toHaveTextContent("110%");

    wheel({ ctrlKey: true, deltaY: 100 });
    wheel({ ctrlKey: true, deltaY: 100 });
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(0.9));
    expect(localStorage.getItem("serverui-ui-zoom")).toBe("0.9");
  });

  it("stops at the limits", async () => {
    render(<UiZoomController />);
    await waitFor(() => expect(setZoom).toHaveBeenCalled());
    for (let i = 0; i < 20; i += 1) wheel({ ctrlKey: true, deltaY: 100 });
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(0.5));
    for (let i = 0; i < 30; i += 1) wheel({ ctrlKey: true, deltaY: -100 });
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(2));
  });

  it("ignores a plain wheel and an event a terminal already handled", async () => {
    render(<UiZoomController />);
    await waitFor(() => expect(setZoom).toHaveBeenCalledTimes(1));

    expect(wheel({ deltaY: -100 }).defaultPrevented).toBe(false);

    const host = document.createElement("div");
    host.addEventListener("wheel", (event) => event.preventDefault());
    document.body.append(host);
    wheel({ ctrlKey: true, deltaY: -100 }, host);
    host.remove();

    expect(setZoom).toHaveBeenCalledTimes(1);
  });

  it("restores the saved zoom at startup", async () => {
    act(() => writeUiZoom(1.4));
    setZoom.mockClear();
    render(<UiZoomController />);
    await waitFor(() => expect(setZoom).toHaveBeenCalledWith(1.4));
  });

  it("leaves the browser's own zoom alone outside the desktop app", async () => {
    desktop = false;
    render(<UiZoomController />);
    await act(async () => {});
    const event = wheel({ ctrlKey: true, deltaY: -100 });
    expect(event.defaultPrevented).toBe(false);
    expect(setZoom).not.toHaveBeenCalled();
  });
});
