// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock("@/features/observability/capture", () => ({
  capture: captureMock,
  currentRoute: () => "/p",
}));

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function open(name: string): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name }));
  return user;
}

it("emits menu_item_selected with item label and aria-label trigger label", async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Deal actions">...</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const user = await open("Deal actions");
  await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
  expect(captureMock).toHaveBeenCalledTimes(1);
  expect(captureMock).toHaveBeenCalledWith("menu_item_selected", {
    itemLabel: "Archive",
    triggerLabel: "Deal actions",
    disabled: false,
    kind: "item",
    route: "/p",
  });
});

it("omits the trigger label when the trigger has no aria-label", async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Jane Owner</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Edit</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const user = await open("Jane Owner");
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  expect(captureMock).toHaveBeenCalledWith("menu_item_selected", {
    itemLabel: "Edit",
    disabled: false,
    kind: "item",
    route: "/p",
  });
});

it("keeps the caller onSelect and preventDefault keeping the menu open", async () => {
  const onSelect = vi.fn((e: Event) => e.preventDefault());
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Menu">...</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSelect}>Keep</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const user = await open("Menu");
  await user.click(await screen.findByRole("menuitem", { name: "Keep" }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("menuitem", { name: "Keep" })).toBeTruthy();
  expect(captureMock).toHaveBeenCalledTimes(1);
});

it("keeps the trigger aria-label for redacted items", async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Owner">Jane Owner</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem redactLabel>Bob Smith</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const user = await open("Owner");
  await user.click(await screen.findByRole("menuitem"));
  expect(captureMock).toHaveBeenCalledWith("menu_item_selected", {
    triggerLabel: "Owner",
    disabled: false,
    kind: "item",
    route: "/p",
  });
});

it("emits for checkbox and radio items with their kind", async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Menu">...</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuCheckboxItem checked>Show notes</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value="a">
          <DropdownMenuRadioItem value="a">Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const user = await open("Menu");
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Show notes" }));
  expect(captureMock).toHaveBeenLastCalledWith(
    "menu_item_selected",
    expect.objectContaining({ itemLabel: "Show notes", kind: "checkbox" }),
  );
  await user.click(screen.getByRole("button", { name: "Menu" }));
  await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
  expect(captureMock).toHaveBeenLastCalledWith(
    "menu_item_selected",
    expect.objectContaining({ itemLabel: "Dark", kind: "radio" }),
  );
});

it("does not emit when opening or closing a menu", async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Menu">...</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>X</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const user = await open("Menu");
  await screen.findByRole("menuitem");
  await user.keyboard("{Escape}");
  expect(captureMock).not.toHaveBeenCalled();
});

it("omits the trigger label when the trigger carries data-telemetry-redact", async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Stage actions: Secret Stage" data-telemetry-redact="true">
        ...
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Edit</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const user = await open("Stage actions: Secret Stage");
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  expect(captureMock).toHaveBeenCalledWith("menu_item_selected", {
    itemLabel: "Edit",
    disabled: false,
    kind: "item",
    route: "/p",
  });
});
