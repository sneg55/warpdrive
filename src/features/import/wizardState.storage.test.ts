import { expect, it } from "vitest";
import { initialWizardState, wizardReducer } from "./wizardState";

it("walks upload -> preparing -> map via the server-parse actions", () => {
  let s = initialWizardState();
  s = wizardReducer(s, { type: "setTarget", target: "person" });
  s = wizardReducer(s, { type: "uploaded", batchId: "b1" });
  expect(s.step).toBe("preparing");
  expect(s.batchId).toBe("b1");
  s = wizardReducer(s, {
    type: "prepared",
    headers: ["Name", "Email"],
    totalRows: 5,
    previewRows: [],
  });
  expect(s.step).toBe("map");
  expect(s.headers).toEqual(["Name", "Email"]);
  expect(s.totalRows).toBe(5);
  // prepared initializes an unmapped column per header so MapStep can render.
  expect(Object.keys(s.columns)).toEqual(["Name", "Email"]);
});
