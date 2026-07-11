// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import { SectionHeaderMenu } from "./SectionHeaderMenu";

afterEach(cleanup);

it("renders a pencil, exact Organization menu items, handlers, and Fill the gaps", async () => {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  const onSwitch = vi.fn();
  const onUnlink = vi.fn();
  const onCustomize = vi.fn();
  const onToggleFillGaps = vi.fn();

  render(
    <SectionHeaderMenu
      sectionLabel={STRINGS.dealSidebar.sections.organization}
      onEdit={onEdit}
      fillGapsPressed={false}
      onToggleFillGaps={onToggleFillGaps}
      menuItems={[
        { label: STRINGS.dealSidebar.menu.switchOrganization, onSelect: onSwitch },
        { label: STRINGS.dealSidebar.menu.unlinkOrganization, onSelect: onUnlink },
        { label: STRINGS.dealSidebar.menu.customizeFields, onSelect: onCustomize },
      ]}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Edit Organization section" }));
  expect(onEdit).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "Fill the gaps" }));
  expect(onToggleFillGaps).toHaveBeenCalledTimes(1);

  const trigger = screen.getByRole("button", { name: "Organization options" });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await user.click(trigger);
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    STRINGS.dealSidebar.menu.switchOrganization,
    STRINGS.dealSidebar.menu.unlinkOrganization,
    STRINGS.dealSidebar.menu.customizeFields,
  ]);

  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.queryByRole("menuitem", { name: STRINGS.dealSidebar.menu.switchOrganization }),
    ).not.toBeInTheDocument(),
  );

  await user.click(trigger);
  await user.click(
    screen.getByRole("menuitem", { name: STRINGS.dealSidebar.menu.switchOrganization }),
  );
  expect(onSwitch).toHaveBeenCalledTimes(1);

  await user.click(trigger);
  await user.click(
    screen.getByRole("menuitem", { name: STRINGS.dealSidebar.menu.unlinkOrganization }),
  );
  expect(onUnlink).toHaveBeenCalledTimes(1);

  await user.click(trigger);
  await user.click(
    screen.getByRole("menuitem", { name: STRINGS.dealSidebar.menu.customizeFields }),
  );
  expect(onCustomize).toHaveBeenCalledTimes(1);
});
