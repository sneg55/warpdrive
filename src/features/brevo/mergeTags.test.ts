import { describe, expect, it } from "vitest";
import { renderMergeTags } from "./mergeTags";

describe("renderMergeTags", () => {
  it("replaces a tag with its default value", () => {
    expect(
      renderMergeTags('{{ contact.FIRSTNAME | default : "Trader" }}, E8 Classic is here.'),
    ).toBe("Trader, E8 Classic is here.");
  });

  it("accepts a default with no space before the colon", () => {
    expect(renderMergeTags('{{ contact.FIRSTNAME | default: "Hey" }}, quick one')).toBe(
      "Hey, quick one",
    );
  });

  it("drops a tag without a default and the separator it leaves at the start, capitalizing what follows", () => {
    expect(renderMergeTags("{{ contact.FIRSTNAME }}, by now, you’ve seen the offer.")).toBe(
      "By now, you’ve seen the offer.",
    );
  });

  it("closes the space Brevo authors leave before a comma", () => {
    expect(renderMergeTags('{{ contact.FIRSTNAME | default : "Trader" }} , VIP access.')).toBe(
      "Trader, VIP access.",
    );
    expect(renderMergeTags("{{ contact.FIRSTNAME }} , I have something for you")).toBe(
      "I have something for you",
    );
  });

  it("drops a tag in the middle without leaving a double space", () => {
    expect(renderMergeTags("Last call {{ contact.FIRSTNAME }} for $167")).toBe(
      "Last call for $167",
    );
  });

  it("leaves a subject without tags unchanged", () => {
    expect(renderMergeTags("FX Laser E8 One")).toBe("FX Laser E8 One");
  });
});
