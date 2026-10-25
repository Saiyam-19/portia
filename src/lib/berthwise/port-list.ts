/** The v1 ports, light enough for the browser (the rule book itself stays on the server). */
export const PORT_IDS = ["mumbai", "jnpa", "jaigarh", "new-mangalore", "paradip", "deendayal", "chennai", "kamarajar", "mundra", "hazira", "kattupalli", "pipavav"] as const;
export type PortId = (typeof PORT_IDS)[number];

export const PORT_NAMES: Record<PortId, string> = {
  mumbai: "Mumbai", jnpa: "JNPA (Nhava Sheva)", jaigarh: "Jaigarh", "new-mangalore": "New Mangalore", paradip: "Paradip", deendayal: "Deendayal (Kandla)",
  chennai: "Chennai", kamarajar: "Kamarajar (Ennore)", mundra: "Mundra", hazira: "Hazira", kattupalli: "Kattupalli", pipavav: "Pipavav",
};

/** What typing "@" offers in the message box: the name to insert and other names it answers to. */
export const PORT_MENTIONS: Array<{ id: PortId; label: string; insert: string; also: string[] }> = [
  { id: "mumbai", label: "Mumbai", insert: "Mumbai", also: ["Bombay", "MbPA"] },
  { id: "jnpa", label: "JNPA (Nhava Sheva)", insert: "JNPA", also: ["Nhava Sheva", "JNPT", "NSICT", "NSIGT", "GTI", "BMCT"] },
  { id: "jaigarh", label: "Jaigarh", insert: "Jaigarh", also: ["JSW Jaigarh"] },
  { id: "new-mangalore", label: "New Mangalore", insert: "New Mangalore", also: ["Mangalore", "NMPA"] },
  { id: "paradip", label: "Paradip", insert: "Paradip", also: ["Paradeep"] },
  { id: "deendayal", label: "Deendayal (Kandla)", insert: "Kandla", also: ["Deendayal", "Vadinar"] },
  { id: "chennai", label: "Chennai", insert: "Chennai", also: ["Madras"] },
  { id: "kamarajar", label: "Kamarajar (Ennore)", insert: "Kamarajar", also: ["Ennore"] },
  { id: "mundra", label: "Mundra", insert: "Mundra", also: ["Adani Mundra", "APSEZ"] },
  { id: "hazira", label: "Hazira", insert: "Hazira", also: ["Adani Hazira"] },
  { id: "kattupalli", label: "Kattupalli", insert: "Kattupalli", also: ["MIDPL"] },
  { id: "pipavav", label: "Pipavav", insert: "Pipavav", also: ["GPPL", "APM Terminals Pipavav"] },
];

/** Ports whose names start with (or contain) what was typed after "@". */
export function matchPorts(query: string, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return PORT_MENTIONS.slice(0, limit);
  const names = (port: (typeof PORT_MENTIONS)[number]) => [port.label, port.insert, ...port.also].map(name => name.toLowerCase());
  const starts = PORT_MENTIONS.filter(port => names(port).some(name => name.startsWith(q) || name.split(/[\s(]+/).some(word => word.startsWith(q))));
  const contains = PORT_MENTIONS.filter(port => !starts.includes(port) && names(port).some(name => name.includes(q)));
  return [...starts, ...contains].slice(0, limit);
}
