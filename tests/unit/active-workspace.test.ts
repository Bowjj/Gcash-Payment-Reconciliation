import { describe, expect, it } from "vitest";

import {
  selectActiveWorkspace,
  type AppWorkspace,
} from "@/lib/auth/active-workspace";

const annie: AppWorkspace = { id: "ws-annie", name: "Annie Internet", role: "owner" };
const testBiz: AppWorkspace = { id: "ws-test", name: "Test Business", role: "owner" };
const businessC: AppWorkspace = { id: "ws-c", name: "Business C", role: "member" };

describe("selectActiveWorkspace", () => {
  it("returns null when there are no workspaces", () => {
    expect(selectActiveWorkspace([], undefined)).toBeNull();
  });

  it("falls back to the earliest workspace when no cookie is set", () => {
    const result = selectActiveWorkspace([annie, testBiz], undefined);
    expect(result?.id).toBe("ws-annie");
  });

  it("returns the earliest workspace when the cookie is unset", () => {
    expect(selectActiveWorkspace([testBiz, annie], undefined)?.id).toBe("ws-test");
  });

  it("returns the workspace selected by the cookie", () => {
    const result = selectActiveWorkspace([annie, testBiz], "ws-test");
    expect(result?.id).toBe("ws-test");
    expect(result?.name).toBe("Test Business");
  });

  it("falls back to the earliest workspace when the cookie is unknown", () => {
    const result = selectActiveWorkspace([annie, testBiz], "ws-ghost");
    expect(result?.id).toBe("ws-annie");
  });

  it("does not return an unrelated workspace as active", () => {
    const result = selectActiveWorkspace([businessC, annie], "ws-annie");
    expect(result?.id).toBe("ws-annie");
  });
});