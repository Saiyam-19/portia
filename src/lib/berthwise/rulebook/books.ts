import chennai from "../../../../data/rulebook/chennai.json";
import deendayal from "../../../../data/rulebook/deendayal.json";
import hazira from "../../../../data/rulebook/hazira.json";
import jaigarh from "../../../../data/rulebook/jaigarh.json";
import jnpa from "../../../../data/rulebook/jnpa.json";
import kamarajar from "../../../../data/rulebook/kamarajar.json";
import kattupalli from "../../../../data/rulebook/kattupalli.json";
import mumbai from "../../../../data/rulebook/mumbai.json";
import mundra from "../../../../data/rulebook/mundra.json";
import newMangalore from "../../../../data/rulebook/new-mangalore.json";
import paradip from "../../../../data/rulebook/paradip.json";
import pipavav from "../../../../data/rulebook/pipavav.json";
import { portBookSchema, type PortBook } from "./schema";

/** The reviewed rule book, bundled with the server code so it can't go missing at runtime. */
const RAW = [mumbai, jnpa, jaigarh, newMangalore, paradip, deendayal, chennai, kamarajar, mundra, hazira, kattupalli, pipavav];

let parsed: PortBook[] | undefined;
export function portBooks(): PortBook[] {
  parsed ??= RAW.map(raw => portBookSchema.parse(raw));
  return parsed;
}

export type PortMatch = { port: PortBook; terminal?: string; berth?: string };

const key = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(the|port|ports|authority|trust|terminal|limited|ltd|pvt|private)\b/g, " ").replace(/\s+/g, " ").trim();

/** Finds a port (and a terminal or berth, when the name is one) by its id, name or any alias. */
export function resolvePort(name: string): PortMatch | { candidates: string[] } | undefined {
  const wanted = key(name);
  if (!wanted) return undefined;
  const exact: PortMatch[] = [];
  for (const port of portBooks()) {
    if ([port.id, port.name, ...port.aliases].some(alias => key(alias) === wanted)) exact.push({ port });
    for (const terminal of port.terminals) {
      if ([terminal.id, terminal.name, ...terminal.aliases].some(alias => key(alias) === wanted)) exact.push({ port, terminal: terminal.id });
      for (const berth of terminal.berths) if ([berth.id, berth.name, ...berth.aliases].some(alias => key(alias) === wanted)) exact.push({ port, terminal: terminal.id, berth: berth.id });
    }
  }
  // Within one port the most specific match wins ("Kandla" is both a port alias and a terminal).
  if (exact.length && new Set(exact.map(match => match.port.id)).size === 1) {
    return exact.sort((a, b) => Number(Boolean(b.berth)) - Number(Boolean(a.berth)) || Number(Boolean(b.terminal)) - Number(Boolean(a.terminal)))[0];
  }
  if (exact.length) return { candidates: [...new Set(exact.map(match => match.port.name))] };
  const partial = portBooks().filter(port => [port.name, ...port.aliases].some(alias => key(alias).includes(wanted) || wanted.includes(key(alias))));
  if (partial.length === 1) return { port: partial[0]! };
  return partial.length ? { candidates: partial.map(port => port.name) } : undefined;
}
