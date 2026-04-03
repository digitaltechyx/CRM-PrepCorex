"use client";

import { useEffect, useState } from "react";
import {
  PhoneInput as IntlPhoneInput,
  defaultCountries,
  parseCountry,
  type CountryIso2,
} from "react-international-phone";
import "react-international-phone/style.css";

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function PhoneInput({ value, onChange, placeholder }: PhoneInputProps) {
  const [defaultCountry, setDefaultCountry] = useState<CountryIso2>("us");

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const locale = navigator.language || navigator.languages?.[0];
      if (!locale) return;

      const parts = locale.split("-");
      const countryCode = (parts[1] || parts[0] || "").toLowerCase();

      if (countryCode) {
        const parsed = parseCountry(countryCode);
        if (parsed && defaultCountries.includes(parsed)) {
          setDefaultCountry(parsed);
        }
      }
    } catch {
      // Fallback to default (us)
    }
  }, []);

  return (
    <div className="w-full">
      <IntlPhoneInput
        value={value}
        defaultCountry={defaultCountry}
        onChange={(val) => onChange?.(val)}
        placeholder={placeholder || "Enter phone number"}
        className="w-full text-sm"
        inputClassName="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        countrySelectorStyleProps={{
          className: "border border-input bg-background rounded-l-md",
          buttonClassName:
            "h-9 px-2 border-r border-input bg-muted hover:bg-muted/80 rounded-l-md",
          searchBoxClassName:
            "w-full px-2 py-1 mb-2 rounded-md border border-input text-sm focus:outline-none",
        }}
      />
    </div>
  );
}

