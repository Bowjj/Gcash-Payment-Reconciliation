// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Button } from "@/components/ui/button";

test("renders an accessible disabled button when disabled", () => {
  render(<Button disabled>Start verification</Button>);

  expect(
    screen.getByRole("button", { name: "Start verification" }),
  ).toBeDisabled();
});
