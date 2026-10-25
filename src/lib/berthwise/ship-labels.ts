/** Plain names for ship types and trades, shared by the fleet page and the chat cards. */
export const SHIP_TYPES: Array<{ value: string; label: string }> = [
  { value: "general-cargo", label: "General cargo ship" },
  { value: "bulk", label: "Bulk carrier" },
  { value: "container", label: "Container ship" },
  { value: "tanker", label: "Tanker" },
  { value: "vlcc", label: "Very large crude carrier (VLCC)" },
  { value: "chemical", label: "Chemical tanker" },
  { value: "lng", label: "LNG carrier" },
  { value: "lpg", label: "LPG carrier" },
  { value: "ro-ro", label: "Ro-Ro / car carrier" },
  { value: "passenger", label: "Passenger ship" },
  { value: "other", label: "Other" },
];
export const shipTypeLabel = (value?: string) => SHIP_TYPES.find(type => type.value === value)?.label;
export const tradeLabel = (value?: string) => value === "foreign" ? "Foreign-going" : value === "coastal" ? "Coastal" : undefined;
