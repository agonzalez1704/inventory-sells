"use client";

import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";

// Country-code phone input (flag + dial-code dropdown), styled to match the
// app's inputs via inline styles (self-contained, theme-var aware). `value` and
// `onChange` are the full number as digits, e.g. "5215512345678".
export function PhoneField({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (digits: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <PhoneInput
      country="mx"
      preferredCountries={["mx", "us"]}
      enableSearch
      searchPlaceholder="Buscar país…"
      value={value}
      onChange={(v) => onChange(v)}
      inputProps={{ name: "telefono", autoFocus }}
      countryCodeEditable={false}
      containerStyle={{ width: "100%" }}
      inputStyle={{
        width: "100%",
        height: "44px",
        fontSize: "16px",
        borderRadius: "10px",
        border: "1px solid var(--border, #e2e8f0)",
        background: "var(--background, #fff)",
        color: "var(--foreground, #0f172a)",
        paddingLeft: "52px",
      }}
      buttonStyle={{
        border: "1px solid var(--border, #e2e8f0)",
        borderRight: "none",
        borderRadius: "10px 0 0 10px",
        background: "var(--muted, #f8fafc)",
      }}
      dropdownStyle={{
        borderRadius: "10px",
        fontSize: "14px",
        boxShadow: "0 10px 30px rgba(2, 6, 23, 0.12)",
      }}
    />
  );
}
