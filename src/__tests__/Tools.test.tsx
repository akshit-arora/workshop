import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tools } from "../components/Tools";

/**
 * Helper to set an input/textarea value using native setter.
 * This bypasses userEvent's keyboard-special-character parsing
 * which breaks on `{`, `[`, etc.
 */
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  nativeSetter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// ─── Tools Component ──────────────────────────────────
describe("Tools Component", () => {
  it("renders all tool tabs", () => {
    render(<Tools />);

    expect(screen.getByText("Beautifier")).toBeInTheDocument();
    expect(screen.getByText("JWT Debugger")).toBeInTheDocument();
    expect(screen.getByText("Base64")).toBeInTheDocument();
    expect(screen.getByText("Encoding")).toBeInTheDocument();
    expect(screen.getByText("Unix Epoch")).toBeInTheDocument();
    expect(screen.getByText("Crontab")).toBeInTheDocument();
    expect(screen.getByText("Regex")).toBeInTheDocument();
  });

  it("defaults to Beautifier active", () => {
    render(<Tools />);
    expect(screen.getByText("Beautify")).toBeInTheDocument();
  });

  it("switches to JWT Debugger tab", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("JWT Debugger"));

    expect(screen.getByText("Decode JWT")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste JWT token here...")).toBeInTheDocument();
  });

  it("switches to Base64 tab", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Base64"));

    expect(screen.getByText("Encode")).toBeInTheDocument();
    expect(screen.getByText("Decode")).toBeInTheDocument();
  });

  it("switches to Encoding tab", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Encoding"));

    expect(screen.getByText("URL Encode")).toBeInTheDocument();
    expect(screen.getByText("URL Decode")).toBeInTheDocument();
    expect(screen.getByText("HTML Encode")).toBeInTheDocument();
    expect(screen.getByText("HTML Decode")).toBeInTheDocument();
  });

  it("switches to Regex tab", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Regex"));

    expect(screen.getByText("Run Regex")).toBeInTheDocument();
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});

// ─── Beautifier ───────────────────────────────────────
describe("Beautifier Tool", () => {
  it("beautifies valid JSON", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    const textarea = screen.getByPlaceholderText("Paste JSON here...") as HTMLTextAreaElement;
    // Use native setter since `{` is a special char for userEvent
    setNativeValue(textarea, '{"name":"test","value":1}');

    await user.click(screen.getByText("Beautify"));

    // The output pre should contain the pretty-printed JSON
    // Both the input textarea and output pre contain "name", so check the pre directly
    const outputPre = document.querySelector("pre");
    expect(outputPre).toBeTruthy();
    expect(outputPre!.textContent).toContain('"name"');
    expect(outputPre!.textContent).toContain('"test"');
  });

  it("shows error for invalid JSON", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    const textarea = screen.getByPlaceholderText("Paste JSON here...");
    await user.clear(textarea);
    await user.type(textarea, "not valid json");

    await user.click(screen.getByText("Beautify"));

    const errorElement = document.querySelector(".text-error");
    expect(errorElement).toBeTruthy();
  });

  it("switches between JSON, XML, and SQL modes", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    expect(screen.getByPlaceholderText("Paste JSON here...")).toBeInTheDocument();

    await user.click(screen.getByText("XML"));
    expect(screen.getByPlaceholderText("Paste XML here...")).toBeInTheDocument();

    await user.click(screen.getByText("SQL"));
    expect(screen.getByPlaceholderText("Paste SQL here...")).toBeInTheDocument();
  });
});

// ─── JWT Debugger ─────────────────────────────────────
describe("JWT Debugger Tool", () => {
  const validJWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  it("decodes a valid JWT token", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("JWT Debugger"));

    const textarea = screen.getByPlaceholderText("Paste JWT token here...");
    await user.clear(textarea);
    await user.type(textarea, validJWT);
    await user.click(screen.getByText("Decode JWT"));

    expect(screen.getByText(/HS256/)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });

  it("shows error for invalid JWT", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("JWT Debugger"));

    const textarea = screen.getByPlaceholderText("Paste JWT token here...");
    await user.clear(textarea);
    await user.type(textarea, "not.a.jwt.at.all");

    await user.click(screen.getByText("Decode JWT"));

    const errorAlert = document.querySelector(".alert-error");
    expect(errorAlert).toBeTruthy();
  });

  it("shows error for JWT with wrong number of parts", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("JWT Debugger"));

    const textarea = screen.getByPlaceholderText("Paste JWT token here...");
    await user.clear(textarea);
    await user.type(textarea, "only.two");

    await user.click(screen.getByText("Decode JWT"));

    expect(screen.getByText(/Invalid JWT format/)).toBeInTheDocument();
  });
});

// ─── Base64 Tool ──────────────────────────────────────
describe("Base64 Tool", () => {
  it("encodes text to Base64", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Base64"));

    const textarea = screen.getByPlaceholderText("Input text...");
    await user.clear(textarea);
    await user.type(textarea, "Hello World");

    await user.click(screen.getByText("Encode"));

    expect(screen.getByText("SGVsbG8gV29ybGQ=")).toBeInTheDocument();
  });

  it("decodes Base64 to text", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Base64"));

    const textarea = screen.getByPlaceholderText("Input text...");
    await user.clear(textarea);
    await user.type(textarea, "SGVsbG8gV29ybGQ=");

    const decodeButtons = screen.getAllByText("Decode");
    await user.click(decodeButtons[0]);

    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("handles invalid Base64 gracefully", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Base64"));

    const textarea = screen.getByPlaceholderText("Input text...");
    await user.clear(textarea);
    await user.type(textarea, "!!!not-base64!!!");

    const decodeButtons = screen.getAllByText("Decode");
    await user.click(decodeButtons[0]);

    expect(screen.getByText("Invalid Base64 input")).toBeInTheDocument();
  });
});

// ─── Epoch Converter ──────────────────────────────────
describe("Epoch Converter Tool", () => {
  it("renders with a default epoch value", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Unix Epoch"));

    const input = screen.getByDisplayValue(/^\d+$/);
    expect(input).toBeInTheDocument();
  });

  it("converts a known epoch timestamp", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Unix Epoch"));

    const input = screen.getByDisplayValue(/^\d+$/);
    await user.clear(input);
    await user.type(input, "0");

    await user.click(screen.getByText("Convert"));

    expect(screen.getByText(/1970/)).toBeInTheDocument();
  });

  it("uses Now button to reset epoch", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Unix Epoch"));

    await user.click(screen.getByText("Now"));

    const input = screen.getByDisplayValue(/^\d+$/);
    const value = parseInt((input as HTMLInputElement).value);
    const currentEpoch = Math.floor(Date.now() / 1000);

    expect(Math.abs(value - currentEpoch)).toBeLessThan(2);
  });
});

// ─── Crontab Visualizer ───────────────────────────────
describe("Crontab Visualizer Tool", () => {
  it("renders with default cron expression", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Crontab"));

    const input = screen.getByDisplayValue("* * * * *");
    expect(input).toBeInTheDocument();

    expect(screen.getByText(/Every minute/)).toBeInTheDocument();
  });

  it("shows error for invalid cron expression", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Crontab"));

    const input = screen.getByDisplayValue("* * * * *");
    await user.clear(input);
    await user.type(input, "* * *");

    expect(screen.getByText(/Invalid Cron format/)).toBeInTheDocument();
  });

  it("displays the cron reference table", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Crontab"));

    expect(screen.getByText("* : every value")).toBeInTheDocument();
    expect(screen.getByText("- : range of values")).toBeInTheDocument();
    expect(screen.getByText(", : list of values")).toBeInTheDocument();
    expect(screen.getByText("/ : step values")).toBeInTheDocument();
  });
});

// ─── Regex Tester ─────────────────────────────────────
describe("Regex Tester Tool", () => {
  it("renders with default state", async () => {
    const user = userEvent.setup();
    render(<Tools />);

    await user.click(screen.getByText("Regex"));

    expect(screen.getByText("Run Regex")).toBeInTheDocument();
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("finds matches for a valid regex", async () => {
    const user = userEvent.setup();
    const { container } = render(<Tools />);

    await user.click(screen.getByText("Regex"));

    // Use native setter for pattern since `\d+` needs special handling
    const patternInput = screen.getByPlaceholderText("[a-z]+") as HTMLInputElement;
    setNativeValue(patternInput, "\\d+");

    // Find the textarea directly and set text
    const testTextArea = container.querySelector("textarea")!;
    setNativeValue(testTextArea, "abc 123 def 456");

    await user.click(screen.getByText("Run Regex"));

    expect(screen.getByText(/Match 1/)).toBeInTheDocument();
  });

  it("shows error for invalid regex", async () => {
    const user = userEvent.setup();
    const { container } = render(<Tools />);

    await user.click(screen.getByText("Regex"));

    const patternInput = screen.getByPlaceholderText("[a-z]+") as HTMLInputElement;
    setNativeValue(patternInput, "[invalid");

    await user.click(screen.getByText("Run Regex"));

    const errorElement = container.querySelector(".text-error");
    expect(errorElement).toBeTruthy();
  });
});

// ─── Encoding Tool (Unit logic tests) ─────────────────
describe("Encoding Logic", () => {
  it("URL encodes special characters", () => {
    expect(encodeURIComponent("hello world")).toBe("hello%20world");
    expect(encodeURIComponent("a&b=c")).toBe("a%26b%3Dc");
  });

  it("URL decodes encoded strings", () => {
    expect(decodeURIComponent("hello%20world")).toBe("hello world");
    expect(decodeURIComponent("a%26b%3Dc")).toBe("a&b=c");
  });

  it("Base64 roundtrip", () => {
    const original = "Hello, Workshop!";
    const encoded = btoa(original);
    const decoded = atob(encoded);
    expect(decoded).toBe(original);
  });

  it("handles empty strings", () => {
    expect(encodeURIComponent("")).toBe("");
    expect(btoa("")).toBe("");
    expect(atob("")).toBe("");
  });
});
