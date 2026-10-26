/** Everyday questions a marine company would ask, with what a good answer must do.
 * `tools`: at least one of these must be called. `say`: each must appear in the reply
 * (case-insensitive; a list means any of them). `noTools`: answered without tools. */
export type EverydayQuestion = { id: string; question: string; tools?: string[]; noTools?: boolean; say?: Array<string | string[]>; avoid?: string[] };

export const EVERYDAY_QUESTIONS: EverydayQuestion[] = [
  { id: "estimate-paradip", question: "What will it cost to berth a 32,000 GT bulk carrier at Paradip for 2 days?", tools: ["estimate_port_call"], say: ["GST", "46,315.02"] },
  { id: "estimate-mundra-tanker", question: "port charges at mundra for a 45k grt tanker staying 30 hrs", tools: ["estimate_port_call"], say: ["USD", ["fuel surcharge", "fuel"]] },
  { id: "voyage", question: "We're sailing from Mundra to Chennai with a 40,000 GRT bulk ship, about a day alongside at each. What will the port costs come to in total?", tools: ["estimate_port_call"], say: ["Mundra", "Chennai", ["total", "combined"]], avoid: ["hours at anchorage"] },
  { id: "compare-berth-hire", question: "Compare berth hire at Mumbai and JNPA for a 25,000 GT container ship staying 18 hours", tools: ["compare_ports"], say: ["Mumbai", "JNPA"] },
  { id: "compare-whole-bill", question: "Which is cheaper overall for a 30,000 GRT bulk carrier staying 24 hours: Kattupalli, Chennai or Kamarajar?", tools: ["compare_ports"], say: ["Kattupalli", "Chennai", "Kamarajar"], avoid: ["kattupalli is cheaper"] },
  { id: "tariff-hazira-pilotage", question: "How does Hazira charge pilotage?", tools: ["port_tariff", "search_port_documents"], say: [["per GRT", "per GT"]] },
  { id: "what-changed-paradip", question: "What changed in Paradip's port charges this year?", tools: ["port_tariff"], say: [["October", "10/10", "2026"]] },
  { id: "coverage", question: "Which ports do you cover?", tools: ["list_ports"], say: ["Mundra", "Paradip", "Chennai"] },
  { id: "draft-chennai", question: "What's the permissible draft at Chennai's berths?", tools: ["search_port_documents"], say: [["draft", "draught"], ["m", "metre"]] },
  { id: "documents-mundra", question: "What documents do I need to submit before arriving at Mundra?", tools: ["search_port_documents"], say: [["certificate", "declaration"]] },
  { id: "pilotage-compulsory-mumbai", question: "Is pilotage compulsory in Mumbai?", tools: ["search_port_documents"], say: ["compulsory", "100"], avoid: ["can't confirm"] },
  { id: "night-pipavav", question: "Can ships enter Pipavav at night?", tools: ["search_port_documents"], say: [["day or night", "tidal", "tide"]], avoid: ["can't confirm"] },
  { id: "unsupported-port", question: "What would a call at Colombo cost for a 20,000 GT ship?", say: [["don't cover", "do not cover", "not one of", "isn't covered", "not covered", "only cover", "isn't among", "not among", "isn't one of", "isn't in", "not in our", "outside", "isn't a port", "not a port", "does not cover", "doesn't cover", "don't have its", "do not have its"]], avoid: ["USD"] },
  { id: "pilotage-jnpa", question: "How much is pilotage for a 10000 GT ship at JNPA?", tools: ["estimate_port_call", "port_tariff"], say: ["3,464"] },
  { id: "kandla-tanker", question: "berth hire at kandla for a 20k GT liquid tanker, 36 hours", tools: ["estimate_port_call"], say: ["Kandla", "6,048"], avoid: ["exchange rate that you did not provide"] },
  { id: "coastal-nmpa", question: "Estimate port dues and pilotage at New Mangalore for a coastal general cargo ship of 8,000 GRT", tools: ["estimate_port_call"], say: [["INR", "Rs", "₹", "rupee"]] },
  { id: "anchorage-chennai", question: "What's the anchorage charge at Chennai for a 30,000 GRT bulk ship if it waits 72 hours?", tools: ["estimate_port_call", "port_tariff"], say: ["48"] },
  { id: "fleet-autofill", question: "Port costs for MV Ocean Star at Paradip, 24 hours alongside", tools: ["estimate_port_call"], say: ["Ocean Star"] },
  { id: "fleet-save", question: "Please save our ship Sea Breeze: 12,000 GRT general cargo ship, IMO 9123456", tools: ["save_ship"], say: ["Sea Breeze", ["saved", "fleet"]], avoid: ["as 0", "recorded as 0", "12,000 nrt", "12,000 m", "may be incorrect"] },
  { id: "company-docs", question: "What does our charter party say about laytime?", tools: ["search_company_documents"], say: ["72"] },
  { id: "agreed-rates", question: "Price a call at Hazira for a 30,000 GRT bulk ship for 24 hours, with our agreed rates", tools: ["estimate_port_call"], say: [["agreed", "your rate"]] },
  { id: "general-term", question: "What is pilotage, in simple words?", noTools: true, say: ["pilot"] },
  { id: "fuel-surcharge-now", question: "How much is the fuel surcharge at Mundra right now?", tools: ["port_tariff", "estimate_port_call", "search_port_documents"], say: ["0.22696", ["twice a month", "latest", "revise", "newer"]] },
  { id: "rupees", question: "Give me the total in rupees at 84.5 per dollar for a 30,000 GT bulk ship at Mundra for 24 hours", tools: ["estimate_port_call"], say: [["INR", "₹", "rupees"]] },
  { id: "tariff-comparison", question: "Compare how JNPA and Mundra charge container ships", tools: ["compare_ports", "port_tariff"], say: ["JNPA", "Mundra"] },
  { id: "kamarajar-container", question: "Kamarajar charges for a 50,000 GT container ship, 20 hours alongside", tools: ["estimate_port_call"], say: [["20,400", "Adani Ennore", "container terminal", "reference tariff"]] },
  { id: "cheapest-small", question: "What's cheaper for a 15,000 GRT general cargo ship staying 12 hours: Jaigarh or Pipavav?", tools: ["compare_ports", "estimate_port_call"], say: ["Jaigarh", "Pipavav"], avoid: ["jaigarh is cheaper", "pipavav is cheaper", "cheaper on the priced"] },
  { id: "lng-mundra", question: "LNG carrier of 90,000 GT at Mundra for 2 days, what are the charges?", tools: ["estimate_port_call"], say: [["LNG terminal", "LNG"]] },
  { id: "vlcc-chennai", question: "How much would a VLCC of 160,000 GT pay in berth hire at Chennai for a day?", tools: ["estimate_port_call", "port_tariff", "compare_ports"], say: ["30,720"] },
  { id: "wharfage-coal", question: "We're discharging 50,000 tonnes of imported coal at Paradip from a foreign-going 32,000 GT bulk carrier. What will wharfage come to?", tools: ["estimate_port_call"], say: [["30,21,500", "3,021,500", "30.2 lakh", "30.22 lakh"]] },
  { id: "wharfage-containers", question: "Berthing charges at Chennai for a 25,000 GRT container ship, 24 hours alongside, discharging 400 TEU", tools: ["estimate_port_call"], say: ["wharfage", ["5,29,600", "529,600"]] },
  { id: "freshness-mumbai", question: "Are your Mumbai rates up to date?", tools: ["port_tariff", "list_ports"], say: [["May 2026", "1 May", "checked"]] },
];
