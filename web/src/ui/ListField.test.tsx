import { describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ListField } from "./ListField.js";

/**
 * LISTFIELD — the shared controlled list editor. Pins the bug it exists to
 * fix: naive `value={list.join(sep)}` + onChange-split fields kill the
 * separator on the keystroke (Enter in a one-per-line textarea, comma in a
 * comma-separated input), so users cannot type a second item.
 */

function Harness(props: { separator: "\n" | ","; initial: string[]; multiline?: boolean }) {
  const [list, setList] = useState(props.initial);
  return (
    <ListField
      value={list}
      onChange={setList}
      separator={props.separator}
      multiline={props.multiline}
      ariaLabel="list"
    />
  );
}

describe("ListField (LISTFIELD)", () => {
  it("LISTFIELD-001: Enter in a one-per-line textarea survives — the newline is not killed on the keystroke", () => {
    render(<Harness separator={"\n"} initial={["threat modeling"]} multiline />);
    const el = screen.getByLabelText("list") as HTMLTextAreaElement;
    fireEvent.change(el, { target: { value: "threat modeling\n" } });
    // The committed list drops the empty trailing line, but the textarea keeps
    // showing the raw text — the newline the user just typed is still there.
    expect(el.value).toBe("threat modeling\n");
    fireEvent.change(el, { target: { value: "threat modeling\nsecure coding" } });
    expect(el.value).toBe("threat modeling\nsecure coding");
  });

  it("LISTFIELD-002: the committed list is parsed correctly while typing and after blur", () => {
    render(<Harness separator={"\n"} initial={[]} multiline />);
    const el = screen.getByLabelText("list") as HTMLTextAreaElement;
    fireEvent.change(el, { target: { value: "a\n\nb " } });
    // onChange commits the trimmed, non-empty items — not the raw text.
    expect(el.value).toBe("a\n\nb "); // raw preserved while focused
    fireEvent.blur(el);
    expect(el.value).toBe("a\nb"); // normalized on blur
  });

  it("LISTFIELD-003: trailing comma in a comma-separated input is not killed mid-typing", () => {
    render(<Harness separator="," initial={["filesystem"]} />);
    const el = screen.getByLabelText("list") as HTMLInputElement;
    fireEvent.change(el, { target: { value: "filesystem, " } });
    expect(el.value).toBe("filesystem, "); // the comma survives mid-edit
    fireEvent.blur(el);
    expect(el.value).toBe("filesystem"); // normalized on blur
    expect(el.value).not.toContain(",");
  });

  it("LISTFIELD-004: adopts external list changes (draft restore) while unfocused", () => {
    const { rerender } = render(<ListField value={["a"]} onChange={() => {}} separator={"\n"} multiline ariaLabel="list" />);
    const el = screen.getByLabelText("list") as HTMLTextAreaElement;
    expect(el.value).toBe("a");
    rerender(<ListField value={["a", "b"]} onChange={() => {}} separator={"\n"} multiline ariaLabel="list" />);
    expect(el.value).toBe("a\nb");
  });

  it("LISTFIELD-005: does not fight the user's in-flight text when the parent re-renders with the parsed value", () => {
    // Simulates the controlled loop: user types "a\n" → onChange(["a"]) →
    // parent re-renders with ["a"]. The raw "a\n" must stay.
    function Loop() {
      const [list, setList] = useState<string[]>([]);
      return (
        <ListField
          value={list}
          onChange={setList}
          separator={"\n"}
          multiline
          ariaLabel="list"
        />
      );
    }
    render(<Loop />);
    const el = screen.getByLabelText("list") as HTMLTextAreaElement;
    fireEvent.change(el, { target: { value: "security\n" } });
    expect(el.value).toBe("security\n");
  });

  it("LISTFIELD-006: blurring after typing trims whitespace items and drops empties", () => {
    render(<Harness separator="," initial={[]} />);
    const el = screen.getByLabelText("list") as HTMLInputElement;
    fireEvent.change(el, { target: { value: "  spaced , , tight, " } });
    fireEvent.blur(el);
    expect(el.value).toBe("spaced,tight");
  });

  afterEach(cleanup);
});
